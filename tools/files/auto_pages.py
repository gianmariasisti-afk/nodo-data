"""Build v1/auto-files.json: automatic pages for the files nodo doesn't follow.

For every ordinary legislative procedure (COD) that is ongoing, or that belongs to the current parliamentary term, and is
not one of nodo's curated files, it reads the Parliament's Legislative Observatory procedure file and writes one entry in
the same shape as an entry of v1/files.json, plus `auto: true`. The app shows these entries as auto pages.

What an entry carries, all read from the procedure file:
  title, procedure, instrument, Observatory status, a stage on nodo's five-step scale, a one-line "where it stands",
  the lead committee, rapporteurs, shadows and opinion rapporteurs (MEP ids), the Commission DG and Commissioner,
  the last key events (timeline) and the Observatory's forecasts still ahead (next steps, marked indicative).
What it does not carry: cabinet staff, the Council working party, committee speakers, latest developments. Those are
the full page's, and the app says so on every auto page.

oeil.europarl.europa.eu answers the cloud workspace; GitHub runners are refused. Runs in the weekly cloud refresh.

Usage: python3 tools/files/auto_pages.py [--limit N] [--only REF] [--today YYYY-MM-DD]
Exit 0 = written, 1 = the procedure list could not be read or fewer than half the pages parsed (nothing written). """
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oeil_diff import key_players, get, T  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
V1 = os.path.join(ROOT, "v1")
OUT = os.path.join(V1, "auto-files.json")
OEIL = "https://oeil.europarl.europa.eu"
PAGE = OEIL + "/oeil/en/procedure-file?reference="
# Ongoing COD procedures, and every COD procedure of the 10th term (some of them completed since 2024).
LISTS = [
    OEIL + "/oeil/en/search/export/XML?procedureType=8&procedureStage=PROC_V",
    OEIL + "/oeil/en/search/export/XML?procedureType=8&term=" + urllib.parse.quote("10th term 2024 - 2029"),
]

# Directorate-General names as the Observatory prints them -> the Commission's codes.
DG = {
    "Agriculture and Rural Development": "AGRI", "Budget": "BUDG", "Climate Action": "CLIMA",
    "Communications Networks, Content and Technology": "CNECT", "Competition": "COMP",
    "Defence Industry and Space": "DEFIS", "Economic and Financial Affairs": "ECFIN", "Education, Youth, Sport and Culture": "EAC",
    "Employment, Social Affairs and Inclusion": "EMPL", "Energy": "ENER", "Environment": "ENV",
    "European Civil Protection and Humanitarian Aid Operations": "ECHO", "Eurostat": "ESTAT",
    "Financial Stability, Financial Services and Capital Markets Union": "FISMA", "Health and Food Safety": "SANTE",
    "Human Resources and Security": "HR", "Internal Market, Industry, Entrepreneurship and SMEs": "GROW",
    "International Partnerships": "INTPA", "Justice and Consumers": "JUST", "Maritime Affairs and Fisheries": "MARE",
    "Migration and Home Affairs": "HOME", "Mobility and Transport": "MOVE", "Regional and Urban Policy": "REGIO",
    "Research and Innovation": "RTD", "Taxation and Customs Union": "TAXUD", "Trade": "TRADE", "Trade and Economic Security": "TRADE",
    "Neighbourhood and Enlargement Negotiations": "NEAR", "Enlargement and Eastern Neighbourhood": "ENEST",
    "Middle East, North Africa and the Gulf": "MENA", "Joint Research Centre": "JRC", "Secretariat-General": "SG",
    "Legal Service": "SJ", "Structural Reform Support": "REFORM", "Economic and Financial Affairs (ECFIN)": "ECFIN",
}
# Observatory subject codes -> nodo's policy areas (v1/files.json legend.areas). First match wins, longest prefix first.
AREAS = [
    ("4.20", "health"), ("3.10.04", "health"), ("3.10.05", "health"), ("3.10.09", "health"), ("3.10.10", "health"), ("3.10.08", "health"),
    ("3.30", "digital"), ("2.40.02", "digital"), ("1.20.09", "digital"), ("2.10.01", "digital"),
    ("3.60", "energy"), ("3.70", "energy"), ("3.20", "energy"),
    ("3.40", "industry"), ("3.50", "industry"), ("2.80", "industry"), ("2.10", "industry"), ("2.40", "industry"), ("3.45", "industry"),
    ("8.70", "budget"), ("2.50", "budget"), ("2.60", "budget"), ("2.70", "budget"), ("5.20", "budget"), ("6.10", "budget"), ("3.10", "health"),
]
# Key events -> how far along the file is. Checked newest first; the first that matches wins.
STEPS = [
    (r"final act published in official journal|final act signed|act adopted by council after parliament's 1st reading|decision by council, 1st reading|act approved by council", "in-force", "Adopted"),
    (r"approval in committee of the text agreed at|text agreed during interinstitutional negotiations|coreper letter confirming interinstitutional agreement", "trilogue", "Deal agreed"),
    (r"matter referred back to the committee responsible for interinstitutional negotiations|committee decision to open interinstitutional negotiations|approval in committee to open interinstitutional negotiations", "trilogue", "In trilogue"),
    (r"decision by parliament, 1st reading", "trilogue", "Parliament voted"),
    (r"vote in committee|committee report tabled", "positions-in-preparation", "Committee voted"),
    (r"committee referral announced|legislative proposal published", "positions-in-preparation", "Positions forming"),
]
COMPLETED = re.compile(r"procedure completed|procedure lapsed|withdrawn", re.I)


