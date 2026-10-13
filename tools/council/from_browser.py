#!/usr/bin/env python3
"""Turn the browser's answers to tools/browser/council.js into a Council collection for pull.py.

The browser only fetches: the calendar listings, the Coreper listings and the participant-list PDFs. Everything is
parsed here. The collection comes in slices, one per browser answer; the agent harness saves each long answer to a
file: a JSON array whose first element's "text" holds the answer (as a JSON string literal or as plain text), or the
answer itself. Each answer starts with "RESULT sha256=<hash> part=<i> of=<n> more=<bool> len=<chars>"; the slices are
joined in order and the SHA-256 of the whole collection is checked.

Usage: python3 tools/council/from_browser.py SAVED_ANSWER [SAVED_ANSWER ...] --out /tmp/council.json
Prints a summary as JSON. Exit code 2 when an answer is missing, cut or altered, or the set of answers is incomplete.
"""
import base64, hashlib, io, json, re, sys

PARSER = "py1"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
COUNTRY = {
    "BELGIUM": "BE", "BULGARIA": "BG", "CZECHIA": "CZ", "CZECHREPUBLIC": "CZ", "DENMARK": "DK", "GERMANY": "DE", "ESTONIA": "EE",
    "IRELAND": "IE", "GREECE": "GR", "SPAIN": "ES", "FRANCE": "FR", "CROATIA": "HR", "ITALY": "IT", "CYPRUS": "CY", "LATVIA": "LV",
    "LITHUANIA": "LT", "LUXEMBOURG": "LU", "HUNGARY": "HU", "MALTA": "MT", "NETHERLANDS": "NL", "THENETHERLANDS": "NL", "AUSTRIA": "AT",
    "POLAND": "PL", "PORTUGAL": "PT", "ROMANIA": "RO", "SLOVENIA": "SI", "SLOVAKIA": "SK", "FINLAND": "FI", "SWEDEN": "SE",
}
OTHERS = re.compile(r"^(COMMISSION|GENERAL SECRETARIAT|EUROPEAN|OTHER PARTICIPANTS|EEAS|HIGH REPRESENTATIVE)")
HONORIFIC = re.compile(r"^(Mr|Ms|Mrs|Dr|Mme|M\.|H\.E\.|Sir|Lady|Prof)\b")
SHORT = [
    (re.compile(r"^Employment, Social Policy, Health and Consumer Affairs Council"), "EPSCO"),
    (re.compile(r"^Transport, Telecommunications and Energy Council"), "TTE Council"),
    (re.compile(r"^Justice and Home Affairs Council"), "JHA Council"),
    (re.compile(r"^Education, Youth, Culture and Sports? Council"), "EYCS Council"),
    (re.compile(r"^Agriculture and Fisheries Council"), "AGRIFISH Council"),
    (re.compile(r"^Economic and Financial Affairs Council"), "ECOFIN"),
]


class Bad(Exception):
    pass


def T(s):
    return re.sub(r"\s+", " ", s or "").strip()


def answer(raw):
    """The browser's answer from a saved tool result."""
    try:
        arr = json.loads(raw)
        text = arr[0]["text"] if isinstance(arr, list) else raw
    except (ValueError, KeyError, IndexError, TypeError):
        text = raw
    text = text.lstrip()
    if text.startswith('"'):
        text, _ = json.JSONDecoder().raw_decode(text)
    return text


def read_slice(path):
    text = answer(open(path, encoding="utf-8").read())
    m = re.search(r"RESULT sha256=([0-9a-f]{64}) part=(\d+) of=(\d+) more=(true|false) len=(\d+)\n", text)
    if not m:
        raise Bad(f"{path}: no RESULT line")
    body = text[m.end():m.end() + int(m.group(5))]
    if len(body) != int(m.group(5)):
        raise Bad(f"{path}: slice {m.group(2)} is cut short")
    return {"sha": m.group(1), "part": int(m.group(2)), "of": int(m.group(3)), "text": body}


def join_slices(slices):
    shas = {x["sha"] for x in slices}
    if len(shas) != 1:
        raise Bad("the files come from different collections")
    n = slices[0]["of"]
    got = {x["part"]: x["text"] for x in slices}
    missing = [i for i in range(1, n + 1) if i not in got]
    if missing:
        raise Bad(f"slices missing: {missing} of {n}; ask the tab again with window.__nodoNext(k)")
    text = "".join(got[i] for i in range(1, n + 1))
    if hashlib.sha256(text.encode("utf-8")).hexdigest() != shas.pop():
        raise Bad("SHA-256 of the joined collection does not match: a slice was cut or altered")
    return json.loads(text)


