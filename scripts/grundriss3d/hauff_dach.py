# Hauffstraße 38: Dächer der Häuser A/B, C–E und F als ebene 3D-Flächen.
# Aufruf: hauff_dach.py <LOES_HAUFF 06_DACHAUFSICHT.pdf> <hauff38.json> <ausgabe.json> [kontrollbild.png]
#
# Lage: Eckpunkte grob vorgegeben und auf den nächsten Linienendpunkt der
# Dachaufsicht (Blatt 06, schwarze 0,37-pt-Linien) gefangen. Blatt 06 hat
# dasselbe Raster wie die Grundrisse 01–05, also gelten dieselben Blattmeter
# (pt × 0,0352778) wie in hauff38.json.
# Höhen: in Metern über Fertigfußboden des obersten Vollgeschosses, gemessen
# in den Vektoren der Schnitte und Ansichten (1:100, keine Koten im Plan):
#   C–E (3.OG):  Schnitt B-B und C-C (Blatt 09)
#   A/B (DG):    Schnitt A-A und Ansicht Süden (Blatt 07)
#   F   (2.OG):  Schnitt D-D (Blatt 10, Schnitt liegt auf der Diagonalen)
# Farben: Pixelmedian auf besonnten Dachflächen im Luftbild (Exposé, Seite 4).
import sys, json
import numpy as np, pymupdf, cv2
from shapely.geometry import Polygon, LineString, Point, MultiPoint
from shapely.ops import unary_union

PT_M = 0.0352778
PDF, HAUS_JSON, AUS = sys.argv[1:4]
BILD = sys.argv[4] if len(sys.argv) > 4 else None

# --- Linien der Dachaufsicht -------------------------------------------------
seite = pymupdf.open(PDF)[0]
linien, enden, alle = [], [], []
for d in seite.get_drawings():
    c, w = d.get('color'), d.get('width') or 0
    if d['type'] != 's' or not c or max(c) > 0.1 or abs(w - 0.37) > 0.02: continue
    for it in d['items']:
        if it[0] == 'l':
            a, b = (it[1].x*PT_M, it[1].y*PT_M), (it[2].x*PT_M, it[2].y*PT_M)
            linien.append((a, b)); enden += [a, b]; alle += [a, b]
        elif it[0] == 'c':      # Bögen (runde Treppentürme): Bézier abtasten
            q = [np.array([v.x, v.y])*PT_M for v in it[1:5]]
            alle += [tuple((1-t)**3*q[0] + 3*(1-t)**2*t*q[1] + 3*(1-t)*t*t*q[2] + t**3*q[3]) for t in np.linspace(0, 1, 9)]
enden, alle = np.array(enden), np.array(alle)

def fang(x, y, tol=0.15):
    """Nächster Linienendpunkt; Abbruch, wenn der Plan dort keinen hat."""
    i = np.argmin(np.hypot(enden[:, 0]-x, enden[:, 1]-y))
    if np.hypot(enden[i, 0]-x, enden[i, 1]-y) > tol:
        raise SystemExit(f'Kein Planpunkt bei ({x}, {y})')
    return np.array(enden[i])

# --- Geometrie-Hilfen -------------------------------------------------------
def kreuz(u, v): return u[0]*v[1] - u[1]*v[0]

def schnitt(p1, p2, q1, q2):
    """Schnittpunkt zweier Geraden (2D)."""
    d1, d2 = p2-p1, q2-q1
    t = kreuz(q1-p1, d2) / kreuz(d1, d2)
    return p1 + t*d1

def abstand(p, a, b):
    """Abstand Punkt–Gerade (2D)."""
    return abs(kreuz(b-a, p-a)) / np.linalg.norm(b-a)

def parallele(a, b, d, richtung):
    """Gerade a–b um d in Richtung des Punkts `richtung` verschoben."""
    n = np.array([-(b-a)[1], (b-a)[0]]) / np.linalg.norm(b-a)
    if np.dot(richtung-a, n) < 0: n = -n
    return a + d*n, b + d*n