def fold(s):
    return re.sub(r"[^a-z ]+", " ", unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()).strip()


def iso(dmy):
    m = re.match(r"(\d\d)/(\d\d)/(\d{4})", dmy or "")
    return f"{m[3]}-{m[2]}-{m[1]}" if m else None


def slug(ref):
    return "auto-" + re.sub(r"[^a-z0-9]+", "-", ref.lower()).strip("-")


def procedure_list():
    refs = {}
    for url in LISTS:
        root = ET.fromstring(get(url))
        for it in root.iter("item"):
            ref, title = T(it.findtext("reference")), T(it.findtext("title"))
            if re.fullmatch(r"\d{4}/\d{4}[A-Z]?\(COD\)", ref):
                refs.setdefault(ref, title)
        time.sleep(1)
    return refs


def section_tables(d, name):
    h = next((h for h in d.find_all("h2") if T(h.get_text(" ")) == name), None)
    if not h:
        return []
    out, node = [], h
    for node in h.find_all_next(["h2", "table"]):
        if node.name == "h2" and T(node.get_text(" ")) != name:
            break
        if node.name == "table":
            out.append(node)
    return out


def rows(t):
    body = t.find("tbody") or t
    return [[T(td.get_text(" ")) for td in tr.find_all(["td", "th"], recursive=False)] for tr in body.find_all("tr", recursive=False)]


def parse(html, ref, college):
    d = BeautifulSoup(html, "html.parser")
    h2 = [T(h.get_text(" ")) for h in d.find_all("h2")]
    title = h2[1] if len(h2) > 1 and h2[0] == ref else ""
    bi = next((h for h in d.find_all("h2") if T(h.get_text(" ")) == "Basic information"), None)
    box = bi.find_parent("div", class_="es_product-section") if bi else None
    btxt = T(box.get_text(" | ")) if box else ""
    status = ""
    m = re.search(r"Status \| (?:\| )*([^|]+?) \|", btxt)
    if m:
        status = T(m[1])
    instr = next((x for x in ("Regulation", "Directive", "Decision") if f"| {x} |" in btxt), "")
    subjects = re.findall(r"\b(\d\.\d\d(?:\.\d\d)?) [A-Z]", btxt)

    players = key_players(html)
    lead = []
    for t in d.find_all("table"):
        th = t.select_one("thead th")
        if th and re.search(r"committee responsible", T(th.get_text(" ")), re.I):
            lead += [T(b.get_text(" ")) for b in t.select(".es_badge-committee")]
    dgs, coms = [], []
    for t in d.find_all("table"):
        th = t.select_one("thead th")
        if th and T(th.get_text(" ")) == "Commission DG":
            for r in rows(t):
                cells = [c for c in r if c]
                if cells and cells[0].strip("- "):
                    dgs.append(cells[0])
                if len(cells) > 1 and cells[1].strip("- "):
                    coms.append(cells[1])

    events, forecasts = [], []
    for t in section_tables(d, "Key events"):
        for r in rows(t):
            c = [x for x in r if x]
            if len(c) >= 2 and iso(c[0]):
                events.append({"date": iso(c[0]), "what": c[1]})
    for t in section_tables(d, "Forecasts"):
        for r in rows(t):
            c = [x for x in r if x]
            if len(c) >= 2 and iso(c[0]):
                forecasts.append({"date": iso(c[0]), "what": c[1]})
    return {"title": title, "status": status, "instrument": instr, "subjects": subjects, "players": players,
            "lead": list(dict.fromkeys(lead)), "dgs": dgs, "coms": coms, "events": events, "forecasts": forecasts}


def commissioner_slug(name, college):
    """'VÁRHELYI Olivér' -> 'oliver-varhelyi' when the College has exactly one person with those words."""
    w = set(fold(name).split())
    hits = [c["slug"] for c in college if w and w <= set(fold(c["name"]).split())]
    return hits[0] if len(hits) == 1 else None


def stage_of(p):
    evs = sorted(p["events"], key=lambda e: e["date"], reverse=True)
    if re.search(r"2nd reading", p["status"], re.I) and not COMPLETED.search(p["status"]):
        return "trilogue", "Second reading", (evs[0] if evs else None)
    # Newest date first; on one date the rule higher in STEPS wins (a vote and a referral back often share a day).
    for d in sorted({e["date"] for e in evs}, reverse=True):
        day = [e for e in evs if e["date"] == d]
        for rx, stage, label in STEPS:
            for e in day:
                if re.search(rx, e["what"], re.I):
                    return stage, label, e
    if COMPLETED.search(p["status"]):
        return "in-force", "Completed", (evs[0] if evs else None)
    return "pre-proposal" if not evs else "positions-in-preparation", "Positions forming", (evs[0] if evs else None)


