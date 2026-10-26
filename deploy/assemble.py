#!/usr/bin/env python3
"""Verify the release asset, assemble static files, and apply reviewed frontend edits."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
asset, output = Path(sys.argv[1]), Path(sys.argv[2])
expected = json.loads((ROOT/'deploy/asset.json').read_text())
assert asset.stat().st_size == expected['bytes'], 'Asset size mismatch'
hash_value = hashlib.sha256()
with asset.open('rb') as stream:
    while chunk := stream.read(4*1024**2): hash_value.update(chunk)
assert hash_value.hexdigest() == expected['sha256'], 'Asset checksum mismatch'
output.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(asset) as archive:
    for name in archive.namelist():
        p = PurePosixPath(name)
        assert not p.is_absolute() and '..' not in p.parts, 'Invalid archive path'
    archive.extractall(output)
shutil.copytree(ROOT/'site', output, dirs_exist_ok=True)
config = json.loads((output/'rasters/native-config.json').read_text())
assert config['years'] == [2000] and config['chunk_manifest']
assert len(list((output/'data/basins').glob('*.json'))) == 426
manifest = json.loads((output/config['chunk_manifest']).read_text())
for filename, entry in manifest['files'].items():
    combined = hashlib.sha256()
    for part in entry['chunks']:
        data = (output/'rasters/chunks'/part['path']).read_bytes()
        assert len(data) == part['bytes']
        assert hashlib.sha256(data).hexdigest() == part['sha256']
        combined.update(data)
    assert combined.hexdigest() == entry['sha256'], filename
files = [p for p in output.rglob('*') if p.is_file()]
assert (output/'index.html').is_file()
assert sum(p.stat().st_size for p in files) < 1_000_000_000
assert max(p.stat().st_size for p in files) <= 4*1024**2
print(f'Verified {len(files)} static files, 426 basins, 2000 at original 30 arcseconds.')
