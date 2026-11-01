# -*- coding: utf-8 -*-
"""契约哨兵 ClauseGuard HTTP 服务（Python 标准库，零第三方依赖）。

路由：
  GET  /                          前端单页（web/dist，构建后由本服务托管）
  GET  /api/health                健康检查
  GET  /api/samples               示例合同列表
  GET  /api/sample?name=rental_toxic
  POST /api/review                合同审查（一次性 JSON，供测试与降级使用）
  POST /api/review/stream         合同审查（SSE：step / tool / finding / result）
  POST /api/letter/stream         协商函流式生成（SSE token）
  POST /api/vision_extract        合同照片 → 文字（GLM-4V）
  GET  /api/tools                 工具清单（MCP tools/list 的 HTTP 镜像）
  POST /api/tools/<name>          直接调用工具
  POST /api/mcp                   MCP JSON-RPC 2.0 over HTTP
"""
from __future__ import annotations

import json
import os
import sys

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import engine  # noqa: E402
import guards  # noqa: E402
import llm  # noqa: E402
import tools  # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
DIST = os.path.abspath(os.path.join(BASE, "..", "web", "dist"))
STATIC = os.path.join(BASE, "static")   # 无构建的兜底页面

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".map": "application/json; charset=utf-8",
}

SAMPLE_NAMES = {
    "rental_toxic": "房屋租赁合同（陷阱示例）",
    "internship_toxic": "实习协议（无薪 / 工伤免责）",
    "training_loan_toxic": "培训班协议（培训贷示例）",
}


def _read_json(handler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw.decode("utf-8") or "{}")


