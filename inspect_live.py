import urllib.request
import json

h = urllib.request.ProxyHandler({})
o = urllib.request.build_opener(h)
d = json.loads(o.open('http://127.0.0.1:28492/api/state').read().decode('utf-8'))
print('Settings priority:', d.get('settings', {}).get('priority_games'))
print('Settings priority mode:', d.get('settings', {}).get('priority_mode'))
print('\nRecent logs (last 15):')
for l in (d.get('recent_logs') or [])[-15:]:
    print(f"[{l.get('level')}] {l.get('time')} - {l.get('message')}")
