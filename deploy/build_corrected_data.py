#!/usr/bin/env python3
"""Build a portable research site from the revision's authoritative source data.

Run in the analysis conda environment (numpy, pandas, geopandas, Pillow).
No simulation results or manuscript files are modified.
"""
from pathlib import Path
import hashlib
import json
import shutil
from collections import Counter
import numpy as np
import pandas as pd
import argparse
from PIL import Image

args = argparse.ArgumentParser()
args.add_argument('--project', type=Path, required=True)
args.add_argument('--corrected', type=Path, required=True)
cfg = args.parse_args()
SITE = Path(__file__).resolve().parents[1]
ROOT = cfg.project
CORRECTED = cfg.corrected
STATS = CORRECTED / 'analysis/corrected_statistics_zero_guard_20261029'
PACKAGE = CORRECTED / 'analysis/manuscript_figures_P99guard_20261029'
SOURCE = PACKAGE / 'source_data'
OUT = SITE / 'site'
DATA = OUT / 'data'
VERSION = 'corrected-lookup-area-P99guard-20261028'
MODELS = ['access_cm2', 'bcc_csm2_mr', 'canesm5', 'ec_earth3', 'gfdl_cm4',
          'inm_cm5_0', 'ipsl_cm6a_lr', 'miroc6', 'mpi_esm1_2_hr', 'mri_esm2_0', 'noresm2_mm']
POPULATION = 7840952672
PROVENANCE = {}


def track(path):
    PROVENANCE[('corrected/' + str(path.relative_to(CORRECTED))) if path.is_relative_to(CORRECTED) else ('reference/' + str(path.relative_to(ROOT)))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return path


def read(name):
    return pd.read_csv(track(SOURCE / name))


def clean(obj):
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, np.ndarray)):
        return [clean(v) for v in obj]
    if isinstance(obj, (float, np.floating)):
        return None if not np.isfinite(obj) else round(float(obj), 7)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    return obj


def write(name, obj):
    path = DATA / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean(obj), separators=(',', ':'), ensure_ascii=False, allow_nan=False))