def area_of(subjects):
    for code in subjects:
        for prefix, area in AREAS:
            if code.startswith(prefix):
                return area
    return "other"


def fmt(iso_d):
    y, m, dd = iso_d.split("-")
    return f"{int(dd)} {['January','February','March','April','May','June','July','August','September','October','November','December'][int(m)-1]} {y}"


def entry(ref, p, college, today, list_title, mep_ids=None):
    stage, label, ev = stage_of(p)
    url = PAGE + urllib.parse.quote(ref, safe="")
    lede = f"{label}. Last step: {ev['what'][0].lower() + ev['what'][1:]}, {fmt(ev['date'])}." if ev else label + "."
    if COMPLETED.search(p["status"]):
        lede = f"{p['status']}." + (f" Last step: {ev['what'][0].lower() + ev['what'][1:]}, {fmt(ev['date'])}." if ev else "")
    # MEPs who have left the Parliament are not in meps.json and are dropped.
    meps = [{"id": x["id"], "role": x["role"], "committee": x["committee"], "basis": "ep-procedure-file", "ref": ref}
            for x in p["players"] if mep_ids is None or x["id"] in mep_ids]
    seen, uniq = set(), []
    for x in meps:
        k = (x["id"], x["role"])
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    dg_codes = [DG.get(n) for n in p["dgs"]]
    lead_com = [s for s in (commissioner_slug(n, college) for n in p["coms"]) if s]
    title = p["title"] or list_title or ref
    return {
        "id": slug(ref), "auto": True, "short": title, "title": title, "kind": (p["instrument"] or "regulation").lower(),
        "procedure": ref, "stage": stage, "stageLabel": label, "area": area_of(p["subjects"]),
        "status": p["status"], "lede": lede, "checked": today,
        "next": [{"date": f["date"], "what": f["what"] if re.search("indicative", f["what"], re.I) else f["what"] + " (indicative)", "src": "oeil"} for f in p["forecasts"] if f["date"] >= today],
        "events": sorted(p["events"], key=lambda e: e["date"], reverse=True)[:8],
        "ep": {"lead": p["lead"]},
        "meps": uniq,
        "commission": {"lead": lead_com, "associated": [], "names": p["coms"]},
        "dg": {"lead": [c for c in dg_codes if c], "basis": "source", "names": {DG[n]: n for n in p["dgs"] if n in DG},
               "note": "Named in the Parliament's procedure file."} if p["dgs"] else None,
        "cabinet": [],
        "sources": [{"id": "oeil", "title": f"Legislative Observatory: procedure file {ref}", "url": url}],
    }


def main(argv):
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else None
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    today = argv[argv.index("--today") + 1] if "--today" in argv else date.today().isoformat()
    curated = json.load(open(os.path.join(V1, "files.json"), encoding="utf-8"))["files"]
    followed = set()
    for f in curated:
        followed.update([f.get("procedure")] + (f.get("procedures") or []) + [x.get("procedure") for x in f.get("parts") or []])
    college = json.load(open(os.path.join(V1, "commission.json"), encoding="utf-8"))["college"]
    mep_ids = {m["id"] for m in json.load(open(os.path.join(V1, "meps.json"), encoding="utf-8"))["meps"]}
    try:
        refs = {only: ""} if only else procedure_list()
    except Exception as e:
        print(f"procedure list could not be read: {e}", file=sys.stderr)
        return 1
    todo = [r for r in sorted(refs, reverse=True) if r not in followed][:limit]
    prev = {}
    if os.path.exists(OUT):
        prev = {f["procedure"]: f for f in json.load(open(OUT, encoding="utf-8")).get("files", [])}
    files, errors = [], []
    for i, ref in enumerate(todo):
        try:
            files.append(entry(ref, parse(get(PAGE + urllib.parse.quote(ref, safe="")), ref, college), college, today, refs.get(ref), mep_ids))
        except Exception as e:
            errors.append(f"{ref}: {str(e)[:120]}")
            if ref in prev:
                files.append(prev[ref])  # keep last week's page rather than drop it
        time.sleep(0.6)
        if (i + 1) % 25 == 0:
            print(f"{i + 1}/{len(todo)}", file=sys.stderr)
    parsed = len(todo) - len(errors)
    if not only and parsed < len(todo) / 2:
        print(f"only {parsed} of {len(todo)} pages parsed; nothing written", file=sys.stderr)
        return 1
    files.sort(key=lambda f: f["procedure"], reverse=True)
    out = {"generated": f"{today}T00:00:00Z", "asOf": today,
           "source": "Parliament Legislative Observatory procedure files (oeil.europarl.europa.eu), read automatically",
           "scope": "Ordinary legislative procedures, ongoing or of the 10th term, that nodo does not follow",
           "files": files, "errors": errors}
    if only:
        print(json.dumps(files, ensure_ascii=False, indent=1))
        return 0
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    print(json.dumps({"written": len(files), "procedures": len(todo), "errors": len(errors)}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
