#!/usr/bin/env python3
"""Committee steps on nodo's files, from the Parliament committees' draft agendas and draft reports.

Input: the saved answers of tools/browser/committees.js (one or more RESULT slices). Output: v1/committee-steps.json,
the dated steps ahead on each nodo file, which the app adds to the file's own "next" steps:
  {"generated", "fetched", "source", "files": {file id: [step]}}
  step = {date, time?, what, kind, committee, procedure, part?, doc, url, src}
  kind: deal-vote | vote | opinion-vote | consideration | amendments | deadline | debate | other

How it reads them:
- each draft agenda (OJ) is split into its numbered items; the date and time of an item come from the last
  "1 December 2026, 10.00 – 11.30" line above it, or from the meeting's first line;
- an item counts when it carries a procedure number nodo follows (a file's procedure, procedures, or a part's);
- each bullet under it ("Vote on the provisional agreement…", "Consideration of draft report", "Deadline for tabling
  amendments: 2 December 2026, 17.00") is one step; a deadline takes its own date;
- a draft report (PR) or draft opinion (PA) on a followed procedure adds its amendment deadline when no agenda gave it.
Steps from documents this run did not read are kept from the previous build while their date is still ahead (the
documents list holds about 80 recent documents per committee). A step whose date has passed is dropped.

Usage: python3 tools/committees/pull.py SAVED_ANSWER [SAVED_ANSWER ...] [--dry-run]
Prints a summary as JSON with "changed". Exit codes: 0 applied or nothing new, 2 the collection failed a check.
"""
import hashlib, importlib.util, json, os, re, sys
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "v1", "committee-steps.json")
REPORT = os.path.join(ROOT, "data-cache", "committee-steps-report.json")
MANIFEST = os.path.join(ROOT, "v1", "manifest.json")
FILES = os.path.join(ROOT, "v1", "files.json")
MEPS = os.path.join(ROOT, "v1", "meps.json")
_spec = importlib.util.spec_from_file_location("cfb", os.path.join(ROOT, "tools", "council", "from_browser.py"))
cfb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cfb)

MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                       "september", "october", "november", "december"], 1)}
PROC = re.compile(r"\b(\d{4}/\d{4}R?\([A-Z]{3}\))")
ITEM = re.compile(r"^(\d{1,2})\.\s+(\S.*)$")
WHEN = re.compile(r"^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),\s*(\d{1,2})[.:](\d\d)")
DATE_TXT = re.compile(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:,\s*(\d{1,2})[.:](\d\d))?")
OJ_ID = re.compile(r"^([A-Z0-9]{4})-OJ-(\d{4}-\d\d-\d\d)-\d+$")


def T(s):
    return re.sub(r"\s+", " ", s or "").strip()


def iso(d, mo, y):
    m = MONTHS.get(mo.lower())
    try:
        return date(int(y), m, int(d)).isoformat() if m else None
    except ValueError:
        return None


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def followed(files):
    """procedure number -> [(file id, part id or None, part short or None)]"""
    out = {}
    for f in files:
        for p in [f.get("procedure")] + list(f.get("procedures") or []):
            if p and PROC.fullmatch(p):
                out.setdefault(p, []).append((f["id"], None, None))
        for part in f.get("parts") or []:
            p = part.get("procedure")
            if p and PROC.fullmatch(p):
                out.setdefault(p, []).append((f["id"], part.get("id"), part.get("short") or part.get("title")))
    return out


def committee_names(meps):
    names = {}
    for m in meps:
        for c in m.get("committees") or []:
            if c.get("abbr") and c.get("name"):
                names[T(c["name"]).lower()] = c["abbr"]
    return names


def kind_of(bullet, opinion):
    b = bullet.lower()
    if b.startswith("deadline for tabling amendments"):
        return "deadline"
    if "provisional agreement" in b and ("vote" in b or "adoption" in b):
        return "deal-vote"
    if "decision to enter into interinstitutional negotiations" in b or "mandate" in b and "vote" in b:
        return "mandate-vote"
    if b.startswith("adoption of draft opinion") or opinion and b.startswith(("adoption", "vote")):
        return "opinion-vote"
    if b.startswith(("adoption of draft report", "adoption of the draft report", "vote")) or b.startswith("adoption of draft recommendation"):
        return "vote"
    if b.startswith("consideration of amendments") or "compromise amendments" in b:
        return "amendments"
    if b.startswith("consideration of draft"):
        return "consideration"
    if "exchange of views" in b or "presentation" in b or "reporting back" in b or "debate" in b:
        return "debate"
    return "other"


