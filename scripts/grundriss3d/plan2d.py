# Wände, Öffnungen und Räume aus einem CAD-Grundriss (PDF, Vektor, 1:100).
# Rasterweg: tragende Linien zeichnen, Wandkörper per Morphologie schließen,
# Lücken bis ~1,4 m sind Öffnungen (außen Fenster, innen Türen), der Rest Räume.
import sys, json, re, math
import numpy as np, cv2, pymupdf

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
    aussen = (zu_frei == 128).astype(np.uint8)*255
    aussen = cv2.bitwise_and(cv2.dilate(aussen, kreis(1.5)), frei)
    innen = cv2.bitwise_and(frei, cv2.bitwise_not(aussen))
    # Fenster: Öffnung, die an den Außenraum grenzt
    rand = cv2.dilate(aussen, kreis(0.12))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(oeff, 8)
    fenster = np.zeros_like(oeff); tueren = np.zeros_like(oeff)
    for i in range(1, n):
        m = lab == i
        (fenster if (rand[m] > 0).any() else tueren)[m] = 255
    # Räume mit Beschriftung
    words = page.get_text('words') if page is not None else (words or [])
    raeume = []
    # Räume: Kerne dort, wo auch Türlücken (bis 1,45 m) zu sind, dann per Wasserscheide auf volle Größe.
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
    labels = [{'text': ' '.join(wd[4] for wd in words if abs(wd[1]-y0) < 2 and abs(wd[0]-x0) < 400 and wd[0] >= x0),
               'x': x0*PT_M, 'y': y0*PT_M}
              for (x0, y0, x1, y1, t, *_r) in words if re.fullmatch(r'(ERDGESCHOSS|\d\.OBERGESCHOSS|OBERGESCHOSS|KELLERGESCHOSS|SOUTERRAIN|UNTERGESCHOSS|DACHGESCHOSS)', t)]
    return {
        'quelle': pfad, 'groesse_m': [w*PX_M, h*PX_M],
        'waende': polys(waende, 0.05), 'fenster': polys(fenster, 0.03), 'tueren': polys(tueren, 0.03),
        'raeume': raeume, 'geschosslabels': labels,
        '_bilder': (linien, waende, fenster, tueren, innen),
    }

if __name__ == '__main__':
    r = auswerten(sys.argv[1])
    linien, waende, fenster, tueren, innen = r.pop('_bilder')
    vis = np.full((*waende.shape, 3), 255, np.uint8)
    vis[innen > 0] = (240, 225, 200); vis[waende > 0] = (40, 40, 40); vis[fenster > 0] = (230, 160, 60); vis[tueren > 0] = (60, 60, 220)
    cv2.imwrite(sys.argv[2] + '.png', vis)
    json.dump(r, open(sys.argv[2] + '.json', 'w'), ensure_ascii=False)
    print(len(r['waende']), 'Wände', len(r['fenster']), 'Fenster', len(r['tueren']), 'Türen', len(r['raeume']), 'Räume', [l['text'] for l in r['geschosslabels']])
