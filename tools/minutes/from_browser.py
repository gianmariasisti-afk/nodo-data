#!/usr/bin/env python3
"""Turn the browser's answers to tools/browser/minutes.js into a minutes collection for tools/minutes/pull.py.

The browser only fetches the committee minutes PDFs (PV). Everything is parsed here, per set of minutes:
- the committees holding the meeting (a joint committee lists two or three), the date and who presided;
- each numbered agenda item: its title, procedure numbers, stage lines (consideration of draft report, vote...) and the
  people listed after "Speakers:", each with the tag in brackets the minutes give them, e.g. "(DG GROW)";
- the Commission officials named in the attendance list.
Names are not matched to MEPs here; pull.py does that against v1/meps.json.

Slices come as in tools/council/from_browser.py (same RESULT protocol, same checks).
Usage: python3 tools/minutes/from_browser.py SAVED_ANSWER [SAVED_ANSWER ...] --out /tmp/minutes.json
Prints a summary as JSON. Exit code 2 when an answer is missing, cut or altered, or the set of answers is incomplete.
"""
import base64, importlib.util, io, json, os, re, sys

PARSER = "py1"
HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("council_from_browser", os.path.join(HERE, "..", "council", "from_browser.py"))
cfb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cfb)

ATTENDANCE = re.compile(r"ПРИСЪСТВЕН ЛИСТ|RECORD OF ATTENDANCE")
NOISE = re.compile(r"^(PV\\\S+|PE\d[\d.]*v\d+-\d+.*|EN|EN United in diversity EN|United in diversity|\d+/\d+)$")
ITEM = re.compile(r"^(\d{1,2})\.\s+(\S.*)$")
PROC = re.compile(r"\b\d{4}/\d{4}R?\([A-Z]{3}\)")
BULLET = re.compile(r"^\s*[•●▪-]\s*")
SPEAKERS = re.compile(r"^\s*Speakers?\s*:\s*(.*)$")
STOP = re.compile(r"^\s*([•●▪]|Decision\b|The (meeting|Chair|vote|committee)\b|Rapporteurs?\b|Responsible\b|\*\*\*|Coordinators|In camera|Vote\b|Adoption\b|Deadline\b|Rapporteur for the opinion)")
NAME = r"[A-ZÀ-ÖØ-ÞŁŠŽČĆĐŚŹŻŘŇŤĎĽĹŐŰ][\w'’.\-]+(?: (?:de la |de |da |van |von |der |del |di |le |la )?[A-ZÀ-ÖØ-ÞŁŠŽČĆĐŚŹŻŘŇŤĎĽĹŐŰ][\w'’.\-]+)+"


def T(s):
    return re.sub(r"\s+", " ", s or "").strip()


def pdf_text(data):
    import pdfplumber
    out = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            out.extend((page.extract_text() or "").split("\n"))
    return [l for l in (x.rstrip() for x in out) if l.strip() and not NOISE.match(l.strip())]


def split_names(s):
    """'A, B (EC, DG BUDG), C' -> ['A', 'B (EC, DG BUDG)', 'C'], respecting brackets."""
    out, cur, depth = [], "", 0
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return [T(x) for x in out if T(x)]


def person(token):
    """One speaker token -> {name, tag} or None. Drops procedural prefixes and 'on behalf of' tails."""
    t = re.sub(r"\(remote participation\)", "", token, flags=re.I)
    t = re.sub(r"^.*?Panel:\s*", "", t)
    t = re.split(r"\s+on behalf of\s+", t)[0]
    t = T(t.rstrip("."))
    m = re.match(r"^(.*?)\s*\((.*)\)?\s*$", t)
    name, tag = (T(m.group(1)), T(m.group(2).rstrip(")"))) if m and "(" in t else (t, "")
    if not re.fullmatch(NAME, name):
        return None
    return {"name": name, "tag": tag} if tag else {"name": name}


def presiding(opening):
    names = set()
    for m in re.finditer(r"(" + NAME + r")\s*\(([^)]*Chair[^)]*)\)", opening):
        names.add(T(m.group(1)))
    for m in re.finditer(r"with (" + NAME + r") (?:\([^)]*\) )?(?:co-\s*)?presiding", opening):
        names.add(T(m.group(1)))
    for m in re.finditer(r"replaced by (" + NAME + r")", opening):
        names.add(T(m.group(1)))
    return sorted(names)


