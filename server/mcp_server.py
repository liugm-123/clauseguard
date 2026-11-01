# -*- coding: utf-8 -*-
"""ClauseGuard MCP Server（stdio 传输，JSON-RPC 2.0）。

用途：把「法条检索 / 违约金核算 / 示范文本比对」三个工具以 MCP 标准协议
暴露给任意 MCP 客户端（Claude Desktop、Trae、Cline 等）。
内部与 Agent 复用 tools.py 的同一份实现，只有传输层不同。

启动：
    python mcp_server.py
客户端配置（示例）：
    {"mcpServers": {"clauseguard": {"command": "python",
                                   "args": ["<repo>/server/mcp_server.py"]}}}

协议方法：initialize / tools/list / tools/call / ping
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import tools  # noqa: E402

PROTOCOL_VERSION = "2024-11-05"


def _reply(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _result(rid, result: dict) -> None:
    _reply({"jsonrpc": "2.0", "id": rid, "result": result})


def _error(rid, code: int, message: str) -> None:
    _reply({"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}})


def handle(message: dict) -> None:
    method = message.get("method")
    rid = message.get("id")
    params = message.get("params") or {}

    if method == "initialize":
        return _result(rid, {
            "protocolVersion": PROTOCOL_VERSION,
            "serverInfo": {"name": "clauseguard", "version": "2.0.0"},
            "capabilities": {"tools": {"listChanged": False}},
            "instructions": "契约哨兵：面向大学生合同的风险审查工具集，可用于法条检索、违约金核算与示范文本比对。",
        })
    if method in ("notifications/initialized", "initialized"):
        return  # 通知无需响应
    if method == "ping":
        return _result(rid, {})
    if method == "tools/list":
        return _result(rid, {"tools": tools.mcp_tools()})
    if method == "tools/call":
        name = params.get("name", "")
        res = tools.resolve(name, params.get("arguments") or {})
        if not res["ok"]:
            return _result(rid, {"isError": True,
                                 "content": [{"type": "text", "text": res["error"]}]})
        return _result(rid, {"isError": False, "content": [
            {"type": "text", "text": json.dumps(res["data"], ensure_ascii=False)}]})
    if rid is not None:
        return _error(rid, -32601, f"Method not found: {method}")


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            _error(None, -32700, "Parse error")
            continue
        try:
            handle(message)
        except Exception as exc:  # 单个请求失败不影响服务
            _error(message.get("id"), -32603, f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
