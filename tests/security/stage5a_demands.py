"""Real password sessions against the isolated local draft only; no privileged test requests.
Requires existing db/seed.sql example accounts and records. Run once per fresh draft.
Writes only synthetic example workflow records; never reads repo .env.
"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse
import requests

U = os.environ['SUPABASE_URL'].rstrip('/')
assert urlparse(U).hostname in ('127.0.0.1', 'localhost'), 'STOP: backend is not local'
PK = os.environ['SUPABASE_PUBLISHABLE_KEY']
PW = 'Synth!Test2026'
D = '33333333-0000-4000-8000-000000000002'
OTHER = '33333333-0000-4000-8000-000000000003'
CLIENT = '22222222-0000-4000-8000-000000000001'
CV = '44444444-0000-4000-8000-000000000001'
SOURCEUR = '11111111-0000-4000-8000-000000000001'
results = []
tokens = {}


def check(name, condition, status=None):
    results.append({'test': name, 'result': 'PASS' if condition else 'FAIL', 'http': status})


def headers(role):
    return {'apikey': PK, 'Authorization': 'Bearer ' + tokens[role],
            'Content-Type': 'application/json', 'Prefer': 'return=representation'}


def req(role, method, path, body=None, prefer=None):
    h = headers(role)
    if prefer:
        h['Prefer'] = prefer
    return requests.request(method, U + '/rest/v1/' + path, headers=h, json=body, timeout=20)


def row(table, query):
    response = req('ops', 'GET', table + '?' + query + '&select=*')
    assert response.ok and len(response.json()) == 1, 'Missing isolated fixture/read-back'
    return response.json()[0]


for role in ['sourceur', 'hrbp', 'ops', 'ceo', 'admin', 'norole', 'sourceur2']:
    response = requests.post(U + '/auth/v1/token?grant_type=password', headers={'apikey': PK},
                             json={'email': role + '@test.local', 'password': PW}, timeout=20)
    assert response.ok, 'STOP: example login failed for ' + role
    tokens[role] = response.json()['access_token']
    check(role + ' real password session', True, response.status_code)

baseline = row('demands', 'id=eq.' + D)
check('Sourceur assigned demand SELECT', req('sourceur', 'GET', 'demands?id=eq.' + D + '&select=*').json() == [baseline])
check('Sourceur other demand hidden', req('sourceur', 'GET', 'demands?id=eq.' + OTHER + '&select=*').json() == [])
fields = {'title': '[TEST] forbidden edit', 'description': 'unauthorized', 'required_skills': ['forbidden'],
          'budget_min': 123, 'budget_max': 456, 'lifecycle': 'on_hold', 'commercial_outcome': 'won',
          'client_id': '22222222-0000-4000-8000-000000000002', 'assigned_to': SOURCEUR}
for role in ['sourceur', 'hrbp', 'ceo', 'admin', 'norole']:
    for field, value in fields.items():
        r = req(role, 'PATCH', 'demands?id=eq.' + D, {field: value})
        check(role + ' UPDATE ' + field + ' blocked', row('demands', 'id=eq.' + D) == baseline and
              (not r.ok or r.json() == []), r.status_code)
    r = req(role, 'POST', 'demands?on_conflict=id',
            {'id': D, 'client_id': CLIENT, 'title': '[TEST] forbidden upsert', 'assigned_to': SOURCEUR},
            'resolution=merge-duplicates,return=representation')
    check(role + ' existing-row upsert blocked', not r.ok and row('demands', 'id=eq.' + D) == baseline, r.status_code)
    r = req(role, 'POST', 'user_roles', {'user_id': SOURCEUR if role == 'sourceur' else
            {'hrbp': '11111111-0000-4000-8000-000000000003', 'ceo': '11111111-0000-4000-8000-000000000005',
             'admin': '11111111-0000-4000-8000-000000000006', 'norole': '11111111-0000-4000-8000-000000000008'}[role],
             'role': 'operations'})
    check(role + ' self-escalation blocked', not r.ok, r.status_code)

r = requests.patch(U + '/rest/v1/demands?id=eq.' + D, headers={'apikey': PK, 'Content-Type': 'application/json'},
                   json={'title': 'anonymous'}, timeout=20)
check('anonymous UPDATE blocked', not r.ok and row('demands', 'id=eq.' + D) == baseline, r.status_code)
for field, value in fields.items():
    r = req('ops', 'PATCH', 'demands?id=eq.' + D, {field: value})
    check('Operations UPDATE ' + field, r.ok and len(r.json()) == 1 and row('demands', 'id=eq.' + D)[field] == value, r.status_code)
    req('ops', 'PATCH', 'demands?id=eq.' + D, {field: baseline[field]})
r = req('ops', 'POST', 'demands?on_conflict=id',
        {'id': D, 'client_id': CLIENT, 'title': '[TEST] Operations upsert', 'assigned_to': SOURCEUR},
        'resolution=merge-duplicates,return=representation')
check('Operations upsert allowed', r.ok and row('demands', 'id=eq.' + D)['title'] == '[TEST] Operations upsert', r.status_code)
req('ops', 'PATCH', 'demands?id=eq.' + D, {'title': baseline['title']})

# Full new candidate chain under an existing synthetic assigned demand.
r = req('sourceur', 'POST', 'demand_candidates', {'demand_id': D, 'cv_id': CV, 'submitted_by': SOURCEUR, 'stage': 'identified'})
check('Sourceur creates own pipeline candidate', r.ok and len(r.json()) == 1, r.status_code)
assert r.ok, 'Pipeline fixture creation failed'
dc = r.json()[0]['id']
for stage in ['contacted', 'screened', 'submitted']:
    r = req('sourceur', 'PATCH', 'demand_candidates?id=eq.' + dc, {'stage': stage})
    check('Sourceur pipeline ' + stage, r.ok and row('demand_candidates', 'id=eq.' + dc)['stage'] == stage, r.status_code)
r = req('sourceur2', 'PATCH', 'demand_candidates?id=eq.' + dc, {'notes': 'forbidden'})
check('Other Sourceur pipeline edit blocked', (not r.ok or r.json() == []) and row('demand_candidates', 'id=eq.' + dc)['notes'] is None, r.status_code)
for role in ['sourceur', 'ceo', 'admin']:
    r = req(role, 'PATCH', 'demand_candidates?id=eq.' + dc, {'qualification_status': 'qualified'})
    check(role + ' qualification blocked', row('demand_candidates', 'id=eq.' + dc)['qualification_status'] == 'pending', r.status_code)
r = req('sourceur', 'PATCH', 'demand_candidates?id=eq.' + dc, {'stage': 'placed'})
check('premature placement blocked', not r.ok and row('demand_candidates', 'id=eq.' + dc)['stage'] == 'submitted', r.status_code)
r = req('ops', 'POST', 'candidate_financials', {'demand_candidate_id': dc, 'client_rate': 600, 'candidate_rate': 450, 'margin': 150, 'tjm_status': 'approved'})
check('TJM approval before qualification blocked', not r.ok, r.status_code)
r = req('hrbp', 'PATCH', 'demand_candidates?id=eq.' + dc, {'qualification_status': 'qualified', 'qualification_notes': 'Stage 5A verified'})
check('HRBP qualification allowed', r.ok and row('demand_candidates', 'id=eq.' + dc)['qualification_status'] == 'qualified', r.status_code)
r = req('ops', 'PATCH', 'demand_candidates?id=eq.' + dc, {'final_decision': 'approved'})
check('final decision without approved TJM blocked', not r.ok, r.status_code)
r = req('ops', 'POST', 'candidate_financials', {'demand_candidate_id': dc, 'client_rate': 600, 'candidate_rate': 450, 'margin': 150})
check('Operations creates TJM draft', r.ok, r.status_code)
for role in ['sourceur', 'hrbp', 'ceo', 'admin']:
    r = req(role, 'PATCH', 'candidate_financials?demand_candidate_id=eq.' + dc, {'tjm_status': 'approved', 'client_rate': 1})
    f = row('candidate_financials', 'demand_candidate_id=eq.' + dc)
    check(role + ' TJM editing/approval blocked', f['tjm_status'] == 'draft' and f['client_rate'] == 600, r.status_code)
    rr = req(role, 'GET', 'candidate_financials?demand_candidate_id=eq.' + dc + '&select=*')
    check(role + ' financial SELECT visibility', rr.ok and len(rr.json()) == (1 if role == 'ceo' else 0), rr.status_code)
r = req('ops', 'PATCH', 'candidate_financials?demand_candidate_id=eq.' + dc, {'tjm_status': 'approved'})
check('Operations approves qualified TJM at submitted', r.ok and row('candidate_financials', 'demand_candidate_id=eq.' + dc)['tjm_status'] == 'approved', r.status_code)
for role in ['sourceur', 'hrbp', 'ceo', 'admin']:
    r = req(role, 'PATCH', 'demand_candidates?id=eq.' + dc, {'final_decision': 'approved'})
    check(role + ' final approval blocked', row('demand_candidates', 'id=eq.' + dc)['final_decision'] == 'pending', r.status_code)
r = req('ops', 'PATCH', 'demand_candidates?id=eq.' + dc, {'final_decision': 'approved'})
check('Operations final approval succeeds', r.ok and row('demand_candidates', 'id=eq.' + dc)['final_decision'] == 'approved', r.status_code)
r = req('ops', 'PATCH', 'candidate_financials?demand_candidate_id=eq.' + dc, {'client_rate': 610})
check('TJM amendment resets draft and final approval', r.ok and row('candidate_financials', 'demand_candidate_id=eq.' + dc)['tjm_status'] == 'draft' and row('demand_candidates', 'id=eq.' + dc)['final_decision'] == 'pending', r.status_code)
req('ops', 'PATCH', 'candidate_financials?demand_candidate_id=eq.' + dc, {'tjm_status': 'approved'})
req('ops', 'PATCH', 'demand_candidates?id=eq.' + dc, {'final_decision': 'approved'})
r = req('sourceur', 'PATCH', 'demand_candidates?id=eq.' + dc, {'stage': 'placed'})
check('Sourceur approved placement succeeds', r.ok and row('demand_candidates', 'id=eq.' + dc)['stage'] == 'placed', r.status_code)
closed = row('demands', 'id=eq.' + D)
check('auto-close still fills and wins demand', closed['lifecycle'] == 'filled' and closed['commercial_outcome'] == 'won' and closed['status'] == 'placed')
r = req('ops', 'POST', 'demands', {'client_id': CLIENT, 'title': '[TEST] Stage5A Operations creation', 'assigned_to': SOURCEUR})
check('Operations creates demand', r.ok and len(r.json()) == 1, r.status_code)
if r.ok:
    new_id = r.json()[0]['id']
    rd = req('ops', 'DELETE', 'demands?id=eq.' + new_id)
    check('Operations deletes demand', rd.ok and len(rd.json()) == 1, rd.status_code)

out = Path('/tmp/stage5a-results.json')
out.write_text(json.dumps(results, indent=2))
for result in results:
    print(result['result'], result['test'], 'HTTP', result['http'])
failed = sum(r['result'] == 'FAIL' for r in results)
print(f'TOTAL {len(results)}; PASS {len(results)-failed}; FAIL {failed}')
sys.exit(1 if failed else 0)