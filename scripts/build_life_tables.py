"""Build data/life-tables.js from the UN World Population Prospects 2024 and WHO.

Streams the complete (single year of age) life tables, medium variant, for both
sexes, females and males. For each country or area and sex it keeps:

  e(x) for the base year (period life expectancy, as published),
  l(x) for the base year (survivors to each age per 10,000 births),
  cohort e(x): years left for someone aged x in the base year if death rates
    follow the UN projection year by year (2100 rates hold after 2100),
  cohort median and upper quartile of years left, rounded to whole years.

It also fetches WHO healthy life expectancy (HALE) and life expectancy at birth
and at 60 to store the share of remaining life lived in good health.

Usage: python3 scripts/build_life_tables.py [year]
"""
import csv
import gzip
import json
import math
import sys
import urllib.request
from array import array
from pathlib import Path

YEAR = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
LAST = 2100
BASE = ("https://population.un.org/wpp/assets/Excel%20Files/"
        "1_Indicator%20(Standard)/CSV_FILES/")
FILES = {
    "b": "WPP2024_Life_Table_Complete_Medium_Both_2024-2100.csv.gz",
    "f": "WPP2024_Life_Table_Complete_Medium_Female_2024-2100.csv.gz",
    "m": "WPP2024_Life_Table_Complete_Medium_Male_2024-2100.csv.gz",
}
WHO = "https://ghoapi.azureedge.net/api/"
WHO_SEX = {"SEX_BTSX": "b", "SEX_FMLE": "f", "SEX_MLE": "m"}
WORLD = "900"
COUNTRY = "4"
AGES = 101
YEARS = LAST - YEAR + 1
OUT = Path(__file__).resolve().parent.parent / "data" / "life-tables.js"


def rows(name):
    with urllib.request.urlopen(BASE + name) as resp:
        text = (line.decode("utf-8-sig") for line in gzip.GzipFile(fileobj=resp))
        header = next(csv.reader([next(text)]))
        for line in text:
            yield dict(zip(header, next(csv.reader([line]))))


def remaining_at(share, surv, open_e):
    """Years until survival falls to `share`, with linear survival within each year
    and an exponential tail in the open age group."""
    for k in range(len(surv) - 1):
        if surv[k + 1] <= share:
            return k + (surv[k] - share) / (surv[k] - surv[k + 1])
    last = surv[-1]
    return len(surv) - 1 + (open_e * math.log(last / share) if last > share else 0)


def cohort(q, a, e, age, period=False):
    """Cohort e(x), median and upper quartile for someone aged `age` in the base year.
    With period=True it holds base-year rates, which should reproduce the published e(x)."""
    surv, years, s = [1.0], 0.0, 1.0
    for k in range(AGES - 1 - age):
        t = 0 if period else min(k, YEARS - 1)
        i = t * AGES + age + k
        years += s * (1 - q[i] + q[i] * a[i])
        s *= 1 - q[i]
        surv.append(s)
    open_e = e[(0 if period else min(AGES - 1 - age, YEARS - 1)) * AGES + AGES - 1]
    years += s * open_e
    return years, remaining_at(0.5, surv, open_e), remaining_at(0.25, surv, open_e)


places = {}
worst = 0.0
for sex, name in FILES.items():
    print(f"reading {name}", file=sys.stderr)
    tables = {}
    for r in rows(name):
        t = int(r["Time"])
        if t < YEAR or not (r["LocTypeID"] == COUNTRY or r["LocID"] == WORLD):
            continue
        code = r["ISO3_code"] or "WLD"
        if code not in tables:
            tables[code] = [array("d", bytes(8 * YEARS * AGES)) for _ in range(4)]
            places.setdefault(code, {"n": r["Location"], "a2": r["ISO2_code"]})
        q, a, e, l = tables[code]
        i = (t - YEAR) * AGES + int(r["AgeGrpStart"])
        q[i], a[i], e[i], l[i] = float(r["qx"]), float(r["ax"]), float(r["ex"]), float(r["lx"])

    for code, (q, a, e, l) in tables.items():
        p = places[code]
        p[sex] = [round(e[x], 1) for x in range(AGES)]
        p.setdefault("l", {})[sex] = [round(l[x] / 10) for x in range(AGES)]
        worst = max(worst, max(abs(cohort(q, a, e, x, period=True)[0] - e[x]) for x in range(10, AGES)))
        c = [cohort(q, a, e, x) for x in range(AGES)]
        p.setdefault("c", {})[sex] = [round(v[0], 1) for v in c]
        p.setdefault("cmed", {})[sex] = [round(v[1]) for v in c]
        p.setdefault("cq3", {})[sex] = [round(v[2]) for v in c]
    del tables

print("reading WHO healthy life expectancy", file=sys.stderr)
who = {}
for key, code in [("hale0", "WHOSIS_000002"), ("hale60", "WHOSIS_000007"), ("le0", "WHOSIS_000001"), ("le60", "WHOSIS_000015")]:
    url = f"{WHO}{code}?$filter=TimeDim%20eq%202021&$select=SpatialDim,SpatialDimType,Dim1,NumericValue"
    with urllib.request.urlopen(url) as resp:
        for v in json.load(resp)["value"]:
            place = "WLD" if v["SpatialDimType"] == "GLOBAL" else v["SpatialDim"] if v["SpatialDimType"] == "COUNTRY" else None
            if place and v["Dim1"] in WHO_SEX and v["NumericValue"]:
                who.setdefault(place, {}).setdefault(WHO_SEX[v["Dim1"]], {})[key] = v["NumericValue"]
for code, sexes in who.items():
    if code in places and all(len(sexes.get(s, {})) == 4 for s in "bfm"):
        places[code]["h"] = {s: [round(v["hale0"] / v["le0"], 3), round(v["hale60"] / v["le60"], 3)] for s, v in sexes.items()}

complete = {k: v for k, v in places.items() if all(s in v for s in FILES)}
payload = {"year": YEAR, "places": dict(sorted(complete.items()))}
OUT.write_text(
    "// Generated by scripts/build_life_tables.py. Do not edit by hand.\n"
    f"// UN DESA, World Population Prospects 2024, complete life tables, medium variant, from {YEAR} (CC BY 3.0 IGO).\n"
    "// b, f, m: period e(x), ages 0 to 100, for both sexes, females, males. l: period survivors per 10,000 births.\n"
    "// c: cohort e(x) under projected death rates. cmed, cq3: cohort median and upper quartile of years left.\n"
    "// h: WHO 2021 healthy share of remaining life at birth and at 60 (HALE / LE), CC BY-NC-SA 3.0 IGO.\n"
    "window.LIFE_TABLES = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n",
    encoding="utf-8",
)
jpn, can = complete["JPN"], complete["CAN"]
print(f"check: recomputed period e(x) differs from the published one by at most {worst:.3f} years (ages 10+)", file=sys.stderr)
print(f"wrote {len(complete)} places, {sum(1 for p in complete.values() if 'h' in p)} with WHO data, to {OUT}", file=sys.stderr)
print(f"check JPN 30: period {jpn['b'][30]} cohort {jpn['c']['b'][30]}; CAN 34: period {can['b'][34]} cohort {can['c']['b'][34]}"
      f" median {can['cmed']['b'][34]} q3 {can['cq3']['b'][34]}; age 100 period {can['b'][100]} cohort {can['c']['b'][100]}", file=sys.stderr)
