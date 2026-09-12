#!/usr/bin/env python3
"""Rebuild everything derived from registration-form/ and prove it is current.

There are four copies of the form in this folder and they are easy to get out
of step:

  registration-form/            the source you edit
  registration-form/embed/      scoped build, generated
  ficny-local/registration/     what the local preview loads
  ficny-local/volunteer-form.html   the preview page, form inlined
  dist/                         exactly what the developer receives

This regenerates all of them from the source and checksums the result, so a
stale copy shows up as a failure rather than as a mystery in the browser.

    python3 build.py
"""

import hashlib
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'registration-form')
PREVIEW = os.path.join(HERE, 'ficny-local', 'registration')
DIST = os.path.join(HERE, 'dist')

# what the website actually needs
SHIPPED = ['index.html', 'styles.css', 'text.js', 'app.js']
DOCS = ['README.md', 'HANDOFF.md', 'Code.gs']


def sha(path):
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:12]


def run(script, cwd):
    out = subprocess.run([sys.executable, script], cwd=cwd,
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit('%s failed:\n%s%s' % (script, out.stdout, out.stderr))
    return out.stdout.strip()


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)


def main():
    print('1. scoped embed build')
    for line in run('build-embed.py', SRC).splitlines():
        print('   ', line)

    print('2. copy source into the preview')
    for name in SHIPPED + ['embed/registration.css']:
        copy(os.path.join(SRC, name), os.path.join(PREVIEW, name))
    copy(os.path.join(SRC, 'img', 'logo.png'),
         os.path.join(PREVIEW, 'img', 'logo.png'))
    print('    %d files' % (len(SHIPPED) + 2))

    print('3. rebuild the preview page')
    for line in run('build-preview.py', HERE).splitlines():
        print('   ', line)

    print('4. assemble dist/')
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    for name in SHIPPED + DOCS:
        copy(os.path.join(SRC, name), os.path.join(DIST, name))
    copy(os.path.join(SRC, 'img', 'logo.png'), os.path.join(DIST, 'img', 'logo.png'))
    for name in ['registration.html', 'registration.css']:
        copy(os.path.join(SRC, 'embed', name), os.path.join(DIST, 'embed', name))

    print('5. check every copy matches the source')
    problems = []
    for name in SHIPPED:
        want = sha(os.path.join(SRC, name))
        for label, path in [('preview', os.path.join(PREVIEW, name)),
                            ('dist', os.path.join(DIST, name))]:
            got = sha(path) if os.path.exists(path) else 'missing'
            if got != want:
                problems.append('%s/%s is %s, source is %s' % (label, name, got, want))

    print()
    print('%-34s %s' % ('file', 'sha256'))
    print('-' * 50)
    for name in SHIPPED + DOCS:
        print('%-34s %s' % ('dist/' + name, sha(os.path.join(DIST, name))))
    for name in ['registration.html', 'registration.css']:
        print('%-34s %s' % ('dist/embed/' + name, sha(os.path.join(DIST, 'embed', name))))

    print()
    if problems:
        print('STALE COPIES:')
        for p in problems:
            print('  ', p)
        sys.exit(1)
    print('all copies match the source')


if __name__ == '__main__':
    main()
