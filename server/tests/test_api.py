# -*- coding: utf-8 -*-
"""HTTP 接口集成测试：真实起一个端口，覆盖 JSON / SSE / MCP 三条链路。"""
import http.client
import json
import os
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.pop("CLAUSEGUARD_API_KEY", None)

import app  # noqa: E402

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

SERVER = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
PORT = SERVER.server_address[1]
THREAD = threading.Thread(target=SERVER.serve_forever, daemon=True)
THREAD.start()


def request(method: str, path: str, body: dict | None = None, raw: bytes | None = None):
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=60)
    payload = raw if raw is not None else (json.dumps(body, ensure_ascii=False).encode("utf-8") if body else None)
    headers = {"Content-Type": "application/json"} if payload else {}
    conn.request(method, path, body=payload, headers=headers)
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    return resp.status, data


def json_request(method: str, path: str, body: dict | None = None):
    status, data = request(method, path, body)
    return status, json.loads(data.decode("utf-8"))


def parse_sse(data: bytes) -> list[tuple[str, dict]]:
    events, event = [], None
    for line in data.decode("utf-8").splitlines():
        if line.startswith("event: "):
            event = line[7:].strip()
        elif line.startswith("data: ") and event:
            events.append((event, json.loads(line[6:])))
            event = None
    return events


class ApiTest(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        SERVER.shutdown()
        SERVER.server_close()

    def test_health(self):
        status, data = json_request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(data["ok"])
        self.assertEqual(data["engine"], "rule")

    def test_samples(self):
        status, data = json_request("GET", "/api/samples")
        self.assertEqual(status, 200)
        self.assertEqual(len(data), 3)

    def test_sample_text(self):
        status, data = json_request("GET", "/api/sample?name=rental_toxic")
        self.assertEqual(status, 200)
        self.assertIn("押金", data["text"])

    def test_review_json(self):
        text = open(os.path.join(DATA, "contracts", "rental_toxic.txt"), encoding="utf-8").read()
        status, data = json_request("POST", "/api/review", {"text": text})
        self.assertEqual(status, 200)
        self.assertTrue(data["findings"])
        self.assertEqual(data["engine_mode"], "rule")

    def test_review_too_short(self):
        status, data = json_request("POST", "/api/review", {"text": "太短"})
        self.assertEqual(status, 400)

    def test_review_stream(self):
        text = open(os.path.join(DATA, "contracts", "rental_toxic.txt"), encoding="utf-8").read()
        status, raw = request("POST", "/api/review/stream", {"text": text})
        self.assertEqual(status, 200)
        events = parse_sse(raw)
        kinds = [k for k, _ in events]
        for kind in ("step", "tool", "finding", "result", "done"):
            self.assertIn(kind, kinds)
        result = next(payload for kind, payload in events if kind == "result")
        self.assertTrue(result["findings"])

    def test_tools_list(self):
        status, data = json_request("GET", "/api/tools")
        self.assertEqual(status, 200)
        self.assertEqual(len(data["tools"]), 3)

    def test_tool_call(self):
        status, data = json_request("POST", "/api/tools/penalty_calc",
                                    {"monthly_rent": 2000, "penalty_months": 3})
        self.assertEqual(status, 200)
        self.assertEqual(data["actual_penalty"], 6000)

    def test_mcp_jsonrpc(self):
        _, data = json_request("POST", "/api/mcp", {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        self.assertEqual(data["result"]["tools"][0]["name"], "law_search")
        _, data2 = json_request("POST", "/api/mcp", {
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {"name": "penalty_calc", "arguments": {"monthly_rent": 1000, "penalty_months": 2}},
        })
        self.assertFalse(data2["result"]["isError"])

    def test_letter_stream_fallback(self):
        status, raw = request("POST", "/api/letter/stream", {
            "category_name": "房屋租赁合同",
            "findings": [{"clause_title": "第三条 租金", "advice": "押金条款模糊",
                          "risk_level_name": "高风险", "citations": []}],
        })
        self.assertEqual(status, 200)
        events = parse_sse(raw)
        self.assertTrue(any(kind == "token" for kind, _ in events))
        self.assertEqual(events[-1][0], "done")
        self.assertEqual(events[-1][1]["mode"], "template")

    def test_404(self):
        status, _ = request("GET", "/api/not-exist")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
