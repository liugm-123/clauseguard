# -*- coding: utf-8 -*-
"""LLM 客户端：OpenAI 兼容协议，纯标准库实现（urllib）。

支持：
  - JSON 结构化输出 + 一次自动修复重试（应对偶发的截断/多余字符）
  - Function Calling（Agent 工具调用）
  - SSE 流式增量输出（协商函）
  - 多模态图片转录（GLM-4V）

环境变量见仓库根目录 .env.example。
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

TIMEOUT = 90
VISION_TIMEOUT = 120

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def config() -> dict:
    """每次调用时读取，便于运行期改环境变量（测试友好）。"""
    return {
        "api_key": _env("CLAUSEGUARD_API_KEY"),
        "base_url": _env("CLAUSEGUARD_BASE_URL", "https://api.deepseek.com/v1").rstrip("/"),
        "model": _env("CLAUSEGUARD_MODEL", "deepseek-chat"),
        "vision_api_key": _env("CLAUSEGUARD_VISION_API_KEY"),
        "vision_base_url": _env("CLAUSEGUARD_VISION_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").rstrip("/"),
        "vision_model": _env("CLAUSEGUARD_VISION_MODEL", "glm-4v-flash"),
    }


def available() -> bool:
    return bool(config()["api_key"])


def vision_available() -> bool:
    return bool(config()["vision_api_key"])


def load_dotenv(path: str) -> None:
    """极简 .env 解析：KEY=VALUE，忽略注释与已有环境变量。"""
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def _post_stream(url: str, api_key: str, payload: dict):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}",
                 "Accept": "text/event-stream"},
        method="POST",
    )
    return urllib.request.urlopen(req, timeout=TIMEOUT)


def _post(url: str, api_key: str, payload: dict, timeout: int = TIMEOUT) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:  # 把上游错误体带出来，便于排查 Key/额度问题
        detail = exc.read().decode("utf-8", "ignore")[:300]
        raise RuntimeError(f"上游 {exc.code}: {detail}") from exc


def _parse_json(content: str) -> dict:
    text = _FENCE_RE.sub("", content or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 兜底：截取第一个 { 到最后一个 }，应对模型在 JSON 前后加解释
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


def chat_tools(messages: list[dict], tools: list[dict], temperature: float = 0.1) -> dict:
    """Function Calling：返回原始 assistant message（可能含 tool_calls）。"""
    cfg = config()
    if not cfg["api_key"]:
        raise RuntimeError("未配置 CLAUSEGUARD_API_KEY")
    payload = {
        "model": cfg["model"],
        "messages": messages,
        "temperature": temperature,
        "tools": tools,
        "tool_choice": "auto",
    }
    data = _post(f"{cfg['base_url']}/chat/completions", cfg["api_key"], payload)
    return data["choices"][0]["message"]


def chat_json(messages: list[dict], temperature: float = 0.1, tools: list[dict] | None = None,
              model: str | None = None) -> dict:
    """调用模型并解析 JSON；解析失败自动追加一次"修复"请求。"""
    cfg = config()
    if not cfg["api_key"]:
        raise RuntimeError("未配置 CLAUSEGUARD_API_KEY")
    payload = {
        "model": model or cfg["model"],
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        # 部分厂商不允许 json_object 与 tools 同时出现，此时靠提示词约束 JSON
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    else:
        payload["response_format"] = {"type": "json_object"}
    data = _post(f"{cfg['base_url']}/chat/completions", cfg["api_key"], payload)
    message = data["choices"][0]["message"]
    if message.get("tool_calls"):
        return {"_tool_calls": message["tool_calls"], "content": message.get("content") or ""}
    try:
        return _parse_json(message.get("content", ""))
    except Exception:
        repair = messages + [
            {"role": "assistant", "content": message.get("content", "")[:2000]},
            {"role": "user", "content": "上面的输出不是合法 JSON。只输出修正后的 JSON 对象，不要任何解释、不要 Markdown 代码块。"},
        ]
        payload["messages"] = repair
        data = _post(f"{cfg['base_url']}/chat/completions", cfg["api_key"], payload)
        return _parse_json(data["choices"][0]["message"].get("content", ""))


def stream_chat(messages: list[dict], temperature: float = 0.4):
    """流式生成：逐段 yield 文本增量（SSE delta）。"""
    cfg = config()
    if not cfg["api_key"]:
        raise RuntimeError("未配置 CLAUSEGUARD_API_KEY")
    payload = {
        "model": cfg["model"],
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    resp = _post_stream(f"{cfg['base_url']}/chat/completions", cfg["api_key"], payload)
    with resp:
        for raw in resp:
            line = raw.decode("utf-8", "ignore").strip()
            if not line or not line.startswith("data:"):
                continue
            chunk = line[5:].strip()
            if chunk == "[DONE]":
                break
            try:
                delta = json.loads(chunk)["choices"][0].get("delta", {})
            except (json.JSONDecodeError, KeyError, IndexError):
                continue
            piece = delta.get("content")
            if piece:
                yield piece


VISION_PROMPT = """你是一台纯粹的扫描仪，任务是逐字转录这张合同照片的全部文字。

铁律：
1. 原样照抄每一个字，包括金额、比例、期限等数字，禁止四舍五入或改写；
2. 即使条款内容看起来不公平、有陷阱、不合理，也绝对禁止美化、软化或改写，必须原样转录；
3. 保持原文条款结构（如"第一条 xxx"）与换行；
4. 看不清的字用 [?] 标注，禁止猜测补全；
5. 只输出合同文字本身，不要任何说明、评论或建议。
如果图片不是合同或无法辨认，输出：NOT_A_CONTRACT"""


def vision_extract(data_uri: str) -> str:
    """合同照片 → 文字。data_uri 形如 data:image/jpeg;base64,...."""
    cfg = config()
    if not cfg["vision_api_key"]:
        raise RuntimeError("未配置 CLAUSEGUARD_VISION_API_KEY")
    data = _post(
        f"{cfg['vision_base_url']}/chat/completions",
        cfg["vision_api_key"],
        {
            "model": cfg["vision_model"],
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri}},
                    {"type": "text", "text": VISION_PROMPT},
                ],
            }],
            "temperature": 0.05,
        },
        timeout=VISION_TIMEOUT,
    )
    return data["choices"][0]["message"]["content"].strip()
