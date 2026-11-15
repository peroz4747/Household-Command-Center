#!/usr/bin/env python3
"""Zgradi lib/data/conflicts.json iz podatkov UCDP (CC BY 4.0). Zaženi enkrat letno, ko izide nova različica.

Potrebne datoteke v mapi DATA (https://ucdp.uu.se/downloads/):
  UcdpPrioConflict_v*.csv        (UCDP/PRIO Armed Conflict Dataset)
  BattleDeaths_v*.csv            (Battle-Related Deaths, conflict level)
  UCDPConflictTerminationDataset_v*_Conflict.csv
  GEDEvent_v*.csv                (Georeferenced Event Dataset - žrtve po straneh)
  codelist_without_cldr.csv      (countrycode: Gleditsch-Ward -> ISO2)

Uporaba: python3 scripts/build-conflicts.py DATA lib/data/conflicts.json
"""
import collections
import csv
import glob
import json
import os
import sys

csv.field_size_limit(10**8)
DATA, OUT = sys.argv[1], sys.argv[2]


def one(pattern):
    files = sorted(glob.glob(os.path.join(DATA, pattern)))
    if not files:
        sys.exit(f"manjka {pattern}")
    return files[-1]


def rows(pattern):
    return csv.DictReader(open(one(pattern), encoding="utf8"))


# Gleditsch-Ward -> ISO2 (countrycode) + zgodovinske države, ki jih seznam nima.
gw = {}
for x in rows("codelist_without_cldr.csv"):
    if x.get("gwn") not in (None, "", "NA") and x.get("iso2c") not in (None, ""):
        gw[x["gwn"]] = x["iso2c"]
gw.update({"345": "RS", "347": "XK", "816": "VN", "817": "VN", "678": "YE", "680": "YE", "265": "DE", "260": "DE", "315": "CZ",
           "364": "RU", "365": "RU", "511": "TZ", "711": "CN", "565": "NA", "972": "TO", "55": "GD"})


def isos(s):
    return sorted({gw[g.strip()] for g in (s or "").split(",") if g.strip() in gw})


def ranges(years):
    out = []
    for y in sorted(set(years)):
        if out and y == out[-1][1] + 1:
            out[-1][1] = y
        else:
            out.append([y, y])
    return out


acd = list(rows("UcdpPrioConflict_v*.csv"))
max_year = max(int(r["year"]) for r in acd)

brd = collections.defaultdict(dict)
for r in rows("BattleDeaths_v*.csv"):
    brd[r["conflict_id"]][int(r["year"])] = int(float(r["bd_best"] or 0))

outcome = {}
for r in rows("UCDPConflictTerminationDataset_v*_Conflict.csv"):
    if r.get("c_outcome") not in (None, "", "NA") and r.get("c_ep_endyear") not in (None, "", "NA"):
        y = int(float(r["c_ep_endyear"]))
        if r["conflict_id"] not in outcome or y >= outcome[r["conflict_id"]][1]:
            outcome[r["conflict_id"]] = (int(float(r["c_outcome"])), y)

# GED: žrtve po straneh za meddržavne/državne konflikte (type_of_violence 1), od 1989.
ged_side = collections.defaultdict(lambda: {"a": 0, "b": 0, "civ": 0, "unk": 0})
ged_iso = collections.defaultdict(lambda: collections.defaultdict(int))
ged_years = collections.defaultdict(lambda: [9999, 0])
for r in rows("GEDEvent_v*.csv"):
    if r["type_of_violence"] != "1":
        continue
    cid = r["conflict_new_id"]
    da, db = int(r["deaths_a"] or 0), int(r["deaths_b"] or 0)
    s = ged_side[cid]
    s["a"] += da
    s["b"] += db
    s["civ"] += int(r["deaths_civilians"] or 0)
    s["unk"] += int(r["deaths_unknown"] or 0)
    y = int(r["year"])
    ged_years[cid][0] = min(ged_years[cid][0], y)
    ged_years[cid][1] = max(ged_years[cid][1], y)
    # Žrtve strani pripišemo državi, če je na tej strani natanko ena vlada (sicer bi jih štele dvakrat).
    for code, d in ((r.get("gwnoa"), da), (r.get("gwnob"), db)):
        st = isos(code)
        if len(st) == 1 and d:
            ged_iso[cid][st[0]] += d

