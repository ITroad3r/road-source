"""Synthetic fixtures for stage3_regression.py / stage3_concurrency.py (isolated draft only).
Usage: python3 stage3_fixtures.py setup|teardown. Post-Stage 6 the fixtures carry an approved Freelance
compensation proposal so the Stage 3 TJM rules are exercised exactly as before."""
import os, sys, subprocess, requests
U = os.environ['SUPABASE_URL'].rstrip('/'); PK = os.environ['SUPABASE_PUBLISHABLE_KEY']
assert '127.0.0.1' in U or 'localhost' in U, 'STOP: backend is not local'
DEMAND = '33333333-0000-4000-8000-000000000001'  # assigned to sourceur (Sourceur-only submission)
FX = {'active': 'de2ab963-4cbe-4fc8-93d8-a8c0db7bce1b', 'noq': 'aaaaaaaa-0000-4000-8000-00000000000b', 'placed': 'aaaaaaaa-0000-4000-8000-00000000000c'}
CV = {k: f'cccccccc-0000-4000-8000-00000000000{i}' for i, k in enumerate(FX)}
tok = lambda r: requests.post(f'{U}/auth/v1/token?grant_type=password', headers={'apikey': PK}, json={'email': f'{r}@test.local', 'password': 'Synth!Test2026'}).json()['access_token']
T = {r: tok(r) for r in ['ops', 'hrbp', 'sourceur']}
H = lambda r: {'apikey': PK, 'Authorization': 'Bearer ' + T[r], 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
def ok(x):
    if not x.ok: sys.exit(f'fixture step failed: {x.status_code} {x.text[:200]}')
    return x
def act(r, dc, a, v=None, **k):
    b = {'_demand_candidate_id': dc, '_action': a, **k}
    if v is not None: b['_expected_version'] = v
    return ok(requests.post(f'{U}/rest/v1/rpc/compensation_action', headers=H(r), json=b)).json()[0]['version']
def teardown():
    for k in FX:
        requests.delete(f'{U}/rest/v1/demand_candidates?id=eq.{FX[k]}', headers=H('ops'))
        requests.delete(f'{U}/rest/v1/talent_hub_cvs?id=eq.{CV[k]}', headers=H('ops'))
def setup():
    teardown()
    # Legacy (pre-Stage 3, pre-Stage 6) placement: inserted directly as historical data, unqualified, no proposal.
    subprocess.run(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c',
        f"insert into talent_hub_cvs (id, full_name) values ('{CV['placed']}', '[TEST] S3 fixture legacy placed');"
        f"insert into demand_candidates (id, demand_id, cv_id, stage, legacy_placement, requires_compensation) values ('{FX['placed']}', '{DEMAND}', '{CV['placed']}', 'placed', true, false);"], check=True)
    for k in ['active', 'noq']:
        ok(requests.post(f'{U}/rest/v1/talent_hub_cvs', headers=H('ops'), json={'id': CV[k], 'full_name': f'[TEST] S3 fixture {k}'}))
        ok(requests.post(f'{U}/rest/v1/demand_candidates', headers=H('ops'), json={'id': FX[k], 'demand_id': DEMAND, 'cv_id': CV[k], 'stage': 'offer'}))
        v = act('sourceur', FX[k], 'submit', _contract_type='freelance', _amount=500)
        v = act('hrbp', FX[k], 'forward', v); act('ops', FX[k], 'approve', v)
        ok(requests.patch(f'{U}/rest/v1/demand_candidates?id=eq.{FX[k]}', headers=H('hrbp'), json={'qualification_status': 'qualified'}))
    ok(requests.post(f'{U}/rest/v1/candidate_financials', headers=H('ops'), json={'demand_candidate_id': FX['active'], 'client_rate': 600, 'candidate_rate': 450, 'margin': 150, 'tjm_status': 'approved'}))
    ok(requests.patch(f'{U}/rest/v1/demand_candidates?id=eq.{FX["active"]}', headers=H('ops'), json={'final_decision': 'approved'}))
    ok(requests.post(f'{U}/rest/v1/candidate_financials', headers=H('ops'), json={'demand_candidate_id': FX['placed'], 'client_rate': 600, 'candidate_rate': 450, 'margin': 150, 'tjm_status': 'approved'}))
    print('fixtures ready')
{'setup': setup, 'teardown': teardown}[sys.argv[1]]()
