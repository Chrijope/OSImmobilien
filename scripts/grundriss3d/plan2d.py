# Wände, Öffnungen und Räume aus einem CAD-Grundriss (PDF, Vektor, 1:100).
# Rasterweg: tragende Linien zeichnen, Wandkörper per Morphologie schließen,
# Lücken bis ~1,4 m sind Öffnungen (außen Fenster, innen Türen), der Rest Räume.
import sys, json, re, math
import numpy as np, cv2, pymupdf
from shapely.geometry import Polygon, Point, LineString
from shapely.strtree import STRtree
from shapely.ops import unary_union
from shapely.affinity import translate

PT_M = 0.0352778          # Meter je pt bei 1:100
PX_M = 0.025              # Meter je Bildpunkt
Z = PT_M / PX_M           # Bildpunkte je pt

def bezier(p0, p1, p2, p3, n=12):
    return [((1-t)**3*p0.x+3*(1-t)**2*t*p1.x+3*(1-t)*t*t*p2.x+t**3*p3.x,
             (1-t)**3*p0.y+3*(1-t)**2*t*p1.y+3*(1-t)*t*t*p2.y+t**3*p3.y) for t in np.linspace(0, 1, n)]

def linienbild(page, mindestbreite=0.5):
    W, H = int(page.rect.width*Z)+2, int(page.rect.height*Z)+2
    img = np.zeros((H, W), np.uint8)
    for d in page.get_drawings():
        if d['type'] not in ('s', 'fs') or (d.get('width') or 0) < mindestbreite: continue
        c = d.get('color') or (1, 1, 1)
        if max(c) > 0.2: continue                       # nur schwarze Linien
        for it in d['items']:
            if it[0] == 'l': pts = [(it[1].x, it[1].y), (it[2].x, it[2].y)]
            elif it[0] == 'c': pts = bezier(*it[1:5])
            elif it[0] == 're':
                r = it[1]; pts = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]
            elif it[0] == 'qu':
                q = it[1]; pts = [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y), (q.ul.x, q.ul.y)]
            else: continue
            a = np.array([[x*Z, y*Z] for x, y in pts], np.int32)
            cv2.polylines(img, [a], False, 255, 2)
    return img

def kreis(m): d = max(3, int(round(m/PX_M))) | 1; return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))

def polys(maske, min_m2, eps=2.0):
    out = []
    n, lab, stats, _ = cv2.connectedComponentsWithStats(maske, 8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA]*PX_M*PX_M < min_m2: continue
        comp = (lab == i).astype(np.uint8)*255
        cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cs:
            c = cv2.approxPolyDP(c, eps, True)
            if len(c) >= 3: out.append([[float(x)*PX_M, float(y)*PX_M] for x, y in c[:, 0, :]])
    return out