def ebene(*p3):
    """Ebene h = ax + by + c durch drei 3D-Punkte."""
    A = np.array([[p[0], p[1], 1] for p in p3]); h = np.array([p[2] for p in p3])
    return np.linalg.solve(A, h)

def ebene_traufe(a, b, h_traufe, p, h_p):
    """Ebene durch die waagerechte Kante a–b auf h_traufe und den Punkt p auf h_p."""
    return ebene((*a, h_traufe), (*b, h_traufe), (*p, h_p))

flaechen = []   # (gruppe, geschoss, punkte2d, ebene | feste Höhen, material, farbe)
def dach(gruppe, geschoss, punkte, eb, material, farbe=None):
    flaechen.append(dict(gruppe=gruppe, geschoss=geschoss, punkte=[np.array(p) for p in punkte],
                         h=[float(eb @ [p[0], p[1], 1]) for p in punkte], material=material, farbe=farbe))
def senkrecht(gruppe, geschoss, punkte3d, material, farbe=None):
    flaechen.append(dict(gruppe=gruppe, geschoss=geschoss, punkte=[np.array(p[:2]) for p in punkte3d],
                         h=[p[2] for p in punkte3d], material=material, farbe=farbe))

# --- Häuser C–E (3.OG = Geschoss 3) ------------------------------------------
# Schnitt B-B (FFB y 20,68) und C-C (FFB 20,83): Traufe 2,94/2,97, First 4,00/4,01,
# Kehle über dem Flur 3,27/3,29, Nordkante 3,52/3,54 (außen), Neigung ~10°.
H_TRAUFE, H_FIRST, H_KEHLE, H_NORD = 2.95, 4.00, 3.28, 3.50
CE, CE_FARBE = 'C-E', '#96979f'
N1, N2, SPITZE = fang(52.91, 25.63), fang(79.80, 25.67), fang(84.58, 31.40)
S2, S1 = fang(80.44, 37.37), fang(55.21, 37.27)
ES, EW, EN = fang(25.13, 48.16), fang(18.31, 44.27), fang(20.85, 37.06)
FD_W, FD_O = fang(54.03, 31.30), fang(75.27, 31.37)    # First D/C
FE_O, FE_W = fang(54.10, 31.65), fang(27.33, 41.00)    # First E

# Kehle parallel zur Nordtraufe, dort, wo die Hauptfläche auf H_KEHLE liegt.
anteil = (H_KEHLE - H_TRAUFE) / (H_FIRST - H_TRAUFE)
kd = parallele(N1, N2, anteil*abstand(FD_O, N1, N2), FD_O)
ke = parallele(EN, N1, anteil*abstand(FE_W, EN, N1), FE_W)
K_J = schnitt(*kd, *ke)                 # Kehlen D und E treffen sich auf der Kehllinie
K_O = schnitt(*kd, FD_O, N2)            # Kehle trifft Grat Ost
K_W = schnitt(*ke, FE_W, EN)            # Kehle trifft Grat West

e_dn = ebene_traufe(N1, N2, H_TRAUFE, FD_O, H_FIRST)
e_ds = ebene_traufe(S1, S2, H_TRAUFE, FD_O, H_FIRST)
e_en = ebene_traufe(EN, N1, H_TRAUFE, FE_W, H_FIRST)
e_es = ebene_traufe(ES, S1, H_TRAUFE, FE_W, H_FIRST)
dach(CE, 3, [K_J, K_O, FD_O, FD_W], e_dn, 'ziegel', CE_FARBE)
dach(CE, 3, [FD_W, FD_O, S2, S1, FE_O], e_ds, 'ziegel', CE_FARBE)
dach(CE, 3, [N2, SPITZE, FD_O], ebene_traufe(N2, SPITZE, H_TRAUFE, FD_O, H_FIRST), 'ziegel', CE_FARBE)
dach(CE, 3, [SPITZE, S2, FD_O], ebene_traufe(SPITZE, S2, H_TRAUFE, FD_O, H_FIRST), 'ziegel', CE_FARBE)
dach(CE, 3, [K_W, K_J, FD_W, FE_O, FE_W], e_en, 'ziegel', CE_FARBE)
dach(CE, 3, [FE_O, S1, ES, FE_W], e_es, 'ziegel', CE_FARBE)
dach(CE, 3, [EN, EW, FE_W], ebene_traufe(EN, EW, H_TRAUFE, FE_W, H_FIRST), 'ziegel', CE_FARBE)
dach(CE, 3, [EW, ES, FE_W], ebene_traufe(EW, ES, H_TRAUFE, FE_W, H_FIRST), 'ziegel', CE_FARBE)
# Gegenläufiger Streifen über dem Flur (Kehle -> Nordkante); in der Dachaufsicht
# nicht gezeichnet, in beiden Schnitten aber gleich.
dach(CE, 3, [K_J, N1, N2, K_O], ebene_traufe(N1, N2, H_NORD, K_J, H_KEHLE), 'ziegel', CE_FARBE)
dach(CE, 3, [K_W, EN, N1, K_J], ebene_traufe(EN, N1, H_NORD, K_J, H_KEHLE), 'ziegel', CE_FARBE)

