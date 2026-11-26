"""Real authenticated interview checks; temporary users/records are always cleaned up.

Reuses the existing synthetic-user fixture helpers. No existing business rows are changed.
"""
from datetime import datetime, timedelta, timezone
from compensation_renegotiation import (
    admin, call, check, cleanup, create_fixture, fixture, require, setup_users, users,
)


def payload(**changes):
    return {
        "demand_candidate_id": fixture["dc"],
        "starts_at": datetime.now(timezone.utc).replace(hour=10, minute=30, second=0, microsecond=0).isoformat(),
        "timezone": "UTC", "mode": "online",
        "meeting_url": "https://meet.example.com/interview", "notes": "Client interview",
        **changes,
    }


def main():
    try:
        setup_users()
        create_fixture()
        require(call("sourceur", "PATCH", "talent_hub_cvs?id=eq." + fixture["cv"], {
            "phone": "+33600000000", "email": "candidate@synthetic.test",
        }), "set temporary candidate contacts")
        row = require(call("sourceur", "POST", "candidate_interviews", payload()), "Sourcer schedules interview")[0]
        resource = "candidate_interviews?id=eq." + row["id"]
        check(row["mode"] == "online", "Online/visio interview stored")
        for role in ["sourceur", "hrbp", "operations"]:
            rows = require(call(role, "GET", resource + "&select=*"), role + " reads interview")
            check(len(rows) == 1, role + " sees interview")
            contacts = require(call(role, "GET", "demand_candidates?id=eq." + fixture["dc"] + "&select=talent_hub_cvs(phone,email)"), role + " reads contacts")[0]["talent_hub_cvs"]
            check(contacts == {"phone": "+33600000000", "email": "candidate@synthetic.test"}, role + " sees only selected mobile and email")
        for role in ["sourceur2", "ceo", "admin"]:
            check(require(call(role, "GET", resource), role + " read") == [], role + " cannot read interview")
        for role in ["sourceur2", "operations", "ceo", "admin"]:
            response = call(role, "POST", "candidate_interviews", payload())
            check(response.status_code in [401, 403], role + " cannot schedule")
            response = call(role, "PATCH", resource, {"notes": "Unauthorized"})
            check(response.status_code in [401, 403] or response.ok and response.json() == [], role + " cannot edit")
            response = call(role, "DELETE", resource)
            check(response.status_code in [401, 403] or response.ok and response.json() == [], role + " cannot delete")
            from compensation_renegotiation import URL, KEY, tokens
            import requests
            response = requests.post(URL + "/rest/v1/candidate_interviews?on_conflict=id", headers={"apikey": KEY, "Authorization": "Bearer " + tokens[role], "Prefer": "resolution=merge-duplicates,return=representation"}, json={"id": row["id"], **payload(notes="Unauthorized upsert")}, timeout=30)
            check(response.status_code in [401, 403], role + " cannot upsert")
        hrbp = require(call("hrbp", "PATCH", resource, {"mode": "onsite", "location": "Client office", "meeting_url": ""}), "HRBP reschedules")[0]
        check(hrbp["mode"] == "onsite" and hrbp["location"] == "Client office", "HRBP edits to onsite")
        check(require(call("sourceur", "GET", resource), "Sourcer reads update")[0]["mode"] == "onsite", "Sourcer sees HRBP changes")
        second = require(call("hrbp", "POST", "candidate_interviews", payload(starts_at=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat())), "HRBP schedules second round")[0]
        date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        rows = require(call("operations", "GET", "candidate_interviews?demand_candidate_id=eq." + fixture["dc"] + "&starts_at=gte." + date.isoformat().replace("+00:00", "Z") + "&starts_at=lt." + (date + timedelta(days=1)).isoformat().replace("+00:00", "Z")), "Operations today query")
        check(len(rows) == 1 and rows[0]["id"] == row["id"], "Today excludes tomorrow's interview")
        for invalid in [{"mode": "phone"}, {"meeting_url": "javascript:alert(1)"}, {"starts_at": None}, {"timezone": "Invalid/Zone"}]:
            check(call("hrbp", "POST", "candidate_interviews", payload(**invalid)).status_code == 400, "Database rejects invalid interview " + next(iter(invalid)))
        from compensation_renegotiation import URL, KEY
        import requests
        response = requests.get(URL + "/rest/v1/" + resource, headers={"apikey": KEY}, timeout=30)
        check(response.status_code in [401, 403] or response.ok and response.json() == [], "Anonymous cannot read interview")
        require(call("hrbp", "PATCH", "demands?id=eq." + fixture["demand"], {"assigned_to": users["sourceur2"]}), "Reassign temporary demand")
        check(require(call("sourceur", "GET", resource), "Former Sourcer read") == [], "Reassignment revokes former Sourcer access")
        check(len(require(call("sourceur2", "GET", resource), "New Sourcer read")) == 1, "New assigned Sourcer sees interview")
        removed = require(call("hrbp", "DELETE", "candidate_interviews?id=eq." + second["id"]), "HRBP removes second round")
        check(len(removed) == 1, "HRBP can delete interview")
        check(require(call("operations", "GET", "demand_candidates?id=eq." + fixture["dc"] + "&select=stage"), "Read stage")[0]["stage"] == "identified", "Scheduling does not bypass pipeline approvals")
    finally:
        admin("DELETE", "/rest/v1/candidate_interviews?demand_candidate_id=eq." + fixture["dc"])
        cleanup()


if __name__ == "__main__":
    main()