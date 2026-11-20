#!/usr/bin/env python3
"""Rebuild the local preview of the volunteer-form page with the form in it.

Fetches the live page, swaps the "Open Google Form" link for the embed build,
and strips the Next.js runtime.

That last part needs explaining: the page is a built Next.js export, and
hydration rebuilds the DOM from React's own tree, deleting anything it did not
render - markup, script tags and stylesheet links alike. Nothing injected from
outside survives it. The page content is already in the served HTML, so with
the runtime removed it still looks right and the form stays put.

This is a preview device only. On ficny.org the runtime stays and the form goes
into the route's source instead. See registration-form/HANDOFF.md.

    python3 build-preview.py
"""

import re
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, 'ficny-local', 'volunteer-form.html')
EMBED = os.path.join(HERE, 'registration-form', 'embed', 'registration.html')
SOURCE = 'https://ficny.org/volunteer-form.html'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'


def fetch(url):
    # curl rather than urllib: the system python here has no CA bundle and
    # fails certificate verification on every https request
    out = subprocess.run(['curl', '-sSf', '-A', UA, url],
                         capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit('could not fetch %s\n%s' % (url, out.stderr.strip()))
    return out.stdout


def cut_anchor(html, start):
    """Return the end offset of the <a> element beginning at start."""
    depth, i = 0, start
    while i < len(html):
        if html.startswith('<a ', i):
            depth += 1
        elif html.startswith('</a>', i):
            depth -= 1
            if depth == 0:
                return i + len('</a>')
        i += 1
    raise SystemExit('unbalanced anchor in the source page')


def main():
    page = fetch(SOURCE)
    embed = open(EMBED).read().replace('src="img/logo.png"',
                                       'src="/registration/img/logo.png"')

    start = page.index('<a href="https://docs.google.com/forms/')
    page = page[:start] + embed + page[cut_anchor(page, start):]

    before = len(re.findall(r'<script', page))
    page = re.sub(r'<script src="/_next/[^"]*"[^>]*></script>', '', page)
    page = re.sub(r'<script>self\.__next_f[^<]*</script>', '', page)
    after = len(re.findall(r'<script', page))

    page = page.replace('</head>',
        '<link rel="stylesheet" href="/registration/embed/registration.css">\n'
        '<!-- STATIC PREVIEW: the Next.js runtime is stripped from this copy, or\n'
        '     hydration deletes the form. The real site keeps its runtime and\n'
        '     renders the form from the route source. -->\n</head>', 1)
    page = page.replace('</body>',
        '<script src="/registration/text.js"></script>\n'
        '<script src="/registration/app.js"></script>\n</body>', 1)

    open(PAGE, 'w').write(page)
    print('next.js scripts %d -> %d' % (before, after))
    print('google form links left:', page.count('docs.google.com/forms'))
    print('wrote', os.path.relpath(PAGE, HERE), len(page), 'bytes')


if __name__ == '__main__':
    main()
