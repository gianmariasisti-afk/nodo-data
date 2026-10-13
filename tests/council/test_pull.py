"""Tests for tools/council/pull.py. Run: python3 -m unittest discover -s tests/council -p 'test_*.py'"""
import importlib.util, json, os, unittest
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("pull", os.path.join(ROOT, "tools", "council", "pull.py"))
pull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pull)

TODAY = date(2026, 10, 12)
CAL = [f"2026-10-{d:02d}|gac|General Affairs Council|/en/meetings/gac/2026/10/{d:02d}/" for d in range(13, 19)]
COR = [[f"2026-10-{d:02d}", ["I"]] for d in range(13, 19)]


def payload(**kw):
    p = {"fetched": "2026-10-12", "parser": "v4", "cal": CAL, "coreper": COR,
         "parts": [{"href": "/en/meetings/gac/2026/10/13/", "title": "General Affairs Council, 13 October 2026", "pdf": "/media/x.pdf",
                    "data": {"BE": [["Mr A B", "Minister"]]}}]}
    p.update(kw)
    return p


class CheckPayload(unittest.TestCase):
    def test_accepts_a_good_collection(self):
        pull.check_payload(payload(), TODAY)

    def test_rejects_old_or_future_dates(self):
        for f in ("2026-09-01", "2026-10-20", "12/10/2026"):
            with self.assertRaises(pull.Rejected):
                pull.check_payload(payload(fetched=f), TODAY)

    def test_rejects_malformed_calendar_and_foreign_pages(self):
        with self.assertRaises(pull.Rejected):
            pull.check_payload(payload(cal=CAL[:2]), TODAY)
        with self.assertRaises(pull.Rejected):
            pull.check_payload(payload(cal=CAL[:-1] + ["2026-10-20|gac|x|https://example.org/"]), TODAY)
        with self.assertRaises(pull.Rejected):
            pull.check_payload(payload(parts=[{"href": "/en/press/x/", "data": None}]), TODAY)
        with self.assertRaises(pull.Rejected):
            pull.check_payload(payload(parts=[{"href": "/en/meetings/gac/2026/10/13/", "data": {"XX": []}}]), TODAY)


class Merge(unittest.TestCase):
    def test_readable_list_wins_and_old_lists_age_out(self):
        cache = {"fetched": "2026-10-05", "cal": [], "coreper": [], "parts": [
            {"href": "/en/meetings/gac/2025/06/10/", "title": "General Affairs Council, 10 June 2025", "pdf": None, "data": {"BE": [["Mr Old", "x"]]}},
            {"href": "/en/meetings/gac/2025/07/10/", "title": "General Affairs Council, 10 July 2025", "pdf": None, "data": {"BE": [["Mr Newer", "x"]]}},
            {"href": "/en/meetings/gac/2026/10/13/", "title": "General Affairs Council, 13 October 2026", "pdf": None, "data": None},
            {"href": "/en/meetings/ecofin/2026/10/09/", "title": "Economic and Financial Affairs Council, 9 October 2026", "pdf": "/m.pdf", "data": {"BE": [["Mr C", "y"]]}},
        ]}
        new = payload(parts=[
            {"href": "/en/meetings/gac/2026/10/13/", "title": "General Affairs Council, 13 October 2026", "pdf": "/media/x.pdf", "data": {"BE": [["Mr A B", "Minister"]]}},
            {"href": "/en/meetings/ecofin/2026/10/09/", "title": "x", "pdf": None, "data": None},
        ])
        m = pull.merge(cache, new, TODAY)
        by = {p["href"]: p for p in m["parts"]}
        self.assertEqual(by["/en/meetings/gac/2026/10/13/"]["data"], {"BE": [["Mr A B", "Minister"]]})
        self.assertEqual(by["/en/meetings/ecofin/2026/10/09/"]["data"], {"BE": [["Mr C", "y"]]})  # unreadable re-read keeps the old list
        self.assertNotIn("/en/meetings/gac/2025/06/10/", by)  # older than 400 days and not the newest GAC list
        self.assertEqual(m["cal"], CAL)


class CheckResult(unittest.TestCase):
    def test_rejects_losses(self):
        council = json.load(open(os.path.join(ROOT, "v1", "council.json"), encoding="utf-8"))
        pull.check_result(council, council)
        worse = json.loads(json.dumps(council))
        for cc in list(worse["permreps"])[:3]:
            worse["permreps"][cc].pop("pr", None)
        with self.assertRaises(pull.Rejected):
            pull.check_result(council, worse)


if __name__ == "__main__":
    unittest.main()
