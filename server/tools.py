# -*- coding: utf-8 -*-
"""工具层：Agent 与 MCP Server 共用同一份工具实现与 JSON Schema。

同一套工具既被 /api/review 的 Agent 直接调用（Function Calling），
也被 mcp_server.py 通过 MCP 协议暴露给外部客户端，避免两份实现漂移。
"""
from __future__ import annotations

import difflib
import os

from retrieval import search as law_search

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
TEMPLATE_NAMES = {"rental_standard": "住建部《房屋租赁合同》示范文本"}


def _law_search(args: dict) -> dict:
    query = (args.get("query") or args.get("keyword") or "").strip()
    if not query:
        raise ValueError("query 不能为空")
    hits = law_search(query, category=args.get("category") or "general",
                      top_k=int(args.get("top_k") or 3))
    return {
        "summary": f"检索「{query}」命中 {len(hits)} 条法条",
        "results": [
            {
                "law_id": h["law"]["id"],
                "law_name": h["law"]["law_name"],
                "article": h["law"]["article"],
                "scenario": h["law"]["scenario"],
                "text": h["law"]["text"],
                "score": h["score"],
                "matched_keywords": h["matched"],
            }
            for h in hits
        ],
    }


def _penalty_calc(args: dict) -> dict:
    rent = float(args.get("monthly_rent") or 0)
    months = float(args.get("penalty_months") or 0)
    if rent <= 0 or months < 0:
        raise ValueError("monthly_rent 必须为正数，penalty_months 必须非负")
    actual = round(rent * months, 2)
    benchmark = round(rent, 2)          # 司法实践基准：约 1 个月租金
    excess = round(max(0.0, actual - benchmark), 2)
    return {
        "summary": f"约定违约金 {actual:g} 元，基准 {benchmark:g} 元，超出 {excess:g} 元",
        "actual_penalty": actual,
        "benchmark": benchmark,
        "excess": excess,
        "reasonable": actual <= benchmark * 1.3,
        "note": "司法实践中租赁违约金一般支持 1 个月租金左右；超过实际损失 30% 可请求法院调减（《民法典》第585条）。",
    }


def _template_diff(args: dict) -> dict:
    text = args.get("text") or ""
    name = args.get("template") or "rental_standard"
    if name not in TEMPLATE_NAMES:
        raise ValueError(f"未知示范文本：{name}")
    path = os.path.join(DATA, "templates", f"{name}.txt")
    with open(path, encoding="utf-8") as f:
        tpl = f.read()
    diff = list(difflib.unified_diff(
        tpl.splitlines(), text.splitlines(),
        fromfile=TEMPLATE_NAMES[name], tofile="你的合同", lineterm="", n=1))
    added = sum(1 for line in diff if line.startswith("+") and not line.startswith("+++"))
    removed = sum(1 for line in diff if line.startswith("-") and not line.startswith("---"))
    return {
        "summary": f"与示范文本比对：新增 {added} 行、缺失 {removed} 行",
        "diff": diff,
        "added": added,
        "removed": removed,
        "template_name": TEMPLATE_NAMES[name],
    }


# 工具注册表：name -> (实现, MCP/Function-Calling Schema)
TOOL_SPECS: dict[str, dict] = {
    "law_search": {
        "handler": _law_search,
        "description": "在本地法条知识库中检索与合同条款相关的法律条文，返回法条 ID、名称、条号与原文。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "要检索的条款文本或关键词，如“押金不予退还”"},
                "category": {
                    "type": "string",
                    "enum": ["rental", "internship", "tripartite", "training_loan", "general"],
                    "description": "合同类型，用于类别先验加权",
                },
                "top_k": {"type": "integer", "description": "返回条数，默认 3"},
            },
            "required": ["query"],
        },
    },
    "penalty_calc": {
        "handler": _penalty_calc,
        "description": "核算租房违约金的合理性：对比司法实践基准（约 1 个月租金），给出超出金额。",
        "parameters": {
            "type": "object",
            "properties": {
                "monthly_rent": {"type": "number", "description": "月租金（元）"},
                "penalty_months": {"type": "number", "description": "合同约定的违约金折合几个月租金"},
            },
            "required": ["monthly_rent", "penalty_months"],
        },
    },
    "template_diff": {
        "handler": _template_diff,
        "description": "把用户合同与官方示范文本逐行比对，输出统一 diff，用于发现缺失的保障条款。",
        "parameters": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "用户的合同全文"},
                "template": {
                    "type": "string",
                    "enum": list(TEMPLATE_NAMES.keys()),
                    "description": "对照的示范文本",
                },
            },
            "required": ["text"],
        },
    },
}


def openai_tools() -> list[dict]:
    """转换为 OpenAI / DeepSeek Function Calling 所需的 tools 数组。"""
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": spec["description"],
                "parameters": spec["parameters"],
            },
        }
        for name, spec in TOOL_SPECS.items()
    ]


def mcp_tools() -> list[dict]:
    """转换为 MCP tools/list 的响应结构。"""
    return [
        {
            "name": name,
            "description": spec["description"],
            "inputSchema": spec["parameters"],
        }
        for name, spec in TOOL_SPECS.items()
    ]


def call_tool(name: str, args: dict) -> dict:
    """统一调用入口；未知工具或参数错误抛 ValueError，由上层转成工具错误结果。"""
    spec = TOOL_SPECS.get(name)
    if not spec:
        raise ValueError(f"未知工具：{name}")
    return spec["handler"](args or {})


def resolve(name: str, args: dict) -> dict:
    """便于 MCP 层返回 {ok, data|error}。"""
    try:
        return {"ok": True, "data": call_tool(name, args)}
    except Exception as exc:  # 工具级异常不打断整条链路
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
