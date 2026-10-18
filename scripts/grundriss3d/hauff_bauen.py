# Hauffstraße 38: aus den fünf LOES-Blättern Etagenpläne und Einheitenpläne bauen.
# Aufruf: hauff_bauen.py <ordner mit plan2d.py> <ordner mit PDFs> <hauff38.json> [prüfliste.json]
# Danach hauff_keller_entfernen.py <hauff38.json> laufen lassen.
import sys, json, re
sys.path.insert(0, sys.argv[1])
import numpy as np, cv2, plan2d
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

ORDNER = sys.argv[2]
BLAETTER = {  # Blatt -> Geschoss für C/D/E und A/B; Haus F liegt eine Etage höher
    '01': ('LOES_HAUFF 01_GRUNDRISS KG, SOUTERRAIN, EG.pdf', -1),
    '02': ('LOES_HAUFF 02_GRUNDRISS EG, 1.OG.pdf', 0),
    '03': ('LOES_HAUFF 03_GRUNDRISS 1.OG, 2.OG.pdf', 1),
    '04': ('LOES_HAUFF 04_GRUNDRISS 2.OG, DG, DACHAUFSICHT.pdf', 2),
    '05': ('LOES_HAUFF 05_GRUNDRISS 3.OG, GALERIE, DACHAUFSICHT.pdf', 3),
}
F_BEREICH = box(12, 0, 46, 27.5)     # Haus F liegt auf allen Blättern oben links