# Gläserne Dächer der drei Treppentürme an der Nordseite: Umriss aus der
# Dachaufsicht, Neigung aus Schnitt B-B (2,60 m an der Traufe, +1,2 m auf 3,7 m).
def turmumriss(x0, y0, x1, y1, a, b):
    """Konvexe Hülle aller Planlinien im Turmbereich nördlich der Traufe a–b (Türme sind konvex)."""
    n = parallele(a, b, 1.0, np.array([(x0+x1)/2, y0]))[0] - a
    sel = [p for p in alle if x0 <= p[0] <= x1 and y0 <= p[1] <= y1 and np.dot(p-a, n) > 0.02]
    sel += [p - np.dot(p-a, n)*n for p in sel]          # auf die Traufe gelotet: Turm schließt dort an
    hull = MultiPoint(sel).convex_hull.simplify(0.05)
    return [np.array(p) for p in hull.exterior.coords[:-1]]
for box, (a, b) in [((49.9, 20.9, 56.6, 25.7), (N1, N2)), ((71.9, 21.2, 77.7, 25.7), (N1, N2)), ((32.6, 26.8, 39.5, 32.2), (EN, N1))]:
    umriss = turmumriss(*box, a, b)
    mitte = np.mean(umriss, axis=0)
    n = parallele(a, b, 1.0, mitte)[0] - a      # Einheitsnormale zum Turm hin
    e = np.array([n[0]*1.2/3.7, n[1]*1.2/3.7, 2.60 - (n[0]*a[0]+n[1]*a[1])*1.2/3.7])
    dach('Turm', 3, umriss, e, 'glas')

# --- Haus F (2.OG = Geschoss 2) ----------------------------------------------
# Schnitt D-D (FFB 2.OG y 31,31) entlang der Diagonalen NW-Ecke -> Treppenauge:
# Ecke 3,16, Knick 3,66, Oberlichtspitze 4,59, Oberlicht oben 5,32.
# Das Haus ist zur Diagonalen symmetrisch; Luftbild: Walmdach, Traufen waagerecht
# an West- und Nordseite. Erker und Hauptfläche liegen deshalb in einer Ebene
# (Traufe 3,16, durch den Knick 3,66, ~6°). Der steile Teil in D-D ab dem
# Oberlicht ist dessen Aufbau, nicht die Dachfläche.
F, F_FARBE, F_BLECH = 'F', '#7d7b7d', '#d3d8e0'
F_NW, F_W1, F_N1 = fang(23.43, 8.99), fang(22.44, 13.54), fang(28.02, 9.84)
KNICK, OL1, OL2, OL3, OL4 = fang(27.35, 14.62), fang(29.45, 17.65), fang(29.56, 19.65), fang(31.28, 18.45), fang(30.42, 19.05)
INNEN = fang(31.16, 20.11)
W3, S3a, S3b, S3c = fang(22.63, 13.59), fang(20.29, 24.32), fang(25.23, 25.21), fang(26.39, 26.13)
O4a, O4b, O4c = fang(38.90, 11.38), fang(38.01, 16.33), fang(38.47, 17.74)
H_FE, H_KN, H_OL, H_OLO = 3.16, 3.66, 4.59, 5.32
# Erker an der NW-Ecke: Blech-Walm (hell im Luftbild).
dach(F, 2, [F_NW, F_W1, KNICK], ebene_traufe(F_NW, F_W1, H_FE, KNICK, H_KN), 'blech', F_BLECH)
dach(F, 2, [F_NW, KNICK, F_N1], ebene_traufe(F_NW, F_N1, H_FE, KNICK, H_KN), 'blech', F_BLECH)
# Hauptflächen fallen zur West- bzw. Nordtraufe; Grat ist die Diagonale.
e3 = ebene_traufe(W3, S3a, H_FE, KNICK, H_KN)
e4 = ebene_traufe(F_N1, O4a, H_FE, KNICK, H_KN)
dach(F, 2, [W3, KNICK, OL1, OL2, OL4, INNEN, S3c, S3b, S3a], e3, 'ziegel', F_FARBE)
dach(F, 2, [F_N1, O4a, O4b, O4c, INNEN, OL4, OL3, OL1, KNICK], e4, 'ziegel', F_FARBE)
dach('F-Oberlicht', 2, [OL1, OL2, OL4, OL3], ebene_traufe(OL2, OL3, H_OLO, OL1, H_OL), 'glas')