class Handler(BaseHTTPRequestHandler):
    server_version = "ClauseGuard/2.0"
    protocol_version = "HTTP/1.0"   # 关闭长连接，SSE 依靠连接结束自然收尾

    # -- 基础响应 ---------------------------------------------------------- #
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def send_json(self, data, status: int = 200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def send_file(self, path: str):
        ext = os.path.splitext(path)[1].lower()
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        if ext in (".js", ".css", ".woff2", ".png", ".jpg", ".svg"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    # -- SSE --------------------------------------------------------------- #
    def start_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("X-Accel-Buffering", "no")
        self._cors()
        self.end_headers()

    def sse(self, event: str, data) -> None:
        body = json.dumps(data, ensure_ascii=False) if not isinstance(data, str) else data
        self.wfile.write(f"event: {event}\ndata: {body}\n\n".encode("utf-8"))
        self.wfile.flush()

    # -- 路由 -------------------------------------------------------------- #
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            return self.send_json({
                "ok": True, "engine": "llm" if llm.available() else "rule",
                "vision": llm.vision_available(),
                "model": llm.config()["model"] if llm.available() else None,
            })
        if path == "/api/samples":
            files = sorted(f[:-4] for f in os.listdir(os.path.join(DATA, "contracts")) if f.endswith(".txt"))
            return self.send_json([{"id": f, "name": SAMPLE_NAMES.get(f, f)} for f in files])
        if path == "/api/sample":
            name = os.path.basename((parse_qs(parsed.query).get("name") or [""])[0])
            file_path = os.path.join(DATA, "contracts", f"{name}.txt")
            if not name or not os.path.isfile(file_path):
                return self.send_json({"error": "示例不存在"}, 404)
            with open(file_path, encoding="utf-8") as f:
                return self.send_json({"id": name, "text": f.read()})
        if path == "/api/tools":
            return self.send_json({"protocol": "mcp/1.0", "tools": tools.mcp_tools()})

        return self.serve_static(path)

    def serve_static(self, path: str):
        if path.startswith("/api/"):
            return self.send_json({"error": "接口不存在"}, 404)
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        for root in (DIST, STATIC):
            candidate = os.path.abspath(os.path.join(root, rel))
            if candidate.startswith(root) and os.path.isfile(candidate):
                return self.send_file(candidate)
        # SPA 回退
        index = os.path.join(DIST, "index.html")
        if os.path.isfile(index):
            return self.send_file(index)
        return self.send_json({"error": "not found", "hint": "请先在 web/ 下执行 npm run build"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = _read_json(self)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self.send_json({"error": "请求体不是合法 JSON"}, 400)

        try:
            if path == "/api/review":
                text = (body.get("text") or "").strip()
                if len(text) < 20:
                    return self.send_json({"error": "合同内容太短，无法审查"}, 400)
                return self.send_json(engine.review(text))

            if path == "/api/review/stream":
                return self.review_stream(body)

            if path == "/api/letter/stream":
                return self.letter_stream(body)

            if path == "/api/vision_extract":
                return self.vision_extract(body)

            if path == "/api/mcp":
                return self.send_json(self.mcp_jsonrpc(body))

            if path.startswith("/api/tools/"):
                name = path.rsplit("/", 1)[-1]
                if name not in tools.TOOL_SPECS:
                    return self.send_json({"error": f"未知工具：{name}"}, 404)
                res = tools.resolve(name, body.get("args") or body)
                return self.send_json(res["data"] if res["ok"] else {"error": res["error"]},
                                     200 if res["ok"] else 400)

            return self.send_json({"error": "not found"}, 404)
        except Exception as exc:  # 对外兜底：永不 500 空响应
            return self.send_json({"error": f"{type(exc).__name__}: {exc}"}, 500)

    # -- 业务 -------------------------------------------------------------- #
    def review_stream(self, body: dict):
        text = (body.get("text") or "").strip()
        if len(text) < 20:
            return self.send_json({"error": "合同内容太短，无法审查"}, 400)
        self.start_sse()
        try:
            engine.review(text, emit=self.sse)
            self.sse("done", {"ok": True})
        except Exception as exc:
            self.sse("error", {"message": f"{type(exc).__name__}: {exc}"})

    def letter_stream(self, body: dict):
        self.start_sse()
        try:
            messages = engine.build_letter_messages(body)
            if llm.available():
                for piece in llm.stream_chat(messages, temperature=0.5):
                    self.sse("token", {"text": piece})
                mode = "llm"
            else:
                text = engine.build_letter_template(body)
                for i in range(0, len(text), 18):
                    self.sse("token", {"text": text[i:i + 18]})
                mode = "template"
            self.sse("done", {"mode": mode})
        except Exception as exc:
            self.sse("error", {"message": f"{type(exc).__name__}: {exc}"})

    def vision_extract(self, body: dict):
        if not llm.vision_available():
            return self.send_json({"error": "未配置视觉模型 Key（CLAUSEGUARD_VISION_API_KEY）"}, 400)
        image = body.get("image", "")
        if not image.startswith("data:image/"):
            return self.send_json({"error": "需要 data:image/...;base64 格式的图片"}, 400)
        if len(image) > 14 * 1024 * 1024:
            return self.send_json({"error": "图片过大，请压缩后重试（上限 10MB）"}, 400)
        text = llm.vision_extract(image)
        if "NOT_A_CONTRACT" in text:
            return self.send_json({"error": "未识别到合同内容，请上传清晰的合同照片"}, 400)
        return self.send_json({"text": text, "chars": len(text)})

    def mcp_jsonrpc(self, body: dict) -> dict:
        """最小可用的 MCP 服务端：initialize / tools/list / tools/call。"""
        method = body.get("method")
        rid = body.get("id")
        params = body.get("params") or {}

        def result(payload):
            return {"jsonrpc": "2.0", "id": rid, "result": payload}

        def error(code, message):
            return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}}

        if method == "initialize":
            return result({
                "protocolVersion": "2024-11-05",
                "serverInfo": {"name": "clauseguard", "version": "2.0.0"},
                "capabilities": {"tools": {}},
            })
        if method == "tools/list":
            return result({"tools": tools.mcp_tools()})
        if method == "tools/call":
            res = tools.resolve(params.get("name", ""), params.get("arguments") or {})
            if not res["ok"]:
                return result({"isError": True, "content": [{"type": "text", "text": res["error"]}]})
            return result({"isError": False, "content": [
                {"type": "text", "text": json.dumps(res["data"], ensure_ascii=False)}]})
        return error(-32601, f"Method not found: {method}")

    def log_message(self, fmt, *args):
        line = guards.redact(fmt % args)
        if "/api/" in line:
            print(f"[clauseguard] {line}")


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    llm.load_dotenv(os.path.join(here, "..", ".env"))
    llm.load_dotenv(os.path.join(here, ".env"))
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    state = "LLM 已接入" if llm.available() else "规则引擎模式（未配置 Key）"
    print(f"契约哨兵 ClauseGuard 已启动: http://localhost:{port}  ·  {state}")
    if not os.path.isdir(DIST):
        print("提示：未找到 web/dist，前端请先 `npm --prefix web run build`，或使用 `npm run dev` 开发模式")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
