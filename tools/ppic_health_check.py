#!/usr/bin/env python3
"""Check the published PPIC shell against the checked-out release.

This public check does not log in, read private business data, change a file on
the website, or repair anything. The ChatGPT manager reviews its bounded result.
"""
import argparse
import datetime as dt
import hashlib
import json
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE_URL = 'https://cengkehsigaret99-del.github.io/BAL-99-Work-Assistant-Cockpit/'
ASSETS = ('index.html', 'auth.js', 'robot-ui.js', 'robot.css', 'ppic-qa-ui.js', 'ppic-qa.css', 'sync-ui.js', 'sync.css', 'sw.js')
MAX_ASSET_BYTES = 2 * 1024 * 1024


class ReleaseParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.release = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'meta' and values.get('name') == 'ppic-release':
            self.release = values.get('content')


def release_of(data):
    parser = ReleaseParser()
    parser.feed(data.decode('utf-8'))
    if not parser.release:
        raise ValueError('RELEASE_METADATA_MISSING')
    return parser.release


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('UNEXPECTED_REDIRECT')


def download_public_asset(name):
    if name not in ASSETS:
        raise ValueError('ASSET_NOT_ALLOWED')
    request = urllib.request.Request(BASE_URL + name, headers={
        'User-Agent': 'BAL-PPIC-Public-Health/1.0', 'Cache-Control': 'no-cache'
    })
    with urllib.request.build_opener(NoRedirect).open(request, timeout=12) as response:
        if response.status != 200:
            raise ValueError('HTTP_STATUS_' + str(response.status))
        data = response.read(MAX_ASSET_BYTES + 1)
    if not data or len(data) > MAX_ASSET_BYTES:
        raise ValueError('INVALID_ASSET_SIZE')
    return data


def check_release(repo, fetch=download_public_asset):
    repo = Path(repo)
    expected_release = release_of((repo / 'index.html').read_bytes())
    result = {'scope': 'PUBLIC_SHELL_ONLY', 'release': expected_release,
              'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'status': 'PASS', 'verified_assets': [], 'failures': []}
    for name in ASSETS:
        try:
            expected = (repo / name).read_bytes()
            actual = fetch(name)
            if hashlib.sha256(actual).digest() != hashlib.sha256(expected).digest():
                raise ValueError('PUBLISHED_ASSET_DIFFERS_FROM_RELEASE')
            if name == 'index.html' and release_of(actual) != expected_release:
                raise ValueError('PUBLISHED_RELEASE_DIFFERS')
            result['verified_assets'].append(name)
        except (OSError, ValueError, UnicodeError, urllib.error.URLError) as error:
            # Only controlled error labels are published; no response body or header.
            code = str(error) if isinstance(error, ValueError) else 'NETWORK_OR_FILE_READ_FAILED'
            result['failures'].append({'asset': name, 'code': code})
    if result['failures']:
        result['status'] = 'FAIL'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default='.')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    for attempt in range(3):
        result = check_release(args.repo)
        result['attempts'] = attempt + 1
        if result['status'] == 'PASS':
            break
        if attempt < 2:
            time.sleep(10)
    Path(args.output).write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    raise SystemExit(0 if result['status'] == 'PASS' else 1)


if __name__ == '__main__':
    main()