def commission_attendance(att):
    lines = att.split("\n")
    i = next((k for k, l in enumerate(lines) if re.search(r"Kommissionen \(\*\)\s*$", l)), None)
    if i is None:
        return []
    block = []
    for l in lines[i + 1:]:
        if re.match(r"^(Друг|Other institutions)", l):
            break
        block.append(l)
    text = T(" ".join(block)).rstrip(".")
    text = re.sub(r"^DG [A-Z]+:\s*", "", text)
    out = []
    for tok in split_names(text):
        p = person(tok)
        if p:
            out.append(p)
    return out


def parse(pid, lines):
    text = "\n".join(lines)
    cut = ATTENDANCE.search(text)
    body, att = (text[:cut.start()], text[cut.start():]) if cut else (text, "")
    bl = body.split("\n")
    hdr = []
    try:
        k = next(i for i, l in enumerate(bl) if re.match(r"^\s*2024 ?- ?2029\s*$", l))
        for l in bl[k + 1:]:
            if re.match(r"^[A-Z0-9]+_PV", l.strip()):
                break
            hdr.append(T(l))
    except StopIteration:
        pass
    om = re.search(r"The meeting opened[\s\S]*?(?=\n\d{1,2}\.\s)", body)
    opening = T(om.group(0)) if om else ""
    items, cur = [], None
    for l in bl:
        m = ITEM.match(l)
        if m:
            cur = {"n": int(m.group(1)), "lines": [m.group(2)]}
            items.append(cur)
        elif cur:
            cur["lines"].append(l)
    parsed, seen = [], set()
    for it in items:
        lines_ = it["lines"]
        joined = "\n".join(lines_)
        procs = sorted(set(PROC.findall(joined)))
        stage = [T(BULLET.sub("", l)) for l in lines_ if BULLET.match(l) and not re.match(r"^\s*-", l)][:4]
        groups, grab = [], None
        for l in lines_:
            s = SPEAKERS.match(l)
            if s:
                if grab is not None:
                    groups.append(grab)
                grab = s.group(1)
                continue
            if grab is not None:
                if STOP.match(l) or ITEM.match(l):
                    groups.append(grab)
                    grab = None
                else:
                    grab += " " + l.strip()
        if grab is not None:
            groups.append(grab)
        speakers = []
        for g in groups:
            g = re.sub(r"\s*The (meeting|2nd Panel)[\s\S]*$", "", g)
            for tok in split_names(g):
                p = person(tok)
                if p and p not in speakers:
                    speakers.append(p)
        title = T(" ".join(lines_[:3]))[:220]
        key = (it["n"], title[:60])
        if key in seen:  # the annexes repeat vote items
            continue
        seen.add(key)
        if procs or speakers:
            parsed.append({"n": it["n"], "title": title, "procs": procs, "stage": stage, "speakers": speakers})
    dm = re.search(r"-PV-(\d{4}-\d\d-\d\d)-", pid)
    return {"id": pid, "date": dm.group(1) if dm else None, "code": pid.split("-")[0], "committees": hdr,
            "presiding": presiding(opening), "items": parsed, "commission": commission_attendance(att), "parser": PARSER}


def main(argv):
    paths, out = [], None
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = argv[i + 1]
            i += 2
        else:
            paths.append(argv[i])
            i += 1
    if not paths or not out:
        print(__doc__)
        return 2
    try:
        col = cfb.join_slices([cfb.read_slice(p) for p in paths])
    except cfb.Bad as e:
        print(json.dumps({"error": str(e)}))
        return 2
    pvs, errors = [], []
    for x in col.get("pvs", []):
        if x.get("error") or not (x.get("lines") or x.get("b64")):
            errors.append({"id": x.get("id"), "error": x.get("error") or "empty"})
            continue
        try:
            if x.get("lines"):  # read in the tab with pdf.js
                lines = [l.rstrip() for l in x["lines"] if l.strip() and not NOISE.match(l.strip())]
            else:  # a PDF sent whole
                lines = pdf_text(base64.b64decode(x["b64"]))
            pvs.append(parse(x["id"], lines))
        except Exception as e:  # one bad PDF must not stop the rest
            errors.append({"id": x["id"], "error": f"parse: {e}"[:200]})
    result = {"fetched": col.get("fetched"), "since": col.get("since"), "committees": col.get("committees", []),
              "listed": col.get("listed", []), "more": bool(col.get("more")), "pvs": pvs, "errors": errors}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(json.dumps({"fetched": result["fetched"], "listed": len(result["listed"]), "parsed": len(pvs),
                      "items": sum(len(p["items"]) for p in pvs), "speakers": sum(len(i["speakers"]) for p in pvs for i in p["items"]),
                      "errors": errors, "more": result["more"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
