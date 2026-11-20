#!/usr/bin/env python3
"""Validate a prepared PPIC XLSX and build a private queue request.

Read one JSON object from stdin. Never pass a signed download URL on a command
line or print the result to a public log. This helper does not modify the file,
contact a service, import business rows, or change any report snapshot.
"""

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import urlsplit


MAX_BYTES = 10 * 1024 * 1024
MAX_ZIP_ENTRY = 16 * 1024 * 1024
DIVISIONS = {
    'BAHAN BAKU', 'GILING', 'VERPACK', 'SDM GILING', 'SDM VERPACK',
    'BARANG JADI', 'CUKAI', 'DO', 'KAS BANK', 'TSG',
}
HOST_RE = re.compile(r'^sdmntpr[a-z0-9-]+\.oaiusercontent\.com$')
RAW_PATH_RE = re.compile(r'^/files/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/raw$')
MONTH_ABBREVIATIONS = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MEI': 5, 'MAY': 5,
    'JUN': 6, 'JUL': 7, 'AGU': 8, 'AUG': 8, 'SEP': 9, 'OKT': 10,
    'OCT': 10, 'NOV': 11, 'DES': 12, 'DEC': 12,
}


class ManifestError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ManifestError(message)


def build_request(request):
    manifest = dict(request['manifest'])
    source = Path(request['local_path'])
    require(source.is_file() and 100 <= source.stat().st_size <= MAX_BYTES, 'Invalid source file size')
    with source.open('rb') as stream:
        data = stream.read(MAX_BYTES + 1)
    require(100 <= len(data) <= MAX_BYTES, 'XLSX must be between 100 bytes and 10 MiB')
    require(data[:4] == b'PK\x03\x04', 'XLSX ZIP signature is missing')
    digest = hashlib.sha256(data).hexdigest()
    require(manifest.get('sha256', digest) == digest, 'Source SHA-256 does not match the actual file')
    require(int(manifest.get('size_bytes', len(data))) == len(data), 'Source size does not match the actual file')
    name = manifest.get('filename', '')
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._() -]{5,159}\.xlsx', name, re.I), 'Invalid XLSX filename')
    require(manifest.get('division') in DIVISIONS, 'Unsupported PPIC category')
    filename_division = next((division for token, division in [
        ('_SDM_GILING_', 'SDM GILING'), ('_SDM_VERPACK_', 'SDM VERPACK'),
        ('_BAHAN_BAKU_', 'BAHAN BAKU'), ('_BARANG_JADI_', 'BARANG JADI'),
        ('_KAS_BANK_', 'KAS BANK'), ('_CUKAI_', 'CUKAI'), ('_GILING_', 'GILING'),
        ('_VERPACK_', 'VERPACK'), ('_TSG_', 'TSG'), ('_DO_', 'DO'),
    ] if token in name.upper()), None)
    require(filename_division == manifest['division'], 'Filename and category differ')
    period = manifest.get('period', '')
    require(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', period), 'Invalid period')
    require(period >= '2026-11', 'September closing and earlier periods are outside automatic intake')
    cutoff = dt.date.fromisoformat(manifest.get('cutoff', ''))
    require(cutoff.isoformat().startswith(period + '-'), 'Cut-off and period differ')
    version = manifest.get('version', '')
    require(re.fullmatch(r'V\d{3,}', version), 'Version must contain V and at least three digits')
    require(re.search(r'(?:^|_)' + re.escape(version) + r'(?:_|\.)', name, re.I), 'Filename and version differ')
    match = re.search(r'_CUTOFF_(\d{1,2})([A-Z]{3})(?:_|\.)', name, re.I)
    require(match is not None, 'Explicit CUTOFF is required in an automatic-upload filename')
    require(int(match[1]) == cutoff.day and MONTH_ABBREVIATIONS.get(match[2].upper()) == cutoff.month,
            'Filename and cut-off differ; reference dates must not replace the book cut-off')
    require(str(cutoff.year) in name, 'Filename and year differ')
    require('_PPIC_UPLOAD_' in name.upper(), 'Only prepared PPIC_UPLOAD outputs enter this queue')
    for key in ('drive_file_id', 'drive_folder_id'):
        require(re.fullmatch(r'[A-Za-z0-9_-]{10,200}', manifest.get(key, '')), 'Missing or invalid Drive identifier')

    with zipfile.ZipFile(request['local_path']) as archive:
        entries = archive.infolist()
        require(len(entries) <= 1000, 'Workbook has too many ZIP entries')
        require(sum(x.file_size for x in entries) <= 64 * 1024 * 1024, 'Workbook expands beyond the allowed size')
        require(all(x.file_size <= MAX_ZIP_ENTRY and not x.flag_bits & 1 for x in entries),
                'Encrypted or oversized workbook entry')
        names = set(archive.namelist())
        require({'[Content_Types].xml', 'xl/workbook.xml'}.issubset(names), 'Workbook structure is missing')
        require(not any(x.lower().endswith('vbaproject.bin') for x in names), 'Macros are outside automatic intake')
        require(not any(x.startswith('xl/externalLinks/') for x in names), 'External workbook links need review')
        require(archive.testzip() is None, 'Workbook ZIP checksum failed')

    url = request.get('download_url')
    if url:
        require(isinstance(url, str) and 40 <= len(url) <= 8192,
                'Temporary file URL has an invalid length')
        parsed = urlsplit(url)
        require(parsed.scheme == 'https' and not parsed.username and not parsed.password,
                'Use the official authenticated Drive temporary HTTPS file URL')
        require(parsed.port in (None, 443) and HOST_RE.fullmatch(parsed.hostname or ''),
                'Temporary file host is outside the approved transfer service')
        require(RAW_PATH_RE.fullmatch(parsed.path) and parsed.query,
                'Temporary file URL must use the connector raw-file path and signed query')
        require(not parsed.fragment, 'URL fragments are not allowed')
    manifest['sha256'] = digest
    manifest['size_bytes'] = len(data)
    allowed = {'filename', 'division', 'period', 'cutoff', 'version', 'sha256', 'size_bytes',
               'drive_file_id', 'drive_folder_id', 'register_ref', 'download_expires_at'}
    manifest = {k: v for k, v in manifest.items() if k in allowed}
    return {'manifest': manifest, 'download_url': url}


def sql_literal(value):
    return 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sql', action='store_true', help='Emit a private MCP SQL enqueue call')
    args = parser.parse_args()
    try:
        prepared = build_request(json.load(sys.stdin))
        if args.sql:
            manifest = sql_literal(json.dumps(prepared['manifest'], ensure_ascii=True, separators=(',', ':')))
            print('select ppic_private.enqueue_auto_import(' + manifest + '::jsonb,'
                  + sql_literal(prepared['download_url']) + ') as receipt;')
        else:
            print(json.dumps(prepared, ensure_ascii=False))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile) as error:
        # Do not echo signed URLs, file bytes, or a database request on failure.
        message = str(error) if isinstance(error, ManifestError) else 'Invalid request or unreadable workbook'
        print('PPIC manifest validation failed: ' + message, file=sys.stderr)
        raise SystemExit(2)


if __name__ == '__main__':
    main()