def scanbild(pfad, px_pro_m):
    """Eingescannter Plan: dunkle, nicht blaue Bildpunkte (Maßketten sind blau), auf 1 px = PX_M skaliert."""
    bgr = cv2.imread(pfad)
    f = 1/(px_pro_m*PX_M)
    bgr = cv2.resize(bgr, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    b, g, r = [x.astype(int) for x in cv2.split(bgr)]
    grau = (b+g+r)//3
    blau = (b - r > 35) | (g - r > 35)
    rot = (r - b > 60)
    return ((grau < 150) & ~blau & ~rot).astype(np.uint8)*255

def auswerten(pfad, seite=0, linien=None, words=None):
    page = None
    if linien is None:
        page = pymupdf.open(pfad)[seite]
        linien = linienbild(page)
    waende = cv2.morphologyEx(linien, cv2.MORPH_CLOSE, kreis(0.6))
    waende = cv2.morphologyEx(waende, cv2.MORPH_OPEN, kreis(0.08))     # Strichreste weg
    zu = cv2.morphologyEx(waende, cv2.MORPH_CLOSE, kreis(1.45))
    luecken = cv2.subtract(zu, waende)
    # Öffnungen: kleine Lückenstücke (Tür 0,3 m², Fenster bis 0,8 m²)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(luecken, 8)
    oeff = np.zeros_like(luecken)
    for i in range(1, n):
        a = stats[i, cv2.CC_STAT_AREA]*PX_M*PX_M
        if not 0.08 < a < 0.9: continue
        ys, xs = np.nonzero(lab == i)
        (_, _), (rw, rh), _ = cv2.minAreaRect(np.column_stack([xs, ys]).astype(np.float32))
        lang, kurz = max(rw, rh)*PX_M, min(rw, rh)*PX_M
        # Tür oder Fenster: so tief wie eine Wand, 0,6 bis 1,6 m breit; Eckzwickel fallen raus.
        if 0.55 <= lang <= 1.6 and 0.08 <= kurz <= 0.6 and lang >= 1.8*kurz: oeff[lab == i] = 255
    frei = cv2.bitwise_not(cv2.bitwise_or(waende, oeff))
    h, w = frei.shape
    # Außenraum nur bis an die geschlossenen Lücken fluten, sonst läuft er durch jedes Fenster ins Haus.
    zu_frei = cv2.bitwise_not(zu)
    maske = np.zeros((h+2, w+2), np.uint8)
    cv2.floodFill(zu_frei, maske, (0, 0), 128)
    flut = (zu_frei == 128).astype(np.uint8)*255
    aussen = cv2.bitwise_and(cv2.dilate(flut, kreis(1.5)), frei)
    innen = cv2.bitwise_and(frei, cv2.bitwise_not(aussen))
    # Fenster: Öffnung, die an den Außenraum grenzt
    rand = cv2.dilate(aussen, kreis(0.12))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(oeff, 8)
    fenster = np.zeros_like(oeff); tueren = np.zeros_like(oeff)
    for i in range(1, n):
        m = lab == i
        (fenster if (rand[m] > 0).any() else tueren)[m] = 255
    # Räume mit Beschriftung
    words = sichtbare_woerter(page) if page is not None else (words or [])
    stempel = raumstempel(words)
    if stempel:
        # Sicher draußen: geflutet und mehr als 3 m von jeder Wand (so tief ist kein Raum); die Flut selbst läuft
        # durch offene Stellen der Fassade auch ins Haus.
        sperre = cv2.bitwise_or(waende, oeff)
        fern = cv2.distanceTransform(cv2.bitwise_not(sperre), cv2.DIST_L2, 5)*PX_M > 3.0
        draussen = np.where(fern & (flut > 0), 255, 0).astype(np.uint8)
        raeume = raeume_aus_stempeln(stempel, zonen(page) if page is not None else [], draussen, sperre)
    else:
        raeume = raeume_ohne_stempel(innen, zu, waende, oeff, words)
    labels = [{'text': ' '.join(wd[4] for wd in words if abs(wd[1]-y0) < 2 and abs(wd[0]-x0) < 400 and wd[0] >= x0),
               'x': x0*PT_M, 'y': y0*PT_M}
              for (x0, y0, x1, y1, t, *_r) in words if re.fullmatch(r'(ERDGESCHOSS|\d\.OBERGESCHOSS|OBERGESCHOSS|KELLERGESCHOSS|SOUTERRAIN|UNTERGESCHOSS|DACHGESCHOSS)', t)]
    return {
        'quelle': pfad, 'groesse_m': [w*PX_M, h*PX_M],
        'waende': polys(waende, 0.05), 'fenster': polys(fenster, 0.03), 'tueren': polys(tueren, 0.03),
        'raeume': raeume, 'geschosslabels': labels,
        '_bilder': (linien, waende, fenster, tueren, innen),
    }

def sichtbare_woerter(page):
    """Wörter ohne weiße (unsichtbare) Schrift; im Plan stehen z. B. weiße Raumnamen anderer Geschosse."""
    weiss = [pymupdf.Rect(sp['bbox']) for b in page.get_text('dict')['blocks'] for l in b.get('lines', [])
             for sp in l['spans'] if sp['color'] == 0xFFFFFF and sp['text'].strip()]
    return [wd for wd in page.get_text('words')
            if not any(r.contains(pymupdf.Point((wd[0]+wd[2])/2, (wd[1]+wd[3])/2)) for r in weiss)]

def raeume_ohne_stempel(innen, zu, waende, oeff, words):
    """Pläne ohne Raumnamen: Kerne dort, wo auch Türlücken (bis 1,45 m) zu sind, dann per Wasserscheide auf volle Größe."""
    h, w = innen.shape
    raeume = []
    kerne = cv2.bitwise_and(innen, cv2.bitwise_not(zu))
    kerne = cv2.erode(kerne, kreis(0.1))
    nk, marker = cv2.connectedComponents(kerne, connectivity=4)
    marker = marker.astype(np.int32)
    marker[innen == 0] = nk                      # Wände, Öffnungen, Außen: eigene Marke
    cv2.watershed(cv2.cvtColor(cv2.bitwise_or(waende, oeff), cv2.COLOR_GRAY2BGR), marker)
    lab = np.where((innen > 0) & (marker > 0) & (marker < nk), marker, 0).astype(np.int32)
    n = nk
    stats = np.zeros((n, 5), np.int64)
    for i, cnt in zip(*np.unique(lab, return_counts=True)): stats[i, cv2.CC_STAT_AREA] = cnt
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA]*PX_M*PX_M < 0.8: continue
        comp = (lab == i).astype(np.uint8)*255
        cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(cs, key=cv2.contourArea)
        poly = cv2.approxPolyDP(c, 2.0, True)[:, 0, :]
        texte = [wd[4] for wd in words if 0 <= int((wd[1]+wd[3])/2*Z) < h and 0 <= int((wd[0]+wd[2])/2*Z) < w and lab[int((wd[1]+wd[3])/2*Z), int((wd[0]+wd[2])/2*Z)] == i]
        raeume.append({'punkte': [[float(x)*PX_M, float(y)*PX_M] for x, y in poly], 'texte': texte,
                       'flaeche': round(stats[i, cv2.CC_STAT_AREA]*PX_M*PX_M, 2)})
    return raeume

