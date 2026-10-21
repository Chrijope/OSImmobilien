# Schreibt die gemeinsame Beispielrechnung (gemeinsam.py) als TypeScript-Datei für die
# Beratungspräsentation in CRM und Artefakt: src/lib/beratungBeispielrechnung.ts.
# Aus derselben Rechnung entstehen die PDF-Präsentation und die Vertriebsdokumente,
# so laufen die Zahlen nicht auseinander. Aufruf aus dem Repo-Wurzelordner:
#   python3 scripts/beratung-beispielrechnung/export.py
import json, os, sys
H = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, H)
import gemeinsam as R

def r100(x): return round(x / 100) * 100
def r10(x): return round(x, -1)
M, A, P1, P3, FREI = R.MON, R.ANZ, R.P1, R.P3, R.FREI_ALTER
P2 = R.verlauf(2)[0]
L = {k: v * 12 * R.JAHRE for k, v in M.items()}
def mon(rows, alter, k): return next(r[k] for r in rows if r["alter"] == alter) / 12
V4_3 = R.variante(R.AFA_OS, 3)
U58, U60_3, U65_3 = R.ueberschuss(58), R.ueberschuss(60, 3), R.ueberschuss(65, 3)
W60, W65 = R.wert(60), R.wert(65)
wert_frei = R.wert(R.ALTER0 + R.MON_FREI / 12)

def spalte(n, rows):
    return dict(vor=round(n * A["vor"]), anfang=round(-mon(rows, 25, "cf_nach")),
                spaet=r10(max(-r["cf_nach"] for r in rows if r["alter"] < FREI) / 12),
                ab58=r10(R.ueberschuss(58, n)["vor"]), zu=r100(R.summen(rows, FREI)["zu"]))

D = dict(
    person=dict(bruttoJahr=R.B, bruttoMonat=round(M["brutto"]), lohnsteuerJahr=round(R.LST), lohnsteuerMonat=round(M["lst"]),
                sozialMonat=round(M["sozial"]), nettoMonat=round(M["netto"]), abzuegeMonat=round(M["lst"] + M["sozial"]),
                rv=round(M["rv"]), kv=round(M["kv"]), pv=round(M["pv"]), av=round(M["av"]), zuVersteuern=round(R.ZVE),
                lebenBrutto=L["brutto"], lebenAbgaben=L["lst"] + L["sozial"], lebenNetto=L["netto"],
                lebenLohnsteuer=round(L["lst"]), lebenSozial=round(L["sozial"])),
    wohnung=dict(name=R.NAME, kaufpreis=R.KP, qm=R.QM, nebenkosten=R.NK, afaGrundlage=R.GEB, mieteWohnung=R.MIETE_WHG_M,
                 garage=round(R.GAR0), miete=A["miete"], hausgeld=A["kost"], ruecklage=round(R.RUECKL_M), rate=A["rate"],
                 zinsMonat=round(R.Z1 / 12), tilgung=A["tilg"], vorSteuer=A["vor"], ersparnis=A["ersp"], anteil=A["eigen"],
                 laufend=A["lauf"], ersparnisOhneGutachten=R.V2["m"], ersparnisJahr=round(R.V4["ersp"]),
                 afa2=round(R.V2["afa"]), afa4=round(R.V4["afa"]), ergebnisJahr=round(R.V4["erg"]),
                 neuZuVersteuern=round(R.ZVE + R.V4["erg"]), lohnsteuerMonatNeu=R.V4["lst_m"], nettoMonatNeu=R.V4["netto_m"],
                 lohnsteuerMonat2=R.V2["lst_m"], nettoMonat2=R.V2["netto_m"], mieteJahr=round(R.MIETE), zinsJahr=round(R.Z1),
                 kostenAbziehbarJahr=round(R.kost_jahr(1, True)), freiMonate=R.MON_FREI, freiJahr=R.FREI_JAHR, freiAlter=FREI,
                 afaEndeAlter=R.AFA_ENDE_ALTER, wertFrei=r100(wert_frei), wert60=r100(W60), wert65=r100(W65),
                 wert30=r100(R.DECK["wert30"]), schnitt30=round(R.DECK["schnitt30"]),
                 bis49=r10(max(-r["cf_nach"] for r in P1 if r["alter"] < R.AFA_ENDE_ALTER) / 12 + 5),
                 max57=r10(max(-r["cf_nach"] for r in P1 if r["alter"] < FREI) / 12), ueberschuss58=r10(U58["vor"]),
                 restRaten=R.MON_FREI - (FREI - R.ALTER0) * 12),
    mehr=[spalte(1, P1), spalte(2, P2), spalte(3, P3)],
    drei=dict(rente65=r10(U65_3["nach"]),
              gerettet=r100(sum(r["steuer"] for r in P3 if r["steuer"] > 0)), wert65=3 * r100(W65),
              miete60=round(3 * R.miete_jahr(60 - R.ALTER0 + 1) / 12),  # Mieteinnahmen aller drei Wohnungen mit 60
              miete=sum(r["miete_j"] for r in P3), afa=round(3 * R.GEB * R.AFA_OS * R.AFA_OS_JAHRE),
              wertzuwachs=3 * (W65 - R.KP), rente60=r10(U60_3["nach"]), rente60Vor=r10(U60_3["vor"]),
              verkauf60=3 * W60, renteAusVerkauf=round(3 * W60 / 300, -2)),
    verlauf=[[R.ALTER0, R.DARL, R.KP]] + [[r["alter"] + 1, round(r["rest"]), round(R.wert(r["alter"] + 1))] for r in P1],
    monate=[[r["alter"], round(r["cf_vor"] / 12), round(r["cf_nach"] / 12)] for r in P1],
)
# Wie in der PDF (Folie 24): Ersparnis = Zuzahlung vor Steuern minus Anteil, damit die Summe aufgeht.
D["drei"]["ersparnisJahr1"] = D["mehr"][2]["vor"] - D["mehr"][2]["anfang"]
def ganz(x):
    if isinstance(x, float): return round(x) if abs(x) >= 1000 or x == int(x) else x
    if isinstance(x, dict): return {k: ganz(v) for k, v in x.items()}
    if isinstance(x, list): return [ganz(v) for v in x]
    return x
D = ganz(D)
ziel = os.path.join(H, "..", "..", "src", "lib", "beratungBeispielrechnung.ts")
with open(ziel, "w", encoding="utf-8") as f:
    f.write("/*\n * Gemeinsame Beispielrechnung der Beratungspräsentation (PDF, CRM, Artefakt).\n"
            " * ERZEUGT aus scripts/beratung-beispielrechnung/gemeinsam.py mit export.py, nicht von Hand ändern.\n"
            " * Beispielperson 65.000 € brutto (Grundtarif 2026), Beispielwohnung Hauffstraße 38 c, Wohnung 13,\n"
            " * AfA 4 % als Annahme (Ersteinschätzung, Gutachten erforderlich). Beträge in Euro, gerundet wie in der PDF.\n */\n")
    f.write("export const BEISPIEL = " + json.dumps(D, ensure_ascii=False, indent=2) + " as const;\n")
print("geschrieben:", os.path.normpath(ziel))
