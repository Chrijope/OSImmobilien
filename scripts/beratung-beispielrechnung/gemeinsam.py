# Gemeinsame Beispielrechnung für die ganze Beratungspräsentation (Runde 2, 21.10.2026).
# Eine Beispielperson und eine Beispielwohnung für alle Folien: Deck (Folie 4, 8, 9), "Steuerersparnis mit Immobilien"
# und "Arbeitsleistung und Immobilienvermögen". Ersetzt rechnung3.py (gleiche Namen, damit die Bauskripte weiterlaufen).
#
# Beispielwohnung seit 21.10.2026 (Christian): Hauffstraße 38 c, Wohnung 13, 3. OG rechts (Exposé Stand 19.10.2026),
# vorher Wohnung 1 (42,53 m², 176.000 €). 285.000 € inkl. Garage (270.000 € + 15.000 €), 72,36 m², 3 Zimmer,
# Kaltmiete 13,00 €/m² (940,68 €; nur 40,68 € Mietdifferenz, die der Bauträger bis zur nächsten Mieterhöhung zahlt,
# längstens 36 Monate, laut Garantievereinbarung), Garage 80 € im 1. Jahr, nicht umlagefähiges Hausgeld 194,22 €
# (inkl. Verwaltung) + Erhaltungsrücklage 62,81 € (Einzelwirtschaftsplan 2026), AfA-Grundlage 247.380 € (80 % Gebäudeanteil
# inkl. Nebenkosten; Restnutzungsdauer laut Ersteinschätzung 32 Jahre, Gutachten nötig), Kaufnebenkosten 24.225 € (8,5 %)
# aus Eigenkapital. Gewählt, damit die Mieteinnahmen dreier Wohnungen mit 60 über 4.200 € liegen (4.792 €).
# Szenario wie Exposé: Miete linear bis 20 €/m² im Jahr 2060, Garage bis 150 €, Kosten +2 % im Jahr, Wert +2 % im Jahr.
# Beispielperson: 65.000 € brutto (seit 21.10.2026, vorher 80.000 €), Steuerklasse I, kinderlos, ohne Kirchensteuer, Grundtarif 2026 (rechnung2.est).
# Abweichung vom Exposé: Das Exposé rechnet pauschal mit 42 % Grenzsteuersatz; hier wird für die Beispielperson der
# tatsächliche Tarif gerechnet (niedriger), damit Folie 8/9 und die Steuer- und Arbeitsleistungsseiten übereinstimmen.
import json, math
from rechnung2 import est, BBG_KV

# ---------- Beispielperson ----------
B = 65000
rv, av = 0.093 * B, 0.013 * B
# Kranken- und Pflegeversicherung vom Gehalt, höchstens bis zur Beitragsbemessungsgrenze.
KVB = min(B, BBG_KV)
kv, pv = 0.0875 * KVB, 0.024 * KVB
SOZ = rv + av + kv + pv
# Vorsorgepauschale 2026: RV, KV (ermäßigt 7,0 % + halber Zusatzbeitrag) und PV voll; die
# Arbeitslosenversicherung nur, soweit KV, PV und AV zusammen 1.900 € nicht übersteigen
# (BMF, Anhang 30a LStH 2026). Auf volle Euro aufgerundet. Codex-Prüfung vom 21.10.2026.
_KV_PV = 0.0845 * KVB + pv
VORSORGE = math.ceil(rv + _KV_PV + max(0.0, min(av, 1900 - _KV_PV)))
ZVE = B - 1230 - 36 - VORSORGE
LST = est(ZVE)
assert LST < 20350, "Soli-Freigrenze überschritten"
NETTO = B - SOZ - LST
MON = dict(brutto=B / 12, lst=LST / 12, rv=rv / 12, kv=kv / 12, pv=pv / 12, av=av / 12, sozial=SOZ / 12, netto=NETTO / 12)

