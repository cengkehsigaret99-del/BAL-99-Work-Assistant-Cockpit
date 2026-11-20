import copy
import hashlib
import importlib.util
import io
import tempfile
import unittest
import zipfile
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1] / 'tools/ppic_auto_manifest.py'
SPEC = importlib.util.spec_from_file_location('ppic_auto_manifest', MODULE)
SUBJECT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUBJECT)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / 'source.xlsx'
        self.write_workbook()
        self.request = {
            'local_path': str(self.path),
            'manifest': {
                'filename': 'TEST_BARANG_JADI_NOVEMBER_2026_V003_CUTOFF_18NOV_REFERENSI_20NOV_PPIC_UPLOAD_WORKING.xlsx',
                'division': 'BARANG JADI', 'period': '2026-11', 'cutoff': '2026-11-18',
                'version': 'V003', 'drive_file_id': 'synthetic-file-001',
                'drive_folder_id': 'synthetic-folder-001',
            },
            'download_url': 'https://sdmntprtest.oaiusercontent.com/files/00000000-0000-4000-8000-000000000001/raw?test-only=1',
        }

    def tearDown(self):
        self.directory.cleanup()

    def write_workbook(self, extra=None):
        with zipfile.ZipFile(self.path, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('[Content_Types].xml', '<Types/>')
            archive.writestr('xl/workbook.xml', '<workbook/>')
            if extra:
                archive.writestr(extra, b'test-only')

    def test_hash_and_size_are_computed_from_bytes(self):
        result = SUBJECT.build_request(self.request)
        self.assertEqual(result['manifest']['sha256'], hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual(result['manifest']['size_bytes'], self.path.stat().st_size)
        self.assertEqual(result['manifest']['cutoff'], '2026-11-18')

    def test_reference_date_cannot_promote_cutoff(self):
        self.request['manifest']['cutoff'] = '2026-11-20'
        with self.assertRaisesRegex(SUBJECT.ManifestError, 'cut-off differ'):
            SUBJECT.build_request(self.request)

    def test_wrong_category_is_rejected(self):
        self.request['manifest']['division'] = 'GILING'
        with self.assertRaisesRegex(SUBJECT.ManifestError, 'category differ'):
            SUBJECT.build_request(self.request)

    def test_changed_bytes_are_not_the_registered_version(self):
        self.request['manifest']['sha256'] = '0' * 64
        with self.assertRaisesRegex(SUBJECT.ManifestError, 'SHA-256'):
            SUBJECT.build_request(self.request)

    def test_locked_period_is_rejected(self):
        self.request['manifest']['period'] = '2026-09'
        self.request['manifest']['cutoff'] = '2026-09-18'
        with self.assertRaisesRegex(SUBJECT.ManifestError, 'outside automatic intake'):
            SUBJECT.build_request(self.request)

    def test_private_or_lookalike_host_is_rejected(self):
        for value in ('http://127.0.0.1/x', 'https://sdmntprtest.oaiusercontent.com.evil.test/x',
                      'https://user:password@sdmntprtest.oaiusercontent.com/x',
                      'https://sdmntprtest.oaiusercontent.com:444/x',
                      'https://oaisdmntprtest.oaiusercontent.com/files/00000000-0000-4000-8000-000000000001/raw?x=1',
                      'https://sdmntpr.oaiusercontent.com/files/00000000-0000-4000-8000-000000000001/raw?x=1'):
            with self.subTest(value=value):
                self.request['download_url'] = value
                with self.assertRaises(SUBJECT.ManifestError):
                    SUBJECT.build_request(self.request)

    def test_transfer_requires_exact_raw_path_and_signed_query(self):
        host = 'https://sdmntprtest.oaiusercontent.com'
        for suffix in ('/files/not-a-uuid/raw?x=1', '/other?x=1',
                       '/files/00000000-0000-4000-8000-000000000001/raw',
                       '/files/00000000-0000-4000-8000-000000000001/raw?x=1#fragment'):
            with self.subTest(suffix=suffix):
                self.request['download_url'] = host + suffix
                with self.assertRaises(SUBJECT.ManifestError):
                    SUBJECT.build_request(self.request)

    def test_zip_entry_limit_matches_worker_before_decompression(self):
        with zipfile.ZipFile(self.path, 'a', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('xl/oversized.xml', b'x' * (SUBJECT.MAX_ZIP_ENTRY + 1))
        self.assertLess(self.path.stat().st_size, SUBJECT.MAX_BYTES)
        with self.assertRaisesRegex(SUBJECT.ManifestError, 'oversized workbook entry'):
            SUBJECT.build_request(self.request)

    def test_macros_and_external_links_require_review(self):
        for entry in ('xl/vbaProject.bin', 'xl/externalLinks/externalLink1.xml'):
            with self.subTest(entry=entry):
                self.write_workbook(entry)
                with self.assertRaises(SUBJECT.ManifestError):
                    SUBJECT.build_request(self.request)

    def test_large_file_rejected_before_reading_all_bytes(self):
        with self.path.open('wb') as stream:
            stream.truncate(SUBJECT.MAX_BYTES + 1)
        with self.assertRaisesRegex(SUBJECT.ManifestError, 'source file size'):
            SUBJECT.build_request(self.request)

    def test_sql_literals_cannot_close_the_argument(self):
        self.assertEqual(SUBJECT.sql_literal("x'); SELECT 1; --"), "'x''); SELECT 1; --'")
        self.assertEqual(SUBJECT.sql_literal(None), 'NULL')

    def test_local_path_is_not_forwarded_to_server(self):
        self.request['manifest']['local_path'] = '/private/test.xlsx'
        result = SUBJECT.build_request(self.request)
        self.assertNotIn('local_path', result['manifest'])


if __name__ == '__main__':
    unittest.main()
