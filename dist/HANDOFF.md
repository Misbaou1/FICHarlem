# Replacing the volunteer-form Google Form on ficny.org

For whoever maintains the website.

## What changes

Exactly one page: **`/volunteer-form`**.

Today that page shows a committee table and a button reading "Open Google Form".
That button opens the FUTA Islamic School **student registration** Google Form
(form id `1FAIpQLSefLICxc_XXQ6...`) - not a volunteer form. The page is being
turned into the registration page it already links to, with the Google Form
replaced by an HTML form on the site.

Nothing else on ficny.org changes. Every other page in the `ficny-local` folder
that came with this is byte-for-byte identical to the live site.

## Two things worth raising separately

1. The committee text on that page describes **"FIC 12 South"** and a role for
   "Muslims who recently moved to **Nashville** Area". It was copied from
   another Islamic center and never rewritten. It is being removed along with
   the Google Form button, so this resolves itself - but if a genuine volunteer
   page is wanted later, that copy needs writing from scratch.
2. That page currently renders with **no header, no menu and no footer**, unlike
   every other page on the site. Visitors who land on it have no way back. Worth
   fixing whichever direction the page goes.

## The files

    index.html     the form
    styles.css     styling (uses #40aa49, the green already on the site)
    text.js        English and French wording
    app.js         the logic
    img/logo.png   the FUTA logo used in the form header

`Code.gs` is not part of the website. It lives in Google Apps Script and
receives the submissions.

## Option A - static page (simplest)

Put the files in the Next.js `public/` folder:

    public/registration.html          <- index.html, renamed
    public/registration/styles.css
    public/registration/text.js
    public/registration/app.js
    public/registration/img/logo.png

Then fix the four paths in `registration.html`:

    <link rel="stylesheet" href="registration/styles.css">
    <img class="logo" src="registration/img/logo.png" ...>
    <script src="registration/text.js"></script>
    <script src="registration/app.js"></script>

Anything in `public/` is served as-is and is not touched by the build.

Then point `/volunteer-form` at it - either replace that route's content with
the form, or redirect the route to `/registration.html`. Keep the old URL
working either way: it is the one already shared with families.

A suggestion, not a requirement: `/registration` reads better than
`/volunteer-form` for a page that registers children. Adding the clearer URL
and redirecting the old one to it costs nothing and stops the confusion
recurring.

The `ficny-local` folder that came with this shows the finished result - open
`volunteer-form.html` in it and the form is there.


## Option B - a real Next.js route

If you would rather it be a proper page with the site header and footer around
it, the form is a single self-contained chunk of markup and one script. Roughly:

1. `app/registration/page.tsx` with the markup from `index.html` (everything
   inside `<main class="page">`, plus the `<template>` and the language bar).
   `class` becomes `className`, and `<input>` tags need to be self-closing.
2. Drop `styles.css` in as a CSS module or a global stylesheet.
3. `text.js` and `app.js` load in a `useEffect`, or get rewritten as React
   state. The form deliberately uses no framework, so Option A is less work and
   there is nothing to gain from converting it unless you want the site chrome.

If you do convert it, the one thing to keep is how the child cards are added:
they are cloned and appended one at a time rather than the list being rebuilt,
so that a parent who changes the number of children does not lose what they
already typed.


## Before it goes live

`app.js` line 6 must have the Google Apps Script URL:

    const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfyc..../exec';

While it is empty the form runs in test mode and does not send anything. Ask the
masjid office for the URL, or see step "Connect the Google Sheet" in README.md.

The form posts JSON as a plain string on purpose. Setting an
`application/json` content-type would make the browser send a CORS preflight,
and Apps Script cannot answer `OPTIONS`. Please do not "fix" that by adding
headers to the fetch call.


## Browser support

Works in current Chrome, Safari, Firefox and Edge, on phones and desktop.
The selected-button highlight uses the CSS `:has()` selector; browsers older
than about 2023 fall back to plain radio buttons, which still work.

## Notes on the code

A few things are deliberate and worth not undoing:

**The form posts a plain string, not JSON with a content-type.** Declaring
`application/json` makes the browser send a CORS preflight, and Apps Script
cannot answer `OPTIONS`. It will look like an unset header; it is not.

**Radio groups are `<fieldset>` + `<legend>`, not `<label>` + `<div>`.** A
`<label>` may name exactly one control, so using one for a group is invalid and
leaves screen readers announcing the inputs as unnamed.

**Ids on the per-child fields are generated at clone time**, in `wireLabels()`.
The `<template>` cannot carry them because ids must be unique, and every child
gets a copy of the same markup. That function is also what joins each label to
its control and each error message to the field it describes.

**Everything is inside one IIFE** and nothing is attached to `window` except
`TEXT`, which is passed in explicitly so the single dependency is visible.

**Drafts are saved to localStorage as the parent types** and restored on the
next visit, because a family with four children has a long form to lose. The
rules checkbox, the four agreement boxes and the signature are deliberately
never restored: agreeing and signing should be deliberate acts each time, not
something a saved draft ticks on the parent's behalf.

**There is a hidden honeypot field** (`#website`). It is positioned off-screen
rather than `display:none` so that bots still fill it; a submission that has it
filled is dropped silently.

**The submit has a 20-second timeout** via `AbortController`, and a re-entry
guard so a double tap cannot send twice.
