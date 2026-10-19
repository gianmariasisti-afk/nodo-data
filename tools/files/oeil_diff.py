"""Compare the priority files' MEP lists with the Parliament's Legislative Observatory.

Python port of tools/browser/oeil.js, for the cloud: oeil.europarl.europa.eu answers the cloud workspace
(GitHub runners are refused). For every procedure a file follows (`procedures`, each part's `procedure`, or
`procedure`), it reads the procedure file and lists the differences with v1/files.json:
  {"checked", "procedures", "differences": [{file, ref, change: new|gone|committee, role, id, name, committee, was?}], "errors"}
The output is what tools/files/apply_mep_diff.py takes.

Usage: python3 tools/files/oeil_diff.py [--out FILE]   (needs beautifulsoup4)
Exit 0 = compared (differences may be empty), 1 = no procedure could be read. """
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILES = os.path.join(ROOT, "v1", "files.json")
BASE = "https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference="
ROLES = {"rapporteur", "shadow", "opinion-rapporteur"}
UA = "Mozilla/5.0 (compatible; nodo-data/1.0; +https://github.com/gianmariasisti-afk/nodo-data)"


def T(s):
    return re.sub(r"\s+", " ", s or "").strip()


def get(url):
    last = None
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html", "Accept-Language": "en"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # retry network errors
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(str(last))


def id_of(a):
    m = re.search(r"meps/en/(\d+)", a.get("href") or "")
    return m.group(1) if m else None


def key_players(html):
    """[{id, name, role, committee}]; shadows of a joint committee carry the joint label ("ITRE-LIBE")."""
    d = BeautifulSoup(html, "html.parser")
    out = []
    for t in d.find_all("table"):
        th = t.select_one("thead th")
        head = T(th.get_text(" ")) if th else ""
        if not re.search("committee", head, re.I) or re.search("budgetary", head, re.I):
            continue
        opinion, joint, rows = bool(re.search("opinion", head, re.I)), bool(re.search("joint", head, re.I)), []
        body = t.find("tbody") or t
        for tr in body.find_all("tr", recursive=False):
            badge = tr.select_one(".es_badge-committee")
            abbr = T(badge.get_text(" ")) if badge else ""
            if abbr:
                rows.append(abbr)
                td = tr.find("td")
                for a in td.select("a.rapporteur") if td else []:
                    out.append({"id": id_of(a), "name": T(a.get_text(" ")), "role": "opinion-rapporteur" if opinion else "rapporteur", "committee": abbr})
            if not opinion:
                for a in tr.select(":scope .collapse a.rapporteur"):  # scoped: the whole section sits in an outer .collapse
                    out.append({"id": id_of(a), "name": T(a.get_text(" ")), "role": "shadow", "committee": "-".join(rows) if joint else (rows[-1] if rows else "")})
    return [x for x in out if x["id"]]


def main(argv):
    out_path = argv[argv.index("--out") + 1] if "--out" in argv else None
    files = json.load(open(FILES, encoding="utf-8"))["files"]
    differences, errors, procedures = [], [], 0
    for f in files:
        targets = [(ref, None) for ref in f.get("procedures") or []] + [(p.get("procedure"), p.get("id")) for p in f.get("parts") or []]
        if not targets and f.get("procedure"):
            targets.append((f["procedure"], None))
        for ref, part in targets:
            if not ref:
                continue
            try:
                live = key_players(get(BASE + urllib.parse.quote(ref, safe="")))
                procedures += 1
            except Exception as e:
                errors.append(f"{ref}: {str(e)[:120]}")
                continue
            if not live:
                continue  # no key players published yet
            mine = [e for e in f.get("meps") or [] if e.get("role") in ROLES and (not part or e.get("part") == part)]
            key = lambda x: f"{x['id']}|{x['role']}"
            have = {key(e): e for e in mine}
            seen = set()
            for x in live:
                seen.add(key(x))
                e = have.get(key(x))
                if not e:
                    differences.append({"file": f["id"], "ref": ref, "change": "new", "role": x["role"], "id": x["id"], "name": x["name"], "committee": x["committee"]})
                elif x["role"] != "shadow" and e.get("committee") != x["committee"]:
                    differences.append({"file": f["id"], "ref": ref, "change": "committee", "role": x["role"], "id": x["id"], "name": x["name"], "committee": x["committee"], "was": e.get("committee")})
            for e in mine:
                if key(e) not in seen:
                    differences.append({"file": f["id"], "ref": ref, "change": "gone", "role": e["role"], "id": e["id"], "committee": e.get("committee")})
            time.sleep(0.5)
    res = {"checked": date.today().isoformat(), "procedures": procedures, "differences": differences, "errors": errors}
    text = json.dumps(res, ensure_ascii=False)
    if out_path:
        open(out_path, "w", encoding="utf-8").write(text)
    print(text)
    return 0 if procedures else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
