import os, requests
U="http://127.0.0.1:8001"; PK=os.environ["SUPABASE_PUBLISHABLE_KEY"]
def tok(r): return requests.post(f"{U}/auth/v1/token?grant_type=password",headers={"apikey":PK},json={"email":f"{r}@test.local","password":"Synth!Test2026"}).json()["access_token"]
res=[]
def h(t): return {"apikey":PK,"Authorization":f"Bearer {t}","Content-Type":"application/json","Prefer":"return=representation"}
def rec(name, ok, detail): res.append((name,"PASS" if ok else "FAIL",detail))
anon={"apikey":PK}
for role in ["sourceur","hrbp","admin","ceo","ops",None]:
    H=h(tok(role)) if role else anon; lbl=role or "anon"
    for cols in ["*","client_rate,margin","client_rate","margin"]:
        r=requests.get(f"{U}/rest/v1/candidate_financials?select={cols}",headers=H)
        n=len(r.json()) if r.ok and isinstance(r.json(),list) else 0
        exp = n>0 if role in ("ceo","ops") else n==0
        rec(f"{lbl} SELECT financials({cols})",exp,f"{r.status_code} rows={n}")
    r=requests.get(f"{U}/rest/v1/demand_candidates?select=id,candidate_financials(client_rate,margin)",headers=H)
    leak=[x for x in (r.json() if r.ok else []) if x.get("candidate_financials")]
    rec(f"{lbl} embedded financials via pipeline", (len(leak)>0) if role in ("ceo","ops") else len(leak)==0, f"{r.status_code} rows_with_fin={len(leak)}")
    if role!="ops":
        fid="aaaaaaaa-0000-4000-8000-00000000000a"
        r=requests.patch(f"{U}/rest/v1/candidate_financials?demand_candidate_id=eq.{fid}",headers=H,json={"client_rate":9999})
        rec(f"{lbl} UPDATE financials blocked", not(r.ok and r.json()), f"{r.status_code} {r.text[:60]}")
        r=requests.post(f"{U}/rest/v1/candidate_financials",headers=H,json={"demand_candidate_id":"aaaaaaaa-0000-4000-8000-00000000000b","client_rate":1,"tjm_status":"approved"})
        rec(f"{lbl} INSERT approved financials blocked", not r.ok, f"{r.status_code}")
        r=requests.delete(f"{U}/rest/v1/candidate_financials?demand_candidate_id=eq.{fid}",headers=H)
        rec(f"{lbl} DELETE financials blocked", not(r.ok and r.json()), f"{r.status_code}")
# admin self-grant ops, hrbp grant other
for role,target in [("admin","db9e5706-5636-4b74-8205-8be116f123c7"),("hrbp","0972ec01-e765-4514-98b4-b25ccbefecbf")]:
    r=requests.post(f"{U}/rest/v1/user_roles",headers=h(tok(role)),json={"user_id":target,"role":"operations"})
    rec(f"{role} grant operations to {'self' if role=='admin' else 'other user'} blocked", not r.ok, f"{r.status_code}")
for n,s,d in res: print(f"{s}\t{n}\t{d}")
print("TOTAL", sum(1 for x in res if x[1]=="PASS"),"/",len(res))
print("--- activity log rate leak ---")
for role in ["sourceur","hrbp","admin","ceo","ops"]:
    r=requests.get(f"{U}/rest/v1/activity_log?select=kind,metadata&kind=eq.tjm_approval",headers=h(tok(role)))
    n=len(r.json()); ok = n>0 if role in ("ceo","ops") else n==0
    print("PASS" if ok else "FAIL", role, "tjm_approval history rows:", n)
