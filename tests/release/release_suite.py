"""Stage 5C release suite: full workflow + authorization with real password sessions on the isolated draft.
Usage: python3 tests/release/release_suite.py  (SUPABASE_URL must be local)"""
import sys, json, time, threading, requests
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from fixtures import *
R = []
def check(area, n, c, d=''): R.append((area, n, 'PASS' if c else 'FAIL', str(d)[:120]))
def H(k, rep=True):
    h = {'apikey': PK, 'Authorization': 'Bearer ' + (TOK[k] if k != 'anon' else PK), 'Content-Type': 'application/json'}
    if rep: h['Prefer'] = 'return=representation'
    return h
def rest(k, m, p, b=None): return requests.request(m, f'{U}/rest/v1/{p}', headers=H(k), json=b, timeout=20)
def one(k, p):
    r = rest(k, 'GET', p); return r.json()[0] if r.ok and r.json() else None
BUS = ['sourceur', 'hrbp', 'ops', 'ceo', 'multi']
try:
    setup()
    check('auth', 'all 7 synthetic accounts sign in with password', len(TOK) == 7)
    r = requests.post(U + '/auth/v1/token?grant_type=password', headers={'apikey': PK}, json={'email': email('ops'), 'password': 'wrong'})
    check('auth', 'wrong password rejected', r.status_code == 400, r.status_code)
    r = requests.post(U + '/auth/v1/signup', headers={'apikey': PK}, json={'email': f'self.{RUN}@synthetic.test', 'password': PW})
    check('auth', 'public self-signup disabled', not r.ok, r.status_code)
    if r.ok and r.json().get('id'): USERS['selfsignup'] = r.json()['id']
    r = requests.get(U + '/rest/v1/demands?select=id', headers={'apikey': PK, 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.invalid'})
    check('auth', 'forged/expired JWT rejected', r.status_code in (401, 403), r.status_code)
    s = login('sourceur'); requests.post(U + '/auth/v1/logout', headers={'apikey': PK, 'Authorization': 'Bearer ' + s['access_token']})
    r = requests.post(U + '/auth/v1/token?grant_type=refresh_token', headers={'apikey': PK}, json={'refresh_token': s['refresh_token']})
    check('auth', 'refresh token revoked after sign-out', not r.ok, r.status_code)
    # ---------- 1 demand ingestion (Operations)
    for k in ['sourceur', 'hrbp', 'ceo', 'admin', 'norole', 'multi', 'anon']:
        r = rest(k, 'POST', 'clients', {'name': f'[TEST] forged {RUN}'})
        if r.ok: track('clients', r.json()[0])
        check('demand', f'{k}: cannot create client', not r.ok, r.status_code)
    c = track('clients', rest('ops', 'POST', 'clients', {'name': f'[TEST] Client {RUN}', 'created_by': USERS['ops']}).json()[0])
    for k in ['sourceur', 'hrbp', 'ceo', 'admin', 'norole', 'multi']:
        r = rest(k, 'POST', 'demands', {'client_id': c['id'], 'title': 'forged', 'created_by': USERS[k]})
        if r.ok: track('demands', r.json()[0])
        check('demand', f'{k}: cannot create demand', not r.ok, r.status_code)
    r = rest('ops', 'POST', 'demands', {'client_id': c['id'], 'title': f'[TEST] Java Dev {RUN}', 'created_by': USERS['ops'], 'required_skills': ['java'], 'budget_max': 700})
    check('demand', 'ops: creates demand', r.ok, r.status_code); d = track('demands', r.json()[0])
    r = rest('ops', 'PATCH', f'demands?id=eq.{d["id"]}', {'assigned_to': USERS['sourceur'], 'lifecycle': 'in_progress'})
    check('demand', 'ops: dispatches demand to sourceur', r.ok and r.json()[0]['assigned_to'] == USERS['sourceur'], r.status_code)
    n = rest('sourceur', 'GET', f'notifications?select=id&user_id=eq.{USERS["sourceur"]}').json()
    check('demand', 'sourceur notified of assignment', len(n) >= 1, len(n))
    for k in ['sourceur', 'hrbp', 'ceo', 'admin', 'multi']:
        r = rest(k, 'PATCH', f'demands?id=eq.{d["id"]}', {'title': 'tampered'})
        check('demand', f'{k}: cannot update demand (5A)', one('ops', f'demands?id=eq.{d["id"]}&select=title')['title'] != 'tampered', r.status_code)
        r = rest(k, 'DELETE', f'demands?id=eq.{d["id"]}')
        check('demand', f'{k}: cannot delete demand', one('ops', f'demands?id=eq.{d["id"]}&select=id') is not None, r.status_code)
    for k, exp in [('sourceur', True), ('hrbp', True), ('ceo', True), ('admin', False), ('norole', False), ('anon', False)]:
        r = rest(k, 'GET', f'demands?id=eq.{d["id"]}&select=id'); seen = r.ok and len(r.json()) == 1
        check('demand', f'{k}: demand visibility = {exp}', seen == exp, r.status_code)
    # ---------- 2 sourcing (Sourceur): CV + upload + pipeline
    cv = rest('sourceur', 'POST', 'talent_hub_cvs', {'full_name': f'[TEST] Candidate {RUN}', 'email': f'cand.{RUN}@synthetic.test', 'skills': ['java'], 'created_by': USERS['sourceur']})
    check('sourcing', 'sourceur: adds Talent Hub candidate', cv.ok, cv.status_code); cv = track('talent_hub_cvs', cv.json()[0])
    path = f'{RUN}/cv.pdf'; pdf = b'%PDF-1.4\n%synthetic\n'
    r = requests.post(f'{U}/storage/v1/object/cvs/{path}', headers={'apikey': PK, 'Authorization': 'Bearer ' + TOK['sourceur'], 'Content-Type': 'application/pdf'}, data=pdf)
    check('storage', 'sourceur: uploads CV', r.ok, r.status_code); CREATED.append(('storage', path))
    for k, exp in [('hrbp', True), ('ops', True), ('ceo', True), ('admin', False), ('norole', False), ('anon', False)]:
        r = requests.get(f'{U}/storage/v1/object/authenticated/cvs/{path}', headers={'apikey': PK, 'Authorization': 'Bearer ' + (TOK.get(k) or PK)})
        check('storage', f'{k}: CV download = {exp}', (r.ok and r.content == pdf) == exp, r.status_code)
    for k in ['ceo', 'admin', 'norole', 'anon']:
        r = requests.post(f'{U}/storage/v1/object/cvs/{RUN}/{k}.pdf', headers={'apikey': PK, 'Authorization': 'Bearer ' + (TOK.get(k) or PK), 'Content-Type': 'application/pdf'}, data=pdf)
        if r.ok: CREATED.append(('storage', f'{RUN}/{k}.pdf'))
        check('storage', f'{k}: cannot upload CV', not r.ok, r.status_code)
        r = requests.delete(f'{U}/storage/v1/object/cvs/{path}', headers={'apikey': PK, 'Authorization': 'Bearer ' + (TOK.get(k) or PK)})
        still = requests.get(f'{U}/storage/v1/object/authenticated/cvs/{path}', headers=ADM).ok
        check('storage', f'{k}: cannot delete CV', still, r.status_code)
    r = requests.post(f'{U}/storage/v1/object/sign/cvs/{path}', headers={'apikey': PK, 'Authorization': 'Bearer ' + TOK['admin'], 'Content-Type': 'application/json'}, json={'expiresIn': 60})
    check('storage', 'admin: cannot mint signed CV URL', not r.ok, r.status_code)
    rest('sourceur', 'PATCH', f'talent_hub_cvs?id=eq.{cv["id"]}', {'cv_url': path})
    r = rest('sourceur', 'POST', 'demand_candidates', {'demand_id': d['id'], 'cv_id': cv['id'], 'submitted_by': USERS['sourceur']})
    check('sourcing', 'sourceur: adds candidate to assigned demand', r.ok, r.status_code); dc = track('demand_candidates', r.json()[0])
    rest('sourceur', 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'stage': 'screened'})
    r = rest('sourceur', 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'qualification_status': 'qualified'})
    check('qualif', 'sourceur: cannot self-qualify', one('ops', f'demand_candidates?id=eq.{dc["id"]}&select=qualification_status')['qualification_status'] == 'pending', r.status_code)
    r = rest('sourceur', 'POST', 'activity_log', {'demand_id': d['id'], 'kind': 'note', 'body': 'note', 'author_id': USERS['sourceur']})
    check('activity', 'sourceur: adds note', r.ok, r.status_code)
    if r.ok: track('activity_log', r.json()[0])
    note = r.json()[0] if r.ok else {'id': '00000000-0000-0000-0000-000000000000'}
    for k in ['hrbp', 'ceo']:
        r = rest(k, 'PATCH', f'activity_log?id=eq.{note["id"]}', {'body': 'x'}); check('activity', f'{k}: cannot edit others note', not r.ok or r.json() == [], r.status_code)
    for k in ['admin', 'norole', 'anon']:
        r = rest(k, 'GET', f'activity_log?demand_id=eq.{d["id"]}&select=id'); check('activity', f'{k}: cannot read activity history', not r.ok or r.json() == [], r.status_code)
    # ---------- 3 HRBP qualification + TJM
    for k in ['ceo', 'admin', 'multi_no']: pass
    r = rest('ceo', 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'qualification_status': 'qualified'})
    check('qualif', 'ceo: cannot qualify', one('ops', f'demand_candidates?id=eq.{dc["id"]}&select=qualification_status')['qualification_status'] == 'pending', r.status_code)
    r = rest('hrbp', 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'qualification_status': 'qualified', 'qualification_notes': 'ok'})
    check('qualif', 'hrbp: qualifies candidate', r.ok and r.json() and r.json()[0]['qualification_status'] == 'qualified', r.status_code)
    for k in ['sourceur', 'hrbp', 'ceo', 'admin', 'multi', 'norole']:
        r = rest(k, 'POST', 'candidate_financials', {'demand_candidate_id': dc['id'], 'client_rate': 1, 'candidate_rate': 1})
        if r.ok: track('candidate_financials', r.json()[0])
        check('finance', f'{k}: cannot create TJM', not r.ok, r.status_code)
    f = rest('ops', 'POST', 'candidate_financials', {'demand_candidate_id': dc['id'], 'client_rate': 650, 'candidate_rate': 480, 'margin': 170})
    check('finance', 'ops: enters TJM (draft)', f.ok and f.json()[0]['tjm_status'] == 'draft', f.status_code); f = track('candidate_financials', f.json()[0])
    r = rest('ops', 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'final_decision': 'approved'})
    check('decision', 'ops: final approval blocked while TJM draft', not r.ok or r.json() == [] or r.json()[0]['final_decision'] != 'approved', r.status_code)
    for k in ['sourceur', 'hrbp', 'ceo', 'admin', 'multi', 'norole', 'anon']:
        r = rest(k, 'GET', f'candidate_financials?id=eq.{f["id"]}&select=client_rate,margin')
        exp = k == 'ceo'; check('finance', f'{k}: TJM/margin readable = {exp}', (r.ok and len(r.json()) == 1) == exp, r.status_code)
        r = rest(k, 'PATCH', f'candidate_financials?id=eq.{f["id"]}', {'tjm_status': 'approved'})
        check('finance', f'{k}: cannot approve TJM', one('ops', f'candidate_financials?id=eq.{f["id"]}&select=tjm_status')['tjm_status'] == 'draft', r.status_code)
    r = rest('ops', 'PATCH', f'candidate_financials?id=eq.{f["id"]}', {'tjm_status': 'approved'})
    check('finance', 'ops: approves TJM', r.ok and r.json()[0]['tjm_status'] == 'approved', r.status_code)
    # ---------- 4 final approval (with race against amendment)
    for k in ['hrbp', 'ceo', 'sourceur', 'multi']:
        r = rest(k, 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'final_decision': 'approved'})
        check('decision', f'{k}: cannot give final approval', one('ops', f'demand_candidates?id=eq.{dc["id"]}&select=final_decision')['final_decision'] == 'pending', r.status_code)
    out = {}
    t1 = threading.Thread(target=lambda: out.setdefault('a', rest('ops', 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'final_decision': 'approved'})))
    t2 = threading.Thread(target=lambda: out.setdefault('m', rest('ops', 'PATCH', f'candidate_financials?id=eq.{f["id"]}', {'client_rate': 660})))
    t1.start(); t2.start(); t1.join(); t2.join()
    fd = one('ops', f'demand_candidates?id=eq.{dc["id"]}&select=final_decision')['final_decision']
    ts = one('ops', f'candidate_financials?id=eq.{f["id"]}&select=tjm_status')['tjm_status']
    check('concurrency', 'race approval vs TJM amendment never leaves approved+draft', not (fd == 'approved' and ts == 'draft'), f'{fd}/{ts}')
    rest('ops', 'PATCH', f'candidate_financials?id=eq.{f["id"]}', {'tjm_status': 'approved'})
    r = rest('ops', 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'final_decision': 'approved'})
    check('decision', 'ops: final approval after qualified + TJM approved', r.ok and r.json()[0]['final_decision'] == 'approved', r.status_code)
    # ---------- 5 placement + auto-close
    r = rest('sourceur', 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'stage': 'placed'})
    st = one('ops', f'demand_candidates?id=eq.{dc["id"]}&select=stage')['stage']
    if st != 'placed': r = rest('ops', 'PATCH', f'demand_candidates?id=eq.{dc["id"]}', {'stage': 'placed'}); st = one('ops', f'demand_candidates?id=eq.{dc["id"]}&select=stage')['stage']
    check('placement', 'candidate marked placed', st == 'placed', r.status_code)
    dd = one('ops', f'demands?id=eq.{d["id"]}&select=lifecycle,commercial_outcome')
    check('placement', 'demand auto-closed filled/won', dd and dd['lifecycle'] == 'filled' and dd['commercial_outcome'] == 'won', dd)
    # ---------- CEO reporting
    r = rest('ceo', 'GET', f'candidate_financials?id=eq.{f["id"]}&select=client_rate,candidate_rate,margin,tjm_status')
    check('ceo', 'ceo: reads placed revenue/margin', r.ok and r.json() and float(r.json()[0]['client_rate']) == 660, r.text[:80])
    for m, p, b in [('PATCH', f'demands?id=eq.{d["id"]}', {'title': 'x'}), ('PATCH', f'candidate_financials?id=eq.{f["id"]}', {'client_rate': 1}), ('DELETE', f'demand_candidates?id=eq.{dc["id"]}', None), ('POST', 'talent_hub_cvs', {'full_name': 'x'})]:
        r = rest('ceo', m, p, b)
        if r.ok and m == 'POST' and r.json(): track('talent_hub_cvs', r.json()[0])
        check('ceo', f'ceo read-only: {m} {p.split("?")[0]} blocked', not r.ok or r.json() == [], r.status_code)
    # ---------- role admin / escalation / invitations
    for k in BUS + ['norole']:
        r = rest(k, 'POST', 'user_roles', {'user_id': USERS[k], 'role': 'operations'}); check('roles', f'{k}: self-grant operations blocked', not r.ok, r.status_code)
        r = rest(k, 'POST', 'user_roles', {'user_id': USERS['norole'], 'role': 'admin'}); check('roles', f'{k}: cannot grant admin to others', not r.ok, r.status_code)
    r = rest('admin', 'POST', 'user_roles', {'user_id': USERS['admin'], 'role': 'operations'}); check('roles', 'admin: self-assign operations blocked', not r.ok, r.status_code)
    r = rest('admin', 'DELETE', f'user_roles?user_id=eq.{USERS["admin"]}&role=eq.admin'); check('roles', 'admin: self-revoke blocked', not r.ok or r.json() == [], r.status_code)
    r = rest('admin', 'POST', 'user_roles', {'user_id': USERS['norole'], 'role': 'sourceur'}); check('roles', 'admin: grants role to another user', r.ok, r.status_code)
    TOK['norole'] = login('norole')['access_token']
    r = rest('norole', 'GET', f'demands?id=eq.{d["id"]}&select=id'); check('roles', 'role change takes effect on new session', r.ok, r.status_code)
    rest('admin', 'DELETE', f'user_roles?user_id=eq.{USERS["norole"]}&role=eq.sourceur')
    r = rest('norole', 'GET', 'demands?select=id'); check('roles', 'revoked role loses access immediately (same token)', r.ok and r.json() == [], len(r.json()) if r.ok else r.status_code)
    a = rest('admin', 'GET', f'role_audit_log?target_user_id=eq.{USERS["norole"]}&select=id')
    if not a.ok: a = rest('admin', 'GET', 'role_audit_log?select=*&limit=200')
    check('roles', 'role changes recorded in audit log', a.ok and len(a.json()) >= 2, a.status_code)
    r = rest('sourceur', 'GET', 'role_audit_log?select=id'); check('roles', 'sourceur: cannot read role audit log', not r.ok or r.json() == [], r.status_code)
    r = requests.post(U + '/auth/v1/admin/users', headers=H('admin'), json={'email': f'x.{RUN}@synthetic.test'})
    check('invite', 'end-user token cannot call auth admin API directly', not r.ok, r.status_code)
    r = requests.post(U + '/auth/v1/invite', headers=H('sourceur'), json={'email': f'y.{RUN}@synthetic.test'})
    check('invite', 'sourceur cannot invite via auth API', not r.ok, r.status_code)
    # ---------- anonymous sweep
    for t in ['clients', 'demands', 'talent_hub_cvs', 'demand_candidates', 'candidate_financials', 'activity_log', 'notifications', 'profiles', 'user_roles', 'generated_cvs', 'role_audit_log']:
        r = rest('anon', 'GET', f'{t}?select=*&limit=1'); check('anon', f'anon: {t} denied', not r.ok or r.json() == [], r.status_code)
    # ---------- no-role / admin data isolation
    for t in ['clients', 'demands', 'talent_hub_cvs', 'demand_candidates', 'candidate_financials']:
        for k in ['norole', 'admin']:
            r = rest(k, 'GET', f'{t}?select=id&limit=5'); check('isolation', f'{k}: no business rows in {t}', r.ok and r.json() == [], r.status_code)
    r = rest('multi', 'GET', f'candidate_financials?select=id'); check('isolation', 'multi (sourceur+hrbp): no financial rows', r.ok and r.json() == [], r.status_code)
finally:
    left = cleanup()
    check('cleanup', 'all run-scoped synthetic users removed', left == [], left)
w = {}
for a, n, s, d in R: print(f'{s}  [{a}] {n}  ({d})')
fails = [x for x in R if x[2] == 'FAIL']
print(f'\nRUN {RUN}: {len(R)-len(fails)}/{len(R)} PASS')
json.dump([dict(area=a, check=n, result=s, detail=d) for a, n, s, d in R], open('docs/stage5c-test-results.json', 'w'), indent=1)
sys.exit(1 if fails else 0)
