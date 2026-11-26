"""Real authenticated compensation-renegotiation regression.

Creates run-scoped synthetic users and business rows, then removes them in finally.
Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.
No existing user, role or business record is modified.
"""
import os
import uuid
import requests

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
RUN = "reneg" + uuid.uuid4().hex[:8]
PASSWORD = "Synth!" + uuid.uuid4().hex[:12]
ROLES = {
    "sourceur": "sourceur",
    "sourceur2": "sourceur",
    "hrbp": "hrbp",
    "operations": "operations",
    "ceo": "ceo",
    "admin": "admin",
}
ADMIN_HEADERS = {
    "apikey": SERVICE,
    "Authorization": "Bearer " + SERVICE,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}
users = {}
tokens = {}
checks = 0
fixture = {"client": str(uuid.uuid4()), "demand": str(uuid.uuid4()), "cv": str(uuid.uuid4()), "dc": str(uuid.uuid4())}
name = "[TEST] compensation renegotiation " + RUN


def check(value, label):
    global checks
    assert value, label
    checks += 1
    print("PASS", label)


def admin(method, path, body=None):
    return requests.request(method, URL + path, headers=ADMIN_HEADERS, json=body, timeout=30)


def call(role, method, resource, body=None):
    headers = {
        "apikey": KEY,
        "Authorization": "Bearer " + tokens[role],
        "Prefer": "return=representation",
    }
    return requests.request(method, URL + "/rest/v1/" + resource, headers=headers, json=body, timeout=30)


def require(response, label):
    assert response.ok, f"{label}: HTTP {response.status_code}: {response.text[:300]}"
    return response.json() if response.content else None


def action(role, name, version=None, contract_type=None, amount=None, currency=None, comment=None):
    body = {"_demand_candidate_id": fixture["dc"], "_action": name}
    if version is not None:
        body["_expected_version"] = version
    if contract_type is not None:
        body["_contract_type"] = contract_type
    if amount is not None:
        body["_amount"] = amount
    if currency is not None:
        body["_currency"] = currency
    if comment is not None:
        body["_comment"] = comment
    return call(role, "POST", "rpc/compensation_action", body)


def proposal():
    rows = require(call("operations", "GET", "compensation_proposals?demand_candidate_id=eq." + fixture["dc"] + "&select=*"), "read proposal")
    return rows[0]


def notifications(role, title):
    return require(call(role, "GET", "notifications?demand_candidate_id=eq." + fixture["dc"] + "&title=eq." + title + "&select=id,title,message"), "read notifications")


def setup_users():
    for key, role in ROLES.items():
        response = admin("POST", "/auth/v1/admin/users", {
            "email": f"{key}.{RUN}@synthetic.test",
            "password": PASSWORD,
            "email_confirm": True,
            "user_metadata": {"full_name": f"[TEST] {key} {RUN}"},
        })
        payload = require(response, "create synthetic " + key)
        users[key] = payload["id"]
        require(admin("DELETE", f"/rest/v1/user_roles?user_id=eq.{payload['id']}"), "clear synthetic bootstrap roles")
        require(admin("POST", "/rest/v1/user_roles", {"user_id": payload["id"], "role": role}), "assign synthetic role")
        login = requests.post(URL + "/auth/v1/token?grant_type=password", headers={"apikey": KEY}, json={
            "email": f"{key}.{RUN}@synthetic.test", "password": PASSWORD,
        }, timeout=30)
        tokens[key] = require(login, "sign in synthetic " + key)["access_token"]


def create_fixture():
    require(call("hrbp", "POST", "clients", {"id": fixture["client"], "name": name}), "create client")
    require(call("hrbp", "POST", "demands", {
        "id": fixture["demand"], "client_id": fixture["client"], "title": name,
        "engagement": "freelance", "assigned_to": users["sourceur"],
    }), "create assigned demand")
    require(call("sourceur", "POST", "talent_hub_cvs", {"id": fixture["cv"], "full_name": name}), "create candidate")
    require(call("sourceur", "POST", "demand_candidates", {
        "id": fixture["dc"], "demand_id": fixture["demand"], "cv_id": fixture["cv"],
    }), "create candidature")