def build():
    DATA.mkdir(parents=True, exist_ok=True)
    domain = pd.read_csv(track(ROOT / 'analysis_domain_426.csv'))
    ids = set(domain.basin_id.astype(int))
    assert len(ids) == len(domain) == 426 and domain.area_km2.min() >= 1000
    master = pd.read_csv(track(STATS / 'main_basin_results.csv')).rename(columns={'shared_wtlev_ufey':'ret'})
    for lev in ['nolev','wtlev']:
        master['category_'+lev] = master['category_'+lev].replace({'Prepared':'Advance warning','Emerging w/o record':'Emergence without exceedance'})
    assert len(master) == 426 and set(master.basin_id) == ids
    standard = pd.read_csv(track(ROOT / 'nature-revised/revised_package/supplementary_source_data/Supplementary_Data_8_global_levee_standard_classes.csv'))
    master = master.merge(domain, on='basin_id', validate='one_to_one').merge(standard, on='basin_id', validate='one_to_one')
    master = master.rename(columns={'toe_area_nolev': 'toe_nolev', 'toe_area_wtlev': 'toe_wtlev',
        'lead_area_nolev': 'lead_nolev', 'lead_area_wtlev': 'lead_wtlev',
        'cat_area_nolev': 'category_nolev', 'cat_area_wtlev': 'category_wtlev', 'shared_wtlev_ret': 'ret'})
    for lev in ['nolev', 'wtlev']:
        assert np.allclose(master['lead_' + lev], master.ret - master['toe_' + lev], equal_nan=True)
        def category(row):
            toe, ret = row['toe_' + lev], row.ret
            if pd.notna(toe) and pd.notna(ret):
                return 'Surprise' if ret < toe else 'Advance warning'
            if pd.notna(ret):
                return 'Undetected surprise'
            return 'Emergence without exceedance' if pd.notna(toe) else 'Neither'
        assert (master.apply(category, axis=1) == master['category_' + lev]).all()

    summary = {'basin_count': 426, 'detected_nolev': int(master.toe_nolev.notna().sum()),
        'detected_wtlev': int(master.toe_wtlev.notna().sum()),
        'masked': int((master.toe_nolev.notna() & master.toe_wtlev.isna()).sum()),
        'both': int((master.toe_nolev.notna() & master.toe_wtlev.notna()).sum()),
        'ret_detected': int(master.ret.notna().sum())}
    assert [summary[k] for k in ['detected_nolev','detected_wtlev','masked','both','ret_detected']] == [328,222,107,221,234]
    for lev in ['nolev', 'wtlev']:
        lead = master.loc[master.common_support, 'lead_' + lev].dropna()
        summary[lev] = {'categories': dict(Counter(master['category_' + lev])), 'paired': len(lead),
            'median_lead': lead.median(), 'iqr': lead.quantile([.25, .75]).tolist(),
            'surprise_paired_percent': 100 * (lead < 0).mean()}
    assert summary['nolev']['median_lead'] == 6 and summary['wtlev']['median_lead'] == 0
    assert summary['nolev']['paired'] == 195 and summary['wtlev']['paired'] == 195
    transitions = master.groupby(['category_nolev','category_wtlev']).size().reset_index(name='count').to_dict('records')
    classes = read('Supplementary_Data_10_Figure_S6_ToE_threshold_sensitivity_summary.csv')
    write('study.json', {'title': 'Levees reduce flood exposure but obscure river-flood emergence',
        'version': VERSION, 'baseline': [1970,2014], 'future': [2015,2100], 'scenario': 'SSP5-8.5', 'percentile': 95,
        'ret_min_models': 2, 'window_years': 10, 'models': MODELS, 'summary': summary,
        'basins': master.to_dict('records'), 'transitions': transitions,
        'protection_classes': classes[classes.threshold == 'P95'].to_dict('records')})

    # The authoritative 426-feature layer; no geometries or IDs from the old 441-domain map.
    # Domain geometry is unchanged; reuse its previously verified web simplification.
    geometry = json.loads((ROOT / 'nature_results_site/public/data/basins.geojson').read_text())
    assert len(geometry['features']) == 426
    assert {f['properties']['basin_id'] for f in geometry['features']} == ids
    write('basins.geojson', geometry)
    shutil.copy2(ROOT / 'nature_results_site/public/data/land.geojson', DATA / 'land.geojson')

    # Global exposure: precisely the same models, denominator and periods as Figure 1.
    exposure = {'population': POPULATION, 'models': MODELS, 'series': {}, 'periods': {}}
    for scenario in ['historical', 'ssp126', 'ssp245', 'ssp585']:
        exposure['series'][scenario] = {}
        exposure['periods'][scenario] = {}
        for lev in ['nolev','wtlev']:
            available = [m for m in MODELS if (CORRECTED / f'analysis/input_series/{m}_{scenario}_{lev}_popgdp.csv').exists()]
            frames = [pd.read_csv(track(CORRECTED / f'analysis/input_series/{m}_{scenario}_{lev}_popgdp.csv')).set_index('Year')['FloodedPop'] for m in available]
            frame = pd.concat(frames, axis=1)
            frame.columns = available
            frame = frame.loc[1970:2014] if scenario == 'historical' else frame.loc[2015:2100]
            assert frame.shape == (45 if scenario == 'historical' else 86, len(available)) and frame.notna().all().all()
            frame = frame / POPULATION * 100
            exposure['series'][scenario][lev] = {'years': frame.index.tolist(), 'model_names': available,
                'mean': frame.mean(axis=1).tolist(), 'min': frame.min(axis=1).tolist(),
                'max': frame.max(axis=1).tolist(), 'models': frame.T.values.tolist()}
            period = frame if scenario == 'historical' else frame.loc[2061:2100]
            exposure['periods'][scenario][lev] = period.values.mean()
    assert round(exposure['periods']['historical']['nolev'],2) == 12.34
    assert round(exposure['periods']['historical']['wtlev'],2) == 8.93
    write('exposure.json', exposure)

    # Recompute only display curves/samples from raw area series. The published ToE
    # remains authoritative; verify every displayed curve reproduces that timing.
    thresholds = pd.read_csv(track(STATS / 'toe_thresholds.csv'))
    thresholds = thresholds[(thresholds.pct == 'P95') & (thresholds.ssp == 'ssp585') & (thresholds.lev == 'nolev')].set_index('basin_id')
    arrays = {}
    for lev in ['nolev', 'wtlev']:
        arr = []
        for model in MODELS:
            parts = []
            for scenario, start, end in [('historical',1970,2014),('ssp585',2015,2100)]:
                path = CORRECTED / f'analysis/input_series/{model}_{scenario}_{lev}_area.csv'
                frame = pd.read_csv(track(path), index_col='Year').loc[start:end]
                parts.append(frame[[f'basin_{b:06d}' for b in sorted(ids)]].values)
            arr.append(np.concatenate(parts,axis=0))
        arrays[lev] = np.stack(arr)
        assert arrays[lev].shape == (11,131,426)
    ret_checks = []
    for idx, bid in enumerate(sorted(ids)):
        row = master.set_index('basin_id').loc[bid]
        t = thresholds.loc[bid]
        detail = {'basin_id': bid, 'years': list(range(1970,2101)), 'rate_years': list(range(2015,2092)),
            'p95_km2': t.threshold, 'historical_max_km2': float(np.nanmax(arrays['nolev'][:,:45,idx])),
            'hist_rate': t.hist_exceed_rate, 'doubling_rate': t.frequency_doubling_rate,
            'null95_rate': t.bootstrap_null95_rate, 'detection_rate': t.detection_rate}
        for lev in ['nolev','wtlev']:
            values = arrays[lev][:,:,idx]
            future = values[:,45:]
            rates = np.array([(future[:,i:i+10] > t.threshold).sum() / np.isfinite(future[:,i:i+10]).sum() for i in range(77)])
            hits = np.flatnonzero((rates > 0) & (rates >= t.detection_rate))
            computed = 2015 + hits[0] if len(hits) else np.nan
            assert (pd.isna(computed) and pd.isna(row['toe_'+lev])) or computed == row['toe_'+lev], (bid,lev,computed,row['toe_'+lev])
            detail[lev] = {'rates': rates.tolist(), 'median_km2': (np.nanmedian(values,axis=0)).tolist(),
                'samples_km2': np.round(values,4).tolist()}
        future = arrays['wtlev'][:,45:,idx]
        hist_max = np.nanmax(arrays['nolev'][:,:45,idx])
        agreement = [int((future[:,i:i+10] > hist_max).any(axis=1).sum()) for i in range(77)]
        hits = np.flatnonzero(np.array(agreement) >= 2)
        ret = int(2015 + hits[0]) if len(hits) else np.nan
        assert (pd.isna(ret) and pd.isna(row.ret)) or ret == row.ret, (bid,'RET',ret,row.ret)
        detail['ret_model_agreement'] = agreement
        write(f'basins/{bid}.json', detail)
        ret_checks.append(bid)

    # Current manuscript figures and explicitly named downloads.
    (OUT / 'figures').mkdir(exist_ok=True)
    figure_names = ['Figure_1_Songhua_example_corrected','Figure_2_population_exposure_corrected',
                    'Figure_3_emergence_corrected','Figure_4_warning_corrected']
    for n,name in enumerate(figure_names,1):
        im = Image.open(track(PACKAGE / 'figures' / (name+'.png'))).convert('RGB')
        im.thumbnail((2200,2200))
        im.save(OUT / f'figures/figure-{n}.webp',quality=90,method=6)
    (OUT / 'downloads').mkdir(exist_ok=True)
    for name in ['main_basin_results.csv','main_common_support.csv','specification_summary.csv']:
        shutil.copy2(track(STATS / name),OUT / 'downloads' / name)
    for name in ['Supplementary_Data_10_Figure_S6_ToE_threshold_sensitivity_summary.csv']:
        shutil.copy2(track(SOURCE / name),OUT / 'downloads' / name)
    shutil.copy2(ROOT / 'analysis_domain_426.csv', OUT / 'downloads/analysis_domain_426.csv')
    # Keep previously public download URLs current, rather than serving the old asset's numbers.
    shutil.copy2(SOURCE / 'Supplementary_Data_5_Figure3_RET_source_data.csv', OUT / 'downloads/Supplementary_Data_5_Figure3_RET_source_data.csv')
    shutil.copy2(ROOT / 'analysis_domain_426.csv', OUT / 'downloads/Supplementary_Data_6_analysis_domain_426.csv')
    # Export displayed annual ensemble means for reuse without a JSON parser.
    rows = []
    for scenario, pair in exposure['series'].items():
        for lev, series in pair.items():
            rows.extend({'scenario':scenario,'protection':lev,'year':year,'exposure_percent':mean}
                for year,mean in zip(series['years'],series['mean']))
    pd.DataFrame(rows).to_csv(OUT / 'downloads/exposure_annual_ensemble.csv', index=False)
    write('provenance.json', {'version':VERSION, 'source_manuscript':'Corrected manuscript, Figures 1–4; P99 positive-event guard verified', 'area_unit':'km2 (no further scaling)', 'common_support':195, 'runoff_mask_mm_year':18.25, 'analysis_depth_threshold_m':0.15, 'zero_event_rule':'No detection without a positive threshold exceedance', 'map_data':'Unchanged VIC 2000 hindcast, separate from CMIP6 results',
        'sha256':PROVENANCE, 'validation':{'domain':426,'toe_curve_checks':852,'shared_ret_checks':len(ret_checks),
        'summary':summary},'display_rounding':'Area samples: 0.0001 km²; JSON floating values: 7 decimal places. Detection verified before rounding.'})
    print(json.dumps(clean(summary),indent=2))
    print('Built 426 basins; verified 852 ToE timings and 426 shared RET timings against the revision.')


if __name__ == '__main__':
    build()
