#!/usr/bin/env python3
"""Fetch Gen 1 (Kanto) Pokédex data and pixel-art sprites into local assets.

Produces:
  tools/data/pokedex.json   - 151 species: name, types, stats, evolution chain, rarity
  assets/sprites/<id>.png   - front sprite (Gen 1 Red/Blue pixel art)
  assets/sprites/back/<id>.png
  assets/sprites/egg.png
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(ROOT, "..", "data"))
SPRITE_DIR = os.path.abspath(os.path.join(ROOT, "..", "assets", "sprites"))
BACK_DIR = os.path.join(SPRITE_DIR, "back")

API = "https://pokeapi.co/api/v2"
SPRITE_BASE = ("https://raw.githubusercontent.com/PokeAPI/sprites/master/"
               "sprites/pokemon/versions/generation-i/red-blue")
EGG_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/egg.png"

HEADERS = {"User-Agent": "pokepomo-offline-fetch/1.0"}


def get_json(url):
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=30) as r:
        return json.load(r)


def get_bytes(url):
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=30) as r:
        return r.read()


def download_sprite(url, dest):
    try:
        blob = get_bytes(url)
        with open(dest, "wb") as f:
            f.write(blob)
        return True
    except HTTPError as e:
        print(f"  ! sprite {url} -> {e.code}", file=sys.stderr)
        return False


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(SPRITE_DIR, exist_ok=True)
    os.makedirs(BACK_DIR, exist_ok=True)

    print("Fetching Gen 1 species list...")
    gen = get_json(f"{API}/generation/1")
    ids = sorted(int(p["url"].rstrip("/").split("/")[-1]) for p in gen["pokemon_species"])
    print(f"  {len(ids)} species")

    print("Fetching species + pokemon details...")
    with ThreadPoolExecutor(max_workers=12) as pool:
        species_list = list(pool.map(lambda i: get_json(f"{API}/pokemon-species/{i}"), ids))
        pokemon_list = list(pool.map(lambda i: get_json(f"{API}/pokemon/{i}"), ids))

    species_by_id = {s["id"]: s for s in species_list}
    pokemon_by_id = {p["id"]: p for p in pokemon_list}

    chain_urls = sorted({s["evolution_chain"]["url"] for s in species_list})
    print(f"Fetching {len(chain_urls)} evolution chains...")
    with ThreadPoolExecutor(max_workers=12) as pool:
        chains = list(pool.map(get_json, chain_urls))

    evo_by_id = {}
    for chain in chains:
        node = chain["chain"]
        stack = [node]
        while stack:
            cur = stack.pop()
            cid = int(cur["species"]["url"].rstrip("/").split("/")[-1])
            bucket = evo_by_id.setdefault(cid, {"from": None, "to": []})
            evolves_to = []
            for nxt in cur["evolves_to"]:
                nid = int(nxt["species"]["url"].rstrip("/").split("/")[-1])
                det = (nxt["evolution_details"] or [{}])[0]
                evolves_to.append({
                    "to": nid,
                    "trigger": det.get("trigger", {}).get("name"),
                    "min_level": det.get("min_level"),
                    "item": (det.get("item") or {}).get("name"),
                })
                stack.append(nxt)
            bucket["to"] = evolves_to
            for e in evolves_to:
                child = evo_by_id.setdefault(e["to"], {"from": None, "to": []})
                child["from"] = cid

    def genus_of(s):
        for g in s.get("genera", []):
            if g["language"]["name"] == "en":
                return g["genus"]
        return ""

    pokedex = []
    id_set = set(ids)
    for i in ids:
        s = species_by_id[i]
        p = pokemon_by_id[i]
        stats = {st["stat"]["name"]: st["base_stat"] for st in p["stats"]}
        evo = evo_by_id.get(i, {"from": None, "to": []})
        from_id = evo["from"]
        is_base = from_id is None or from_id not in id_set
        evolves = [e for e in evo["to"] if e["to"] in id_set]
        legendary = s.get("is_legendary", False) or s.get("is_mythical", False)
        pokedex.append({
            "id": i,
            "name": s["name"],
            "types": [t["type"]["name"] for t in p["types"]],
            "stats": {
                "hp": stats.get("hp"),
                "attack": stats.get("attack"),
                "defense": stats.get("defense"),
                "sp_attack": stats.get("special-attack"),
                "sp_defense": stats.get("special-defense"),
                "speed": stats.get("speed"),
            },
            "base_experience": p.get("base_experience") or 64,
            "capture_rate": s.get("capture_rate") or 45,
            "is_legendary": s.get("is_legendary", False),
            "is_mythical": s.get("is_mythical", False),
            "genus": genus_of(s),
            "evolution": evo,
            "evolves_to": [e["to"] for e in evolves],
            "evolves_at": next((e["min_level"] for e in evolves if e.get("min_level")), None),
            "is_base": is_base,
            "egg_pool": is_base and not legendary,
        })

    with open(os.path.join(DATA_DIR, "pokedex.json"), "w") as f:
        json.dump(pokedex, f, indent=1)
    print(f"  wrote pokedex.json ({len(pokedex)} entries)")

    js_dir = os.path.abspath(os.path.join(ROOT, "..", "src", "js"))
    os.makedirs(js_dir, exist_ok=True)
    with open(os.path.join(js_dir, "pokedex-data.js"), "w") as f:
        f.write("// GENERATED FILE - do not edit by hand.\n")
        f.write("// Regenerate with: python3 tools/fetch_data.py\n")
        f.write("window.__POKEDEX__ = ")
        json.dump(pokedex, f, separators=(",", ":"))
        f.write(";\n")
    print("  wrote src/js/pokedex-data.js")

    print("Downloading sprites...")
    with ThreadPoolExecutor(max_workers=12) as pool:
        pool.map(lambda i: download_sprite(f"{SPRITE_BASE}/{i}.png",
                                           os.path.join(SPRITE_DIR, f"{i}.png")), ids)
        download_sprite(EGG_URL, os.path.join(SPRITE_DIR, "egg.png"))
    print("  done")


if __name__ == "__main__":
    main()
