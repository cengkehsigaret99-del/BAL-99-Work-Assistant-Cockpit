import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('ppic_health', Path(__file__).resolve().parents[1] / 'tools/ppic_health_check.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PublicHealthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.data = {name: ('synthetic-' + name).encode() for name in MODULE.ASSETS}
        self.data['index.html'] = b'<html><meta content="6.0" name="ppic-release"><form id="ownerLogin"></form></html>'
        for name, data in self.data.items():
            (self.root / name).write_bytes(data)

    def tearDown(self):
        self.temp.cleanup()

    def test_verified_public_release(self):
        result = MODULE.check_release(self.root, self.data.__getitem__)
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(result['scope'], 'PUBLIC_SHELL_ONLY')
        self.assertEqual(result['release'], '6.0')
        self.assertEqual(result['verified_assets'], list(MODULE.ASSETS))

    def test_old_or_changed_asset_is_not_healthy(self):
        self.data['robot-ui.js'] = b'stale synthetic script'
        result = MODULE.check_release(self.root, self.data.__getitem__)
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual(result['failures'], [{'asset': 'robot-ui.js', 'code': 'PUBLISHED_ASSET_DIFFERS_FROM_RELEASE'}])

    def test_network_error_does_not_echo_response_or_secrets(self):
        def failed(_):
            raise OSError('private response must not be copied')
        result = MODULE.check_release(self.root, failed)
        self.assertNotIn('private response', str(result))
        self.assertEqual(result['status'], 'FAIL')

    def test_missing_release_fails(self):
        with self.assertRaises(ValueError):
            MODULE.release_of(b'<html>synthetic</html>')

    def test_unknown_asset_is_rejected_before_network(self):
        with self.assertRaisesRegex(ValueError, 'ASSET_NOT_ALLOWED'):
            MODULE.download_public_asset('../../private.xlsx')


if __name__ == '__main__':
    unittest.main()
