# -*- coding: utf-8 -*-
"""检索层单元测试：中文二元组切分、BM25 排序、类别先验与准入阈值。"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import retrieval  # noqa: E402


class TokenizeTest(unittest.TestCase):
    def test_chinese_bigram(self):
        self.assertEqual(retrieval.tokenize("押金"), ["押金"])

    def test_mixed_text(self):
        tokens = retrieval.tokenize("月租2000元")
        self.assertIn("2000", tokens)
        self.assertIn("月租", tokens)


class SearchTest(unittest.TestCase):
    def test_deposit_clause_hits_l001(self):
        hits = retrieval.search("退房时甲方视房屋状况决定是否退还押金", "rental", top_k=3)
        self.assertTrue(hits)
        self.assertEqual(hits[0]["law"]["id"], "L001")
        self.assertIn("押金", hits[0]["matched"])

    def test_penalty_clause_hits_l002(self):
        hits = retrieval.search("乙方应支付相当于 6 个月租金的违约金", "rental", top_k=3)
        ids = [h["law"]["id"] for h in hits]
        self.assertIn("L002", ids)

    def test_unrelated_text_recalls_nothing(self):
        hits = retrieval.search("今天天气很好，我们一起去操场打球", "rental", top_k=3)
        self.assertEqual(hits, [])

    def test_category_prior_breaks_tie(self):
        hits_rental = retrieval.search("试用期与违约金", "rental", top_k=5)
        hits_job = retrieval.search("试用期与违约金", "internship", top_k=5)
        self.assertNotEqual([h["law"]["id"] for h in hits_rental],
                            [h["law"]["id"] for h in hits_job])

    def test_min_score_filters(self):
        hits = retrieval.search("违约金", "rental", top_k=5, min_score=0.95)
        self.assertEqual(hits, [])


if __name__ == "__main__":
    unittest.main()
