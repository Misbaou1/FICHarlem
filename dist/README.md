# FUTA Islamic School - online registration

Replaces the Google Form. Pick the number of children and you get a full set of
fields for each child, in English or French, and every submission lands in a
Google Sheet.

    index.html     the form
    styles.css     styling
    text.js        all the English and French wording
    app.js         the logic
    Code.gs        goes in Google Apps Script, NOT on the website
    HANDOFF.md     instructions for whoever maintains ficny.org

Fees and rules come from *FUTA Islamic School 2026-2027 Rules & Regulations*.


## Why not the Google Form

The Google Form asks for the first child properly, then asks for the rest in
free-text boxes ("Date of Birth - Please enter the date of Birth for each").
Google Forms cannot repeat a group of questions, so that was the only way to do
it there. The cost is that all the siblings end up mashed into one spreadsheet
cell and you cannot sort by class level or count how many beginners you have.

Here each child gets their own card, and the sheet gets one row per child.


## Test it on your computer

Open a Terminal in this folder and run:

    python3 -m http.server 8000

Then go to http://localhost:8000

The form is in test mode until you connect the sheet: it checks everything and
shows the confirmation screen, but instead of sending it prints the answers to
the browser console (press F12 to see them).

Things to try:

- Press + three times. Three complete child cards appear.
- Type in child 2, then press + again. What you typed stays.
- Answer Yes to allergies on one child. The follow-up box opens on that child
  only.
- Enter a date of birth. The age fills in by itself.
- Switch between the two payment plans and watch the total change.
- Press Français at the top. Everything changes language, including the errors.
- Press Send with empty boxes. The first missing answer is highlighted.


## Connect the Google Sheet

1. Make a new Google Sheet, e.g. *FUTA Registrations 2026-2027*.
2. In the sheet: **Extensions > Apps Script**.
3. Delete the sample code, paste in all of `Code.gs`, save.
4. **Deploy > New deployment**, click the gear, choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**   <- important, or parents hit a login page
5. Deploy, and approve the permission prompt (your account > Advanced >
   Go to ... (unsafe) > Allow. That is normal for your own script.)
6. Copy the **Web app URL**. It ends in `/exec`.
7. Open `app.js` and put it on line 6:

       const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfyc..../exec';

8. Reload and submit a real test. A `Registrations` tab appears with a green
   header row and one row per child.

To check the deployment, paste the `/exec` URL into a browser. You should see
`{"result":"success","message":"FUTA registration endpoint is live."}`. If you
get a login page instead, redo step 4 with *Who has access: Anyone*.

To get an email on every submission, put the office address in `NOTIFY_EMAIL`
at the top of `Code.gs`.


## Putting it on ficny.org

See `HANDOFF.md`. Send that file plus this folder to whoever maintains the site.


## Changing things later

- **Wording, in either language** - `text.js`. Nothing else to touch.
- **Fees** - the `monthlyTuition()` and `fees()` functions at the top of
  `app.js`. They are written to match the two tables in the rules PDF.
- **Questions for each child** - the `<template id="studentTemplate">` block at
  the bottom of `index.html`. Every input needs `data-field="something"` and
  `app.js` picks it up on its own. Then add a matching column name to `HEADERS`
  in `Code.gs` and a matching entry in the `rows.push([...])` list, in the same
  position.
- **Most children one family can register** - `MAX_STUDENTS` in `app.js`.
- **Colors** - the block at the top of `styles.css`. The green is the one used
  on ficny.org.

After editing `Code.gs`, redeploy with **Deploy > Manage deployments > pencil
icon > Version: New version > Deploy**. That keeps the same URL. Choosing "New
deployment" gives you a different URL you would have to paste into `app.js`
again.


## Notes on what changed from the Google Form

Worth checking these are what you want:

- **Registration fee is now $50 per child**, not per family. The old form and
  the old rules said per family. The new rules PDF says per student, and the
  tables in it confirm it ($100 for two children, $150 for three).
- **Second parent is optional.** The Google Form marks all five of those fields
  required, which blocks a single parent from submitting at all.
- **Allergy and health questions are per child.** They were one set for the
  whole family before, so with three children you could not tell whose allergy
  it was.
- **Age is calculated** from the date of birth instead of being typed.
- **The $20 late pickup fee is gone**, because it is not in the new rules PDF.
  Tell me if it still applies and I will put it back.
- **Academic year is fixed at 2026-2027** instead of being a question.
- **Photo consent** is an opt-out checkbox, matching the rules ("parents who do
  not wish their child to appear should notify the school in writing").
