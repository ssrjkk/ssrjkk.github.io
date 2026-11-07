import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import generate_status as status


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        responses = {
            "/complete": (200, b"hello", 5),
            "/truncated": (200, b"hello", 10),
            "/maintenance": (503, b"down", 4),
            "/ready": (200, b'{"status":"ready"}', 18),
            "/not-ready": (200, b'{"status":"not_ready"}', 22),
        }
        code, body, length = responses[self.path]
        self.send_response(code)
        self.send_header("Content-Length", str(length))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


class StatusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def probe(self, path, expected=None):
        return status.probe(self.base + path, attempts=1, expected_status=expected)

    def test_complete_response_passes(self):
        self.assertEqual(self.probe("/complete")[:2], (True, 200))

    def test_truncated_response_is_not_up(self):
        self.assertFalse(self.probe("/truncated")[0])

    def test_maintenance_preserves_http_status(self):
        self.assertEqual(self.probe("/maintenance")[:2], (False, 503))

    def test_ready_api_passes(self):
        self.assertEqual(self.probe("/ready", "ready")[:2], (True, 200))

    def test_not_ready_api_is_down(self):
        self.assertFalse(self.probe("/not-ready", "ready")[0])

    def test_html_is_not_a_ready_api(self):
        self.assertFalse(self.probe("/complete", "ready")[0])

    def test_old_header_only_history_is_not_reused(self):
        with tempfile.TemporaryDirectory() as tmp:
            filename = Path(tmp) / "status.json"
            filename.write_text(json.dumps({"targets": [{"id": "test", "history": [1, 1]}]}))
            targets = [("test", "Test", self.base + "/maintenance", None)]
            with (
                patch.object(status, "STATUS_FILE", filename),
                patch.object(status, "TARGETS", targets),
                patch.object(status, "probe", return_value=(False, 503, 1)),
            ):
                status.main()
            data = json.loads(filename.read_text())
            self.assertEqual(data["probe_method"], status.PROBE_METHOD)
            self.assertEqual(data["targets"][0]["history"], [0])
            self.assertEqual(data["summary"]["down"], 1)


if __name__ == "__main__":
    unittest.main()
