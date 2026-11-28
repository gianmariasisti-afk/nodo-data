#!/usr/bin/env python3
"""MEP offices and teams, from the Parliament's MEP pages.

Input: the saved answers of tools/browser/offices.js (one or more RESULT slices). Output: v1/offices.json:
  {"generated", "fetched", "source", "meps": {MEP id: {"bxl": office, "sxb": office, "team": [names], "pool": [names]}}}
  office = {"building", "room", "phone"} (phone in +32 2 28 45420 form)
  team = the MEP's own accredited assistants; pool = accredited assistants the MEP shares with other MEPs ("grouping").
Local assistants, service providers, paying agents and trainees are left out: nodo shows the Brussels team.
Names keep the Parliament's spelling, with all-capital words set in title case. The Parliament publishes no emails
or roles for assistants, and nodo stores none.

A run that read fewer than 600 MEPs, or more than 60 with errors, is refused (bot check, cut collection).

Usage: python3 tools/offices/pull.py SAVED_ANSWER [SAVED_ANSWER ...] [--dry-run]
Prints a summary as JSON with "changed". Exit codes: 0 applied or nothing new, 2 the collection failed a check.
"""
import hashlib, importlib.util, json, os, re, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "v1", "offices.json")
REPORT = os.path.join(ROOT, "data-cache", "offices-report.json")
MANIFEST = os.path.join(ROOT, "v1", "manifest.json")
_spec = importlib.util.spec_from_file_location("cfb", os.path.join(ROOT, "tools", "council", "from_browser.py"))
cfb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cfb)

ROOM = re.compile(r"^[A-Z0-9]{2,4}\s?[A-Z0-9]{2,6}$")


def T(s):
    return re.sub(r"\s+", " ", s or "").strip()


def word(w):
    """ELKJÆR-LARSEN -> Elkjær-Larsen; mixed-case words stay as written."""
    if len(w) > 1 and w.upper() == w and any(c.isalpha() for c in w):
        return "-".join("'".join(p[:1].upper() + p[1:].lower() for p in part.split("'")) for part in w.split("-"))
    return w


def name(s):
    return " ".join(word(w) for w in T(s).split())


def phone(s):
    s = T(s)
    m = re.match(r"^00(\d+)\s*(.*)$", s)
    return f"+{m.group(1)} {m.group(2)}".strip() if m else s


def office(card):
    lines = [T(l) for l in card.get("lines") or [] if T(l)]
    b = next((i for i, l in enumerate(lines) if l.lower().startswith("bât")), None)
    if b is None:
        return None
    building = " ".join(w.capitalize() for w in re.sub(r"^b[âa]t\.?\s*", "", lines[b], flags=re.I).split())
    room = lines[b + 1] if b + 1 < len(lines) and ROOM.match(lines[b + 1]) else ""
    out = {"building": building}
    if room:
        out["room"] = room
    if card.get("phone"):
        out["phone"] = phone(card["phone"])
    return out


def build(col):
    meps = {}
    for x in col.get("meps") or []:
        o = {}
        for c in x.get("cards") or []:
            city = T(c.get("city")).lower()
            k = "bxl" if city.startswith("bru") else "sxb" if city.startswith("stras") else None
            off = office(c) if k else None
            if off:
                o[k] = off
        for t in x.get("teams") or []:
            ty = T(t.get("type")).lower()
            k = "team" if ty == "accredited assistants" else "pool" if ty.startswith("accredited assistants (grouping") else None
            if k:
                ns = sorted({name(n) for n in t.get("names") or [] if T(n)}, key=lambda n: (n.split()[-1].lower(), n.lower()))
                if ns:
                    o[k] = ns
        meps[str(x["id"])] = o
    return meps


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
    errors = col.get("errors") or []
    if len(col.get("meps") or []) < 600 or len(errors) > 60:
        print(json.dumps({"error": f"read {len(col.get('meps') or [])} MEPs with {len(errors)} errors: refused"}))
        return 2
    meps = build(col)
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except FileNotFoundError:
        old = {}
    changed = json.dumps(old.get("meps"), sort_keys=True) != json.dumps(meps, sort_keys=True)
    out = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
           "fetched": col.get("fetched"),
           "source": "European Parliament, MEP pages (europarl.europa.eu/meps): contact cards and assistants, names only",
           "meps": dict(sorted(meps.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0))}
    summary = {"changed": changed, "fetched": col.get("fetched"), "meps": len(meps),
               "withBrussels": sum(1 for o in meps.values() if "bxl" in o), "withTeam": sum(1 for o in meps.values() if "team" in o),
               "withPool": sum(1 for o in meps.values() if "pool" in o), "errors": errors[:20]}
    if not dry and changed:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        man = json.load(open(MANIFEST, encoding="utf-8"))
        raw = open(OUT, "rb").read()
        man["files"]["offices"] = {"path": "offices.json", "description": "MEP offices (Brussels, Strasbourg) and accredited assistants, names only, from the MEP pages",
                                   "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        man["generated"] = out["generated"]
        with open(MANIFEST, "w", encoding="utf-8") as f:
            json.dump(man, f, ensure_ascii=False, indent=1)
            f.write("\n")
    if not dry:
        os.makedirs(os.path.dirname(REPORT), exist_ok=True)
        with open(REPORT, "w", encoding="utf-8") as f:
            json.dump({"run": out["generated"], **summary}, f, ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
