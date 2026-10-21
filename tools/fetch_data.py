#!/usr/bin/env python3
"""Fetch Gen 1 (Kanto) Pokédex data and FireRed/LeafGreen sprites into assets.

Produces:
  data/pokedex.json         - 151 species: name, types, stats, evolution, rarity
  src/js/pokedex-data.js    - same data as a JS global for the renderer
  assets/sprites/<id>.png   - front sprite (FireRed/LeafGreen, 64x64 GBA art)
  assets/sprites/egg.png
"""
import json
import os
import struct
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(ROOT, "..", "data"))
SPRITE_DIR = os.path.abspath(os.path.join(ROOT, "..", "assets", "sprites"))

API = "https://pokeapi.co/api/v2"
SPRITE_BASE = ("https://raw.githubusercontent.com/PokeAPI/sprites/master/"
               "sprites/pokemon/versions/generation-iii/firered-leafgreen")
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


def read_png_header(path):
    """Return (width, height, bit_depth, color_type, palette_len) for a PNG."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    i = 8
    width = height = bit_depth = color_type = None
    palette_len = 0
    while i < len(data):
        length = struct.unpack(">I", data[i:i + 4])[0]
        chunk = data[i + 4:i + 8]
        if chunk == b"IHDR":
            width, height, bit_depth, color_type, _, _, _ = struct.unpack(
                ">IIBBBBB", data[i + 8:i + 8 + length])
        elif chunk == b"PLTE":
            palette_len = length // 3
        elif chunk == b"IEND":
            break
        i += 12 + length
    return width, height, bit_depth, color_type, palette_len


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

    print("Downloading FireRed/LeafGreen sprites...")
    missing = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(
            lambda i: (i, download_sprite(f"{SPRITE_BASE}/{i}.png",
                                          os.path.join(SPRITE_DIR, f"{i}.png"))),
            ids))
        download_sprite(EGG_URL, os.path.join(SPRITE_DIR, "egg.png"))

    for i, ok in results:
        if not ok:
            missing.append(i)
    if missing:
        raise SystemExit(f"FAILED: {len(missing)} sprites missing: {missing}")

    print("Verifying sprites...")
    bad = []
    for i in ids:
        path = os.path.join(SPRITE_DIR, f"{i}.png")
        w, h, _, _, _ = read_png_header(path)
        if (w, h) != (64, 64):
            bad.append((i, w, h))
    if bad:
        raise SystemExit(f"FAILED: unexpected sprite sizes: {bad[:10]}")
    print(f"  {len(ids)} sprites OK (64x64)")
    print("  done")


if __name__ == "__main__":
    main()
