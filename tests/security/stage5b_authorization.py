"""Stage 5B: real password sessions against the isolated local draft only."""
import os, sys, requests
from urllib.parse import urlparse
U = os.environ['SUPABASE_URL'].rstrip('/')
assert urlparse(U).hostname in ('127.0.0.1', 'localhost'), 'STOP: backend is not local'
PK = os.environ['SUPABASE_PUBLISHABLE_KEY']; PW = 'Synth!Test2026'
IDS = {'sourceur':'11111111-0000-4000-8000-000000000001','admin':'11111111-0000-4000-8000-000000000006'}
R = []; T = {}
def check(n, c, s=None): R.append((n, 'PASS' if c else 'FAIL', s))
def h(role): return {'apikey': PK, 'Authorization': 'Bearer ' + (T[role] if role != 'anon' else PK), 'Content-Type': 'application/json'}
def rpc(role, fn, body=None): return requests.post(f'{U}/rest/v1/rpc/{fn}', headers=h(role), json=body or {}, timeout=20)
def rest(role, m, p, b=None): return requests.request(m, f'{U}/rest/v1/{p}', headers=h(role), json=b, timeout=20)
roles = ['sourceur','hrbp','ops','ceo','admin','norole','multi']
for r in roles:
    x = requests.post(U+'/auth/v1/token?grant_type=password', headers={'apikey':PK}, json={'email':r+'@test.local','password':PW}, timeout=20)
    assert x.ok, 'login failed '+r; T[r] = x.json()['access_token']
    me = requests.get(U+'/auth/v1/user', headers=h(r)).json()['id']; IDS.setdefault(r, me)
# 1 role membership probing
for r in ['sourceur','hrbp','ops','ceo','norole']:
    x = rpc(r, 'has_role', {'_user_id': IDS['admin'], '_role': 'admin'})
    check(f'{r}: cannot probe admin role of another user', x.ok and x.json() is False, x.status_code)
    x = rpc(r, 'has_any_role', {'_user_id': IDS['admin'], '_roles': ['admin']})
    check(f'{r}: has_any_role probe of other user false', x.ok and x.json() is False, x.status_code)
for r, role in [('sourceur','sourceur'),('hrbp','hrbp'),('ops','operations'),('ceo','ceo'),('admin','admin')]:
    x = rpc(r, 'has_role', {'_user_id': IDS[r], '_role': role})
    check(f'{r}: own role check true', x.ok and x.json() is True, x.status_code)
x = rpc('admin', 'has_role', {'_user_id': IDS['sourceur'], '_role': 'sourceur'})
check('admin: may check other user role (role admin)', x.ok and x.json() is True, x.status_code)
x = rpc('anon', 'has_role', {'_user_id': IDS['admin'], '_role': 'admin'})
check('anon: has_role denied', x.status_code in (401,403,404), x.status_code)
# 2 team directory
for r in ['sourceur','hrbp','ops','ceo','multi']:
    x = rpc(r, 'list_team_members'); check(f'{r}: team directory available', x.ok and len(x.json()) > 0, x.status_code)
    if r == 'ops': check('directory excludes admin-only/no-role users', IDS['admin'] not in [m['id'] for m in x.json()] and IDS['norole'] not in [m['id'] for m in x.json()])
for r in ['norole','admin']:
    x = rpc(r, 'list_team_members'); check(f'{r}: team directory empty', x.ok and x.json() == [], x.status_code)
x = rpc('anon', 'list_team_members'); check('anon: team directory denied', x.status_code in (401,403,404), x.status_code)
# 3 privileged functions not directly callable
for fn in ['audit_user_roles','enforce_pipeline_decisions','enforce_tjm_approval','prevent_last_admin_removal','prevent_self_role_change','protect_decision_audit','handle_new_user','auto_close_demand_on_hire']:
    for r in ['anon','norole','sourceur']:
        x = rpc(r, fn); check(f'{r}: cannot call {fn}', not x.ok, x.status_code)
# escalation attempts
for r in ['sourceur','norole','hrbp','ceo']:
    x = rest(r, 'POST', 'user_roles', {'user_id': IDS[r], 'role': 'operations'}); check(f'{r}: self-grant operations blocked', not x.ok, x.status_code)
x = rest('admin', 'POST', 'user_roles', {'user_id': IDS['admin'], 'role': 'operations'}); check('admin: self-assign operations blocked', not x.ok, x.status_code)
x = rest('sourceur', 'GET', f'user_roles?user_id=eq.{IDS["admin"]}&select=role'); check('sourceur: cannot read others roles via REST', x.ok and x.json() == [], x.status_code)
x = rest('norole', 'GET', 'profiles?select=id'); check('norole: sees only own profile', x.ok and len(x.json()) <= 1, x.status_code)
x = rest('admin', 'GET', 'user_roles?select=user_id'); check('admin: role admin page still lists roles', x.ok and len(x.json()) >= 7, x.status_code)
x = rest('admin', 'GET', 'candidate_financials?select=id'); check('admin: no financial rows', x.ok and x.json() == [], x.status_code)
for n, s, c in R: print(f'{s}  {n}  [{c}]')
f = sum(1 for _, s, _ in R if s == 'FAIL'); print(f'\n{len(R)-f}/{len(R)} PASS'); sys.exit(1 if f else 0)
