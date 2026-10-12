#!/usr/bin/env python3
"""Rebuild v1/council.json from a browser collection of the Council website.

consilium.europa.eu blocks GitHub runners, so the collection runs in a desktop browser (see README, "council.json
updates") and produces a raw file with:
  cal      meeting calendar lines "start[>end]|code|title|href" for the rest of the year
  coreper  [date, ["I", "II"]] from the preparatory-bodies calendar
  parts    one entry per formal Council meeting of the year: href, title, pdf, data {country: [[name, title], ...]}
           parsed from the official list of participants
This script keeps what does not come from the collection (presidency, population, configuration names, areas,
Coreper attachment) and rebuilds: meetings, coreper, each configuration's last meeting and representatives, and the
Permanent Representatives and deputies named in the lists. Extra names from other official sources can be passed
in a JSON file ({country: {"pr"|"dpr": [name, date, source]}}): the participant lists win when they are newer.

Usage: python3 tools/build-council.py RAW.json [EXTRA.json] [--out v1/council.json]
"""
import json, re, sys, hashlib, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF_IDS = ["GAC", "GAC-COH", "FAC", "FAC-TRADE", "FAC-DEF", "FAC-DEV", "ECOFIN", "JHA-HOME", "JHA-JUST", "COMPET-IM",
            "COMPET-RS", "TTE-TEL", "TTE-EN", "TTE-TRANS", "ENVI", "AGRIFISH", "EPSCO-EMPL", "EPSCO-HEALTH", "EYCS-EY", "EYCS-CS"]
BASE = "https://www.consilium.europa.eu"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def conf_of(code, title):
    """Configuration from the URL code and the title. The part in brackets decides when there is one
    ("Justice and Home Affairs Council (Justice)"), otherwise the whole title ("Informal meeting of trade ministers")."""
    m = re.search(r"\(([^)]*)\)", title or "")
    sub = (m.group(1) if m else title or "").lower()
    if code == "gac":
        return "GAC-COH" if "cohesion" in sub else "GAC"
    if code == "fac":
        return "FAC-DEF" if "defence" in sub else "FAC-TRADE" if "trade" in sub else "FAC-DEV" if "development" in sub else "FAC"
    if code == "jha":
        return "JHA-HOME" if "home" in sub else "JHA-JUST" if "justice" in sub else None
    if code == "epsco":
        return "EPSCO-HEALTH" if "health" in sub else "EPSCO-EMPL"
    if code == "compet":
        return "COMPET-RS" if ("research" in sub or "space" in sub) else "COMPET-IM"
    if code == "tte":
        return "TTE-TEL" if "telecom" in sub else "TTE-EN" if "energy" in sub else "TTE-TRANS" if "transport" in sub else None
    if code == "eycs":
        return "EYCS-CS" if ("culture" in sub or "sport" in sub) else "EYCS-EY" if ("education" in sub or "youth" in sub) else None
    return {"ecofin": "ECOFIN", "env": "ENVI", "agrifish": "AGRIFISH"}.get(code)


def date_of(href):
    m = re.search(r"/(\d{4})/(\d\d)/(\d\d)", href)
    return f"{m[1]}-{m[2]}-{m[3]}" if m else ""


def clean(s):
    s = re.sub(r"\s*protocol\.council@consilium\.europa\.eu\s*", " ", s or "")
    return re.sub(r"\s+", " ", s).strip()


def clean_name(n):
    n = clean(n)
    # pdf text splits a surname at an accented capital: "Oana-Silvia Ț OIU" -> "Oana-Silvia ȚOIU"
    n = re.sub(r"(?<=\s)([^\x00-\x7F])\s(?=[A-ZÀ-ÖØ-Þ])", r"\1", n)
    # and spaces hyphens: "LÉGLISE - COSTA" -> "LÉGLISE-COSTA"
    return re.sub(r"\s+-\s+", "-", n)


HON = re.compile(r"^(Mr|Ms|Mrs|Dr|Mme|M\.|H\.E\.|Sir|Lady|Prof)\s+")


def honorifics(parts):
    """The honorific each person carries most often across the lists (one list writes "Mr Irena ANDRASSY")."""
    seen = {}
    for p in parts:
        for people in (p.get("data") or {}).values():
            for n, _ in people:
                n = clean_name(n); m = HON.match(n)
                if m:
                    seen.setdefault(n[m.end():], {}).setdefault(m.group(1), 0)
                    seen[n[m.end():]][m.group(1)] += 1
    return {k: max(v, key=v.get) for k, v in seen.items()}


