"""Apply the Legislative Observatory differences to the MEP lists of v1/files.json.

The weekly Council task runs OEIL CODE in the browser, which answers with
{"checked", "procedures", "differences": [{file, ref, change, role, id, name, committee, was?}], "errors"}.
This script applies those differences:
  new        add {id, role, committee, basis "ep-procedure-file", ref[, part]}
  gone       remove the entry with that id and role (and part, for a package)
  committee  set the committee of that entry
A new MEP whose id is not in v1/meps.json is skipped and reported. Nothing else in files.json changes.

Usage: python3 tools/files/apply_mep_diff.py DIFF.json [--dry-run]
Prints a JSON summary. Exit 0 = applied (or nothing to apply), 2 = refused (input malformed or too many changes). """
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILES = os.path.join(ROOT, "v1", "files.json")
MEPS = os.path.join(ROOT, "v1", "meps.json")
ROLES = {"rapporteur", "shadow", "opinion-rapporteur"}
MAX_CHANGES = 25  # more than this in one week means the page layout changed, not the people


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    dry = "--dry-run" in argv
    diff = json.load(open(argv[0], encoding="utf-8"))
    rows = diff.get("differences")
    if not isinstance(rows, list):
        print(json.dumps({"refused": "no differences list"}))
        return 2
    if len(rows) > MAX_CHANGES:
        print(json.dumps({"refused": f"{len(rows)} differences (limit {MAX_CHANGES}); check by hand"}))
        return 2
    data = json.load(open(FILES, encoding="utf-8"))
    mep_ids = {str(m["id"]) for m in json.load(open(MEPS, encoding="utf-8"))["meps"]}
    by_id = {f["id"]: f for f in data["files"]}
    applied, skipped = [], []
    for d in rows:
        f = by_id.get(d.get("file"))
        if not f or d.get("role") not in ROLES or not d.get("id"):
            skipped.append({**d, "why": "unknown file, role or id"})
            continue
        part = next((p["id"] for p in f.get("parts") or [] if p.get("procedure") == d.get("ref")), None)
        mid = str(d["id"])
        same = lambda e: str(e.get("id")) == mid and e.get("role") == d["role"] and (part is None or e.get("part") == part)
        meps = f.setdefault("meps", [])
        if d["change"] == "new":
            if mid not in mep_ids:
                skipped.append({**d, "why": "MEP id not in meps.json"})
                continue
            if any(same(e) for e in meps):
                continue
            e = {"id": mid, "role": d["role"], "committee": d.get("committee") or "", "basis": "ep-procedure-file", "ref": d.get("ref")}
            if part:
                e["part"] = part
            meps.append(e)
        elif d["change"] == "gone":
            before = len(meps)
            f["meps"] = [e for e in meps if not same(e)]
            if len(f["meps"]) == before:
                continue
        elif d["change"] == "committee":
            hit = [e for e in meps if same(e)]
            if not hit:
                skipped.append({**d, "why": "entry not found"})
                continue
            for e in hit:
                e["committee"] = d.get("committee") or e["committee"]
                e["basis"], e["ref"] = "ep-procedure-file", d.get("ref")
        else:
            skipped.append({**d, "why": "unknown change"})
            continue
        applied.append({k: d.get(k) for k in ("file", "change", "role", "name", "id", "committee")})
    if applied and not dry:
        with open(FILES, "w", encoding="utf-8") as out:
            out.write(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"applied": applied, "skipped": skipped, "dryRun": dry}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