def what_of(kind, c, bullet, opinion):
    doc = "draft opinion" if opinion else "draft report"
    return {
        "deal-vote": f"{c} vote on the provisional agreement",
        "mandate-vote": f"{c} vote on opening trilogue negotiations",
        "opinion-vote": f"{c} vote on its opinion",
        "vote": f"{c} vote on the {doc}",
        "amendments": f"{c} considers the amendments",
        "consideration": f"{c} considers the {doc}",
        "deadline": f"{c} deadline for amendments to the {doc}",
    }.get(kind) or (
        f"{c} report back on the trilogue negotiations" if re.search(r"reporting back.*negotiation", bullet, re.I)
        else f"Commission presents the proposal in {c}" if re.search(r"presentation by the commission", bullet, re.I)
        else f"{c} exchange of views" if re.search(r"exchange of views", bullet, re.I)
        else f"{c}: {re.sub(r'\s*\(Rule [^)]*\)', '', bullet[0].lower() + bullet[1:]) if bullet else 'on the agenda'}")


def parse_agenda(a, names):
    """[(procedure, step without file)] from one draft agenda's lines."""
    m = OJ_ID.match(a["id"])
    if not m:
        return []
    body, first = m.group(1), m.group(2)
    lines = [T(l) for l in a.get("lines") or [] if T(l)]
    # Committees holding the meeting: the "Committee on ..." lines at the top (a joint committee lists two or three).
    codes = []
    for l in lines[:12]:
        if l.lower().startswith("committee on") or l.lower().startswith("subcommittee on") or l.lower().startswith("special committee"):
            c = names.get(l.lower())
            if c and c not in codes:
                codes.append(c)
    if not codes and not body.startswith("CJ"):
        codes = [body]
    url = f"https://www.europarl.europa.eu/doceo/document/{a['id']}_EN.html"
    day, time = first, None
    for l in lines[:12]:
        w = WHEN.match(l)
        if w:
            day, time = iso(w.group(1), w.group(2), w.group(3)) or first, f"{int(w.group(4)):02d}.{w.group(5)}"
            break
    items, cur = [], None
    for l in lines:
        w = WHEN.match(l)
        if w and not ITEM.match(l):
            day, time = iso(w.group(1), w.group(2), w.group(3)) or day, f"{int(w.group(4)):02d}.{w.group(5)}"
            cur = None
            continue
        it = ITEM.match(l)
        if it:
            cur = {"n": int(it.group(1)), "title": it.group(2), "lines": [], "day": day, "time": time}
            items.append(cur)
        elif cur is not None:
            cur["lines"].append(l)
    out = []
    for it in items:
        text = " ".join(it["lines"])
        procs = sorted(set(PROC.findall(text)))
        if not procs:
            continue
        opinion = bool(re.search(r"Rapporteur for (?:the )?opinion", text, re.I))
        resp = re.search(r"Responsible:\s*([A-Z]{4}(?:\s*,\s*[A-Z]{4})*)", text)
        rap = re.search(r"Rapporteurs?:\s*(.+?)(?:\s+(?:PR|AM|PA|RR|CM|AD)\s+–|\s+Responsible:|\s+Opinions?:|$)", text)
        if opinion and not body.startswith("CJ"):
            c = body
        elif len(codes) > 1:
            c = "–".join(codes)
        elif resp and not opinion:
            c = "–".join(x.strip() for x in resp.group(1).split(",")) if body.startswith("CJ") else body
        else:
            c = codes[0] if codes else body
        bullets = [T(l.lstrip("•●▪- ")) for l in it["lines"] if re.match(r"^[•●▪]", l)]
        for b in bullets or ["On the agenda"]:
            k = kind_of(b, opinion)
            d, tm = it["day"], it["time"]
            if k == "deadline":
                dt = DATE_TXT.search(b)
                if not dt:
                    continue
                d = iso(dt.group(1), dt.group(2), dt.group(3))
                tm = f"{int(dt.group(4)):02d}.{dt.group(5)}" if dt.group(4) else None
            if not d:
                continue
            step = {"date": d, "what": what_of(k, c, b, opinion), "kind": k, "committee": c, "doc": a["id"], "url": url,
                    "src": "ep-oj-" + a["id"], "item": it["n"], "agendaItem": T(it["title"])[:160]}
            if tm:
                step["time"] = tm
            if rap:
                step["rapporteur"] = T(re.sub(r"\((?:[^)]*)\)", "", rap.group(1)))[:120]
            for p in procs:
                out.append((p, dict(step, procedure=p)))
    return out


def parse_draft(x):
    if x.get("error") or not x.get("deadline"):
        return []
    text = " ".join(x.get("lines") or [])
    procs = sorted(set(PROC.findall(text)))
    opinion = "-PA-" in x["id"]
    c = x["id"].split("-")[0]
    if c.startswith("CJ"):
        c = x.get("committee") or c
    url = f"https://www.europarl.europa.eu/doceo/document/{x['id']}_EN.html"
    step = {"date": x["deadline"], "what": what_of("deadline", c, "", opinion), "kind": "deadline", "committee": c,
            "doc": x["id"], "url": url, "src": "ep-draft-" + x["id"]}
    if x.get("authors"):
        step["rapporteur"] = ", ".join(" ".join(w.capitalize() if w.isupper() else w for w in a.split()) for a in x["authors"])[:120]
    return [(p, dict(step, procedure=p)) for p in procs]


