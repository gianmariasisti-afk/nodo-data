"""Tests for tools/council/from_browser.py. Run: python3 -m unittest discover -s tests/council -p 'test_*.py'"""
import hashlib, json, os, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools", "council"))
import from_browser as fb  # noqa: E402

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")


class CalLine(unittest.TestCase):
    def test_dates_from_the_url_and_short_titles(self):
        cases = [
            ({"href": "/en/meetings/epsco/2026/09/30-01/", "title": "Informal meeting of health ministers, 30 September - 1 October 2026", "days": ["2026-10-01"]},
             "2026-09-30>2026-10-01|epsco|Informal meeting of health ministers|/en/meetings/epsco/2026/09/30-01/"),
            ({"href": "/en/meetings/european-council/2026/10/15-16/", "title": "European Council, 15-16 October 2026", "days": ["2026-10-15", "2026-10-16"]},
             "2026-10-15>2026-10-16|european-council|European Council|/en/meetings/european-council/2026/10/15-16/"),
            ({"href": "/en/meetings/ecofin/2026/11/10/budget/", "title": "Economic and Financial Affairs Council (Budget)", "days": ["2026-11-10"]},
             "2026-11-10|ecofin|ECOFIN (Budget)|/en/meetings/ecofin/2026/11/10/budget/"),
            ({"href": "/en/meetings/eycs/2026/11/19/", "title": "Education, Youth, Culture and Sport Council (Education and Youth)", "days": ["2026-11-19"]},
             "2026-11-19|eycs|EYCS Council (Education and Youth)|/en/meetings/eycs/2026/11/19/"),
            ({"href": "/en/meetings/international-ministerial-meetings/2026/10/13/albania/", "title": "10th Accession Conference with Albania Ongoing", "days": ["2026-10-13"]},
             "2026-10-13|international-ministerial-meetings|10th Accession Conference with Albania|/en/meetings/international-ministerial-meetings/2026/10/13/albania/"),
        ]
        for m, want in cases:
            self.assertEqual(fb.cal_line(m), want)
        self.assertTrue(fb.cal_line({"href": "/en/meetings/x/2026/12/31-02/", "title": "X", "days": []}).startswith("2026-12-31>2027-01-02|"))


class Participants(unittest.TestCase):
    def test_rows(self):
        rows = [("LIST OF PARTICIPANTS", ""), ("HIGH REPRESENTATIVE", ""), ("Ms Kaja KALLAS", "High Representative"),
                ("BELGIUM", ""), ("Mr Jan JAMBON", "Deputy Prime Minister and Minister for Finance and Pensions,"),
                ("", "with responsibility for the National Lottery"), ("CYPRU S", ""), ("Mr Makis KERAVNOS", "Minister for Finance"),
                ("NETHERLANDS", ""), ("Mr Pieter Jan KLEIWEG DE ZWAAN AUSTRIA *", "Permanent Representative"), ("Mr Norbert TOTSCHNIG", "Federal Minister"),
                ("LUXEMBOURG", "Minister"), ("COMMISSION", ""), ("Mr Valdis DOMBROVSKIS", "Commissioner")]
        self.assertEqual(fb.parse_participants(rows), {
            "BE": [["Mr Jan JAMBON", "Deputy Prime Minister and Minister for Finance and Pensions, with responsibility for the National Lottery"]],
            "CY": [["Mr Makis KERAVNOS", "Minister for Finance"]],
            "NL": [["Mr Pieter Jan KLEIWEG DE ZWAAN", "Permanent Representative"]],
            "AT": [["Mr Norbert TOTSCHNIG", "Federal Minister"]],
        })

    def test_real_lists(self):
        """Two lists with traps: a name cut inside a word ("M" + "r David VLAJČIĆ") and a header sharing a line with a name."""
        want = json.load(open(os.path.join(FIX, "expected.json"), encoding="utf-8"))
        for name, data in want.items():
            got = fb.parse_participants(fb.pdf_rows(open(os.path.join(FIX, name), "rb").read()))
            self.assertEqual(got, data, name)


class Slices(unittest.TestCase):
    def slices(self, text, n):
        sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
        size = -(-len(text) // n)
        return [{"sha": sha, "part": i + 1, "of": n, "text": text[i * size:(i + 1) * size]} for i in range(n)]

    def test_join_checks_order_completeness_and_hash(self):
        text = json.dumps({"fetched": "2026-10-13", "lists": ["é" * 50, "x" * 100]})
        s = self.slices(text, 3)
        self.assertEqual(fb.join_slices(list(reversed(s))), json.loads(text))
        with self.assertRaises(fb.Bad):
            fb.join_slices(s[:2])
        bad = [dict(x) for x in s]
        bad[1]["text"] = bad[1]["text"][:-1] + "!"
        with self.assertRaises(fb.Bad):
            fb.join_slices(bad)

    def test_read_slice_from_a_saved_answer(self):
        import tempfile
        body = '{"a":1}'
        ans = f"RESULT sha256={hashlib.sha256(body.encode()).hexdigest()} part=1 of=1 more=false len={len(body)}\n{body}\n" + "#" * 50
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            json.dump([{"type": "text", "text": json.dumps(ans) + "\n\n(captured at origin https://consilium.europa.eu)"}], f)
        x = fb.read_slice(f.name)
        self.assertEqual((x["part"], x["of"], x["text"]), (1, 1, body))


if __name__ == "__main__":
    unittest.main()
