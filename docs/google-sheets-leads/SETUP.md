# Misguided Yutes: saving orders to Google Sheets (about 10 minutes)

Until this is done the site runs in **preview mode**: orders still go to WhatsApp, but nothing is saved anywhere.

## Why a Sheet and not a Google Form

A Google Form can't take a cart (no line items, quantities, totals, or "did the WhatsApp message go through?"). So the site posts each confirmed order to a small Google Apps Script web app, which writes it into a Google Sheet. To the owner it behaves like a form's response sheet: one tab per kind of lead, newest at the bottom, plus an email for each order and a PDF copy.

**Which link goes where:** the link you need is the **Web app URL** from step 5 (it looks like `https://script.google.com/macros/s/.../exec`). It is NOT a Google Form link. It goes into `src/data/site.json` as `leads.url`, or into the Netlify environment variable `PUBLIC_LEADS_URL`.

## Steps

1. **Make the sheet.** In Google Sheets create a blank spreadsheet called `Misguided Yutes orders`, using the Google account that should own the data.
2. **Open the script editor.** Extensions > Apps Script. Delete what is there and paste in all of `Code.gs` from this folder.
3. **The secret is already matched.** `TOKEN` in `Code.gs` is the same string as `leads.token` in `src/data/site.json`, so there is nothing to copy. To change it, change it in both places.
4. **Set the owner's email.** Near the top of `Code.gs`, replace `CHANGE-ME@example.com` in `OWNER_EMAIL`. Until you do, rows are still saved but no emails are sent. Save (Ctrl+S).
5. **Run `setup`, then deploy.**
   - Pick `setup` in the function dropdown and press Run. Approve the permissions (Sheets, Drive, Gmail send). It creates the three tabs (**Orders, Subscribers, Problems**) and schedules the 8pm daily summary (Atlanta time).
   - Deploy > New deployment > type **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the **Web app URL** (ends in `/exec`).
6. **Connect the site.** Either set `leads.url` in `src/data/site.json`, or (nicer on Netlify) add `PUBLIC_LEADS_URL` under Site configuration > Environment variables, then redeploy. Leave `token` as it is.
7. **Test it live.** Add something to the cart, fill the order form and press the WhatsApp button. Come back to the tab and answer **Yes, I sent it**. Within a few seconds there is a row in `Orders`, an email, and a PDF in the Drive folder `Misguided Yutes orders`. Then do an order and answer **No**: a row appears in `Problems` and you get a "follow up" email. The welcome-gate email box fills `Subscribers`.

## What each tab holds

| Tab | Columns |
|---|---|
| Orders | Received, Ref, Name, Phone, Email, Country, Address, Note, Items, Subtotal (USD), PDF |
| Subscribers | Received, Email, Source |
| Problems | Received, Ref, Name, Phone, Email, Contact left, What happened, Note, Items, Subtotal (USD) |

Refs look like `MGY-ORD-1124-4F2K` and match what the customer sent on WhatsApp, so you can search the sheet for what you see in the chat.

## Good to know

- The token is visible in the site's JavaScript, so it only stops casual spam, not a determined attacker. Anyone who has it can add rows but cannot read the sheet.
- Changing `Code.gs` later needs **Deploy > Manage deployments > edit > New version**, otherwise the old code keeps running.
- Orders are logged only after the customer answers Yes to "Did your message go through?". A No goes to `Problems`, so unsent orders never look like real ones.
- The page can't read Google's reply (browser rules), so it never tells the customer "saved". WhatsApp is the source of truth; the sheet is a log.
- If the PDF step fails (Drive quota, permissions) the row and the email still go through, with an empty PDF cell.
- Cells that start with `=`, `+`, `-` or `@` are stored with a leading apostrophe so nobody can inject a formula through the address box.
- `npm test` checks this script's logic against a mock of Google's services. It cannot prove the real deployment works: step 7 is the real test.
