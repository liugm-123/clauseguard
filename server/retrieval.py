# -*- coding: utf-8 -*-
"""法条知识库检索：BM25 + 类别先验 + 关键词覆盖度的混合排序。

为什么不用向量检索：法条库只有 22 条、领域固定，向量模型的
语义泛化在这里收益有限，反而引入"看着像就召回"的噪声；
BM25 的中文二元组切分对"押金""违约金"这类法律术语召回稳定，
且排序过程完全可解释（可展示命中词与得分），符合"AI 可解释"的要求。
"""
from __future__ import annotations

import json
import math
import os
import re
from collections import Counter

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")

_CJK = re.compile(r"[\u4e00-\u9fff]")
_RUN = re.compile(r"[\u4e00-\u9fff]+|[a-zA-Z0-9]+")

K1 = 1.5
B = 0.75


def tokenize(text: str) -> list[str]:
    """中文按二元组切分（无词典依赖），英文/数字整词保留。"""
    out: list[str] = []
    for run in _RUN.findall((text or "").lower()):
        if _CJK.match(run):
            if len(run) == 1:
                out.append(run)
            else:
                out.extend(run[i:i + 2] for i in range(len(run) - 1))
        else:
            out.append(run)
    return out


class BM25Index:
    """极简 BM25（k1=1.5, b=0.75），支持字段加权。"""

    def __init__(self, docs: list[str]):
        self.docs = docs
        self.tokens = [tokenize(d) for d in docs]
        self.lengths = [len(t) for t in self.tokens]
        self.avg_len = (sum(self.lengths) / len(self.lengths)) if self.lengths else 0.0
        self.tfs = [Counter(t) for t in self.tokens]
        df: Counter = Counter()
        for tf in self.tfs:
            df.update(tf.keys())
        n = len(docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def score(self, query_tokens: list[str]) -> list[float]:
        scores = []
        for tf, dl in zip(self.tfs, self.lengths):
            s = 0.0
            for t in query_tokens:
                f = tf.get(t)
                if not f:
                    continue
                denom = f + K1 * (1 - B + B * dl / (self.avg_len or 1))
                s += self.idf.get(t, 0.0) * f * (K1 + 1) / denom
            scores.append(s)
        return scores


class LawRetriever:
    """法条检索器：加载 laws.json，构建一次索引后复用。"""

    def __init__(self, laws: list[dict]):
        self.laws = laws
        self.by_id = {law["id"]: law for law in laws}
        # 字段加权：场景与关键词重复多次，等价于提升其权重
        self._docs = [
            " ".join(
                [law["scenario"]] * 3
                + [law["law_name"], law["article"]]
                + [law["text"]]
                + [" ".join(law["keywords"])] * 4
            )
            for law in laws
        ]
        self.index = BM25Index(self._docs)

    @classmethod
    def from_file(cls, path: str | None = None) -> "LawRetriever":
        path = path or os.path.join(DATA, "laws.json")
        with open(path, encoding="utf-8") as f:
            return cls(json.load(f))

    def search(self, query: str, category: str = "general", top_k: int = 2,
               min_score: float = 0.0) -> list[dict]:
        """返回 [{law, score, matched}]，按混合得分降序。

        得分 = 0.65 × 饱和化 BM25 + 0.35 × 关键词覆盖率 + 类别先验。
        饱和度用 bm25/(bm25+20) 而非除以最大值，避免"每个条款都必然有第一条命中"
        的伪相关（除以最大值会让不相关文本的头名得分恒为 1）。
        另外设置准入门槛：必须命中至少一个领域关键词，或 BM25 极强（norm≥0.72）。
        """
        q_tokens = tokenize(query)
        if not q_tokens:
            return []
        raw = self.index.score(q_tokens)
        results = []
        for law, bm25 in zip(self.laws, raw):
            if bm25 <= 0:
                continue
            matched = [k for k in law["keywords"] if k and k in query]
            coverage = len(matched) / max(1, len(law["keywords"]))
            norm = bm25 / (bm25 + 20.0)
            if not matched and norm < 0.72:      # 准入门槛：纯字形相似不算命中
                continue
            prior = 0.15 if law["category"] == category else (0.05 if law["category"] == "general" else 0)
            score = round(0.65 * norm + 0.35 * coverage + prior, 4)
            if score < min_score:
                continue
            results.append({"law": law, "score": score, "matched": matched})
        results.sort(key=lambda r: (-r["score"], r["law"]["id"]))
        return results[:top_k]


# 模块级单例：服务启动即加载，避免每个请求重复建索引
RETRIEVER = LawRetriever.from_file()
LAWS = RETRIEVER.laws
LAW_BY_ID = RETRIEVER.by_id


def search(query: str, category: str = "general", top_k: int = 2, min_score: float = 0.0):
    return RETRIEVER.search(query, category, top_k, min_score)
