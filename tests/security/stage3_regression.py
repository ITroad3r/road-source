"""Stage 3 regression: TJM amendment invalidates final approval. Run ONLY against the isolated draft backend.
Usage: SUPABASE_URL=http://127.0.0.1:8001 SUPABASE_PUBLISHABLE_KEY=... python3 tests/security/stage3_regression.py"""
import os, requests, threading
U=os.environ["SUPABASE_URL"]; PK=os.environ["SUPABASE_PUBLISHABLE_KEY"]
assert "127.0.0.1" in U or "localhost" in U, "refusing to run outside the isolated draft"
PW="Synth!Test2026"; ACTIVE="de2ab963-4cbe-4fc8-93d8-a8c0db7bce1b"; PLACED="aaaaaaaa-0000-4000-8000-00000000000c"
T={r:requests.post(f"{U}/auth/v1/token?grant_type=password",headers={"apikey":PK},json={"email":f"{r}@test.local","password":PW}).json()["access_token"] for r in ["sourceur","hrbp","ceo","admin","ops"]}
def H(r): return {"apikey":PK,"Authorization":"Bearer "+T[r],"Content-Type":"application/json","Prefer":"return=representation"}
res=[]
def check(name,cond,detail=""): res.append(("PASS" if cond else "FAIL",name,detail))
def dc(id): return requests.get(f"{U}/rest/v1/demand_candidates?id=eq.{id}&select=stage,final_decision,decided_by",headers=H("ops")).json()[0]
def fin(id): r=requests.get(f"{U}/rest/v1/candidate_financials?demand_candidate_id=eq.{id}&select=id,client_rate,tjm_status,amendment_pending",headers=H("ops")).json(); return r[0] if r else None
def pfin(role,id,body): return requests.patch(f"{U}/rest/v1/candidate_financials?demand_candidate_id=eq.{id}",headers=H(role),json=body)
def pdc(role,id,body): return requests.patch(f"{U}/rest/v1/demand_candidates?id=eq.{id}",headers=H(role),json=body)
def set_active_approved():
    if fin(ACTIVE)["tjm_status"]!="approved": pfin("ops",ACTIVE,{"tjm_status":"approved"})
    if dc(ACTIVE)["final_decision"]!="approved": pdc("ops",ACTIVE,{"final_decision":"approved"})
# --- A. active approved candidate
set_active_approved(); before=dc(ACTIVE); rate=fin(ACTIVE)["client_rate"]
check("A0 setup: active candidate approved + TJM approved", before["final_decision"]=="approved" and fin(ACTIVE)["tjm_status"]=="approved")
pfin("ops",ACTIVE,{"client_rate":rate+10,"tjm_status":"approved"})
f=fin(ACTIVE); d=dc(ACTIVE)
check("A1 amendment resets TJM to draft (even if 'approved' sent)", f["tjm_status"]=="draft", f["tjm_status"])
check("A2 amendment resets final decision to pending", d["final_decision"]=="pending", d["final_decision"])
log=requests.get(f"{U}/rest/v1/activity_log?demand_candidate_id=eq.{ACTIVE}&kind=eq.final_decision&order=created_at.desc&limit=1&select=metadata",headers=H("ops")).json()[0]["metadata"]
check("A3 audit keeps previous approver/time", log.get("previous_decided_by")==before["decided_by"] and log.get("previous_decided_at") is not None)
tl=requests.get(f"{U}/rest/v1/activity_log?demand_candidate_id=eq.{ACTIVE}&kind=eq.tjm_approval&order=created_at.desc&limit=1&select=metadata",headers=H("ops")).json()[0]["metadata"]
check("A4 audit keeps original TJM", float(tl.get("old_client_rate"))==float(rate))
r=pdc("ops",ACTIVE,{"final_decision":"approved"}); check("A5 final approval blocked while TJM draft", not r.ok, str(r.status_code))
pfin("ops",ACTIVE,{"tjm_status":"approved"}); check("A6 TJM reapproval does not auto-restore final approval", dc(ACTIVE)["final_decision"]=="pending")
r=pdc("ops",ACTIVE,{"final_decision":"approved"}); check("A7 explicit reconfirmation by Operations succeeds", r.ok and dc(ACTIVE)["final_decision"]=="approved")
# --- B. placed candidate
if not fin(PLACED): requests.post(f"{U}/rest/v1/candidate_financials",headers=H("ops"),json={"demand_candidate_id":PLACED,"client_rate":600,"candidate_rate":450,"margin":150})
if fin(PLACED)["tjm_status"]!="approved": pfin("ops",PLACED,{"tjm_status":"approved"})
pb=dc(PLACED); pfin("ops",PLACED,{"client_rate":fin(PLACED)["client_rate"]+5})
f=fin(PLACED); d=dc(PLACED)
check("B1 placed: stage unchanged", d["stage"]=="placed")
check("B2 placed: final decision unchanged", d["final_decision"]==pb["final_decision"])
check("B3 placed: TJM draft + amendment flagged", f["tjm_status"]=="draft" and f["amendment_pending"] is True)
pfin("ops",PLACED,{"tjm_status":"approved"}); f=fin(PLACED)
check("B4 placed: reapproval clears amendment flag", f["tjm_status"]=="approved" and f["amendment_pending"] is False)
# --- C. unauthorized
for role in ["sourceur","hrbp","ceo","admin"]:
    pre=fin(ACTIVE)
    r=pfin(role,ACTIVE,{"client_rate":1}); check(f"C {role}: cannot edit TJM", fin(ACTIVE)["client_rate"]==pre["client_rate"], str(r.status_code))
    r=pfin(role,ACTIVE,{"tjm_status":"draft"}); check(f"C {role}: cannot change TJM approval", fin(ACTIVE)["tjm_status"]==pre["tjm_status"], str(r.status_code))
    r=pfin(role,PLACED,{"amendment_pending":True}); check(f"C {role}: cannot touch amendment flag", fin(PLACED)["amendment_pending"] is False, str(r.status_code))
    r=pdc(role,ACTIVE,{"final_decision":"rejected"}); check(f"C {role}: cannot make final decision", dc(ACTIVE)["final_decision"]=="approved", str(r.status_code))
    r=requests.post(f"{U}/rest/v1/activity_log",headers=H(role),json={"demand_candidate_id":ACTIVE,"kind":"final_decision","body":"forged","author_id":None})
    check(f"C {role}: cannot forge decision audit", not r.ok, str(r.status_code))