# --- Häuser A/B (DG = Geschoss 2) --------------------------------------------
# Ansicht Süden: Giebel 12,51 m breit, 45°, Traufe y 13,14, First 6,79;
# Schnitt A-A: DG-FFB y 31,66, First außen 25,11 -> First 6,55, Traufe 0,20.
AB, AB_FARBE = 'A/B', '#777474'
T_NW, T_NO = fang(87.08, 20.48), fang(96.46, 22.00)      # Traufe Nord (außen)
T_SW, T_SO = fang(85.07, 32.82), fang(94.44, 34.36)      # Traufe Süd (außen)
G_W = (fang(85.10, 32.64), fang(87.08, 20.48))           # Ortgang West
G_O = (fang(94.44, 34.36), fang(96.46, 22.00))           # Ortgang Ost
F_W = schnitt(fang(86.62, 26.74), fang(89.39, 27.19), *G_W)
F_O = schnitt(fang(91.46, 27.53), fang(94.91, 28.10), *G_O)
# Glasstreifen (Oberlichter der Galerie) zwischen zwei Linien quer zum First.
gl = [(fang(90.35, 21.22), fang(88.41, 33.17)), (fang(92.43, 21.55), fang(90.49, 33.51))]
H_AT, H_AF = 0.20, 6.55
for traufe in [(T_NW, T_NO), (T_SW, T_SO)]:
    e = ebene_traufe(*traufe, H_AT, F_W, H_AF)
    tw = [schnitt(*traufe, *g) for g in gl]
    fw = [schnitt(F_W, F_O, *g) for g in gl]
    dach(AB, 2, [traufe[0], tw[0], fw[0], F_W], e, 'ziegel', AB_FARBE)
    dach(AB, 2, [tw[0], tw[1], fw[1], fw[0]], e, 'glas')
    dach(AB, 2, [tw[1], traufe[1], F_O, fw[1]], e, 'ziegel', AB_FARBE)

# --- Senkrechte Flächen -------------------------------------------------------
# Außenkante (ohne Nachbarfläche) über der Traufhöhe ihres Hauses: senkrechte
# Fassadenfläche bis auf die Traufhöhe (Giebel, Ortgänge, Stirn des Flurstreifens).
# Gemeinsame Kante mit Höhensprung (Erker, Oberlicht, Zwickel am Grat):
# senkrechte Blechaufkantung zwischen beiden Flächen.
def kanten(f):
    n = len(f['punkte'])
    return [(f['punkte'][i], f['punkte'][(i+1) % n], f['h'][i], f['h'][(i+1) % n]) for i in range(n)]