def ringe(maske, eps=2.5, min_m2=0.05):
    """Polygone mit Löchern aus einer Maske (Meter)."""
    cs, hier = cv2.findContours(maske, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    if hier is None: return out
    for i, c in enumerate(cs):
        if hier[0][i][3] != -1: continue                 # nur äußere Ringe, Löcher hängen daran
        if cv2.contourArea(c)*plan2d.PX_M**2 < min_m2: continue
        aussen = cv2.approxPolyDP(c, eps, True)[:, 0, :]
        if len(aussen) < 3: continue
        poly = [[[round(float(x)*plan2d.PX_M, 3), round(float(y)*plan2d.PX_M, 3)] for x, y in aussen]]
        j = hier[0][i][2]
        while j != -1:
            if cv2.contourArea(cs[j])*plan2d.PX_M**2 > 0.05:
                loch = cv2.approxPolyDP(cs[j], eps, True)[:, 0, :]
                if len(loch) >= 3: poly.append([[round(float(x)*plan2d.PX_M, 3), round(float(y)*plan2d.PX_M, 3)] for x, y in loch])
            j = hier[0][j][0]
        out.append(poly)
    return out

# Raumname im Plan -> (Typ, Name im Modell). Reihenfolge zählt.
TYPEN = [(r'^MK\s*(\d+)', 'abstell', 'Keller MK {0}'), (r'^BAD|^WC', 'bad', 'Bad'),
         (r'^K[ÜU]CHE\s*/\s*(?:ZIMMER|WOHNEN)', 'wohnen', 'Wohnküche'), (r'^K[ÜU]CHE', 'kueche', 'Küche'),
         (r'^DIELE', 'flur', 'Diele'), (r'^FLUR', 'flur', 'Flur'), (r'^TERR?ASSE', 'balkon', 'Terrasse'),
         (r'^LOGGIA', 'balkon', 'Loggia'), (r'^BALKON', 'balkon', 'Balkon'), (r'^AR$|^ABST', 'abstell', 'Abstellraum'),
         (r'^TH$', 'treppenhaus', 'Treppenhaus'), (r'^AUFZUG', 'abstell', 'Aufzug'), (r'^HA-RAUM', 'abstell', 'Hausanschlussraum'),
         (r'^HEIZ', 'abstell', 'Heizzentrale'), (r'^GALERIE', 'flur', 'Galerie'), (r'^ZIMMER|^WOHN|^SCHLAF', 'zimmer', 'Zimmer')]

def raumtyp(raum):
    text = raum['name'].upper().replace(' / ', '/')
    for muster, typ, name in TYPEN:
        m = re.search(muster, text)
        if m:
            if typ == 'flur' and name == 'Flur' and raum['g']: name = 'Gemeinschaftsflur'
            return typ, name.format(*m.groups())
    return 'flur', 'Raum'

GESCHOSS = {-1: 'UG', 0: 'EG'}
etagen, einheiten = [], {}
for nr, (datei, basis) in BLAETTER.items():
    r = plan2d.auswerten(f'{ORDNER}/{datei}')
    linien, waende, fenster, tueren, innen = r.pop('_bilder')
    for haus_f in (False, True):
        bereich = np.zeros_like(waende)
        x0, y0, x1, y1 = [int(v/plan2d.PX_M) for v in F_BEREICH.bounds]
        if haus_f: bereich[y0:y1, x0:x1] = 255
        else: bereich[:] = 255; bereich[y0:y1, x0:x1] = 0
        geschoss = basis + (1 if haus_f else 0)
        w = cv2.bitwise_and(waende, bereich)
        if cv2.countNonZero(w)*plan2d.PX_M**2 < 3: continue
        raeume = []
        for x in r['raeume']:
            p = Polygon(x['punkte'])
            if not p.is_valid: p = p.buffer(0)
            if p.geom_type != 'Polygon': p = max(p.geoms, key=lambda g: g.area)
            if p.is_empty or p.area < 0.5: continue
            if F_BEREICH.contains(p.representative_point()) != haus_f: continue
            typ, name = raumtyp(x)
            we = x['we'] if not x['g'] and x['we'] and 1 <= x['we'] <= 46 else None
            raeume.append({'typ': typ, 'name': name, 'we': we, 'flaeche': round(p.area, 2), 'aus_cad': x['aus_cad'],
                           'punkte': [[round(a, 3), round(b, 3)] for a, b in p.exterior.coords[:-1]]})
        # Größtes Zimmer je Einheit ist Wohnen (außer es gibt eine Wohnküche), die übrigen Schlafen.
        for we in {x['we'] for x in raeume if x['we']}:
            zi = [x for x in raeume if x['we'] == we and x['typ'] == 'zimmer']
            hat_wohnen = any(x['we'] == we and x['typ'] == 'wohnen' for x in raeume)     # Wohnküche
            for i, x in enumerate(sorted(zi, key=lambda x: -x['flaeche'])):
                x['typ'] = 'wohnen' if i == 0 and not hat_wohnen else 'schlafen'
        # CAD-Raumflächen sind sicher frei: dort zugelaufene Wandmasse (z. B. Loggien zwischen Brüstung und Fassade) weg
        cad = [Polygon(x['punkte']).buffer(-0.02) for x in raeume if x['aus_cad']]
        if cad: w[plan2d._maske(unary_union(cad), w.shape) > 0] = 0
        f = cv2.bitwise_and(fenster, bereich); t = cv2.bitwise_and(tueren, bereich)
        fuss = cv2.morphologyEx(cv2.bitwise_or(w, cv2.bitwise_and(innen, bereich)), cv2.MORPH_CLOSE, plan2d.kreis(0.5))
        etage = {'blatt': nr, 'geschoss': geschoss, 'haus': 'F' if haus_f else 'A-E',
                 'waende': ringe(w), 'fenster': [p[0] for p in ringe(f, 2, 0.02)], 'tueren': [p[0] for p in ringe(t, 2, 0.02)],
                 'decke': [p[0] for p in ringe(fuss, 4, 5)], 'raeume': raeume}
        etagen.append(etage)
        # Einheiten: Räume der Einheit, Wände im Umkreis von 0,6 m
        for we in sorted({x['we'] for x in raeume if x['we']}):
            eigen = [x for x in raeume if x['we'] == we]
            gebiet = unary_union([Polygon(x['punkte']).buffer(0.6) for x in eigen])
            wp = []
            for poly in etage['waende']:
                g = Polygon(poly[0], poly[1:]).buffer(0).intersection(gebiet)
                for teil in (getattr(g, 'geoms', [g])):
                    if teil.geom_type == 'Polygon' and teil.area > 0.05:
                        wp.append([[[round(a, 3), round(b, 3)] for a, b in teil.exterior.coords[:-1]]] + [[[round(a, 3), round(b, 3)] for a, b in h.coords[:-1]] for h in teil.interiors])
            nahe = lambda polys: [p for p in polys if gebiet.intersects(Polygon(p))]
            einheiten.setdefault(we, []).append({'geschoss': geschoss, 'waende': wp, 'fenster': nahe(etage['fenster']), 'tueren': nahe(etage['tueren']), 'raeume': eigen})
    print(nr, 'fertig', file=sys.stderr)

# Ausgabe im Planformat des CRM (src/components/grundriss3d/plan.ts)
def titel(e):
    g = GESCHOSS.get(e['geschoss'], f"{e['geschoss']}. OG")
    return f"Haus 38 F, {g}" if e['haus'] == 'F' else f"Häuser 38 A bis E, {g}"

def raum_json(x, rid, mit_we):
    return {'id': rid, 'name': f"{x['name']} (WE {x['we']})" if mit_we and x['we'] else x['name'], 'typ': x['typ'],
            'punkte': [{'x': a, 'y': b} for a, b in x['punkte']]}

leer = lambda g: {'version': 1, 'nordWinkel': 0, 'geschoss': g, 'waende': [], 'oeffnungen': []}
haus = {'version': 1, 'geschosse': 5, 'etagen': [
    {'geschoss': e['geschoss'], 'titel': titel(e), 'plan': {**leer(e['geschoss']),
        'raeume': [raum_json(x, f'r{i}', True) for i, x in enumerate(e['raeume'])],
        'flaechen': {'waende': e['waende'], 'fenster': e['fenster'], 'tueren': e['tueren'], 'decke': e['decke']}}}
    for e in etagen],
    'quelle': 'Werkpläne Studio LOES (Blätter 01 bis 05, 1:100), automatisch aus den Vektordaten gelesen'}
liste = []
for we in sorted(einheiten):
    # Eine Einheit liegt im Modell auf einem Geschoss: dem mit der größten Fläche.
    t = max(einheiten[we], key=lambda t: sum(x['flaeche'] for x in t['raeume']))
    liste.append({'we': we, 'plan': {**leer(t['geschoss']), 'raeume': [raum_json(x, f'r{i}', False) for i, x in enumerate(t['raeume'])],
                                     'flaechen': {'waende': t['waende'], 'fenster': t['fenster'], 'tueren': t['tueren']}}})
json.dump({'haus': haus, 'einheiten': liste}, open(sys.argv[3], 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(etagen), 'Etagen', len(liste), 'Einheiten')
# Optional: Prüfliste aller Räume mit Fläche und Herkunft (CAD-Raumfläche oder Teilung)
if len(sys.argv) > 4: json.dump([{'geschoss': e['geschoss'], 'haus': e['haus'], **{k: x[k] for k in ('we', 'name', 'typ', 'flaeche', 'aus_cad')}}
           for e in etagen for x in e['raeume']], open(sys.argv[4], 'w'), ensure_ascii=False, indent=0)
