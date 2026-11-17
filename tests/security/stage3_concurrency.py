"""Overlapping-transaction stress for lock ordering (draft backend only). Fires concurrent
final-approval / TJM-amend / TJM-reapprove / qualification requests on one candidature and checks
(a) no deadlock errors (SQLSTATE 40P01), (b) never: final_decision=approved with TJM not approved."""
import os, requests, threading, subprocess
U=os.environ["SUPABASE_URL"]; PK=os.environ["SUPABASE_PUBLISHABLE_KEY"]; assert "127.0.0.1" in U or "localhost" in U
tok=lambda r: requests.post(f"{U}/auth/v1/token?grant_type=password",headers={"apikey":PK},json={"email":f"{r}@test.local","password":"Synth!Test2026"}).json()["access_token"]
OPS,HR=tok("ops"),tok("hrbp"); ID="de2ab963-4cbe-4fc8-93d8-a8c0db7bce1b"
def H(t): return {"apikey":PK,"Authorization":"Bearer "+t,"Content-Type":"application/json"}
def deadlocks(): return int(subprocess.check_output(["psql","-X","-At","-c","select deadlocks from pg_stat_database where datname=current_database()"]).strip())
errs=[]; s=requests.Session()
def call(fn):
    r=fn()
    if not r.ok: errs.append(r.text)
fin=lambda: s.get(f"{U}/rest/v1/candidate_financials?demand_candidate_id=eq.{ID}&select=client_rate,tjm_status",headers=H(OPS)).json()[0]
dc=lambda: s.get(f"{U}/rest/v1/demand_candidates?id=eq.{ID}&select=final_decision,qualification_status",headers=H(OPS)).json()[0]
d0=deadlocks(); bad=0; rounds=40
for i in range(rounds):
    rate=fin()["client_rate"]
    ops=[lambda: requests.patch(f"{U}/rest/v1/demand_candidates?id=eq.{ID}",headers=H(OPS),json={"final_decision":"approved"}),
         lambda: requests.patch(f"{U}/rest/v1/candidate_financials?demand_candidate_id=eq.{ID}",headers=H(OPS),json={"client_rate":rate+1}),
         lambda: requests.patch(f"{U}/rest/v1/candidate_financials?demand_candidate_id=eq.{ID}",headers=H(OPS),json={"tjm_status":"approved"}),
         lambda: requests.patch(f"{U}/rest/v1/demand_candidates?id=eq.{ID}",headers=H(HR),json={"qualification_notes":f"r{i}"}),
         lambda: requests.patch(f"{U}/rest/v1/demand_candidates?id=eq.{ID}",headers=H(OPS),json={"final_decision":"approved"})]
    ts=[threading.Thread(target=call,args=(f,)) for f in ops]; [t.start() for t in ts]; [t.join() for t in ts]
    f,d=fin(),dc()
    if d["final_decision"]=="approved" and f["tjm_status"]!="approved": bad+=1
dl=deadlocks()-d0; dl_err=sum("40P01" in e or "deadlock" in e.lower() for e in errs)
print(f"rounds={rounds} requests={rounds*5} rejected_by_rules={len(errs)-dl_err} deadlock_errors={dl_err} pg_deadlock_counter_delta={dl} invariant_violations={bad}")
print("PASS" if dl==0 and dl_err==0 and bad==0 else "FAIL")