def gleich(p, q): return np.hypot(*(p-q)) < 0.02
def hoehe_auf(kante, p):
    """Höhe einer Kante (a, b, ha, hb) am Punkt p, None wenn p nicht darauf liegt."""
    a, b, ha, hb = kante
    if LineString([a, b]).distance(Point(p)) > 0.02: return None
    t = np.clip(np.dot(p-a, b-a) / np.dot(b-a, b-a), 0, 1)
    return ha + t*(hb-ha)
def senkrechte(a, b, ha, hb, ua, ub):
    """Senkrechte Fläche zwischen Unterkante (ua, ub) und Oberkante (ha, hb); entartete Ecken fallen weg."""
    pts = [(*a, ua), (*b, ub), (*b, hb), (*a, ha)]
    return [p for k, p in enumerate(pts) if not (k == 0 and abs(ua-ha) < 0.01 or k == 1 and abs(ub-hb) < 0.01)]
basis = {}
for f in flaechen: basis[f['gruppe']] = min(basis.get(f['gruppe'], 99), min(f['h']))
neu, gesehen = [], set()
for f in list(flaechen):
    for a, b, ha, hb in kanten(f):
        nachbar = None
        for g in flaechen:
            if g is f or g['gruppe'].split('-O')[0] != f['gruppe'].split('-O')[0]: continue
            for k in kanten(g):
                if LineString([k[0], k[1]]).buffer(0.02).intersection(LineString([a, b])).length > 0.5*np.hypot(*(b-a)):
                    nachbar = k; break
            if nachbar: break
        if nachbar is None:
            h0 = basis[f['gruppe']]
            if max(ha, hb) - h0 >= 0.05: neu.append((f, senkrechte(a, b, ha, hb, h0, h0), 'fassade'))
            continue
        ua, ub = hoehe_auf(nachbar, a), hoehe_auf(nachbar, b)
        if ua is None or ub is None: continue          # nur Teilüberlappung: Nachbar prüft selbst
        if max(ha-ua, hb-ub) < 0.05: continue           # gleiche Höhe oder Nachbar höher
        neu.append((f, senkrechte(a, b, ha, hb, min(ua, ha), min(ub, hb)), 'blech'))
for f, pts, mat in neu:
    if len(pts) >= 3: senkrecht(f['gruppe'], f['geschoss'], pts, mat)

# --- Prüfungen ---------------------------------------------------------------
def planabweichung(pts3):
    P = np.array(pts3); c = P.mean(0)
    n = np.linalg.svd(P - c)[2][-1]
    return float(np.max(np.abs((P - c) @ n)))
max_plan = max(planabweichung([(*p, h) for p, h in zip(f['punkte'], f['h'])]) for f in flaechen)
assert max_plan < 0.02, f'Fläche nicht eben: {max_plan:.3f} m'
# Gemeinsame Ecken benachbarter Dachflächen: Höhensprünge melden.
spruenge = []
dachfl = [f for f in flaechen if f['material'] != 'fassade']
for f in dachfl:
    for g in dachfl:
        if f is g or f['gruppe'] != g['gruppe']: continue
        for p, hp in zip(f['punkte'], f['h']):
            for q, hq in zip(g['punkte'], g['h']):
                if gleich(p, q) and abs(hp-hq) > 0.01: spruenge.append((round(abs(hp-hq), 3), tuple(np.round(p, 2))))

# Lage gegen die Decken der obersten Geschosse aus hauff38.json.
haus = json.load(open(HAUS_JSON))['haus']
def decke(geschoss, titel):
    for e in haus['etagen']:
        if e['geschoss'] == geschoss and titel in e['titel']:
            return [Polygon(p) for p in e['plan']['flaechen']['decke']]
    return []
decken = {'C-E': [p for p in decke(3, 'A bis E') if p.area > 300], 'A/B': [p for p in decke(2, 'A bis E') if p.bounds[0] > 84],
          'F': decke(2, 'Haus 38 F')}
