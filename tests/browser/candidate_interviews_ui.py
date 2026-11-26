"""Signed-in scheduling and daily interview UI regression; temporary fixtures only."""
import asyncio
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.async_api import async_playwright, expect

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "security"))
from compensation_renegotiation import PASSWORD, RUN, admin, call, cleanup, create_fixture, fixture, name, require, setup_users
from candidate_interviews import payload

SHOTS = Path("/tmp/browser/candidate-interviews")
SHOTS.mkdir(parents=True, exist_ok=True)


async def login(browser, role, language="en", mobile=False):
    context = await browser.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 1800}, timezone_id="UTC")
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    await page.goto("http://localhost:8080/auth", wait_until="domcontentloaded")
    await page.evaluate("lang => localStorage.setItem('roadsource-lang', lang)", language)
    await page.reload(wait_until="domcontentloaded")
    await page.locator("#si-email").fill(f"{role}.{RUN}@synthetic.test")
    await page.locator("#si-pw").fill(PASSWORD)
    await page.locator("form button[type=submit]").first.click()
    await page.wait_for_url(re.compile("/dashboard"), timeout=30000)
    return context, page, errors


async def main():
    try:
        setup_users()
        create_fixture()
        require(call("sourceur", "PATCH", "talent_hub_cvs?id=eq." + fixture["cv"], {"phone": "+33600000000", "email": "candidate@synthetic.test"}), "Set UI candidate contacts")
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context, page, errors = await login(browser, "sourceur")
            await page.goto("http://localhost:8080/demands/" + fixture["demand"], wait_until="domcontentloaded")
            await page.get_by_role("button", name="Interview", exact=True).click(timeout=20000)
            dialog = page.get_by_role("dialog")
            await expect(dialog.get_by_text("+33600000000", exact=True)).to_be_visible()
            await expect(dialog.get_by_text("candidate@synthetic.test", exact=True)).to_be_visible()
            await dialog.get_by_role("button", name="Schedule interview", exact=True).click()
            await dialog.get_by_role("button", name="Interview date", exact=True).click()
            today = datetime.now(timezone.utc)
            # Calendar's accessible day labels include the full month/day/year.
            day_label = today.strftime("%A, %B %-d")
            await page.get_by_role("button", name=re.compile(re.escape(day_label))).first.click()
            await dialog.get_by_label("Interview time", exact=True).fill("14:30")
            await dialog.get_by_label("Meeting link", exact=True).fill("https://meet.example.com/client-review")
            await dialog.get_by_label("Notes", exact=True).fill("Client confirmed interview")
            await dialog.get_by_role("button", name="Save interview", exact=True).click()
            await expect(dialog.get_by_role("link", name="Join meeting", exact=True)).to_be_visible(timeout=15000)
            await dialog.screenshot(path=str(SHOTS / "1_sourcer_scheduled.png"))
            await page.keyboard.press("Escape")
            await page.goto("http://localhost:8080/dashboard", wait_until="domcontentloaded")
            section = page.get_by_role("region", name="Today's client interviews", exact=True)
            await expect(section.get_by_text(name, exact=True)).to_be_visible(timeout=20000)
            await expect(section.get_by_text("14:30", exact=True)).to_be_visible()
            await section.screenshot(path=str(SHOTS / "2_sourcer_today.png"))
            assert not errors, errors
            await context.close()

            context, page, errors = await login(browser, "operations")
            section = page.get_by_role("region", name="Today's client interviews", exact=True)
            await expect(section.get_by_text(name, exact=True)).to_be_visible(timeout=20000)
            row = section.locator("li", has_text=name)
            await row.get_by_role("button", name="Details", exact=True).click()
            dialog = page.get_by_role("dialog")
            await expect(dialog.get_by_text("+33600000000", exact=True)).to_be_visible()
            await expect(dialog.get_by_text("candidate@synthetic.test", exact=True)).to_be_visible()
            await expect(dialog.get_by_role("button", name="Schedule interview", exact=True)).to_have_count(0)
            await expect(dialog.get_by_role("button", name="Edit interview", exact=True)).to_have_count(0)
            await dialog.screenshot(path=str(SHOTS / "3_operations_readonly.png"))
            assert not errors, errors
            await context.close()

            context, page, errors = await login(browser, "hrbp", "fr", True)
            section = page.get_by_role("region", name="Entretiens du jour", exact=True)
            await expect(section.get_by_text(name, exact=True)).to_be_visible(timeout=20000)
            await section.locator("li", has_text=name).get_by_role("button", name="Détails", exact=True).click()
            dialog = page.get_by_role("dialog")
            await dialog.get_by_role("button", name="Modifier l’entretien", exact=True).click()
            await dialog.get_by_label("Heure de l’entretien", exact=True).fill("16:45")
            await dialog.get_by_role("button", name="Sur site", exact=True).click()
            await dialog.get_by_label("Adresse du client", exact=True).fill("12 Rue du Client, Paris")
            await dialog.get_by_role("button", name="Enregistrer l’entretien", exact=True).click()
            await expect(dialog.get_by_text("12 Rue du Client, Paris", exact=True)).to_be_visible(timeout=15000)
            await dialog.screenshot(path=str(SHOTS / "4_hrbp_mobile_rescheduled.png"))
            assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Mobile page overflow"
            assert not errors, errors
            await page.keyboard.press("Escape")
            await expect(section.get_by_text("16:45", exact=True)).to_be_visible(timeout=15000)
            await section.screenshot(path=str(SHOTS / "5_hrbp_mobile_today.png"))
            await context.close()

            # Tomorrow must not be included in today's dashboard.
            require(call("hrbp", "POST", "candidate_interviews", payload(starts_at=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat())), "Tomorrow interview")
            context, page, errors = await login(browser, "sourceur", "en", True)
            section = page.get_by_role("region", name="Today's client interviews", exact=True)
            await expect(section.get_by_text(name, exact=True)).to_be_visible(timeout=20000)
            await expect(section.locator("li", has_text=name)).to_have_count(1)
            await expect(section.get_by_text("16:45", exact=True)).to_be_visible()
            await section.screenshot(path=str(SHOTS / "6_sourcer_mobile_updated.png"))
            assert not errors, errors
            await context.close()
            await browser.close()
            print("PASS: Sourcer scheduling, HRBP rescheduling, Operations read-only contacts, same-day filtering, EN/FR desktop/mobile; no page errors")
    finally:
        admin("DELETE", "/rest/v1/candidate_interviews?demand_candidate_id=eq." + fixture["dc"])
        cleanup()


if __name__ == "__main__":
    asyncio.run(main())