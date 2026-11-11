"""Geocode birthplaces Wikidata missed using OpenStreetMap Nominatim (1 req/sec).
Reads data/raw/missing_places.json, appends to data/raw/geocode_cache.json."""
import json, os, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
cache_path = os.path.join(RAW, "geocode_cache.json")
cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
missing = json.load(open(os.path.join(RAW, "missing_places.json")))

COUNTRY = {"USA": "United States", "VEN": "Venezuela", "Republic of Korea": "South Korea"}

for n, key in enumerate(missing):
    if key in cache:
        continue
    city, state, country = key.split("|")
    country = COUNTRY.get(country, country)
    q = ", ".join(x for x in [city, state, country] if x)
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": q, "format": "json", "limit": 1})
    req = urllib.request.Request(url, headers={"User-Agent": "baseball-quiz-dev/0.1"})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=30))
        if not res and state:  # retry without state/province
            time.sleep(1.1)
            url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": f"{city}, {country}", "format": "json", "limit": 1})
            res = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "baseball-quiz-dev/0.1"}), timeout=30))
        cache[key] = [round(float(res[0]["lat"]), 4), round(float(res[0]["lon"]), 4)] if res else None
    except Exception as e:
        print("error", key, e)
    if n % 25 == 0:
        json.dump(cache, open(cache_path, "w"))
        print(n, len(missing), flush=True)
    time.sleep(1.1)

json.dump(cache, open(cache_path, "w"))
print("done;", sum(1 for k in missing if not cache.get(k)), "still missing")