def cal_line(m):
    """'start[>end]|code|title|href'. Dates come from the URL (/2026/09/30-01/ is 30 September to 1 October)."""
    href, days = m["href"], sorted(m.get("days") or [])
    code = href.split("/")[3]
    start, end = (days[0], days[-1]) if days else ("", "")
    u = re.search(r"/(\d{4})/(\d\d)/(\d\d)(?:-(\d\d))?/", href)
    if u:
        start = f"{u[1]}-{u[2]}-{u[3]}"
        if u[4]:
            y, mo = int(u[1]), int(u[2])
            if int(u[4]) < int(u[3]):
                mo += 1
                if mo > 12:
                    mo, y = 1, y + 1
            end = f"{y}-{mo:02d}-{u[4]}"
        else:
            end = max(start, end or start)
    title = re.sub(r",\s*\d{1,2}(\s+[A-Z][a-z]+)?(\s+20\d\d)?\s*[-–]\s*\d{1,2}\s+[A-Z][a-z]+\s+20\d\d\s*$", "", m["title"])
    title = re.sub(r",\s*\d{1,2}\s+[A-Z][a-z]+\s+20\d\d\s*$", "", title)
    title = re.sub(r"\s+Ongoing$", "", T(title))  # the listing badges meetings under way
    for rx, s in SHORT:
        title = rx.sub(s, title)
    return f"{start}{'>' + end if end and end != start else ''}|{code}|{T(title)}|{href}"


def pdf_rows(data):
    """Text rows of a participants PDF, top to bottom: [(left, right)]. Words within 2.5pt of height share a row; the
    name column is left of x=200. Letters closer than 1.5pt join into one word ("M" + "r David" is "Mr David")."""
    import pdfplumber
    out = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            rows = []
            for w in page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False, use_text_flow=False):
                y = w["bottom"]
                row = next((r for r in rows if abs(r["y"] - y) < 2.5), None)
                if row is None:
                    row = {"y": y, "w": []}
                    rows.append(row)
                row["w"].append(w)
            rows.sort(key=lambda r: r["y"])
            for r in rows:
                ws = sorted(r["w"], key=lambda w: w["x0"])
                out.append((T(" ".join(w["text"] for w in ws if w["x0"] < 200)), T(" ".join(w["text"] for w in ws if w["x0"] >= 200))))
    return out


def parse_participants(rows):
    """{country: [[name, function], ...]} from the rows of an English list. A list in French only gives {}."""
    res, cur, last = {}, None, None
    for lt, rt in rows:
        k = re.sub(r"[\s*]+", "", lt)
        if k and k == k.upper() and k in COUNTRY:
            cur = COUNTRY[k]
            res.setdefault(cur, [])
            last = None
            continue
        tail = re.match(r"^(.*\S)\s+([A-Z][A-Z ]{3,}?)\s*\*?$", lt)
        if tail and cur and HONORIFIC.match(tail[1]) and re.sub(r"\s+", "", tail[2]) in COUNTRY:
            last = [tail[1], rt]
            res[cur].append(last)
            cur = COUNTRY[re.sub(r"\s+", "", tail[2])]
            res.setdefault(cur, [])
            last = None
            continue
        if OTHERS.match(lt):
            cur, last = None, None
            continue
        if not cur:
            continue
        if HONORIFIC.match(lt):
            last = [lt, rt]
            res[cur].append(last)
        elif not lt and rt and last:
            last[1] = T(last[1] + " " + rt)
        elif lt and last and not rt and not re.match(r"^\d", lt):
            last[0] = T(last[0] + " " + lt)
    return {c: v for c, v in res.items() if v}


def build(first):
    cal = sorted((cal_line(m) for m in first["cal"]), key=lambda x: x[:10])
    cor = {}
    for m in first["coreper"]:
        k = re.match(r"^Coreper (I|II)$", T(m["title"]))
        if k:
            for d in m["days"]:
                cor.setdefault(d, set()).add(k[1])
    coreper = [[d, [x for x in ("I", "II") if x in s]] for d, s in sorted(cor.items())]
    lists, no_list, partial, errors = [], [], [], []
    for x in first["lists"]:
        if x.get("error"):
            errors.append(f"{x['href']}: {x['error']}")
            continue
        data = None
        if x.get("b64"):
            try:
                data = parse_participants(pdf_rows(base64.b64decode(x["b64"])))
            except Exception as e:  # an unreadable PDF counts as no list; the next run tries again
                errors.append(f"{x['href']}: PDF not readable ({e.__class__.__name__})")
        if x.get("pdf") is None:
            no_list.append(x["href"])
        elif data is not None and len(data) < 25:
            partial.append({"href": x["href"], "countries": len(data)})
        lists.append({"href": x["href"], "title": x.get("title") or "", "pdf": x.get("pdf"), "data": data})
    payload = {"fetched": first["fetched"], "parser": PARSER, "window": first["window"], "cal": cal, "coreper": coreper, "parts": lists}
    summary = {"fetched": first["fetched"], "meetings": len(cal), "coreper": len(coreper), "held": first["held"], "toRead": first["todo"],
               "read": sum(1 for x in lists if x["data"]), "noList": no_list, "partial": partial, "errors": errors}
    return payload, summary


def main(argv):
    out = argv[argv.index("--out") + 1]
    files = [a for a in argv if a not in ("--out", out)]
    payload, summary = build(join_slices([read_slice(f) for f in files]))
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    open(out, "w", encoding="utf-8").write(body)
    summary["sha256"] = hashlib.sha256(body.encode("utf-8")).hexdigest()
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Bad as e:
        print(f"Rejected: {e}", file=sys.stderr)
        sys.exit(2)
