"""Reconstruct verified VIC-2000 grids from immutable originals plus exact Float32 updates.

Only packaging is performed here. All hydrological calculations are precomputed.
Both original and corrected full-grid hashes are checked before publication.
"""
from pathlib import Path
import hashlib,json,tempfile,concurrent.futures
import numpy as np,rasterio as rio
from rasterio.windows import Window
from rasterio.enums import Resampling
from rasterio.shutil import copy as rio_copy
from PIL import Image
ROOT=Path(__file__).resolve().parent/'vic2000-correction'
H,W=21600,43200;CHUNK=4*1024**2

def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for b in iter(lambda:f.read(CHUNK),b''):h.update(b)
 return h.hexdigest()

def apply(output):
 output=Path(output);spec=json.loads((ROOT/'manifest.json').read_text());old_manifest=json.loads((output/'rasters/chunks/manifest.json').read_text());namespace='rasters/vic2000-20261029';destination=output/namespace;destination.mkdir(parents=True,exist_ok=True)
 def one(record):
  layer=record['layer'];filename=f'{layer}-2000.tif';old_entry=old_manifest['files'][filename];assert old_entry['sha256']==record['old_cog_sha256'];patch=ROOT/record['patch'];assert sha(patch)==record['patch_sha256']
  with np.load(patch,allow_pickle=False) as p:indices=p['indices'];values=p['values']
  assert indices.dtype==np.dtype('uint32') and values.dtype==np.dtype('float32') and len(indices)==len(values)==record['changed_pixels'];assert np.all(np.diff(indices.astype('int64'))>0) and int(indices[-1])<H*W and np.all(np.isfinite(values)) and np.all(values>=0)
  with tempfile.TemporaryDirectory(prefix='vic2000-') as tmp:
   tmp=Path(tmp);original=tmp/'original.tif'
   with original.open('wb') as f:
    for part in old_entry['chunks']:
     b=(output/'rasters/chunks'/part['path']).read_bytes();assert len(b)==part['bytes'] and hashlib.sha256(b).hexdigest()==part['sha256'];f.write(b)
   assert sha(original)==record['old_cog_sha256']
   raster=tmp/'corrected.tif';before=hashlib.sha256();after=hashlib.sha256()
   with rio.Env(GDAL_CACHEMAX=128*1024**2),rio.open(original) as src:
    assert src.shape==(H,W) and src.dtypes==('float32',) and src.crs.to_epsg()==4326
    profile={'driver':'GTiff','dtype':'float32','count':1,'height':H,'width':W,'crs':src.crs,'transform':src.transform,'tiled':True,'blockxsize':256,'blockysize':256,'compress':'deflate','predictor':3,'zlevel':6,'BIGTIFF':'IF_SAFER'}
    with rio.open(raster,'w',**profile) as dst:
     for row in range(0,H,256):
      n=min(256,H-row);win=Window(0,row,W,n);a=src.read(1,window=win);before.update(a.astype('<f4').tobytes());lo,hi=np.searchsorted(indices,[row*W,(row+n)*W]);a.ravel()[indices[lo:hi].astype('int64')-row*W]=values[lo:hi];after.update(a.astype('<f4').tobytes());dst.write(a,1,window=win)
     dst.update_tags(source_model='VIC GPU historical hindcast',year='2000',version=spec['version'],return_period_axis=json.dumps(spec['axis_corrected']),mask_application='physical water depth; dry-region screen applies to analysis aggregates')
   assert before.hexdigest()==record['old_grid_sha256'];assert after.hexdigest()==record['new_grid_sha256']
   cog=tmp/filename
   rio_copy(raster,cog,driver='COG',COMPRESS='DEFLATE',PREDICTOR='FLOATING_POINT',LEVEL='6',BLOCKSIZE='256',RESAMPLING='AVERAGE',BIGTIFF='IF_SAFER',NUM_THREADS='2')
   exact=hashlib.sha256()
   with rio.open(cog) as ds:
    assert ds.shape==(H,W) and ds.dtypes==('float32',) and ds.is_tiled and ds.overviews(1)
    for row in range(0,H,256):exact.update(ds.read(1,window=Window(0,row,W,min(256,H-row))).astype('<f4').tobytes())
    assert exact.hexdigest()==record['new_grid_sha256'];overviews=ds.overviews(1)
    a=ds.read(1,out_shape=(1024,2048),resampling=Resampling.average)
   # Preserve the existing colour-relief scale; only the water depths change.
   knots=[0,.1,.1001,.3,.7,1.5,3,6,12,60]
   colors=np.array([[0,0,0,0],[0,0,0,0],[130,218,214,120],[49,183,178,165],[39,139,220,205],[67,86,217,225],[126,63,210,238],[220,64,142,248],[239,68,68,255],[127,29,29,255]])
   rgba=np.stack([np.interp(a,knots,colors[:,i]) for i in range(4)],axis=-1).round().astype('uint8');rgba[~np.isfinite(a)]=0
   Image.fromarray(rgba).save(output/f'rasters/{layer}-2000.webp',format='WEBP',lossless=True,method=4)
   parts=[];combined=hashlib.sha256();partdir=destination/f'{layer}-2000';partdir.mkdir(exist_ok=True)
   with cog.open('rb') as f:
    i=0
    while b:=f.read(CHUNK):
     name=f'{layer}-2000/{i:04d}.bin';(destination/name).write_bytes(b);combined.update(b);parts.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()});i+=1
   entry={'bytes':cog.stat().st_size,'chunk_size':CHUNK,'chunks':parts,'sha256':combined.hexdigest(),'grid_sha256':exact.hexdigest()}
   native={'year':2000,'layer':layer,'path':filename,'bytes':entry['bytes'],'width':W,'height':H,'dtype':'float32','overviews':overviews,'base_resolution_arcsec':30,'full_grid_checked_pixels':H*W,'grid_sha256':exact.hexdigest()}
   return filename,entry,native
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:records=list(pool.map(one,spec['files']))
 manifest={'format':'byte-identical COG parts','version':spec['version'],'files':{name:entry for name,entry,_ in records}};(destination/'manifest.json').write_text(json.dumps(manifest,indent=2))
 config=json.loads((output/'rasters/native-config.json').read_text());config.update(base_url=namespace+'/',chunk_manifest=namespace+'/manifest.json',version=spec['version']);(output/'rasters/native-config.json').write_text(json.dumps(config,indent=2))
 native={'format':'COG','compression':'lossless DEFLATE with floating-point predictor','version':spec['version'],'base_resolution_arcsec':30,'width':W,'height':H,'crs':'EPSG:4326','overview_resampling':'average','years':[2000],'total_bytes':sum(e['bytes'] for _,e,_ in records),'files':[n for _,_,n in records]};(output/'rasters/native-manifest.json').write_text(json.dumps(native,indent=2))
 overview=json.loads((output/'rasters/manifest.json').read_text());overview.update(version=spec['version'],source='VIC GPU historical hindcast, year 2000; corrected lookup coordinates, 29 October 2026. Separate from the CMIP6 ensemble.');(output/'rasters/manifest.json').write_text(json.dumps(overview,indent=2))
 provenance=json.loads((output/'data/provenance.json').read_text());provenance.update(map_data='VIC GPU 2000 hindcast, reprocessed with corrected lookup coordinates on 29 October 2026; original 30-arcsecond Float32 grid; separate from CMIP6 results',map_validation=spec);(output/'data/provenance.json').write_text(json.dumps(provenance,separators=(',',':')))
 (output/'downloads/VIC_2000_map_validation.json').write_text(json.dumps(spec,indent=2))
 print('Verified corrected VIC maps: 2 full Float32 grids; original source chunks preserved.')