# ---------- Beispielwohnung Hauffstraße 38 c, WE 13 ----------
NAME = "Hauffstraße 38 c, Wohnung 13"
KP, QM, KP_WHG, KP_GAR = 285000, 72.36, 270000, 15000
NK = 24225                                          # Kaufnebenkosten aus Eigenkapital (GrESt 6,5 %, Notar/Grundbuch 2 %)
GEB = 247380                                        # AfA-Bemessungsgrundlage laut Exposé
QM_MIETE0, QM_MIETE_2060, GAR0, GAR_2060 = 13.0, 20.0, 80.0, 150.0
MIETE_WHG_M = round(QM * QM_MIETE0, 2)              # 940,68 €
MIETE = (MIETE_WHG_M + GAR0) * 12                   # Jahresmiete im 1. Jahr: 12.248,16 €
KOST_ABZ_M, RUECKL_M = 194.22, 62.81                # abziehbar bzw. erst bei Verwendung absetzbar
KOST = (KOST_ABZ_M + RUECKL_M) * 12                 # gezahlt im 1. Jahr
KOST_STEIG = 0.02
DARL, ZINS, TILG = KP, 0.048, 0.012
RATE = DARL * (ZINS + TILG) / 12                    # 1.425 €
WACHS = 0.02
AFA_N, AFA_OS = 0.02, 0.04                          # 4 %: Annahme Restnutzungsdauer 25 Jahre (Christians Vorgabe); Exposé WE 13: Ersteinschätzung 32 Jahre ≈ 3,1 %
AFA_OS_JAHRE = 25
STEUER_RUHE = 0.25
ALTER0, JAHR0, JAHRE = 25, 2026, 40

def miete_jahr(j):
    """Jahresmiete im Jahr j (1 = 2026): Wohnung linear 13 -> 20 €/m² bis 2060, Garage 80 -> 150 €, danach konstant."""
    f = min(j - 1, 2060 - JAHR0) / (2060 - JAHR0)
    return (QM * (QM_MIETE0 + f * (QM_MIETE_2060 - QM_MIETE0)) + GAR0 + f * (GAR_2060 - GAR0)) * 12
def kost_jahr(j, nur_abziehbar=False):
    m = KOST_ABZ_M if nur_abziehbar else KOST_ABZ_M + RUECKL_M
    return m * 12 * (1 + KOST_STEIG) ** (j - 1)

def jahr(rs, rate=None):
    rate = rate or RATE
    zj = tj = 0; m = 0
    for _ in range(12):
        if rs <= 0: break
        z = rs * ZINS / 12; t = min(rate - z, rs); rs -= t; zj += z; tj += t; m += 1
    return rs, zj, tj, m

# ---------- Erstes Jahr ----------
_, Z1, T1, _ = jahr(DARL)
def variante(satz, n=1):
    afa = GEB * satz; erg = MIETE - Z1 - afa - kost_jahr(1, True)
    ersp = LST - est(ZVE + n * erg)
    # Die Ersparnis selbst runden (nicht die Differenz zweier gerundeter Lohnsteuerwerte), sonst wichen
    # Anteil auf den Folien und Monatsverlauf um 1 € voneinander ab. Lohnsteuer und Netto folgen daraus.
    m = round(ersp / 12); lst_m = round(LST / 12) - m
    return dict(afa=afa, erg=erg, ersp=ersp, m=m, lst_m=lst_m, netto_m=round(NETTO / 12) + m)
V2, V4 = variante(AFA_N), variante(AFA_OS)
V8 = variante(0.08)                                 # nur für Kompatibilität, wird nicht mehr gezeigt
ZUZ = RATE + KOST / 12 - MIETE / 12                 # Zuzahlung vor Steuer
LAUF = (Z1 + KOST - MIETE) / 12                     # Zinsen + Kosten − Miete
TILG_M = T1 / 12
EIGEN = ZUZ - V4["ersp"] / 12                       # Zuzahlung nach Steuer = eigener Anteil