def fix_name(n, hon):
    n = clean_name(n); m = HON.match(n)
    return f"{hon.get(n[m.end():], m.group(1))} {n[m.end():]}" if m else n


def pr_slot(title):
    t = title or ""
    if re.search(r"Alternate|PSC|Political and Security", t, re.I):
        return None
    if re.search(r"Deputy Permanent Representative", t, re.I):
        return "dpr"
    if re.search(r"Permanent Representative", t, re.I):
        return "pr"
    return None


def build(old, raw, extra=None):
    fetched = raw["fetched"]
    # meetings of the rest of the year
    meetings = []
    for ln in raw["cal"]:
        d, code, title, href = ln.split("|")
        a, _, b = d.partition(">")
        ec = code == "european-council" and re.search(r"European Council|heads of state|Euro Summit", title, re.I)
        kind = "ec" if ec else "summit" if code.startswith("international") or code == "european-council" else "eg" if code == "eurogroup" else "council"
        meetings.append({"start": a, "end": b or a, "title": title, "url": BASE + href, "conf": conf_of(code, title),
                         "kind": kind, "informal": title.lower().startswith("informal")})
    # representatives at the last meeting of each configuration, and ambassadors named in any list
    # a list that could not be read (none published, or in French only) still dates the meeting
    parts = sorted([p for p in raw["parts"] if p.get("data") is not None], key=lambda p: date_of(p["href"]))
    hon = honorifics(parts)
    reps, last, prs, unassigned = {}, {}, {}, []
    for p in parts:
        code = p["href"].split("/")[3]
        cid = conf_of(code, p["title"])
        d = date_of(p["href"])
        if not cid:
            unassigned.append(p["title"]); continue
        last[cid] = [d, BASE + p["href"]]
        for cc, people in p["data"].items():
            ppl = [[fix_name(n, hon), clean(t)] for n, t in people if clean_name(n)]
            if not ppl:
                continue
            reps.setdefault(cid, {})[cc] = [d, ppl]
            for n, t in ppl:
                s = pr_slot(t)
                if s:
                    prs.setdefault(cc, {})[s] = [n, d]
    # other official sources fill gaps; a newer participant list wins
    for cc, slots in (extra or {}).items():
        for s, v in slots.items():
            cur = prs.get(cc, {}).get(s)
            if not cur or cur[1] < v[1]:
                prs.setdefault(cc, {})[s] = v
    configs = []
    for c in old["configs"]:
        n = dict(c)
        n["last"] = last.get(c["id"], c.get("last"))
        n["reps"] = reps.get(c["id"], c.get("reps", {}))
        configs.append(n)
    out = dict(old)
    out.update({
        "fetched": fetched, "configs": configs, "meetings": meetings,
        "coreper": [[d, k] for d, k in raw["coreper"]],
        "permreps": prs,
        "sources": {**old.get("sources", {}),
                    "participants": f"Council of the EU, lists of participants of formal Council meetings, January to {MONTHS[int(fetched[5:7]) - 1]} {fetched[:4]}",
                    "calendar": f"Consilium meeting calendar, checked {fetched}"},
    })
    if extra:
        out["sources"]["permreps"] = ("Ambassadors and deputies not named in the participant lists come from official sources: the Permanent "
                                      "Representations' websites and Council documents (URL in the third field of the entry)")
    return out, unassigned


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_path = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(ROOT, "v1", "council.json")
    if "--out" in sys.argv:
        args = [a for a in args if a != out_path]
    raw = json.load(open(args[0], encoding="utf-8"))
    extra = json.load(open(args[1], encoding="utf-8")) if len(args) > 1 else None
    old = json.load(open(os.path.join(ROOT, "v1", "council.json"), encoding="utf-8"))
    new, unassigned = build(old, raw, extra)
    buf = json.dumps(new, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    open(out_path, "wb").write(buf)
    man_path = os.path.join(os.path.dirname(out_path), "manifest.json")
    if os.path.exists(man_path):
        man = json.load(open(man_path, encoding="utf-8"))
        if "council" in man.get("files", {}):
            man["files"]["council"].update({"bytes": len(buf), "sha256": hashlib.sha256(buf).hexdigest()})
            open(man_path, "w", encoding="utf-8").write(json.dumps(man, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps({"bytes": len(buf), "meetings": len(new["meetings"]), "coreper": len(new["coreper"]),
                      "unassigned": unassigned, "pr": sum(1 for v in new["permreps"].values() if "pr" in v),
                      "dpr": sum(1 for v in new["permreps"].values() if "dpr" in v)}, ensure_ascii=False))