# Raumnamen im Plan (Raumstempel). „G“ davor heißt Gemeinschaftseigentum, die Kreisziffer darüber ist die Wohnung.
RAUMNAME = re.compile(r'^(BAD|WC|BAD/WC|DIELE|FLUR|K[ÜU]CHE|ZIMMER|AR|ABSTELLR\.?|TERR?ASSE|LOGGIA|BALKON|TH|AUFZUG|MK\d*'
                      r'|FAHRRAD|HA-RAUM|HEIZZENTRALE|GALERIE|WOHNEN|SCHLAFEN|ESSEN|HWR|ABST\.?)$')

def raumstempel(words):
    """Raumstempel aus den Wörtern: Name (auch über zwei Zeilen), Wohnungsnummer aus der Kreisziffer darüber."""
    mitte = lambda wd: ((wd[0]+wd[2])/2*PT_M, (wd[1]+wd[3])/2*PT_M)
    namen = sorted((wd for wd in words if RAUMNAME.match(wd[4])), key=lambda wd: (wd[1], wd[0]))
    zahlen = [(mitte(wd), int(wd[4])) for wd in words if re.fullmatch(r'\d{1,2}', wd[4])]
    stempel, belegt = [], set()
    for i, wd in enumerate(namen):
        if i in belegt: continue
        x, y = mitte(wd)
        teile = [wd]
        # Fortsetzung in derselben Zeile („BAD / WC“, „MK 35“) oder in der Zeile darunter („HA-RAUM“ / „ELEKTRO“)
        for wd2 in words:
            if wd2 is wd: continue
            x2, y2 = mitte(wd2)
            gleiche_zeile = abs(y2-y) < 0.15 and 0 < wd2[0]*PT_M - wd[2]*PT_M < 0.6
            naechste = 0.25 < y2-y < 0.6 and abs(x2-x) < 0.9 and not re.fullmatch(r'G', wd2[4])
            if gleiche_zeile or naechste:
                teile.append(wd2)
                if wd2 in namen: belegt.add(namen.index(wd2))
        text = ' '.join(t[4] for t in sorted(teile, key=lambda t: (round(t[1]), t[0])))
        g = any(wd2[4] == 'G' and abs(mitte(wd2)[0]-x) < 0.9 and -0.7 < mitte(wd2)[1]-y < 0.15 for wd2 in words)
        we = [n for (zx, zy), n in zahlen if abs(zx-x) < 0.8 and -1.0 < zy-y < -0.3 and not g]
        stempel.append({'name': text, 'g': g, 'we': we[0] if we else None, 'x': x, 'y': y})
    return stempel

