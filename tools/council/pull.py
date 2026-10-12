#!/usr/bin/env python3
"""Apply a Council collection (tools/council/collect.mjs) to the repository.

The collection is merged into data-cache/council-raw.json (participant lists by meeting; the calendar and Coreper
dates are replaced) and v1/council.json is rebuilt from the merged cache with tools/build-council.py.
data-cache/council-inbox.json records the last collection applied, so the same one is never applied twice.

Usage:
  python3 tools/council/pull.py --body FILE        apply a collection saved to FILE (the JSON string from the browser)
  python3 tools/council/pull.py --supabase         apply the latest approved row of the Supabase table council_inbox
Options: --sha HEX checks the collection's SHA-256; --dry-run builds and checks without writing.
Exit codes: 0 applied or nothing new, 2 the collection or the rebuilt file failed a check (nothing written).
"""
import hashlib, importlib.util, json, os, re, sys, urllib.request
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, "data-cache", "council-raw.json")
STATE = os.path.join(ROOT, "data-cache", "council-inbox.json")
EXTRA = os.path.join(ROOT, "tools", "council", "permreps-extra.json")
COUNCIL = os.path.join(ROOT, "v1", "council.json")

_spec = importlib.util.spec_from_file_location("build_council", os.path.join(ROOT, "tools", "build-council.py"))
bc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bc)

CAL = re.compile(r"^\d{4}-\d\d-\d\d(>\d{4}-\d\d-\d\d)?\|[a-z-]+\|[^|]+\|/en/meetings/[^|]+$")
FORMAL = re.compile(r"^/en/meetings/(agrifish|compet|ecofin|eycs|epsco|env|fac|gac|jha|tte)/\d{4}/")
COUNTRIES = {"AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU",
             "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"}
KEEP_DAYS = 400


class Rejected(Exception):
    pass


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def check_payload(p, today):
    """Shape and plausibility of a collection. Raises Rejected with the reason."""
    if not isinstance(p, dict):
        raise Rejected("collection is not an object")
    f = p.get("fetched", "")
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", f):
        raise Rejected(f"bad fetched date {f!r}")
    if f > (today + timedelta(days=1)).isoformat() or f < (today - timedelta(days=21)).isoformat():
        raise Rejected(f"fetched date {f} is not recent")
    cal, cor, parts = p.get("cal"), p.get("coreper"), p.get("parts")
    if not isinstance(cal, list) or len(cal) < 5 or not all(isinstance(x, str) and CAL.match(x) for x in cal):
        raise Rejected("meeting calendar missing or malformed")
    if not isinstance(cor, list) or len(cor) < 5 or not all(
            isinstance(x, list) and len(x) == 2 and re.fullmatch(r"\d{4}-\d\d-\d\d", str(x[0])) and set(x[1]) <= {"I", "II"} and x[1]
            for x in cor):
        raise Rejected("Coreper dates missing or malformed")
    if not isinstance(parts, list):
        raise Rejected("participant lists missing")
    for x in parts:
        if not isinstance(x, dict) or not FORMAL.match(str(x.get("href", ""))):
            raise Rejected(f"participant list for an unexpected page: {str(x)[:120]}")
        d = x.get("data")
        if d is None:
            continue
        if not isinstance(d, dict) or not set(d) <= COUNTRIES:
            raise Rejected(f"participant list {x['href']} has unknown countries")
        for people in d.values():
            if not isinstance(people, list) or not all(isinstance(q, list) and len(q) == 2 and all(isinstance(s, str) and len(s) < 400 for s in q) for q in people):
                raise Rejected(f"participant list {x['href']} is malformed")


def merge(cache, p, today):
    """Participant lists by meeting page: a list that could be read replaces one that could not. The calendar and Coreper
    dates come whole from the new collection. Lists older than KEEP_DAYS go, except the newest of each configuration."""
    parts = {x["href"]: x for x in (cache or {}).get("parts", [])}
    for x in p["parts"]:
        old = parts.get(x["href"])
        if old is None or x.get("data") is not None or old.get("data") is None:
            parts[x["href"]] = {k: x.get(k) for k in ("href", "title", "pdf", "data")}
    ordered = sorted(parts.values(), key=lambda x: bc.date_of(x["href"]))
    newest = {}
    for x in ordered:
        if x.get("data"):
            newest[bc.conf_of(x["href"].split("/")[3], x.get("title", ""))] = x["href"]
    cut = (today - timedelta(days=KEEP_DAYS)).isoformat()
    kept = [x for x in ordered if bc.date_of(x["href"]) >= cut or x["href"] in newest.values()]
    return {"fetched": p["fetched"], "parser": p.get("parser"), "cal": p["cal"], "coreper": p["coreper"], "parts": kept}


