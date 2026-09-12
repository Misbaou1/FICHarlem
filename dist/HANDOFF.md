# FUTA Islamic School registration form

For whoever maintains ficny.org.

This replaces the "Open Google Form" link on **`/volunteer-form`** with a
registration form that runs on the site. Nothing else on ficny.org changes.

The form is plain HTML, CSS and JavaScript. No build step, no framework, no
dependencies. It is about 2,000 lines in four files.


## Why the form exists

The Google Form that link opens asks for the first child properly, then asks
for every other child in free-text boxes ("Date of Birth - Please enter the
date of Birth for each"). Google Forms cannot repeat a group of questions, so
all the siblings end up in one spreadsheet cell and the school cannot sort by
class level or count how many beginners it has.

Here the parent says how many children they are registering and gets a complete
set of fields for each one. The sheet gets one row per child.


## What is in the package

    index.html      the form
    styles.css      styling (uses #40aa49, the green already on the site)
    text.js         all the English and French wording
    app.js          the logic
    img/logo.png    the FUTA logo used in the form header

    embed/          the same form, scoped for dropping into an existing page
    Code.gs         Google Apps Script - receives submissions, NOT part of the site
    README.md       setup and testing notes for the masjid office

`Code.gs` lives in Apps Script attached to a Google Sheet. It never goes on the
web server.


## Four things that will cost you time if you do not know them

**1. The form must go in the route source. It cannot be injected.**
I tried. ficny.org is a built Next.js export, and hydration rebuilds the DOM
from React's own tree, deleting anything it did not render - markup, `<script>`
tags and stylesheet `<link>`s alike. Anything added from outside disappears a
moment after load. The local preview in `ficny-local/` works only because the
Next.js runtime is stripped out of that one page.

**2. The class names are prefixed on purpose. Do not rename them back.**
The site loads Bootstrap. Four of the form's original class names collided with
it, and one was destructive: Bootstrap-era CSS on the site sets
`.checkbox { opacity: 0; width: 0; height: 0 }` for a toggle-switch widget,
which made the agreement checkboxes render at 26x23px and effectively invisible.
They are now `reg-card`, `reg-lead`, `reg-badge` and `reg-check`.

Scoping selectors under a wrapper stops the form's CSS leaking out. It does not
stop the host page's CSS leaking in - only different class names do that.

**3. The fetch sends a plain string on purpose.**
Setting an `application/json` content-type makes the browser send a CORS
preflight, and Apps Script cannot answer `OPTIONS`. It will look like a missing
header. It is not. Leave it alone.

**4. Ids for the per-child fields are generated at clone time.**
See `wireLabels()` in app.js. The `<template>` cannot carry ids because every
child clones the same markup and ids must be unique. That function also joins
each label to its control and each error message to the field it describes,
so removing it leaves screen readers announcing the inputs as unnamed.


## Option A - static page (least work)

Put the files in the Next.js `public/` folder:

    public/registration.html          <- index.html, renamed
    public/registration/styles.css
    public/registration/text.js
    public/registration/app.js
    public/registration/img/logo.png

Fix the four paths in `registration.html` to match:

    <link rel="stylesheet" href="registration/styles.css">
    <img class="logo" src="registration/img/logo.png" ...>
    <script src="registration/text.js"></script>
    <script src="registration/app.js"></script>

Anything in `public/` is served as-is and untouched by the build.

Then point `/volunteer-form` at it - either replace that route's content or
redirect it. Keep the old URL working: it is the one already shared with
families, and the "Volunteer Sign Up" button on `/get-involved` routes there.


## Option B - inside the page, keeping the site chrome

Use `embed/registration.html` and `embed/registration.css`. Every selector in
that CSS is scoped under `.futa-reg`, and `rem` units are converted to `px`
because `rem` resolves against `<html>`, which an embedded component must not
touch.

Paste the markup where the Google Form link is, load the CSS, then load
`text.js` and `app.js` **after** the markup exists - app.js binds to the DOM as
it runs.

Regenerate the embed after editing the source:

    python3 build-embed.py

It refuses to emit CSS containing an unscoped selector or a leftover `rem`, so
a mistake fails the build rather than leaking into the page.

Option A is less work and there is nothing to gain from a full React rewrite.
If you do convert it, keep how the child cards are added: they are cloned and
appended one at a time rather than the list being rebuilt, so a parent who
changes the number of children does not lose what they already typed.


## Before it goes live

`app.js` line 13 needs the Google Apps Script URL:

    var ENDPOINT = 'https://script.google.com/macros/s/AKfyc..../exec';

While it is empty the form runs in test mode: it validates and shows the
confirmation, but logs the answers to the console instead of sending them. The
masjid office has the URL, or README.md has the steps to create it.


## What else is in there

- **English / French toggle**, remembered between visits. All wording is in
  `text.js` - nothing to hunt for in the HTML.
- **Fees calculated from the 2026-2027 rules**: $50 registration per child;
  tuition $60 / $100 / $120 for one, two or three children, then $40 each;
  monthly plan is registration plus three months up front, then nine payments;
  full-year plan takes 5% off tuition. All 21 figures were checked against the
  two tables in the rules PDF.
- **Drafts saved to localStorage** as the parent types, restored next visit. The
  rules checkbox, the four agreement boxes and the signature are deliberately
  never restored - agreeing and signing should be deliberate each time.
- **A honeypot field** (`#website`), off-screen rather than `display:none` so
  bots still fill it. A submission with it filled is dropped silently.
- **A 20-second submit timeout** via `AbortController`, and a guard so a double
  tap cannot send twice.
- **Accessibility**: radio groups are `<fieldset>`/`<legend>`, errors are wired
  with `aria-describedby` and `aria-invalid`, and there is a skip link.
- **A print stylesheet**, for the office's paper copy.


## Browser support

Current Chrome, Safari, Firefox and Edge, on phones and desktop. The
selected-answer highlight uses the CSS `:has()` selector; browsers older than
roughly 2023 fall back to plain radio buttons, which still work.


## Two questions for the masjid, not for you

Flagging these so nobody assumes they are bugs:

1. **Registration is $50 per student.** The old Google Form says per family.
   The 2026-2027 rules PDF says per student and its tables confirm it - $100 for
   two children, $150 for three. The form follows the PDF.
2. **The $20 late-pickup fee is gone.** It is in the old Google Form's agreement
   checkbox but appears nowhere in the new rules PDF, so it was removed.