def zonen(page):
    """Raumflächen aus dem CAD (Raumstempel-Ebene): weiß gefüllte Umrisse und die Belagsmuster (Fliesen, Schraffur).
    Musterlinien enden genau am Raumrand; sich kreuzende Linien (Gitter) bzw. Nachbarn in der Zeichenfolge
    (parallele Schraffur) bilden eine Fläche."""
    weiss, linien = [], []
    for d in page.get_drawings():
        ebene = d.get('layer') or ''
        if ebene == 'A_LOES_RAUMSTEMPEL' and d['type'] == 'f':
            pts = [(it[1].x*PT_M, it[1].y*PT_M) for it in d['items'] if it[0] == 'l']
            if len(pts) >= 3:
                p = Polygon(pts).buffer(0)
                if p.area >= 0.8: weiss.append(p)          # kleinere sind Schriftfelder
        elif ebene in ('A_LOES_RAUMSTEMPEL', 'A_LOES_RAUM') and d['type'] == 's' and (d.get('width') or 0) < 0.3 \
                and d.get('color') and 0.8 < min(d['color']) < 0.9:
            for it in d['items']:
                if it[0] == 'l': linien.append(LineString([(it[1].x*PT_M, it[1].y*PT_M), (it[2].x*PT_M, it[2].y*PT_M)]))
    n = len(linien)
    eltern = list(range(n))
    def wurzel(i):
        while eltern[i] != i: eltern[i] = eltern[eltern[i]]; i = eltern[i]
        return i
    def verbinde(i, j): eltern[wurzel(i)] = wurzel(j)
    # Gitter: Linien, die sich kreuzen. Nur berühren (Ende an Ende oder Ende auf Linie) gilt nicht, so bleiben
    # aneinanderstoßende Flächen (Bad an Küche, Küche an Terrasse) getrennt.
    gekreuzt = set()
    if n:
        for i, j in zip(*STRtree(linien).query(linien, predicate='intersects')):
            if i >= j: continue
            p = linien[i].intersection(linien[j])
            if p.geom_type == 'Point' and min(p.distance(Point(c)) for c in (*linien[i].coords, *linien[j].coords)) > 0.01:
                verbinde(i, j); gekreuzt.update((i, j))
    richtung = lambda l: math.atan2(l.coords[1][1]-l.coords[0][1], l.coords[1][0]-l.coords[0][0]) % math.pi
    # Schraffur in einer Richtung: Nachbarn in der Zeichenfolge, parallel und nah
    for i in range(n-1):
        if i in gekreuzt or i+1 in gekreuzt: continue
        dw = abs(richtung(linien[i]) - richtung(linien[i+1])); dw = min(dw, math.pi-dw)
        if dw < 0.02 and linien[i].distance(linien[i+1]) < 0.4: verbinde(i, i+1)
    gruppen = {}
    for i in range(n): gruppen.setdefault(wurzel(i), []).append(linien[i])
    out = list(weiss)
    for g in gruppen.values():
        if len(g) < 3: continue
        rw = [richtung(l) for l in g]
        if max(min(abs(a-rw[0]), math.pi-abs(a-rw[0])) for a in rw) < 0.05:
            # Schraffur in einer Richtung: die Ränder parallel zu den Linien liegen irgendwo zwischen der äußersten
            # Linie und der nächsten; im Mittel eine halbe Teilung weiter außen.
            nx, ny = -math.sin(rw[0]), math.cos(rw[0])
            lage = sorted((l.centroid.x*nx + l.centroid.y*ny, i) for i, l in enumerate(g))
            teilung = float(np.median(np.diff([a for a, _ in lage])))
            if 0.05 < teilung < 0.4:
                for (_, i), vz in ((lage[0], -1), (lage[-1], 1)):
                    g = g + [translate(g[i], vz*nx*teilung/2, vz*ny*teilung/2)]
        # Schließen als Vektor-Operation (Puffer hin und zurück): Musterlinien enden auf dem Raumrand, so bleibt er exakt.
        flaeche = unary_union([l.buffer(0.2) for l in g]).buffer(-0.2)
        for p in getattr(flaeche, 'geoms', [flaeche]):
            if p.geom_type == 'Polygon' and p.area >= 0.8: out.append(Polygon(p.exterior))
    # Schmale Splitter (Schriftfelder, Kanten) sind keine Räume
    return [p for p in out if p.buffer(-0.2).area >= 0.3]

