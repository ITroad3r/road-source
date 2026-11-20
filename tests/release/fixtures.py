"""Run-scoped synthetic fixtures for the isolated draft backend. Every user/row is tagged with a run id
and removed in cleanup(), even when tests fail. Refuses to run against a non-local backend."""
import os, uuid, requests
from urllib.parse import urlparse
U = os.environ['SUPABASE_URL'].rstrip('/')
assert urlparse(U).hostname in ('127.0.0.1', 'localhost'), 'STOP: backend is not the isolated local draft'
PK = os.environ['SUPABASE_PUBLISHABLE_KEY']; SK = os.environ['SUPABASE_SERVICE_ROLE_KEY']
RUN = 'rel' + uuid.uuid4().hex[:8]; PW = 'Synth!' + uuid.uuid4().hex[:12]
ADM = {'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
ROLES = {'sourceur': ['sourceur'], 'hrbp': ['hrbp'], 'ops': ['operations'], 'ceo': ['ceo'], 'admin': ['admin'],
         'multi': ['sourceur', 'hrbp'], 'norole': []}
USERS, TOK, CREATED = {}, {}, []   # CREATED: (table, id)

def email(k): return f'{k}.{RUN}@synthetic.test'
def login(k):
    r = requests.post(U + '/auth/v1/token?grant_type=password', headers={'apikey': PK}, json={'email': email(k), 'password': PW}, timeout=20)
    r.raise_for_status(); return r.json()
def setup():
    for k, roles in ROLES.items():
        r = requests.post(U + '/auth/v1/admin/users', headers=ADM, json={'email': email(k), 'password': PW, 'email_confirm': True,
            'user_metadata': {'full_name': f'[TEST] {k} {RUN}'}}, timeout=20)
        r.raise_for_status(); uid = r.json()['id']; USERS[k] = uid
        requests.delete(f'{U}/rest/v1/user_roles?user_id=eq.{uid}', headers=ADM)  # strip bootstrap roles
        for role in roles:
            x = requests.post(U + '/rest/v1/user_roles', headers=ADM, json={'user_id': uid, 'role': role}); x.raise_for_status()
    for k in ROLES: TOK[k] = login(k)['access_token']
def track(table, row): CREATED.append((table, row['id'])); return row
def cleanup():
    order = ['generated_cvs', 'activity_log', 'candidate_financials', 'demand_candidates', 'notifications', 'demands', 'talent_hub_cvs', 'clients']
    ids = {}
    for t, i in CREATED: ids.setdefault(t, []).append(i)
    uids = ','.join(USERS.values())
    if uids:
        for t, col in [('activity_log', 'author_id'), ('notifications', 'user_id')]:
            requests.delete(f'{U}/rest/v1/{t}?{col}=in.({uids})', headers=ADM)
    for t in ['activity_log', 'candidate_financials']:
        for d in ids.get('demand_candidates', []): requests.delete(f'{U}/rest/v1/{t}?demand_candidate_id=eq.{d}', headers=ADM)
    for d in ids.get('demands', []): requests.delete(f'{U}/rest/v1/activity_log?demand_id=eq.{d}', headers=ADM)
    for t in order:
        for i in ids.get(t, []): requests.delete(f'{U}/rest/v1/{t}?id=eq.{i}', headers=ADM)
    for p in [x for t, x in CREATED if t == 'storage']:
        requests.delete(f'{U}/storage/v1/object/cvs/{p}', headers=ADM)
    for uid in USERS.values():
        requests.delete(f'{U}/rest/v1/user_roles?user_id=eq.{uid}', headers=ADM)
        requests.delete(f'{U}/auth/v1/admin/users/{uid}', headers=ADM)
    left = requests.get(f'{U}/auth/v1/admin/users?per_page=500', headers=ADM).json().get('users', [])
    return [u['email'] for u in left if RUN in (u.get('email') or '')]
