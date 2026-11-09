"""Read the Council's notices of meeting (CM documents) from the public register, for the weekly reference refresh.

www.consilium.europa.eu answers the cloud with a bot check, but the document register
(data.consilium.europa.eu) does not. Every preparatory-body meeting has a notice of meeting,
CM nnnn/yy, with the subject (the working party), the date and the provisional agenda, which
names the files discussed. CM numbers run in order through the year, so this script starts a little
below the highest CM number already cited in v1/files.json and reads upward until it finds no
new notice for a while. Notices that are not public answer 404 and are skipped.

Output (--out FILE, JSON): {"checked", "year", "from", "to", "read", "notices": [
  {"cm": "CM 4811/26", "url", "subject", "dates": ["2026-11-10"], "agenda": "...", "files": [...], "workingPartyOf": [...]}]}
Only notices with a meeting date from --today to --today + --days are kept. Two hints, never proof:
`files` = priority files whose name or cited Council document numbers appear in the subject or agenda;
`workingPartyOf` = priority files that list this working party in council.workingParties.
The task still reads the agenda and adds a date only when it names the file.

Usage: python3 tools/council/cm_notices.py --today YYYY-MM-DD [--days 21] [--out FILE]
Needs pdftotext (poppler-utils). Exit 0 = read, 1 = no notice could be read. """
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILES = os.path.join(ROOT, "v1", "files.json")
URL = "https://data.consilium.europa.eu/doc/document/CM-{n}-{y}-INIT/en/pdf"
UA = "Mozilla/5.0 (compatible; nodo-data/1.0; +https://github.com/gianmariasisti-afk/nodo-data)"
MONTHS = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july",
                                          "august", "september", "october", "november", "december"])}
BACK = 250       # start this far below the highest CM number already cited
MISSES = 60      # stop after this many numbers in a row with no public notice


def opt(argv, name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


def fetch(n, y):
    req = urllib.request.Request(URL.format(n=n, y=y), headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 + attempt * 3)
        except Exception:
            time.sleep(2 + attempt * 3)
    raise RuntimeError(f"CM {n}/{y % 100}: no answer")


def text_of(pdf):
    p = subprocess.run(["pdftotext", "-layout", "-", "-"], input=pdf, capture_output=True, timeout=60)
    return re.sub(r"[ \t]+", " ", p.stdout.decode("utf-8", "ignore"))


def dates_of(s, year):
    """'12 and 13 November 2026', '30 November - 1 December 2026' -> ISO dates."""
    out = []
    for m in re.finditer(r"((?:\d{1,2}(?:\s*(?:,|and|-|–)\s*)?)+)\s*([A-Z][a-z]+)(?:\s+(\d{4}))?", s):
        mon = MONTHS.get(m[2].lower())
        if not mon:
            continue
        y = int(m[3] or year)
        for d in re.findall(r"\d{1,2}", m[1]):
            try:
                out.append(date(y, mon, int(d)).isoformat())
            except ValueError:
                pass
    return sorted(set(out))


def parse(txt, year):
    subj = re.search(r"Subject:\s*(.+?)\n\s*Date:", txt, re.S)
    dt = re.search(r"\n\s*Date:\s*(.+)", txt)
    if not subj or not dt:
        return None
    agenda = txt[dt.end():]
    agenda = re.split(r"\n\s*NB[\s.:]", agenda)[0]
    agenda = "\n".join(l.strip() for l in agenda.splitlines()
                       if l.strip() and not re.match(r"(Time|Venue|Format|CM \d+/\d+\s|EN$|JUSTUS|LEX BUILDING|EUROPA BUILDING|Rue de la Loi)", l.strip()))
    return {"subject": re.sub(r"\s+", " ", subj[1]).strip(), "dates": dates_of(dt[1], year), "agenda": agenda[:2500]}


def core(name):
    """'Biotech Act I', 'MFF 2028–2034', 'Industrial Accelerator Act ('Made in Europe')' -> 'biotech act', 'mff', ..."""
    name = re.sub(r"\(.*?\)", " ", name.split(":")[0])
    name = re.sub(r"\b(\d{4}\s*[–-]\s*\d{4}|I{1,3})\s*$", " ", name.strip())
    return re.sub(r"\s+", " ", name).strip().lower()


def hints(files):
    """Per file: name keywords, Council document numbers it cites, and its working parties' names."""
    out = []
    for f in files:
        names = [f.get("title") or "", f.get("short") or ""] + [p.get("title") or "" for p in f.get("parts") or []]
        words = {core(n) for n in names if len(core(n)) > 5}
        src = json.dumps(f.get("sources") or [], ensure_ascii=False)
        docs = set(re.findall(r"(?:doc\.?|ST|council-)\s*(\d{4,5})(?:/\d\d)?\b", src, re.I))
        wps = {core(w.get("name") or "") for w in (f.get("council") or {}).get("workingParties") or []}
        out.append((f["id"], words, docs, {w for w in wps if w.startswith(("working party", "ad hoc", "antici"))}))
    return out


def match(p, H):
    low = (p["subject"] + " " + p["agenda"]).lower()
    subj = core(p["subject"].replace("ATT.", "").replace("Att.", "").replace("Meeting of the", ""))
    named = [fid for fid, words, docs, _ in H
             if any(w in low for w in words) or any(re.search(rf"(?<!\d){d}/\d\d", low) for d in docs)]
    by_wp = [fid for fid, _, _, wps in H if any(subj.startswith(w) or w.startswith(subj) for w in wps if subj)]
    return named, by_wp


def main(argv):
    today = date.fromisoformat(opt(argv, "--today", date.today().isoformat()))
    until = today + timedelta(days=int(opt(argv, "--days", "21")))
    out_path = opt(argv, "--out")
    if not shutil.which("pdftotext"):
        print("pdftotext missing (apt-get install poppler-utils)", file=sys.stderr)
        return 1
    files = json.load(open(FILES, encoding="utf-8"))["files"]
    y, yy = today.year, today.year % 100
    cited = [int(n) for n in re.findall(rf"CM[- ](\d+)[-/](?:{y}|{yy})\b", json.dumps(files))]
    start = max(1, (max(cited) if cited else 1) - BACK)
    H = hints(files)
    notices, read, misses, n, last = [], 0, 0, start, start
    while misses < MISSES:
        pdf = fetch(n, y)
        if pdf is None:
            misses += 1
        else:
            misses, read, last = 0, read + 1, n
            p = parse(text_of(pdf), y)
            if p and any(today.isoformat() <= d <= until.isoformat() for d in p["dates"]):
                p["files"], p["workingPartyOf"] = match(p, H)
                notices.append({"cm": f"CM {n}/{yy}", "url": URL.format(n=n, y=y), **p})
            time.sleep(0.2)
        n += 1
    res = {"checked": today.isoformat(), "year": y, "from": start, "to": last, "read": read, "notices": notices}
    text = json.dumps(res, ensure_ascii=False, indent=1)
    if out_path:
        open(out_path, "w", encoding="utf-8").write(text + "\n")
    print(json.dumps({k: v for k, v in res.items() if k != "notices"} | {"kept": len(notices)}))
    return 0 if read else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
