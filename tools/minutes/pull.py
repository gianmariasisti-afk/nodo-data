#!/usr/bin/env python3
"""Apply a minutes collection (tools/minutes/from_browser.py) to the repository and rebuild v1/minutes.json.

The parsed minutes are merged into data-cache/minutes-raw.json (one record per PV id, kept 400 days). v1/minutes.json is
rebuilt from the whole cache: for each nodo file, the committee meetings whose agenda items carry one of the file's
procedure numbers (or name the file in the item title), the MEPs who spoke on those items (matched to v1/meps.json by
name; whoever presided that meeting is left out) and the Commission officials who spoke or attended.
Roles are not decided here: the app compares the speakers with the file's rapporteurs and shadows when it shows them.

Usage: python3 tools/minutes/pull.py --body /tmp/minutes.json [--dry-run]
Prints a summary as JSON with "changed". Exit codes: 0 applied or nothing new, 2 the collection failed a check.
"""
import hashlib, json, os, re, sys, unicodedata
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, "data-cache", "minutes-raw.json")
REPORT = os.path.join(ROOT, "data-cache", "minutes-report.json")
OUT = os.path.join(ROOT, "v1", "minutes.json")
MANIFEST = os.path.join(ROOT, "v1", "manifest.json")
KEEP_DAYS = 400
PROCEDURAL = re.compile(r"^(Adoption of (the )?(agenda|minutes)|Approval of minutes|Chair.s announcement|Any other business|Date of next meeting)", re.I)
STAGE = re.compile(r"^(Consideration|Adoption|Vote|Exchange of views|Presentation|Reporting back|Public hearing|Statement)", re.I)
EP_DGS = {"PRES", "IPOL", "EXPO", "EPRS", "COMM", "PERS", "INLO", "LINC", "TRAD", "FINS", "ITEC", "SAFE", "CASP", "IUST", "ECTI", "PART"}


class Rejected(Exception):
    pass


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z ]", " ", s.replace("-", " ")).split())


def mep_index(meps):
    full, tokens = {}, {}
    for m in meps:
        k = norm(f"{m.get('given', '')} {m.get('family', '')}")
        full[k] = m["id"]
        tokens.setdefault(frozenset(k.split()), []).append(m["id"])
    def find(name):
        k = norm(name)
        if k in full:
            return full[k]
        hit = tokens.get(frozenset(k.split()), [])
        return hit[0] if len(hit) == 1 else None
    return find


def dg_of(tag):
    m = re.search(r"\bDG ([A-Z]{2,6})\b", tag or "")
    return m.group(1) if m else None


def is_commission(p, attendance):
    tag = p.get("tag", "")
    if re.search(r"\bEC\b|European Commission|Commissioner", tag):
        return True
    dg = dg_of(tag)
    if dg and dg not in EP_DGS:
        return True
    return norm(p["name"]) in attendance


def file_keys(files):
    keys = {}
    for f in files:
        procs = {f.get("procedure")} | set(f.get("procedures") or []) | {p.get("procedure") for p in f.get("parts") or []}
        names = {x.lower() for x in (f.get("title"), f.get("short")) if x and len(x) >= 12}
        keys[f["id"]] = ({p for p in procs if p}, names)
    return keys


def check(col, today):
    if not isinstance(col, dict) or not isinstance(col.get("pvs"), list):
        raise Rejected("collection has no pvs list")
    f = col.get("fetched", "")
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", f) or f > (today + timedelta(days=1)).isoformat() or f < (today - timedelta(days=21)).isoformat():
        raise Rejected(f"fetched date {f!r} is not recent")
    good = [p for p in col["pvs"] if p.get("items") is not None and re.fullmatch(r"[A-Z0-9]{4}-PV-\d{4}-\d\d-\d\d-\d+", p.get("id", ""))]
    if len(good) != len(col["pvs"]):
        raise Rejected("a parsed minutes record is malformed")
    if len(good) >= 4 and sum(1 for p in good if p["items"]) < len(good) / 2:
        raise Rejected("fewer than half of the minutes have agenda items: the parser no longer fits the documents")


