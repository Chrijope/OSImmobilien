# Hauffstraße 38, UG: Die Kellerverschläge WE 35 bis 46 (Block oben rechts im
# Blatt) gibt es so nicht, im 3D-Modell standen dort leere Zellen mit Möbeln.
# Christian am 18.10.2026: „da ist eigentlich nichts, daher bitte löschen“.
# Entfernt im UG die Räume dieses Blocks und schneidet Wände, Öffnungen und
# Decke im Umriss der Zellen (plus Wandstärke) heraus.
# Aufruf: python3 hauff_keller_entfernen.py <hauff38.json>   (venv mit shapely)
import json, sys
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

pfad = sys.argv[1]
d = json.load(open(pfad))
etage = next(e for e in d["haus"]["etagen"] if e["geschoss"] == -1)
plan = etage["plan"]
BEREICH = box(74.4, 18.7, 87.2, 26.3)

def mitte(r):
    xs = [p["x"] for p in r["punkte"]]; ys = [p["y"] for p in r["punkte"]]
    return sum(xs) / len(xs), sum(ys) / len(ys)

weg = [r for r in plan["raeume"] if BEREICH.contains(Polygon([(p["x"], p["y"]) for p in r["punkte"]]).centroid)]
assert 10 <= len(weg) <= 14, f"unerwartet viele Räume: {len(weg)}"
schnitt = unary_union([Polygon([(p["x"], p["y"]) for p in r["punkte"]]).buffer(0.45) for r in weg]).convex_hull
plan["raeume"] = [r for r in plan["raeume"] if r not in weg]

def ringe(geom):
    teile = getattr(geom, "geoms", [geom])
    return [t for t in teile if t.geom_type == "Polygon" and t.area > 0.02]

f = plan["flaechen"]
neu = []
for w in f["waende"]:
    for t in ringe(Polygon(w[0], w[1:]).buffer(0).difference(schnitt)):
        neu.append([[[round(x, 3), round(y, 3)] for x, y in t.exterior.coords[:-1]]] +
                   [[[round(x, 3), round(y, 3)] for x, y in h.coords[:-1]] for h in t.interiors])
f["waende"] = neu
for art in ("tueren", "fenster"):
    f[art] = [o for o in f[art] if not Polygon(o).intersects(schnitt)]
if f.get("decke"):
    decke = []
    for ring in f["decke"]:
        for t in ringe(Polygon(ring).buffer(0).difference(schnitt)):
            decke.append([[round(x, 3), round(y, 3)] for x, y in t.exterior.coords[:-1]])
    f["decke"] = decke

json.dump(d, open(pfad, "w"), ensure_ascii=False, separators=(",", ":"))
print("entfernt:", ", ".join(r["name"] for r in weg))
