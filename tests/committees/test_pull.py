"""tools/committees/pull.py: reading committee draft agendas (fixtures: ITRE 30 Nov - 1 Dec 2026 and the ITRE-IMCO
joint meeting of 1 Dec 2026, as collected by tools/browser/committees.js)."""
import importlib.util, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("pull", os.path.join(ROOT, "tools", "committees", "pull.py"))
pull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pull)
AG = {a["id"]: a for a in json.load(open(os.path.join(os.path.dirname(__file__), "fixtures", "agendas.json")))["agendas"]}
NAMES = {"committee on industry, research and energy": "ITRE", "committee on the internal market and consumer protection": "IMCO"}


def steps(aid):
    return [s for _, s in pull.parse_agenda(AG[aid], NAMES)]


def test_deal_vote_takes_the_section_time():
    s = [x for x in steps("ITRE-OJ-2026-11-30-1") if x["procedure"] == "2025/0400(COD)"]
    assert len(s) == 1
    assert (s[0]["date"], s[0]["time"], s[0]["kind"], s[0]["committee"]) == ("2026-12-01", "10.00", "deal-vote", "ITRE")
    assert s[0]["what"] == "ITRE vote on the provisional agreement"
    assert s[0]["rapporteur"].startswith("Niels Fuglsang")


def test_deadline_takes_its_own_date_and_time():
    s = {x["kind"]: x for x in steps("ITRE-OJ-2026-11-30-1") if x["procedure"] == "2026/0139(COD)"}
    assert s["consideration"]["date"] == "2026-12-01"
    assert (s["deadline"]["date"], s["deadline"]["time"]) == ("2026-12-02", "17.00")
    assert s["deadline"]["what"] == "ITRE deadline for amendments to the draft report"


def test_joint_committee_names_both():
    s = {x["kind"]: x for x in steps("CJ18-OJ-2026-12-01-1") if x["procedure"] == "2026/0138(COD)"}
    assert s["consideration"]["committee"] == "ITRE–IMCO"
    assert (s["consideration"]["date"], s["consideration"]["time"]) == ("2026-12-01", "14.30")
    assert (s["deadline"]["date"], s["deadline"]["time"]) == ("2026-12-10", "12.00")


def test_items_without_procedure_are_skipped():
    assert all(x["procedure"] for x in steps("ITRE-OJ-2026-11-30-1"))
    assert not any("2026/2911" in x["procedure"] for x in steps("ITRE-OJ-2026-11-30-1") if x["procedure"].endswith("(COD)"))