def cleanup():
    # Remove every notification generated for all role holders by this run-scoped candidature.
    admin("DELETE", "/rest/v1/notifications?demand_candidate_id=eq." + fixture["dc"])
    admin("DELETE", "/rest/v1/activity_log?demand_candidate_id=eq." + fixture["dc"])
    admin("DELETE", "/rest/v1/demand_candidates?id=eq." + fixture["dc"])
    admin("DELETE", "/rest/v1/activity_log?demand_id=eq." + fixture["demand"])
    admin("DELETE", "/rest/v1/demands?id=eq." + fixture["demand"])
    admin("DELETE", "/rest/v1/talent_hub_cvs?id=eq." + fixture["cv"])
    admin("DELETE", "/rest/v1/clients?id=eq." + fixture["client"])
    for uid in users.values():
        admin("DELETE", "/rest/v1/user_roles?user_id=eq." + uid)
        admin("DELETE", "/rest/v1/activity_log?author_id=eq." + uid)
        admin("DELETE", "/rest/v1/notifications?user_id=eq." + uid)
        admin("DELETE", "/auth/v1/admin/users/" + uid)


def suite():
    require(call("sourceur", "PATCH", "demand_candidates?id=eq." + fixture["dc"], {"stage": "contacted"}), "contact candidate")
    require(call("sourceur", "PATCH", "demand_candidates?id=eq." + fixture["dc"], {"stage": "screened"}), "screen candidate without mandatory dossier")
    require(call("hrbp", "PATCH", "demand_candidates?id=eq." + fixture["dc"], {"qualification_status": "qualified"}), "HRBP qualification")
    require(call("operations", "PATCH", "demand_candidates?id=eq." + fixture["dc"], {"final_decision": "approved"}), "Operations candidate approval")

    p = require(action("sourceur", "submit", contract_type="cdi", amount=4000, currency="EUR"), "Sourceur submits compensation")[0]
    check(p["status"] == "pending_manager_review" and float(p["original_amount"]) == 4000, "initial CDI salary and original snapshot stored")
    p = require(action("hrbp", "forward", p["version"]), "HRBP forwards compensation")[0]
    check(p["status"] == "pending_operations_review", "proposal awaits Operations")

    check(not action("sourceur", "save_renegotiation", p["version"], amount=3900).ok, "Sourceur cannot revise before Operations requests renegotiation")
    check(not action("hrbp", "return_to_manager", p["version"], comment="Please renegotiate").ok, "HRBP cannot perform Operations renegotiation action")
    check(not action("operations", "return_to_manager", p["version"]).ok, "renegotiation instructions are mandatory")
    p = require(action("operations", "return_to_manager", p["version"], comment="Please renegotiate the salary with the candidate"), "Operations requests renegotiation")[0]
    check(p["status"] == "returned_to_manager" and p["last_return_reason"] == "Please renegotiate the salary with the candidate", "renegotiation status and instructions stored")
    check(len(notifications("hrbp", "Compensation renegotiation requested")) == 1, "HRBP notified of Operations renegotiation request")
    candidate = require(call("operations", "GET", "demand_candidates?id=eq." + fixture["dc"] + "&select=qualification_status,final_decision,stage"), "candidate preserved")[0]
    check(candidate["qualification_status"] == "qualified" and candidate["final_decision"] == "approved" and candidate["stage"] != "placed", "renegotiation does not undo candidate reviews or reject candidate")
    check(not call("sourceur", "PATCH", "demand_candidates?id=eq." + fixture["dc"], {"stage": "placed"}).ok, "placement remains blocked during renegotiation")

    for role in ["sourceur2", "ceo", "admin"]:
        check(not action(role, "save_renegotiation", p["version"], amount=3900).ok, role + " cannot revise renegotiation terms")
    check(not action("sourceur", "save_renegotiation", p["version"], amount=-1).ok, "negative revised amount rejected")
    check(not action("sourceur", "save_renegotiation", p["version"], contract_type="freelance").ok, "contract-type change requires a new amount")
    revised = require(action("sourceur", "save_renegotiation", p["version"], contract_type="freelance", amount=390, currency="EUR", comment="Candidate agreed to freelance"), "Sourceur saves revised terms")[0]
    check(revised["status"] == "returned_to_manager" and revised["manager_contract_type"] == "freelance" and float(revised["manager_amount"]) == 390, "Sourceur revision remains awaiting HRBP validation")
    check(revised["original_contract_type"] == "cdi" and float(revised["original_amount"]) == 4000, "original candidate request remains preserved")
    check(len(notifications("hrbp", "Revised compensation awaiting HRBP validation")) == 1, "HRBP notified when Sourcer revises terms")
    check(not action("sourceur", "forward", revised["version"]).ok, "Sourceur cannot resubmit directly to Operations")
    check(not action("sourceur", "submit", revised["version"], amount=380).ok, "Sourceur cannot bypass HRBP with initial-submit action")

    reviewed = require(action("hrbp", "manager_review", revised["version"], contract_type="cdd", amount=3750, currency="EUR", comment="Draft HRBP revision"), "HRBP saves an intermediate revision")[0]
    check(reviewed["status"] == "returned_to_manager" and reviewed["manager_contract_type"] == "cdd" and float(reviewed["manager_amount"]) == 3750, "HRBP intermediate review keeps renegotiation open for both editors")
    p = require(action("hrbp", "forward", reviewed["version"], contract_type="cdd", amount=3700, currency="EUR", comment="Validated revised CDD"), "HRBP validates and resubmits")[0]
    check(p["status"] == "pending_operations_review" and p["manager_contract_type"] == "cdd" and float(p["manager_amount"]) == 3700, "HRBP can revise contract type and salary before resubmission")
    check(len(notifications("operations", "Compensation awaiting Operations approval")) >= 1, "Operations notified of HRBP resubmission")
    history = require(call("operations", "GET", "compensation_audit?demand_candidate_id=eq." + fixture["dc"] + "&order=id&select=action,actor_role,to_status,old_contract_type,new_contract_type,old_amount,new_amount,comment"), "read history")
    sourceur_revision = next(row for row in history if row["action"] == "save_renegotiation")
    check(sourceur_revision["actor_role"] == "sourceur" and sourceur_revision["old_contract_type"] == "cdi" and sourceur_revision["new_contract_type"] == "freelance" and float(sourceur_revision["new_amount"]) == 390, "Sourceur revision is fully audited")
    manager_revision = next(row for row in history if row["action"] == "manager_review" and row["comment"] == "Draft HRBP revision")
    check(manager_revision["to_status"] == "returned_to_manager", "HRBP intermediate revision preserves renegotiation status in history")
    check(manager_revision["old_contract_type"] == "freelance" and manager_revision["new_contract_type"] == "cdd" and float(manager_revision["old_amount"]) == 390 and float(manager_revision["new_amount"]) == 3750, "HRBP intermediate revision is fully audited")
    check(history[-1]["action"] == "forward" and history[-1]["actor_role"] == "hrbp" and float(history[-1]["old_amount"]) == 3750 and float(history[-1]["new_amount"]) == 3700, "HRBP final revision and resubmission are fully audited")

    p = require(action("operations", "approve", p["version"], comment="Approved after renegotiation"), "Operations approves revised terms")[0]
    check(p["status"] == "approved" and p["final_contract_type"] == "cdd" and float(p["final_amount"]) == 3700, "final approval stores revised compensation")
    for stage in ["submitted", "client_interview", "offer", "placed"]:
        require(call("sourceur", "PATCH", "demand_candidates?id=eq." + fixture["dc"], {"stage": stage}), "advance candidate to " + stage)
    demand = require(call("operations", "GET", "demands?id=eq." + fixture["demand"] + "&select=lifecycle,commercial_outcome"), "read closed demand")[0]
    check(demand["lifecycle"] == "filled" and demand["commercial_outcome"] == "won", "placement still closes demand after renegotiation loop")


if __name__ == "__main__":
    try:
        setup_users()
        create_fixture()
        suite()
        print(f"{checks} authenticated renegotiation checks passed")
    finally:
        cleanup()
        remaining = admin("GET", "/rest/v1/demand_candidates?id=eq." + fixture["dc"] + "&select=id").json()
        assert remaining == [], "synthetic candidature cleanup failed"
        print("Synthetic users and business fixtures removed")