def check_result(old, new):
    """The rebuilt council.json must not lose what the published one has."""
    problems = []
    if len(new["meetings"]) < 5:
        problems.append(f"only {len(new['meetings'])} meetings")
    if len(new["coreper"]) < 5:
        problems.append(f"only {len(new['coreper'])} Coreper dates")
    pr = lambda c, s: sum(1 for v in c.get("permreps", {}).values() if s in v)
    for s in ("pr", "dpr"):
        if pr(new, s) < pr(old, s) - 1:
            problems.append(f"{s} count drops from {pr(old, s)} to {pr(new, s)}")
    for c_old, c_new in zip(old["configs"], new["configs"]):
        if len(c_new.get("reps") or {}) < len(c_old.get("reps") or {}) - 2:
            problems.append(f"{c_old['id']} loses representatives ({len(c_old.get('reps') or {})} to {len(c_new.get('reps') or {})})")
    if problems:
        raise Rejected("; ".join(problems))


def from_supabase():
    cfg = open(os.path.join(ROOT, "config.js"), encoding="utf-8").read()
    url = re.search(r'supabaseUrl:\s*"([^"]+)"', cfg).group(1)
    key = os.environ.get("SUPABASE_KEY") or re.search(r'supabaseAnonKey:\s*"([^"]+)"', cfg).group(1)
    q = "/rest/v1/council_inbox?select=id,created_at,sha256,body&approved_at=not.is.null&order=id.desc&limit=1"
    req = urllib.request.Request(url + q, headers={"apikey": key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        rows = json.load(r)
    return rows[0] if rows else None


def main(argv):
    today = datetime.now(timezone.utc).date()
    dry = "--dry-run" in argv
    state = load(STATE, {}) or {}
    if "--supabase" in argv:
        row = from_supabase()
        if not row or (state.get("id") and row["id"] <= state["id"]):
            print(json.dumps({"changed": False, "reason": "no new approved collection"}))
            return 0
        body, sha, rid = row["body"], row["sha256"], row["id"]
    else:
        body = open(argv[argv.index("--body") + 1], encoding="utf-8").read()
        sha, rid = (argv[argv.index("--sha") + 1] if "--sha" in argv else None), None
    real = hashlib.sha256(body.encode("utf-8")).hexdigest()
    if sha and sha != real:
        raise Rejected(f"SHA-256 mismatch: expected {sha}, got {real}")
    if state.get("sha256") == real:
        print(json.dumps({"changed": False, "reason": "collection already applied"}))
        return 0
    p = json.loads(body)
    check_payload(p, today)
    cache = load(CACHE)
    if cache and p["fetched"] < cache.get("fetched", ""):
        raise Rejected(f"collection of {p['fetched']} is older than the cache ({cache['fetched']})")
    merged = merge(cache, p, today)
    old = load(COUNCIL)
    new, unassigned = bc.build(old, merged, load(EXTRA))
    check_result(old, new)
    summary = {"changed": True, "fetched": p["fetched"], "sha256": real, "row": rid, "meetings": len(new["meetings"]),
               "coreper": len(new["coreper"]), "lists": len(merged["parts"]), "newLists": len(p["parts"]), "unassigned": unassigned,
               "pr": sum(1 for v in new["permreps"].values() if "pr" in v), "dpr": sum(1 for v in new["permreps"].values() if "dpr" in v)}
    if dry:
        summary["dryRun"] = True
        print(json.dumps(summary, ensure_ascii=False))
        return 0
    with open(CACHE, "w", encoding="utf-8") as f:
        f.write(json.dumps(merged, ensure_ascii=False, separators=(",", ":")))
    bc.write(new, COUNCIL)
    with open(STATE, "w", encoding="utf-8") as f:
        f.write(json.dumps({"id": rid, "sha256": real, "fetched": p["fetched"], "applied": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}, indent=1) + "\n")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Rejected as e:
        print(f"Rejected: {e}", file=sys.stderr)
        sys.exit(2)
