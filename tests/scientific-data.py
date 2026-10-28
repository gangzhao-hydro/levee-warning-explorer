"""Check the assembled research explorer against the verified manuscript results."""
import csv, json, statistics, sys
from pathlib import Path
root=Path(sys.argv[1]);study=json.loads((root/'data/study.json').read_text());bs=study['basins'];s=study['summary']
assert len(bs)==len({b['basin_id'] for b in bs})==426
common=[b for b in bs if b['lead_nolev'] is not None and b['lead_wtlev'] is not None]
assert len(common)==195
assert [statistics.median(b['lead_'+l] for b in common) for l in ['nolev','wtlev']]==[6,0]
assert sum(b['toe_nolev'] is not None and b['toe_wtlev'] is None for b in bs)==107
assert sum(b['toe_nolev'] is not None and b['toe_wtlev'] is not None and b['toe_wtlev']>b['toe_nolev'] for b in bs)==120
assert sum(b['category_nolev']=='Advance warning' for b in bs)==166
assert sum(b['category_nolev']=='Advance warning' and b['category_wtlev']!='Advance warning' for b in bs)==64
for b in bs:
 d=json.loads((root/f"data/basins/{b['basin_id']}.json").read_text())
 for l in ['nolev','wtlev']:
  assert len(d[l]['rates'])==77 and len(d[l]['samples_km2'])==11
  for vals in d[l]['samples_km2']:assert len(vals)==131 and all(v is not None and v>=0 for v in vals)
  if b['lead_'+l] is not None:assert b['lead_'+l]==b['ret']-b['toe_'+l]
 for l in ['nolev','wtlev']:
  hits=[y for y,r in zip(d['rate_years'],d[l]['rates']) if r>0 and r>=d['detection_rate']-1e-7]
  assert (hits[0] if hits else None)==b['toe_'+l]
 for l in ['nolev','wtlev']:
  assert sum(s[l]['categories'].values())==426
exp=json.loads((root/'data/exposure.json').read_text())
for scenario,pair in exp['series'].items():
 for state,v in pair.items():
  assert len(v['models'])==(10 if scenario=='ssp126' else 11)
  assert len(v['years'])==(45 if scenario=='historical' else 86)
assert round(exp['series']['ssp585']['wtlev']['mean'][-1],2)==11.14
rows=list(csv.DictReader((root/'downloads/main_common_support.csv').open()));assert len(rows)==195
print('PASS: domain, zero-preserving series, 852 ToE curves, common support, warning transitions, scenario coverage and exports')