def _maske(poly, form):
    m = np.zeros(form, np.uint8)
    for p in getattr(poly, 'geoms', [poly]):
        if p.geom_type == 'Polygon':
            cv2.fillPoly(m, [np.round(np.array(p.exterior.coords)/PX_M).astype(np.int32)], 255)
    return m

def _teilen(bereich, saaten, zusatz=None):
    """Wasserscheide auf dem Abstandsbild: Grenzen fallen an Engstellen (Türen, Durchgänge). saaten: [(id, x, y)] in m."""
    h, w = bereich.shape
    dist = cv2.distanceTransform(bereich, cv2.DIST_L2, 5)*PX_M
    hoehe = (255*(1 - np.minimum(dist, 1.5)/1.5)).astype(np.uint8)
    marker = np.where(bereich > 0, 0, 1).astype(np.int32)
    for sid, x, y in saaten:
        sx, sy = int(x/PX_M), int(y/PX_M)
        if not (0 <= sx < w and 0 <= sy < h): continue
        if not bereich[sy, sx]:                                # Stempel auf Wand oder Tür: nächster freier Punkt
            ys, xs = np.nonzero(bereich[max(0, sy-24):sy+25, max(0, sx-24):sx+25])
            if not len(xs): continue
            k = np.argmin((xs+max(0, sx-24)-sx)**2 + (ys+max(0, sy-24)-sy)**2)
            sx, sy = xs[k]+max(0, sx-24), ys[k]+max(0, sy-24)
        cv2.circle(marker, (int(sx), int(sy)), 3, sid+2, -1)
    if zusatz is not None: marker[(zusatz > 0) & (marker == 0)] = 1      # gehört keinem Raum
    marker[bereich == 0] = 1
    cv2.watershed(cv2.cvtColor(hoehe, cv2.COLOR_GRAY2BGR), marker)
    return np.where(bereich > 0, marker - 2, -1)