by = collections.defaultdict(list)
for r in acd:
    by[r["conflict_id"]].append(r)

conflicts = []
for cid, rs in by.items():
    rs.sort(key=lambda r: int(r["year"]))
    last = rs[-1]
    years = [int(r["year"]) for r in rs]
    union = lambda key: sorted({i for r in rs for i in isos(r[key])})
    # Udeležba vsake države: leta, stran, vloga in strani konflikta v prvem letu njene udeležbe.
    part = {}
    for r in rs:
        y = int(r["year"])
        for key, side, role in (("gwno_a", "A", "primary"), ("gwno_b", "B", "primary"), ("gwno_a_2nd", "A", "support"), ("gwno_b_2nd", "B", "support")):
            for iso in isos(r[key]):
                p = part.setdefault(iso, {"side": side, "role": role, "years": [], "sideA": r["side_a"], "sideB": r["side_b"], "roles": set()})
                p["years"].append(y)
                p["roles"].add(role)
    members = {}
    for iso, p in part.items():
        members[iso] = {
            "side": p["side"],
            "role": "primary" if "primary" in p["roles"] else "support",
            "years": ranges(p["years"]),
            "sideA": p["sideA"],
            "sideB": p["sideB"],
            "now": p["years"][-1] == max_year if p["years"] else False,
        }
    d = brd.get(cid, {})
    o = outcome.get(cid)
    ongoing = years[-1] == max_year
    gs = ged_side.get(cid)
    conflicts.append({
        "id": int(cid),
        "location": last["location"],
        "sideA": last["side_a"], "sideB": last["side_b"],
        "sideA2": last["side_a_2nd"] or "", "sideB2": last["side_b_2nd"] or "",
        "a": union("gwno_a"), "b": union("gwno_b"), "a2": union("gwno_a_2nd"), "b2": union("gwno_b_2nd"),
        "aNow": isos(last["gwno_a"]), "bNow": isos(last["gwno_b"]), "a2Now": isos(last["gwno_a_2nd"]), "b2Now": isos(last["gwno_b_2nd"]),
        "type": int(last["type_of_conflict"]),
        "inc": int(last["incompatibility"]),
        "territory": last["territory_name"] or "",
        "start": rs[0]["start_date"][:10],
        "first": years[0], "last": years[-1], "active": len(years),
        "war": sum(1 for r in rs if r["intensity_level"] == "2"),
        "deaths": sum(d.values()), "deathsYears": [min(d), max(d)] if d else None,
        "recent": {str(y): d[y] for y in sorted(d)[-6:]} if d and years[-1] >= max_year - 2 else {},
        "ongoing": ongoing,
        "outcome": o[0] if o and not ongoing else None,
        "outcomeYear": o[1] if o and not ongoing else None,
        "members": members,
        "ged": ({**gs, "from": ged_years[cid][0], "to": ged_years[cid][1], "byIso": dict(ged_iso[cid])} if gs else None),
        "byYear": [{"y": int(r["year"]), "a": isos(r["gwno_a"]), "b": isos(r["gwno_b"]), "a2": isos(r["gwno_a_2nd"]), "b2": isos(r["gwno_b_2nd"])} for r in rs if int(r["year"]) >= max_year - 9],
    })
conflicts.sort(key=lambda c: (-c["last"], -c["deaths"]))
src = "UCDP/PRIO Armed Conflict, Battle-Related Deaths, Georeferenced Event Dataset (GED), Conflict Termination (CC BY 4.0)"
json.dump({"source": src, "maxYear": max_year, "conflicts": conflicts}, open(OUT, "w"), separators=(",", ":"), ensure_ascii=False)
print(len(conflicts), "konfliktov, zadnje leto", max_year, "| z GED:", sum(1 for c in conflicts if c["ged"]))