def main(argv):
    dry = "--dry-run" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    try:
        col = cfb.join_slices([cfb.read_slice(p) for p in paths])
    except cfb.Bad as e:
        print(json.dumps({"error": str(e)}))
        return 2
    if not col.get("committees") or not isinstance(col.get("agendas"), list):
        print(json.dumps({"error": "the collection has no committees or agendas"}))
        return 2
    listed = col.get("listed") or {}
    empty = [c for c, n in listed.items() if not n]
    if len(empty) > len(listed) / 2:
        print(json.dumps({"error": f"documents lists came back empty for {len(empty)} of {len(listed)} committees (bot check?)"}))
        return 2
    files = load(FILES)["files"]
    fol = followed(files)
    names = committee_names(load(MEPS)["meps"])
    today = date.today().isoformat()
    found, errors = [], [a for a in col["agendas"] if a.get("error")] + [d for d in col.get("drafts", []) if d.get("error")]
    for a in col["agendas"]:
        if not a.get("error"):
            found += parse_agenda(a, names)
    for d in col.get("drafts", []):
        found += parse_draft(d)
    read_docs = {a["id"] for a in col["agendas"] if not a.get("error")} | {d["id"] for d in col.get("drafts", []) if not d.get("error")}
    # One agenda item is one step per file: an item naming several procedures of one file (or the file and its part)
    # shows once, with the part only when exactly one part is concerned; several bullets of one item keep the
    # weightiest (a vote over a consideration). Deadlines stay separate: they fall on their own date.
    RANK = ["deal-vote", "mandate-vote", "vote", "opinion-vote", "amendments", "consideration", "debate", "other"]
    groups = {}
    for proc, step in found:
        for fid, part, short in fol.get(proc, []):
            if step["date"] < today:
                continue
            key = (fid, step["doc"], step.get("item"), step["date"], step["kind"] == "deadline")
            g = groups.setdefault(key, {"steps": [], "parts": {}})
            g["steps"].append(step)
            g["parts"][part] = short
    new = {}
    for (fid, *_), g in groups.items():
        s = dict(sorted(g["steps"], key=lambda x: RANK.index(x["kind"]) if x["kind"] in RANK else 99)[0])
        parts = {p: n for p, n in g["parts"].items() if p}
        if len(parts) == 1 and None not in g["parts"]:
            (part, short), = parts.items()
            s["part"] = part
            s["what"] = f"{short}: {s['what']}"
        new.setdefault(fid, []).append(s)
    # An agenda's deadline wins over the same deadline read from the draft report.
    for fid, xs in new.items():
        keep, seen = [], set()
        for s in sorted(xs, key=lambda s: (s["kind"] != "deadline" or s["src"].startswith("ep-draft-"), s["date"])):
            k = (s["date"], s["kind"], s.get("part"), s["committee"].split("–")[0], s["procedure"])
            if k in seen:
                continue
            seen.add(k)
            keep.append(s)
        new[fid] = keep
    # Keep earlier steps from documents not read this run, while still ahead.
    prev = (load(OUT, {}) or {}).get("files", {})
    for fid, xs in prev.items():
        for s in xs:
            if s["date"] >= today and s.get("doc") not in read_docs and fid in {f["id"] for f in files}:
                new.setdefault(fid, []).append(s)
    for fid in new:
        new[fid].sort(key=lambda s: (s["date"], s.get("time") or "99", s["what"]))
    body = {"source": "European Parliament committees: draft agendas and draft reports (europarl.europa.eu), read by nodo",
            "fetched": col.get("fetched"), "files": dict(sorted(new.items()))}
    old = load(OUT, {}) or {}
    changed = json.dumps(old.get("files"), sort_keys=True) != json.dumps(body["files"], sort_keys=True)
    out = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"), **body}
    summary = {"changed": changed, "fetched": col.get("fetched"), "agendas": len(col["agendas"]), "drafts": len(col.get("drafts", [])),
               "files": {k: len(v) for k, v in new.items()}, "steps": sum(len(v) for v in new.values()),
               "errors": [{"id": e.get("id"), "error": e.get("error")} for e in errors] + col.get("errors", [])}
    if not dry and changed:
        os.makedirs(os.path.dirname(REPORT), exist_ok=True)
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        man = load(MANIFEST)
        raw = open(OUT, "rb").read()
        man["files"]["committeeSteps"] = {"path": "committee-steps.json",
                                          "description": "Dated committee steps ahead on nodo's files, from the committees' draft agendas and draft reports",
                                          "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        man["generated"] = out["generated"]
        with open(MANIFEST, "w", encoding="utf-8") as f:
            json.dump(man, f, ensure_ascii=False, indent=1)
            f.write("\n")
    if not dry:
        with open(REPORT, "w", encoding="utf-8") as f:
            json.dump({"run": out["generated"], **summary}, f, ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
