"""Table 1 — the integration census: who publishes each stream, in what form, and how it behaved.

Owners and interfaces were read from each adapter's own header comment in
server/sources/*.js (not from memory); pull counts and success come from A2."""
import json, os
from common import *

# group -> (stream, provider, interface, auth, interval label, [source ids])
SPEC = [
    ('PM2.5, PM10, gases, 175 ground stations', 'Pollution Control Dept. (PCD)', 'JSON', 'none', '15 min', ['air4thai']),
    ('PM2.5 fused with satellite, 77 provinces', 'GISTDA', 'JSON', 'none', '1 h', ['gistda_pm25']),
    ('Noise level, 27 stations', 'PCD (Noise4Thai)', 'HTML page, parsed', 'none', '30 min', ['pcd_noise']),
    ('Rain gauges, about 4,200', 'HII, for several agencies', 'JSON', 'none', '10 min', ['thaiwater_rain']),
    ('Weather forecast and stations', 'Thai Meteorological Dept.', 'JSON via sibling relay', 'none', '15 min', ['tmd_relay']),
    ('Wind, rain and PM2.5 model forecast', 'Open-Meteo (CAMS, weather models)', 'JSON', 'none', '6 h', ['openmeteo', 'openmeteo_aq', 'openmeteo_aq_hist', 'regional_wind']),
    ('Satellite rain (IMERG)', 'NASA GES DISC', 'OPeNDAP', 'free token', '30 min', ['imerg']),
    ('El Niño index (ONI)', 'NOAA CPC', 'text file', 'none', '12 h', ['enso']),
    ('Agricultural burn scars by crop', 'HII and Kasetsart Univ.', 'JSON', 'none', 'daily', ['burn_area']),
    ('Drought risk, crop water use', 'GISTDA', 'JSON (GeoJSON)', 'none', '6 h', ['cropsdrought']),
    ('Fire detections, three VIIRS satellites', 'NASA FIRMS', 'CSV', 'none', '6 h', ['firms_regional']),
    ('Aerosol optical depth, 5 sites', 'NASA AERONET', 'CSV', 'none', 'daily', ['aeronet']),
    ('Airport visibility and weather codes', 'NOAA Aviation Weather Center', 'JSON', 'none', '30 min', ['metarVisibility']),
    ('Low-cost PM2.5 sensors, northern Thailand', 'Chiang Mai Univ. (DustBoy)', 'JSON', 'free token', '1 h', ['dustboy']),
    ('About 1,000 public cameras', 'GISTDA, iTIC, DWR, volunteer aggregator', 'HLS, MJPEG, JPEG', 'none', '30 min', ['cctvHealth', 'hazeVision']),
    ('Haze news and citizen reports', 'News outlets (RSS)', 'RSS', 'none', '20-30 min', ['news', 'citizen_social']),
    ('Flood verdicts (sibling system)', 'FloodDash', 'JSON, local', 'none', '10 min', ['twin_flood']),
]

def run():
    a2 = json.load(open(os.path.join(OUT, 'a2_reliability.json')))['per_source']
    rows = []
    for stream, owner, iface, auth, interval, ids in SPEC:
        pulls = sum(a2[i]['runs'] for i in ids if i in a2); ok = sum(a2[i]['ok'] for i in ids if i in a2)
        new = sum(a2[i]['rows_new_total'] for i in ids if i in a2)
        rows.append({'stream': stream, 'owner': owner, 'interface': iface, 'auth': auth, 'interval': interval, 'sources': ids,
                     'pulls': pulls, 'ok': ok, 'success': ok / pulls if pulls else None, 'rows_new': new})
    res = {'rows': rows,
           'providers': len({r['owner'].split(' (')[0].split(',')[0] for r in rows}),
           'distinct_interfaces': len({r['interface'].split(',')[0].split(' (')[0] for r in rows}),
           'needing_token': [r['stream'] for r in rows if 'token' in r['auth']],
           'silent_success': [r['stream'] for r in rows if r['auth'] != 'none' and r['rows_new'] == 0 and r['pulls'] > 100],
           'streams': len(rows)}
    return res

if __name__ == '__main__':
    r = run(); save('census.json', r)
    for x in r['rows']: print(f"{x['stream'][:44]:44} {x['owner'][:34]:34} {x['interface'][:22]:22} {x['pulls']:6} {100*x['success']:5.1f}% new={x['rows_new']}")
    print({k: v for k, v in r.items() if k != 'rows'})
