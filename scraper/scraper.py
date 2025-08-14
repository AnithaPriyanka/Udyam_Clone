#!/usr/bin/env python3
"""Udyam Step 1 & 2 scraper

Usage:
    python3 scraper/scraper.py

Dependencies:
    pip install pyppeteer beautifulsoup4
"""
import asyncio
import json
import logging
from typing import List, Dict, Any, Optional

from bs4 import BeautifulSoup  # type: ignore
import os
import pyppeteer
from pyppeteer import launch  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
LOGGER = logging.getLogger("scraper")

UDYAM_URL = "https://udyamregistration.gov.in/UdyamRegistration.aspx"

def to_camel(s: str) -> str:
    import re
    s = re.sub(r"[^a-zA-Z0-9]+", " ", s).strip()
    parts = s.split()
    if not parts:
        return "field"
    return parts[0].lower() + "".join(p.title() for p in parts[1:])

async def launch_and_extract(output_path: str = "../backend/schema/formSchema.json") -> None:
    browser = await launch(
        headless=True,
        args=["--no-sandbox", "--disable-setuid-sandbox"],
    )
    page = await browser.newPage()
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36")
    try:
        LOGGER.info("Navigating to Udyam portal...")
        await page.goto(UDYAM_URL, {'timeout': 60000})
        await asyncio.sleep(5) # Increased sleep to allow page to render
        # Custom wait for Aadhaar field to be visible
        async def wait_for_aadhaar_field(page, timeout=90):
            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtAadhaar', {'visible': True, 'timeout': timeout * 1000})
        await wait_for_aadhaar_field(page)

        # Heuristics: try to reveal Step 1 / 'New Registration' content
        # We attempt multiple clickable candidates by text.
        async def click_by_text(candidates: List[str]) -> bool:
            for text in candidates:
                el = await page.Jx(f"//*[contains(translate(normalize-space(text()), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), '{text.upper()}')]")
                if el:
                    try:
                        await el[0].click()
                        await asyncio.sleep(1.2)
                        return True
                    except Exception as e:
                        LOGGER.warning(f"Failed click on '{text}': {e}")
            return False

        await click_by_text(["NEW REGISTRATION", "AADHAAR", "REGISTRATION"])

        # Wait for potential Aadhaar/PAN inputs (selectors are heuristic)
        # We will search inputs afterwards regardless.
        await asyncio.sleep(2)

        # Fill Aadhaar Number and Name of Entrepreneur
        try:
            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtAadhaar', {'visible': True})
            await page.type('#ctl00_ContentPlaceHolder1_txtAadhaar', '988350854804') # Dummy Aadhaar Number
            LOGGER.info("Filled Aadhaar Number.")
            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtName', {'visible': True})
            await page.type('#ctl00_ContentPlaceHolder1_txtName', 'Konna Anitha Priyanka') # Dummy Name
            LOGGER.info("Filled Name of Entrepreneur.")
            await page.click('#ctl00_ContentPlaceHolder1_chkAgree') # Click declaration checkbox
            LOGGER.info("Clicked declaration checkbox.")
            await asyncio.sleep(2) # Short sleep after filling initial fields

            # Try to click the "Validate & Generate OTP" button to proceed to the next step
            await page.click('#ctl00_ContentPlaceHolder1_btnValidateAadhaar')
            LOGGER.info("Clicked 'Validate & Generate OTP' button.")
            await asyncio.sleep(5) # Increased sleep to give more time for the next page/section to load
            await page.screenshot({'path': 'debug_after_otp_click.png'}) # Take a screenshot for debugging
        except Exception as e:
            LOGGER.warning(f"Could not click 'Validate & Generate OTP' button: {e}")

        # Try to fill OTP and click Validate button
        try:
            # Wait for the OTP input field to appear and then fill it
            await page.waitForSelector('#ctl00_ContentPlaceHolder1_txtOTP', {'visible': True})
            await page.type('#ctl00_ContentPlaceHolder1_txtOTP', '123456') # Fill with dummy OTP
            LOGGER.info("Filled OTP field.")

            # Wait for the Validate button to appear and then click it
            await page.waitForSelector('#ctl00_ContentPlaceHolder1_btnValidateOTP', {'visible': True})
            await page.click('#ctl00_ContentPlaceHolder1_btnValidateOTP')
            LOGGER.info("Clicked 'Validate OTP' button.")
            await asyncio.sleep(5) # Give time for the next page/section to load
            await page.screenshot({'path': 'debug_after_otp_validation.png'}) # Take a screenshot for debugging
        except Exception as e:
            LOGGER.warning(f"Could not fill OTP or click Validate button: {e}")

        # Try to navigate to step 2 area too (PAN)
        await click_by_text(["PAN", "VALIDATE PAN", "STEP 2", "NEXT"])
        await asyncio.sleep(1.5)

        # Evaluate full HTML to parse both steps generically
        html = await page.content()

        # Optional visibility map via DOM check
        visibility_js = """() => {
            const map = {};
            const all = Array.from(document.querySelectorAll('input,select,textarea'));
            all.forEach((el, idx) => {
                const r = el.getBoundingClientRect();
                const visible = !!(r.width || r.height);
                const key = el.id || el.name || `field_${idx}`;
                map[key] = visible;
            });
            return map;
        }"""
        vis = await page.evaluate(visibility_js)

    finally:
        await browser.close()

    # Parse with BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    fields: List[Dict[str, Any]] = []
    order = 0

    def add_field(el, step_guess: int):
        nonlocal order
        tag = el.name
        t = el.get("type", "text").lower() if tag == "input" else ("select" if tag == "select" else ("textarea" if tag == "textarea" else "text"))
        if t == "hidden": # Filter out hidden fields
            return
        fid = el.get("id") or ""
        name = el.get("name") or fid or to_camel((el.get("title") or "") + " " + (el.get("placeholder") or ""))
        placeholder = el.get("placeholder") or ""
        required = el.has_attr("required")

        # find label by for= or parent <label>
        label_text = ""
        if fid:
            lab = soup.select_one(f"label[for='{fid}']")
            if lab and lab.text:
                label_text = lab.text.strip()
        if not label_text:
            parent_label = el.find_parent("label")
            if parent_label and parent_label.text:
                label_text = parent_label.text.strip()
        if not label_text:
            # heuristic: previous sibling label
            prev = el.find_previous("label")
            if prev and prev.text:
                label_text = prev.text.strip()
        # New improvement: For certain types, use element's own text content as label
        if not label_text and tag in ["button", "input"] and t in ["submit", "button", "checkbox", "radio"]:
            element_text = el.get_text(strip=True)
            if element_text:
                label_text = element_text

        # validation extraction
        pattern = el.get("pattern")
        minlength = el.get("minlength")
        maxlength = el.get("maxlength")
        validation = None
        msg = None

        label_upper = (label_text or name).upper()

        if pattern:
            msg = "Invalid format"
        else:
            # Heuristics for Aadhaar & PAN
            if "AADHAAR" in label_upper or "AADHAR" in label_upper or name.lower().startswith("aadhaar"):
                pattern = r"^\d{12}$"
                msg = "Aadhaar must be exactly 12 digits"
            if "PAN" in label_upper or name.lower().startswith("pan"):
                pattern = r"^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$"
                msg = "PAN must be in the format ABCDE1234F"

        if pattern or minlength or maxlength:
            validation = {
                "pattern": pattern or "",
                "message": msg or "Invalid value",
                "minLength": int(minlength) if minlength else None,
                "maxLength": int(maxlength) if maxlength else None,
            }

        # select options
        options = None
        if tag == "select":
            options = []
            for opt in el.find_all("option"):
                options.append({"value": opt.get("value", ""), "label": (opt.text or "").strip()})

        # visibility
        visible_key = fid or name
        visible = bool(vis.get(visible_key, True)) if isinstance(vis, dict) else True

        fields.append({
            "name": name,
            "id": fid or None,
            "label": label_text or name,
            "step": step_guess,
            "type": t,
            "placeholder": placeholder,
            "required": bool(required),
            "validation": validation,
            "options": options,
            "visible": visible,
            "rawAttributes": {k: v for k, v in el.attrs.items()},
            "_order": order,
        })
        order += 1

    # Try to identify containers for steps, else fallback by keyword heuristics per field
    containers = soup.select("#step1, #Step1, [id*='step1' i], #step2, #Step2, [id*='step2' i], form")
    if not containers:
        containers = [soup]

    for c in containers:
        for el in c.select("input, select, textarea"):
            # guess step by nearby text
            parent_text = (c.text or "").upper()
            step_guess = 1 if ("AADHAAR" in parent_text or "OTP" in parent_text) else (2 if "PAN" in parent_text else 1)
            add_field(el, step_guess)

    # sort by original order
    fields.sort(key=lambda x: x["_order"])  # for debug
    for f in fields:
        f.pop("_order", None)

    # Ensure directory exists
    out_path = os.path.abspath(os.path.join(os.path.dirname(__file__), output_path))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as fp:
        json.dump(fields, fp, indent=2, ensure_ascii=False)

    LOGGER.info("Wrote schema with %d fields -> %s", len(fields), out_path)

if __name__ == "__main__":
    asyncio.get_event_loop().run_until_complete(launch_and_extract())