def build(cache, files, meps, today):
    find = mep_index(meps)
    keys = file_keys(files)
    out = {fid: {"meetings": [], "speakers": {}, "officials": {}} for fid in keys}
    unmatched = {}
    for pv in sorted(cache["pvs"].values(), key=lambda p: (p["date"], p["id"])):
        chairs = {norm(n) for n in pv.get("presiding", [])}
        att = {norm(p["name"]): p for p in pv.get("commission", [])}
        touched, other = set(), 0
        for it in pv["items"]:
            title = it.get("title", "").lower()
            # An item counts when it was discussed or decided: speakers, or a stage line. Coordinators' annexes and
            # "date of next meetings" also carry procedure numbers and would otherwise look like meetings on the file.
            real = it["speakers"] or any(STAGE.match(s) for s in it.get("stage", []))
            hits = [fid for fid, (procs, names) in keys.items() if real and (set(it.get("procs", [])) & procs or any(n in title for n in names))]
            if it["speakers"] and not hits and not PROCEDURAL.match(it.get("title", "")):
                other += 1
            for fid in hits:
                touched.add(fid)
                o = out[fid]
                o["meetings"].append({"pv": pv["id"], "date": pv["date"], "code": pv["code"], "committees": pv.get("committees", []),
                                      "item": it["n"], "title": it["title"][:160], "stage": it.get("stage", [])[:3], "spoke": len(it["speakers"])})
                for p in it["speakers"]:
                    if is_commission(p, att):
                        k = norm(p["name"])
                        a = att.get(k, {})
                        e = o["officials"].setdefault(k, {"name": p["name"], "dg": dg_of(p.get("tag")) or dg_of(a.get("tag")), "spoke": [], "present": []})
                        if pv["date"] not in e["spoke"]:
                            e["spoke"].append(pv["date"])
                        if not e["dg"]:
                            e["dg"] = dg_of(p.get("tag")) or dg_of(a.get("tag"))
                        if not e["dg"] and p.get("tag") and "role" not in e:
                            e["role"] = re.sub(r"\s*[–-]\s*European Commission$", "", p["tag"])[:100]
                        continue
                    if p.get("tag"):  # guests: agencies, OECD, ministers, Parliament staff
                        continue
                    if norm(p["name"]) in chairs:
                        continue
                    mid = find(p["name"])
                    if not mid:
                        unmatched.setdefault(p["name"], []).append(pv["id"])
                        continue
                    s = o["speakers"].setdefault(mid, {"id": mid, "n": 0, "dates": [], "pvs": []})
                    s["n"] += 1
                    if pv["date"] not in s["dates"]:
                        s["dates"].append(pv["date"])
                    if pv["id"] not in s["pvs"]:
                        s["pvs"].append(pv["id"])
        # Officials named in the attendance list of a meeting whose every discussed item was about one nodo file: present
        # for that file. A meeting that also discussed other business says nothing about who came for which item.
        if len(touched) == 1 and not other:
            fid = touched.pop()
            for k, a in att.items():
                e = out[fid]["officials"].setdefault(k, {"name": a["name"], "dg": dg_of(a.get("tag")), "spoke": [], "present": []})
                if pv["date"] not in e["spoke"] and pv["date"] not in e["present"]:
                    e["present"].append(pv["date"])
    files_out = {}
    for fid, o in out.items():
        if not o["meetings"]:
            continue
        sp = sorted(o["speakers"].values(), key=lambda s: s["id"])
        sp.sort(key=lambda s: max(s["dates"]), reverse=True)  # most recent first ...
        sp.sort(key=lambda s: s["n"], reverse=True)  # ... within the same number of times
        files_out[fid] = {"meetings": o["meetings"], "speakers": sp,
                          "officials": sorted(o["officials"].values(), key=lambda e: (-len(e["spoke"]), e["name"]))}
    dates = [p["date"] for p in cache["pvs"].values()]
    doc = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "source": "European Parliament committee minutes (PV), read by tools/minutes. Speakers per agenda item; whoever presided is left out.",
           "through": max(dates) if dates else None, "minutes": len(cache["pvs"]),
           "committees": cache.get("committees", []), "files": files_out}
    return doc, unmatched


def write_json(path, obj, compact):
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(obj, ensure_ascii=False, indent=1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(txt + "\n")
    return (txt + "\n").encode("utf-8")


def main(argv):
    if "--body" not in argv:
        print(__doc__)
        return 2
    body = argv[argv.index("--body") + 1]
    dry = "--dry-run" in argv
    today = datetime.now(timezone.utc).date()
    col = load(body)
    try:
        check(col, today)
    except Rejected as e:
        print(json.dumps({"changed": False, "rejected": str(e)}))
        return 2
    cache = load(CACHE, {"pvs": {}})
    before = json.dumps(cache["pvs"], sort_keys=True, ensure_ascii=False)
    for p in col["pvs"]:
        cache["pvs"][p["id"]] = p
    cut = (today - timedelta(days=KEEP_DAYS)).isoformat()
    cache["pvs"] = {k: v for k, v in sorted(cache["pvs"].items()) if (v.get("date") or "") >= cut}
    cache["committees"] = col.get("committees", cache.get("committees", []))
    cache["checked"] = col.get("fetched")
    cache["listed"] = col.get("listed", [])
    files = load(os.path.join(ROOT, "v1", "files.json"))["files"]
    meps = load(os.path.join(ROOT, "v1", "meps.json"))["meps"]
    doc, unmatched = build(cache, files, meps, today)
    old = load(OUT, {})
    changed = json.dumps(cache["pvs"], sort_keys=True, ensure_ascii=False) != before or json.dumps(old.get("files"), sort_keys=True) != json.dumps(doc["files"], sort_keys=True)
    summary = {"changed": changed, "new": [p["id"] for p in col["pvs"]], "errors": col.get("errors", []), "more": col.get("more", False),
               "minutes": doc["minutes"], "through": doc["through"],
               "files": {k: {"meetings": len(v["meetings"]), "speakers": len(v["speakers"]), "officials": len(v["officials"])} for k, v in doc["files"].items()},
               "unmatched": sorted(unmatched)}
    if dry or not changed:
        print(json.dumps(summary, ensure_ascii=False))
        return 0
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    cache["updated"] = doc["generated"]
    write_json(CACHE, cache, compact=True)
    write_json(REPORT, {"generated": doc["generated"], "checked": col.get("fetched"), "errors": col.get("errors", []), "more": col.get("more", False),
                        "unmatched": unmatched}, compact=False)
    buf = write_json(OUT, doc, compact=True)
    man = load(MANIFEST)
    man["files"]["minutes"] = {"path": "minutes.json",
                               "description": "Who spoke on nodo's files in Parliament committee meetings, from the committees' minutes",
                               "bytes": len(buf), "sha256": hashlib.sha256(buf).hexdigest()}
    man["generated"] = doc["generated"]
    write_json(MANIFEST, man, compact=False)
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