bericht = {}
for gr, dps in decken.items():
    fp = unary_union([Polygon(f['punkte']).buffer(0.01) for f in dachfl if f['gruppe'] == gr or (gr, f['gruppe']) == ('C-E', 'Turm')])
    d = unary_union(dps)
    # Traufkanten (waagerecht, auf Traufhöhe, am Dachrand) abtasten und den Abstand
    # zum Deckenumriss messen. Gleichmäßiger Abstand je Kante = gleiche Lage,
    # der Wert selbst ist der Dachüberstand.
    kantenwerte = []
    for f in dachfl:
        if f['gruppe'] != gr: continue
        for a, b, ha, hb in kanten(f):
            if abs(ha-hb) > 0.01 or abs(ha - basis[gr]) > 0.01: continue
            L = LineString([a, b])
            if fp.exterior.distance(L.interpolate(0.5, normalized=True)) > 0.05: continue
            dd = [d.boundary.distance(L.interpolate(t, normalized=True)) for t in np.linspace(0.1, 0.9, 9)]
            kantenwerte.append((round(L.length, 1), round(float(np.median(dd)), 2), round(max(dd)-min(dd), 2)))
    bericht[gr] = dict(decke_m2=round(d.area, 1), decke_ausserhalb_dach_m2=round(d.difference(fp).area, 2),
                       traufkanten_laenge_abstand_spanne=kantenwerte)

# --- Ausgabe -----------------------------------------------------------------
aus = {'quelle': 'Studio LOES, Blatt 06 Dachaufsicht (Lage), Schnitte A-A, B-B, C-C, D-D und Ansichten (Höhen), Luftbild Exposé (Farben); '
                 'Höhen über FFB des obersten Vollgeschosses; erzeugt mit scripts/grundriss3d/hauff_dach.py',
       'flaechen': []}
for f in flaechen:
    pts = [[round(float(p[0]), 3), round(float(p[1]), 3), round(float(h), 3)] for p, h in zip(f['punkte'], f['h'])]
    eintrag = {'geschoss': f['geschoss'], 'punkte': pts, 'material': f['material']}
    if f['farbe']: eintrag['farbe'] = f['farbe']
    aus['flaechen'].append(eintrag)
json.dump(aus, open(AUS, 'w'), ensure_ascii=False, indent=1)

zaehl = {}
for f in flaechen: zaehl[(f['gruppe'], f['material'])] = zaehl.get((f['gruppe'], f['material']), 0) + 1
print('Flächen:', len(flaechen), {f'{g} {m}': n for (g, m), n in sorted(zaehl.items())})
print('max. Planabweichung:', round(max_plan, 4), 'm')
print('Höhensprünge an gemeinsamen Ecken:', sorted(set(spruenge), reverse=True)[:12])
print('Lage gegen Decken:', json.dumps(bericht, ensure_ascii=False))
print('F: Traufe West', round(float(e3 @ [*S3a, 1]), 2), round(float(e3 @ [*W3, 1]), 2), 'Traufe Nord', round(float(e4 @ [*F_N1, 1]), 2), round(float(e4 @ [*O4a, 1]), 2),
      'Neigung', [round(float(np.degrees(np.arctan(np.hypot(e[0], e[1])))), 1) for e in (e3, e4)])
print('C-E: Neigung', round(float(np.degrees(np.arctan(np.hypot(*e_ds[:2])))), 1), 'Kehle', np.round(K_J, 2), np.round(K_O, 2), np.round(K_W, 2))

if BILD:   # Draufsicht: Decken blau, Dachflächen rot, Fassadenkanten grün
    K, x0, y0 = 20, 15, 5
    img = np.full((50*K, 90*K, 3), 255, np.uint8)
    P = lambda pts: np.array([[(p[0]-x0)*K, (p[1]-y0)*K] for p in pts], np.int32)
    for dps in decken.values():
        for p in dps: cv2.fillPoly(img, [P(p.exterior.coords)], (245, 215, 190))
    for f in flaechen:
        farbe = (0, 160, 0) if f['material'] == 'fassade' else (200, 120, 0) if f['material'] == 'glas' else (0, 0, 220)
        cv2.polylines(img, [P(f['punkte'])], True, farbe, 1)
        if f['material'] != 'fassade':
            m = np.mean(f['punkte'], 0)
            cv2.putText(img, f"{max(f['h']):.2f}", tuple(P([m])[0]), 0, 0.35, (0, 0, 0), 1)
    cv2.imwrite(BILD, img)
