#!/usr/bin/env python3
"""Point the form at your Google Sheet.

    python3 connect-sheet.py https://script.google.com/macros/s/AKfyc..../exec

Checks the URL is live, writes it into app.js, and rebuilds everything.
Run with no arguments to see what the form is currently pointed at.
"""

import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, 'registration-form', 'app.js')


def current():
    m = re.search(r"var ENDPOINT = '([^']*)';", open(APP).read())
    return m.group(1) if m else None


def main():
    if len(sys.argv) < 2:
        url = current()
        print('currently sending to:', url or '(nothing - the form is in test mode)')
        print('\nto connect a sheet:\n  python3 connect-sheet.py <your /exec URL>')
        return

    url = sys.argv[1].strip()

    if not url.startswith('https://script.google.com/macros/s/'):
        sys.exit('That does not look like an Apps Script URL.\n'
                 'It should start https://script.google.com/macros/s/ and end in /exec')
    if not url.endswith('/exec'):
        sys.exit('The URL must end in /exec.\n'
                 'A /dev URL only works while you are signed in, so parents cannot use it.')

    print('checking the endpoint is reachable...')
    out = subprocess.run(['curl', '-sSL', '-m', '25', url], capture_output=True, text=True)
    body = out.stdout.strip()

    if '"result":"success"' in body:
        print('  the endpoint answered correctly')
    elif 'accounts.google.com' in body or 'Sign in' in body or '<html' in body.lower():
        sys.exit('  That URL returns a Google sign-in page, so parents would hit a login\n'
                 '  screen instead of submitting.\n\n'
                 '  Fix: Deploy > Manage deployments > edit > Who has access: Anyone')
    else:
        print('  unexpected reply:', (body[:160] or '(empty)'))
        if input('  continue anyway? [y/N] ').strip().lower() != 'y':
            sys.exit('stopped')

    src = open(APP).read()
    src = re.sub(r"var ENDPOINT = '[^']*';", "var ENDPOINT = '%s';" % url, src, count=1)
    open(APP, 'w').write(src)
    print('written into app.js')

    subprocess.run([sys.executable, 'build.py'], cwd=HERE, check=True)
    print('\nDone. Submit a test registration and check the Registrations tab.')


if __name__ == '__main__':
    main()
