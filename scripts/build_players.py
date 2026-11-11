"""Build data/players.json: every MLB player who appeared in 2000+.

Inputs (data/raw/):
  players_YYYY.json   MLB Stats API season player lists (names, positions, birthplaces)
  war_bat.txt         Baseball-Reference batting WAR by season
  war_pitch.txt       Baseball-Reference pitching WAR by season
  wikidata_birth.csv  MLB id -> birthplace coordinates
  geocode_cache.json  (optional) "city|state|country" -> [lat, lon] for places Wikidata missed
"""
import csv, glob, json, os, re, unicodedata
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
FIRST_YEAR = 2000


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


# --- WAR, by mlb id ---------------------------------------------------------
war = defaultdict(float)
years = defaultdict(set)
ip_start = defaultdict(float)
ip_relief = defaultdict(float)
bbref = {}
teams = defaultdict(lambda: defaultdict(float))  # mlb id -> team -> games

with open(os.path.join(RAW, "war_bat.txt"), newline="") as f:
    for r in csv.DictReader(f):
        if r["mlb_ID"] in ("", "NULL"):
            continue
        i = int(r["mlb_ID"])
        war[i] += num(r["WAR"])
        y = int(r["year_ID"])
        years[i].add(y)
        bbref[i] = r["player_ID"]
        if y >= FIRST_YEAR and r["pitcher"] == "N":
            teams[i][r["team_ID"]] += num(r["G"])

with open(os.path.join(RAW, "war_pitch.txt"), newline="") as f:
    for r in csv.DictReader(f):
        if r["mlb_ID"] in ("", "NULL"):
            continue
        i = int(r["mlb_ID"])
        war[i] += num(r["WAR"])
        y = int(r["year_ID"])
        years[i].add(y)
        bbref[i] = r["player_ID"]
        ip_start[i] += num(r["IPouts_start"])
        ip_relief[i] += num(r["IPouts_relief"])
        if y >= FIRST_YEAR:
            teams[i][r["team_ID"]] += num(r["G"])

# --- Bio from MLB Stats API -------------------------------------------------
bio = {}
for path in sorted(glob.glob(os.path.join(RAW, "players_*.json"))):
    for p in json.load(open(path))["people"]:
        bio[p["id"]] = p  # later seasons overwrite earlier: freshest position

# --- Coordinates -------------------------------------------------------------
coords = {}
with open(os.path.join(RAW, "wikidata_birth.csv"), newline="") as f:
    for r in csv.DictReader(f):
        m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", r["coord"])
        if m and r["mlb"].isdigit():
            coords[int(r["mlb"])] = [round(float(m.group(2)), 4), round(float(m.group(1)), 4)]

geocache_path = os.path.join(RAW, "geocode_cache.json")
geocache = json.load(open(geocache_path)) if os.path.exists(geocache_path) else {}


def place_key(p):
    return "|".join([p.get("birthCity", ""), p.get("birthStateProvince", ""), p.get("birthCountry", "")])


# --- Merge -------------------------------------------------------------------
def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", "", s.replace("-", " "))
    return re.sub(r"\s+", " ", s).strip()


# Borrow coordinates from other players born in the same city (any era).
by_place = {}
for i, p in bio.items():
    if i in coords:
        by_place.setdefault(place_key(p), coords[i])
for k, v in by_place.items():
    geocache.setdefault(k, v)

out, missing_places = [], set()
for i, p in bio.items():
    ys = [y for y in years.get(i, ()) if y >= FIRST_YEAR]
    if not ys:
        continue  # on a roster list but never appeared in a game since 2000
    pos = p.get("primaryPosition", {}).get("abbreviation", "")
    if pos == "P":
        pos = "SP" if ip_start[i] >= ip_relief[i] else "RP"
    elif pos == "OF":
        pos = "CF"
    team = max(teams[i].items(), key=lambda kv: kv[1])[0] if teams[i] else ""
    c = coords.get(i) or geocache.get(place_key(p))
    if not c:
        missing_places.add(place_key(p))
    full = p["fullName"]
    out.append({
        "id": i,
        "name": full,
        "pos": pos,
        "war": round(war[i], 1),
        "from": min(years[i]),
        "to": max(years[i]),
        "team": team,
        "born": ", ".join(x for x in [p.get("birthCity"), p.get("birthStateProvince"), p.get("birthCountry")] if x),
        "country": p.get("birthCountry", ""),
        "ll": c,
        "keys": sorted({norm(full), norm(f"{p.get('useName', p.get('firstName',''))} {p.get('lastName','')}")}),
        "last": norm(p.get("lastName", "")),
    })

# Hall of Famers (inducted as players) who appeared in 2000 or later.
HOF = {
    "Cal Ripken Jr.", "Tony Gwynn", "Rickey Henderson", "Roberto Alomar", "Barry Larkin",
    "Greg Maddux", "Tom Glavine", "Frank Thomas", "Randy Johnson", "Pedro Martínez",
    "John Smoltz", "Craig Biggio", "Ken Griffey Jr.", "Mike Piazza", "Jeff Bagwell",
    "Tim Raines", "Iván Rodríguez", "Chipper Jones", "Jim Thome", "Vladimir Guerrero",
    "Trevor Hoffman", "Mariano Rivera", "Roy Halladay", "Edgar Martinez", "Mike Mussina",
    "Harold Baines", "Derek Jeter", "Larry Walker", "David Ortiz", "Scott Rolen",
    "Fred McGriff", "Adrián Beltré", "Todd Helton", "Joe Mauer", "Ichiro Suzuki",
    "CC Sabathia", "Billy Wagner", "Jeff Kent", "Carlos Beltrán", "Andruw Jones",
}
hof_keys = {norm(n) for n in HOF}
hof_name = lambda r: re.sub(r" sr$", "", norm(r["name"]))  # MLB lists "Tim Raines Sr."
for r in out:
    if hof_name(r) in hof_keys:
        r["hof"] = 1
found = {hof_name(r) for r in out if r.get("hof")}
if hof_keys - found:
    print("HOF names not matched:", sorted(hof_keys - found))

out.sort(key=lambda r: -r["war"])
json.dump(out, open(os.path.join(ROOT, "data", "players.json"), "w"), separators=(",", ":"))
json.dump(sorted(missing_places), open(os.path.join(RAW, "missing_places.json"), "w"), indent=0)
print(f"{len(out)} players, {sum(1 for r in out if r['ll'])} with coords, {len(missing_places)} places missing")
from collections import Counter
print(Counter(r["pos"] for r in out))
