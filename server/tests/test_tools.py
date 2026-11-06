# -*- coding: utf-8 -*-
"""工具层单元测试：违约金核算、法条检索工具、示范文本比对、错误处理。"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import tools  # noqa: E402


class PenaltyTest(unittest.TestCase):
    def test_excessive_penalty(self):
        data = tools.call_tool("penalty_calc", {"monthly_rent": 2000, "penalty_months": 6})
        self.assertEqual(data["actual_penalty"], 12000)
        self.assertEqual(data["benchmark"], 2000)
        self.assertEqual(data["excess"], 10000)
        self.assertFalse(data["reasonable"])

    def test_reasonable_penalty(self):
        data = tools.call_tool("penalty_calc", {"monthly_rent": 2000, "penalty_months": 1})
        self.assertTrue(data["reasonable"])

    def test_invalid_input(self):
        with self.assertRaises(ValueError):
            tools.call_tool("penalty_calc", {"monthly_rent": 0, "penalty_months": 1})


class LawSearchToolTest(unittest.TestCase):
    def test_returns_law_id(self):
        data = tools.call_tool("law_search", {"query": "押金不予退还", "category": "rental"})
        self.assertTrue(data["results"])
        self.assertEqual(data["results"][0]["law_id"], "L001")

    def test_empty_query(self):
        with self.assertRaises(ValueError):
            tools.call_tool("law_search", {"query": ""})


class TemplateDiffToolTest(unittest.TestCase):
    def test_diff_shape(self):
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "data", "contracts", "rental_toxic.txt")
        with open(path, encoding="utf-8") as f:
            contract = f.read()
        data = tools.call_tool("template_diff", {"text": contract, "template": "rental_standard"})
        self.assertGreater(data["added"] + data["removed"], 0)
        self.assertTrue(any(line.startswith("-") for line in data["diff"]))


class RegistryTest(unittest.TestCase):
    def test_specs_expose_schema(self):
        for name, spec in tools.TOOL_SPECS.items():
            self.assertIn("parameters", spec)
            self.assertEqual(spec["parameters"]["type"], "object")

    def test_openai_and_mcp_shapes(self):
        self.assertEqual(len(tools.openai_tools()), len(tools.TOOL_SPECS))
        self.assertEqual(len(tools.mcp_tools()), len(tools.TOOL_SPECS))
        self.assertIn("inputSchema", tools.mcp_tools()[0])

    def test_unknown_tool(self):
        result = tools.resolve("hack_the_planet", {})
        self.assertFalse(result["ok"])
        self.assertIn("未知工具", result["error"])


if __name__ == "__main__":
    unittest.main()