# ---------- Verlauf ----------
def verlauf(n=1):
    rs, rows, monate = DARL, [], 0
    for j in range(1, JAHRE + 1):
        miete, kost, kabz = miete_jahr(j), kost_jahr(j), kost_jahr(j, True)
        rs, zj, tj, m = jahr(rs); monate += m
        afa = GEB * AFA_OS if j <= AFA_OS_JAHRE else 0
        erg = miete - zj - afa - kabz
        alter = ALTER0 + j - 1
        st = LST - est(ZVE + n * erg) if alter < 65 else -max(n * erg, 0) * STEUER_RUHE
        cf_vor = n * (miete - kost - zj - tj)
        rows.append(dict(j=j, jahr=JAHR0 + j - 1, alter=alter, miete_m=miete / 12, kost_m=kost / 12, zins=zj, tilg=tj, rest=rs,
                         erg=erg, afa=afa, steuer=st, cf_vor=cf_vor, cf_nach=cf_vor + st, miete_j=n * miete))
    return rows, monate

def wert(alter, p=WACHS): return KP * (1 + p) ** (alter - ALTER0)
def ueberschuss(alter, n=1, steuer=STEUER_RUHE):
    j = alter - ALTER0 + 1; vor = n * (miete_jahr(j) - kost_jahr(j)) / 12
    return dict(vor=vor, nach=vor * (1 - steuer), miete=(miete_jahr(j) / 12 - GAR_2060) / QM)

P1, MON_FREI = verlauf(1)
P3, _ = verlauf(3)
FREI_ALTER = ALTER0 + MON_FREI // 12
FREI_JAHR = JAHR0 + MON_FREI // 12
AFA_ENDE_ALTER = ALTER0 + AFA_OS_JAHRE              # erstes Alter ohne erhöhte AfA
def summen(rows, bis_alter):
    zu = sum(-r["cf_nach"] for r in rows if r["cf_nach"] < 0 and r["alter"] < bis_alter)
    return dict(zu=zu, ersp=sum(r["steuer"] for r in rows if r["steuer"] > 0), miete=sum(r["miete_j"] for r in rows))

# Gerundete Anzeigewerte, die überall gleich erscheinen (Folie 4, 8, 9, Steuer- und Arbeitsleistungsseiten)
ANZ = dict(miete=round(MIETE / 12), kost=round(KOST / 12), rate=round(RATE), vor=round(ZUZ), ersp=V4["m"],
           tilg=round(TILG_M), lauf=round(LAUF))
ANZ["eigen"] = ANZ["vor"] - ANZ["ersp"]
assert ANZ["miete"] + ANZ["ersp"] + ANZ["eigen"] == ANZ["rate"] + ANZ["kost"]

# ---------- Kennzahlen für das Deck ----------
DECK = dict(
    rate=RATE, miete_m=MIETE / 12, miete_whg_m=MIETE_WHG_M, garage_m=GAR0, kost_m=KOST / 12, ersp_m=V4["ersp"] / 12,
    eigen_m=EIGEN, tilg_m=TILG_M, zins_m=Z1 / 12, vor_steuer_m=ZUZ, lauf_m=LAUF,
    frei_monate=MON_FREI, frei_jahr=FREI_JAHR, wert30=KP * (1 + WACHS) ** 30,
    rest30=next(r["rest"] for r in P1 if r["j"] == 30),
    schnitt30=sum(-r["cf_nach"] for r in P1 if r["j"] <= 30) / 360,
)

if __name__ == "__main__":
    print(json.dumps(dict(LST=LST, NETTO=NETTO, ZVE=ZVE, RATE=RATE, Z1=Z1, T1=T1, MIETE=MIETE, KOST=KOST, V2=V2, V4=V4,
                          ZUZ=ZUZ, LAUF=LAUF, TILG_M=TILG_M, EIGEN=EIGEN, MON_FREI=MON_FREI, FREI=(FREI_ALTER, FREI_JAHR),
                          W65=wert(65), U58=ueberschuss(58), U60_3=ueberschuss(60, 3), DECK=DECK), ensure_ascii=False, indent=1))
    for r in P1: print(r["alter"], round(r["miete_m"]), round(r["rest"]), round(r["erg"]), round(r["steuer"]), round(r["cf_vor"] / 12), round(r["cf_nach"] / 12))
    # Selbstprüfung gegen das Exposé WE 13
    assert round(RATE) == 1425 and abs(MIETE - 12248.16) < 0.01 and round(GEB * AFA_OS) == 9895
    assert EIGEN <= 300, "Eigenanteil über 300 €"  # 65.000 €: rund 288 €
