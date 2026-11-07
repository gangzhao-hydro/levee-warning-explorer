#!/usr/bin/env python3
"""Add display-only historical windows; do not alter future detection data."""
from pathlib import Path
import argparse, hashlib, json
import numpy as np
import pandas as pd

MODELS = ['access_cm2','bcc_csm2_mr','canesm5','ec_earth3','gfdl_cm4','inm_cm5_0',
          'ipsl_cm6a_lr','miroc6','mpi_esm1_2_hr','mri_esm2_0','noresm2_mm']

def build(corrected, site, output):
    corrected, site, output = map(Path, (corrected, site, output))
    study = json.loads((site/'data/study.json').read_text())
    basins = {int(b['basin_id']): b for b in study['basins']}
    ids = sorted(basins)
    assert len(ids) == 426
    threshold_file = corrected/'analysis/corrected_statistics_zero_guard_20261029/toe_thresholds.csv'
    thresholds = pd.read_csv(threshold_file).query("pct == 'P95' and ssp == 'ssp585' and lev == 'nolev'").set_index('basin_id')
    hashes = {}
    def track(path):
        hashes[str(path.relative_to(corrected))] = hashlib.sha256(path.read_bytes()).hexdigest()
        return path
    track(threshold_file)
    arrays = {}
    for state in ['nolev', 'wtlev']:
        values = []
        for model in MODELS:
            parts = []
            for scenario, start, end in [('historical', 1970, 2014), ('ssp585', 2015, 2100)]:
                path = track(corrected/f'analysis/input_series/{model}_{scenario}_{state}_area.csv')
                df = pd.read_csv(path, index_col='Year').loc[start:end]
                assert list(df.index) == list(range(start, end + 1))
                parts.append(df[[f'basin_{bid:06d}' for bid in ids]].to_numpy(float))
            values.append(np.concatenate(parts))
        arrays[state] = np.stack(values)
        assert arrays[state].shape == (11, 131, 426)
        assert np.isfinite(arrays[state]).all() and (arrays[state] >= 0).all()
    result = {
        'schema_version': 1, 'data_version': study['version'],
        'window_years': 10, 'models': MODELS, 'rate_years': list(range(1970, 2015)),
        'historical_only_window_starts': [1970, 2005],
        'boundary_spanning_window_starts': [2006, 2014],
        'toe_search_window_starts': [2015, 2091],
        'display_unit': 'fraction; multiply by 100 for percent',
        'note': 'Historical and boundary-spanning windows are display context, not ToE candidates. Future frequencies and published ToE/RET are unchanged.',
        'basins': {}, 'source_sha256': hashes,
    }
    max_future_error = 0.0
    all_rates = {}
    for idx, bid in enumerate(ids):
        original = json.loads((site/f'data/basins/{bid}.json').read_text())
        t = thresholds.loc[bid]
        assert abs(float(original['p95_km2']) - t.threshold) <= 5.1e-8
        record = {'p95_km2': original['p95_km2']}
        for state in ['nolev', 'wtlev']:
            a = arrays[state][:, :, idx]
            full = np.asarray([(a[:, i:i+10] > t.threshold).mean() for i in range(122)])
            existing = np.asarray(original[state]['rates'])
            error = float(np.max(np.abs(full[45:] - existing)))
            max_future_error = max(error, max_future_error)
            assert error <= 5.1e-8, (bid, state, error)
            hits = np.flatnonzero((full[45:] > 0) & (full[45:] >= t.detection_rate))
            toe = int(2015 + hits[0]) if len(hits) else None
            assert toe == basins[bid]['toe_' + state], (bid, state, toe)
            record[state] = [round(float(v), 7) for v in full[:45]]
            all_rates[bid, state] = full
        # Every published RET is also checked independently, although not modified.
        histmax = arrays['nolev'][:, :45, idx].max()
        future = arrays['wtlev'][:, 45:, idx]
        agree = np.asarray([(future[:, i:i+10] > histmax).any(axis=1).sum() for i in range(77)])
        hits = np.flatnonzero(agree >= 2)
        ret = int(2015 + hits[0]) if len(hits) else None
        assert ret == basins[bid]['ret'], (bid, 'RET', ret)
        result['basins'][str(bid)] = record
    fig1 = track(corrected/'analysis/manuscript_figures_P99guard_20261029/source_data/Figure_1_basin118_ToE_rates.csv')
    f = pd.read_csv(fig1)
    assert f.window_start.tolist() == list(range(1970, 2092))
    for state in ['nolev', 'wtlev']:
        assert np.allclose(f[state + '_p95_exceedance_rate'], all_rates[118, state], atol=1e-15, rtol=0)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':'), allow_nan=False) + '\n')
    report = {'basins': 426, 'historical_display_curves': 852, 'future_rate_values_verified': 426*2*77,
              'toe_verified': 852, 'ret_verified': 426, 'figure1c_points_verified': 244,
              'historical_model_years_per_state_basin': 495, 'samples_per_window': 110,
              'max_future_rounding_error': max_future_error,
              'future_data_modified': False, 'input_files_modified': False,
              'output_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
              'output_bytes': output.stat().st_size}
    return report

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--corrected', type=Path, required=True)
    p.add_argument('--site', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    print(json.dumps(build(args.corrected, args.site, args.output), indent=2))