def raeume_aus_stempeln(stempel, zonen_liste, draussen, sperre):
    """Ein Raum je Raumstempel. Liegt der Stempel in einer CAD-Raumfläche, ist das der Raum (bei mehreren Stempeln
    darin wird die Fläche geteilt). Die übrigen Stempel teilen sich die freie Fläche per Wasserscheide mit dem
    sicheren Außenraum (draussen), Grenzen fallen an Türen, Fenster und Engstellen."""
    h, w = sperre.shape
    frei = cv2.bitwise_not(sperre)
    lab = np.full((h, w), -1, np.int32)
    exakt = {}
    # Kleine Flächen zuerst: eine offene Küche liegt im CAD oft als eigene Fläche über dem Wohnraum.
    # Nachbarflächen überlappen dagegen nur im Wandstreifen, das bleibt (liegt unter der Wand).
    belegt = []
    for z in sorted(zonen_liste, key=lambda z: z.area):
        drin = [i for i, s in enumerate(stempel) if z.contains(Point(s['x'], s['y'])) and i not in exakt]
        if not drin: continue
        for b in belegt:
            if z.intersection(b).area > 0.5*b.area: z = z.difference(b)
        belegt.append(z)
        m = _maske(z, (h, w))
        m[lab >= 0] = 0
        if len(drin) == 1:
            lab[m > 0] = drin[0]; exakt[drin[0]] = z
        else:
            t = _teilen(cv2.bitwise_and(m, frei), [(i, stempel[i]['x'], stempel[i]['y']) for i in drin])
            for i in drin: lab[t == i] = i; exakt[i] = None
    rest = [i for i in range(len(stempel)) if i not in exakt]
    bereich = frei.copy()
    bereich[cv2.dilate((lab >= 0).astype(np.uint8), kreis(0.08)) > 0] = 0
    t = _teilen(bereich, [(i, stempel[i]['x'], stempel[i]['y']) for i in rest], draussen)
    for i in rest: lab[t == i] = i
    # Zweimal beschrifteter Raum (langer Flur): gleiche Stempel, deren Flächen ohne Wand aneinanderstoßen, sind ein Raum.
    schluessel = lambda i: (stempel[i]['name'], stempel[i]['we'], stempel[i]['g'])
    for a in rest:
        for b in rest:
            if a < b and schluessel(a) == schluessel(b) and abs(stempel[a]['x']-stempel[b]['x']) + abs(stempel[a]['y']-stempel[b]['y']) < 20:
                ma, mb = lab == a, lab == b
                if mb.any() and (cv2.dilate(ma.astype(np.uint8), kreis(0.1)).astype(bool) & mb).any(): lab[mb] = a
    raeume = []
    for i, s in enumerate(stempel):
        if isinstance(exakt.get(i), Polygon):
            poly = exakt[i]
        else:
            comp = cv2.morphologyEx((lab == i).astype(np.uint8)*255, cv2.MORPH_OPEN, kreis(0.08))
            cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not cs: continue
            c = cv2.approxPolyDP(max(cs, key=cv2.contourArea), 2.0, True)[:, 0, :]
            if len(c) < 3: continue
            poly = Polygon([(float(x)*PX_M, float(y)*PX_M) for x, y in c]).buffer(0)
        if poly.geom_type != 'Polygon': poly = max(poly.geoms, key=lambda g: g.area)
        if poly.area < 0.5: continue
        raeume.append({'punkte': [list(p) for p in poly.simplify(0.02).exterior.coords[:-1]], 'name': s['name'], 'we': s['we'],
                       'g': s['g'], 'texte': [s['name']] + ([str(s['we'])] if s['we'] else []),
                       'flaeche': round(poly.area, 2), 'aus_cad': isinstance(exakt.get(i), Polygon)})
    return raeume

if __name__ == '__main__':
    r = auswerten(sys.argv[1])
    linien, waende, fenster, tueren, innen = r.pop('_bilder')
    vis = np.full((*waende.shape, 3), 255, np.uint8)
    vis[innen > 0] = (240, 225, 200); vis[waende > 0] = (40, 40, 40); vis[fenster > 0] = (230, 160, 60); vis[tueren > 0] = (60, 60, 220)
    cv2.imwrite(sys.argv[2] + '.png', vis)
    json.dump(r, open(sys.argv[2] + '.json', 'w'), ensure_ascii=False)
    print(len(r['waende']), 'Wände', len(r['fenster']), 'Fenster', len(r['tueren']), 'Türen', len(r['raeume']), 'Räume', [l['text'] for l in r['geschosslabels']])
