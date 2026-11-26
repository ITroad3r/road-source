"""Signed-in desktop/mobile UI regression for Operations-requested renegotiation.

Uses the run-scoped synthetic fixtures and cleanup from the API regression.
"""
import asyncio
import re
import sys
from pathlib import Path
from playwright.async_api import async_playwright, expect

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from security.compensation_renegotiation import (  # noqa: E402
    PASSWORD, RUN, action, cleanup, create_fixture, name, proposal, require, setup_users,
)

APP = "http://localhost:8080"
SHOTS = Path("/tmp/browser/compensation-renegotiation")
SHOTS.mkdir(parents=True, exist_ok=True)


async def sign_in(browser, role, language="en", mobile=False):
    context = await browser.new_context(
        viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 1800},
        is_mobile=mobile,
        has_touch=mobile,
    )
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    await page.goto(APP + "/auth", wait_until="domcontentloaded")
    await page.evaluate("lang => localStorage.setItem('roadsource-lang', lang)", language)
    await page.reload(wait_until="domcontentloaded")
    await page.locator("#si-email").fill(f"{role}.{RUN}@synthetic.test")
    await page.locator("#si-pw").fill(PASSWORD)
    await page.locator("form button[type=submit]").first.click()
    await page.wait_for_url(re.compile(r"/dashboard"), timeout=30000)
    page._test_errors = errors
    return context, page


async def open_proposal(page, tab_pattern, open_label):
    await page.goto(APP + "/compensation", wait_until="domcontentloaded")
    await page.get_by_role("tab", name=re.compile(tab_pattern)).click()
    row = page.locator("li", has_text=name)
    await expect(row).to_be_visible(timeout=20000)
    await row.get_by_role("button", name=open_label, exact=True).click()
    dialog = page.get_by_role("dialog")
    await expect(dialog).to_be_visible()
    return dialog


async def confirm_action(page, dialog, button_label, confirm_label, comment_label, comment):
    await dialog.get_by_role("button", name=button_label, exact=True).click()
    alert = page.get_by_role("alertdialog")
    await expect(alert).to_be_visible()
    await alert.get_by_label(re.compile(comment_label)).fill(comment)
    await alert.get_by_role("button", name=confirm_label, exact=True).click()
    await expect(alert).to_be_hidden(timeout=20000)


async def choose_contract(page, dialog, label_pattern, option):
    await dialog.get_by_role("combobox", name=re.compile(label_pattern)).click()
    await page.get_by_role("option", name=option, exact=True).click()


async def main():
    setup_users()
    create_fixture()
    try:
        submitted = require(action("sourceur", "submit", contract_type="cdi", amount=4000, currency="EUR"), "UI fixture submit")[0]
        require(action("hrbp", "forward", submitted["version"]), "UI fixture forward")
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                # Operations, English desktop: see the request and return it to HRBP.
                context, page = await sign_in(browser, "operations")
                dialog = await open_proposal(page, "Compensation approval", "Open compensation")
                await expect(dialog.get_by_text("CDI", exact=True).first).to_be_visible()
                await expect(dialog.get_by_text("4,000.00", exact=False).first).to_be_visible()
                await page.screenshot(path=str(SHOTS / "1_operations_review_desktop_en.png"))
                await confirm_action(page, dialog, "Request renegotiation from HRBP", "Confirm", "Comment / justification", "Please renegotiate with the candidate")
                assert proposal()["status"] == "returned_to_manager"
                await expect(dialog.get_by_text("Renegotiation requested by Operations", exact=True).first).to_be_visible(timeout=15000)
                await page.screenshot(path=str(SHOTS / "2_operations_requested_desktop_en.png"))
                assert not page._test_errors, page._test_errors
                await context.close()

                # Assigned Sourcer, French mobile: revise contract type and TJM, but do not resubmit.
                context, page = await sign_in(browser, "sourceur", "fr", True)
                dialog = await open_proposal(page, "Mes propositions à compléter", "Ouvrir la rémunération")
                await expect(dialog.get_by_text("Instructions de renégociation des Opérations", exact=False)).to_be_visible()
                await choose_contract(page, dialog, "Type de contrat", "Freelance")
                await dialog.locator("input[type=number]").fill("390")
                await page.screenshot(path=str(SHOTS / "3_sourceur_revision_mobile_fr.png"))
                await confirm_action(page, dialog, "Enregistrer les conditions révisées pour validation HRBP", "Confirmer", "Commentaire / justification", "TJM négocié avec le candidat")
                assert proposal()["status"] == "returned_to_manager"
                assert proposal()["manager_contract_type"] == "freelance"
                assert float(proposal()["manager_amount"]) == 390
                await expect(dialog.get_by_role("button", name="Soumettre au manager", exact=True)).to_have_count(0)
                await page.screenshot(path=str(SHOTS / "4_sourceur_revised_mobile_fr.png"))
                assert not page._test_errors, page._test_errors
                await context.close()

                # HRBP, English desktop: revise again and validate/resubmit.
                context, page = await sign_in(browser, "hrbp")
                dialog = await open_proposal(page, "Validation & renegotiation", "Open compensation")
                await expect(dialog.get_by_text("Current revised terms", exact=True)).to_be_visible()
                await choose_contract(page, dialog, "Contract type", "CDD")
                await dialog.locator("input[type=number]").fill("3700")
                await confirm_action(page, dialog, "Approve & forward to Operations", "Confirm", "Comment / justification", "Validated revised CDD")
                assert proposal()["status"] == "pending_operations_review"
                assert proposal()["manager_contract_type"] == "cdd"
                assert float(proposal()["manager_amount"]) == 3700
                await page.screenshot(path=str(SHOTS / "5_hrbp_resubmitted_desktop_en.png"))
                assert not page._test_errors, page._test_errors
                await context.close()

                # Operations approves the revised proposal and the history remains visible.
                context, page = await sign_in(browser, "operations")
                dialog = await open_proposal(page, "Compensation approval", "Open compensation")
                await confirm_action(page, dialog, "Approve compensation", "Confirm", "Comment / justification", "Approved after renegotiation")
                assert proposal()["status"] == "approved"
                await expect(dialog.get_by_text("Approved by Operations", exact=True).first).to_be_visible(timeout=15000)
                await expect(dialog.get_by_text("Save revised terms for HRBP validation", exact=True)).to_be_visible()
                await page.screenshot(path=str(SHOTS / "6_operations_approved_history_desktop_en.png"))
                assert not page._test_errors, page._test_errors
                await context.close()
            finally:
                await browser.close()
        print("PASS Operations review and mandatory-instruction renegotiation UI (English desktop)")
        print("PASS assigned Sourcer revision without direct resubmission (French mobile)")
        print("PASS HRBP revision, validation and resubmission UI (English desktop)")
        print("PASS Operations approval and revision history UI (English desktop)")
        print("4 signed-in UI scenarios passed; no browser page errors")
    finally:
        cleanup()
        print("Synthetic UI users and business fixtures removed")


if __name__ == "__main__":
    asyncio.run(main())
