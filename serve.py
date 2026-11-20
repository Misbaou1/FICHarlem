#!/usr/bin/env python3
"""Local server for the ficny.org clone.

The site is a static Next.js export whose own links are extensionless
(/about-us, /events, /resources), and the real host rewrites those to the
matching .html file. Python's stock http.server only serves exact filenames,
so every one of those links 404s locally. This adds the same rewrite, which is
the only difference between this and `python3 -m http.server`.

    python3 serve.py [port]        default 8766
"""

import os
import sys
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ficny-local')


class CleanURLHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        local = super().translate_path(path)

        # an exact file hit wins
        if os.path.isfile(local):
            return local

        # A directory with an index.html wins over a same-named .html file.
        # Returning the directory lets the stock handler redirect /registration
        # to /registration/ (so the page's relative links resolve) and then
        # serve its index.html. Checking the .html first served a stale
        # registration.html against the current registration/app.js.
        if os.path.isdir(local) and os.path.isfile(os.path.join(local, 'index.html')):
            return local

        # /about-us  ->  about-us.html
        if not os.path.splitext(local)[1]:
            candidate = local.rstrip('/') + '.html'
            if os.path.isfile(candidate):
                return candidate

        return local

    def log_message(self, fmt, *args):
        # keep 404s, drop the successful noise
        if args and str(args[1]).startswith(('4', '5')):
            sys.stderr.write('  %s %s\n' % (args[1], args[0]))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766

    if not os.path.isdir(ROOT):
        sys.exit('cannot find %s' % ROOT)

    handler = functools.partial(CleanURLHandler, directory=ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', port), handler)

    print('FIC Harlem site   http://localhost:%d/' % port)
    print('Registration form http://localhost:%d/registration' % port)
    print('Press Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')


if __name__ == '__main__':
    main()