r=pfin("ops",PLACED,{"amendment_pending":True}); check("C ops: cannot set amendment flag directly", fin(PLACED)["amendment_pending"] is False)
for role in ["ops","sourceur","hrbp"]:
    r=requests.delete(f"{U}/rest/v1/activity_log?demand_candidate_id=eq.{ACTIVE}&kind=in.(final_decision,qualification,tjm_approval)",headers=H(role))
    check(f"C {role}: cannot delete decision audit", not r.ok or r.json()==[], str(r.status_code))
    r=requests.patch(f"{U}/rest/v1/activity_log?demand_candidate_id=eq.{ACTIVE}&kind=eq.final_decision",headers=H(role),json={"body":"tampered"})
    check(f"C {role}: cannot edit decision audit", not r.ok or r.json()==[], str(r.status_code))
# --- D. simultaneous: TJM amendment vs final approval
bad=0
for i in range(6):
    # put in state: TJM approved, final pending, then race amendment vs approval
    pfin("ops",ACTIVE,{"client_rate":fin(ACTIVE)["client_rate"]+1}); pfin("ops",ACTIVE,{"tjm_status":"approved"})
    rate=fin(ACTIVE)["client_rate"]
    ts=[threading.Thread(target=pfin,args=("ops",ACTIVE,{"client_rate":rate+1})), threading.Thread(target=pdc,args=("ops",ACTIVE,{"final_decision":"approved"}))]
    [t.start() for t in ts]; [t.join() for t in ts]
    if dc(ACTIVE)["final_decision"]=="approved" and fin(ACTIVE)["tjm_status"]!="approved": bad+=1
check("D simultaneous amendment + approval never leaves approved candidate with draft TJM (6 races)", bad==0, f"violations={bad}")
# --- E. audit fixes (0008)
NOQ="aaaaaaaa-0000-4000-8000-00000000000b"
requests.delete(f"{U}/rest/v1/candidate_financials?demand_candidate_id=eq.{NOQ}",headers=H("ops"))
pdc("hrbp",NOQ,{"qualification_status":"pending"})
r=requests.post(f"{U}/rest/v1/candidate_financials",headers=H("ops"),json={"demand_candidate_id":NOQ,"client_rate":640,"tjm_status":"approved"})
check("E1 INSERT approved TJM before qualification rejected", not r.ok and fin(NOQ) is None, str(r.status_code))
r=requests.post(f"{U}/rest/v1/candidate_financials",headers=H("ops"),json={"demand_candidate_id":NOQ,"client_rate":640})
check("E2 draft TJM before qualification allowed", r.ok, str(r.status_code))
r=pfin("ops",NOQ,{"tjm_status":"approved"})
check("E3 UPDATE draft->approved before qualification rejected", not r.ok and fin(NOQ)["tjm_status"]=="draft", str(r.status_code))
requests.delete(f"{U}/rest/v1/candidate_financials?demand_candidate_id=eq.{NOQ}",headers=H("ops"))
pdc("hrbp",NOQ,{"qualification_status":"qualified"})
r=pdc("ops",NOQ,{"final_decision":"approved"})
check("E4 final approval of qualified candidate with NO financial record rejected", not r.ok and dc(NOQ)["final_decision"]=="pending", r.text[:80])
for s,n,d in res: print(f"{s}\t{n}\t{d}")
print("TOTAL",sum(1 for x in res if x[0]=="PASS"),"/",len(res))
