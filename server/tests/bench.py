# -*- coding: utf-8 -*-
"""评测脚本：跑完 3 份陷阱合同，输出可直接写进文档的指标表。

用法：
    python tests/bench.py            # 规则模式（不消耗额度）
    python tests/bench.py --llm      # 接入大模型（需要 .env 中的 Key）
"""
import json
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine  # noqa: E402
import llm  # noqa: E402

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
SAMPLES = ["rental_toxic", "internship_toxic", "training_loan_toxic"]


def run(use_llm: bool) -> None:
    if use_llm:
        llm.load_dotenv(os.path.join(os.path.dirname(DATA), "..", ".env"))
    else:
        os.environ.pop("CLAUSEGUARD_API_KEY", None)

    rows, latencies = [], []
    for name in SAMPLES:
        with open(os.path.join(DATA, "contracts", f"{name}.txt"), encoding="utf-8") as f:
            text = f.read()
        t0 = time.perf_counter()
        result = engine.review(text)
        latency = (time.perf_counter() - t0) * 1000
        latencies.append(latency)
        rows.append({
            "sample": name,
            "category": result["category_name"],
            "clauses": result["stats"]["clause_count"],
            "findings": result["stats"]["finding_count"],
            "high": result["stats"]["high_risk"],
            "score": result["risk_score"],
            "mode": result["engine_mode"],
            "latency_ms": round(latency),
            "verified": result["llm_stats"]["verified"],
            "dropped": result["llm_stats"]["dropped"],
            "rejected": result["llm_stats"]["rejected"],
            "citation_warn": result["llm_stats"]["citation_warn"],
            "tools": [t["name"] for t in result["tools"]],
        })

    print(json.dumps(rows, ensure_ascii=False, indent=2))
    print(f"\n平均耗时 {statistics.mean(latencies):.0f} ms · "
          f"中位数 {statistics.median(latencies):.0f} ms")


if __name__ == "__main__":
    run("--llm" in sys.argv)
