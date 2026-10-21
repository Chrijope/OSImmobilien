# Musterrechnung für "Steuerersparnis mit Immobilien" und "Altersvorsorge mit Immobilien" (Werte 2026, vereinfacht).
import math, json

def est(zve):
    """Einkommensteuer-Grundtarif 2026 (§ 32a EStG)."""
    x = math.floor(zve)
    if x <= 12348: return 0
    if x <= 17799:
        y = (x - 12348) / 1e4; return math.floor((914.51 * y + 1400) * y)
    if x <= 69878:
        z = (x - 17799) / 1e4; return math.floor((173.10 * z + 2397) * z + 1034.87)
    if x <= 277825: return math.floor(0.42 * x - 11135.63)
    return math.floor(0.45 * x - 19470.38)

def grenz(zve):
    if zve > 69878: return 0.42
    z = (zve - 17799) / 1e4; return (2 * 173.10 * z + 2397) / 1e4

# Gehalt 80.000 €, Steuerklasse I, kinderlos, keine Kirchensteuer. BBG 2026: KV/PV 69.750 €, RV/AV 101.400 €.
B = 80000; BBG_KV = 69750
rv, av = 0.093 * B, 0.013 * B
kv, pv = 0.0875 * BBG_KV, 0.024 * BBG_KV          # 7,3 % + halber Zusatzbeitrag 2,9 %; PV 1,8 % + 0,6 % kinderlos
sozial = rv + av + kv + pv
vorsorge = rv + 0.0845 * BBG_KV + pv + av          # Vorsorgepauschale 2026 (KV ermäßigt 7,0 % + 1,45 %)
zve0 = B - 1230 - 36 - vorsorge
lst0 = est(zve0)
assert lst0 < 20350, "Soli-Freigrenze überschritten"
netto = B - sozial - lst0
G = dict(brutto=B, sozial=round(sozial), lst=lst0, netto=round(netto), zve=round(zve0), grenz=round(grenz(zve0) * 100, 1),
         rv=round(rv), av=round(av), kv=round(kv), pv=round(pv))

# Wohnung: 300.000 €, Gebäude 80 %, Miete 1.000 €, Kosten 100 €, Darlehen 300.000 € 4,5 % / 1,3 %
KP, GEB, MIETE, KOST, DARL, ZINS, TILG = 300000, 240000, 12000, 1200, 300000, 0.045, 0.013
RATE = DARL * (ZINS + TILG) / 12

def jahr(rs, sonder_m=0.0):
    zj = tj = 0
    for _ in range(12):
        if rs <= 0: break
        z = rs * ZINS / 12; t = min(RATE - z + sonder_m, rs); rs -= t; zj += z; tj += t
    return rs, zj, tj

_, Z1, T1 = jahr(DARL)
V = {}
for name, satz in (("ohne", None), ("afa2", 0.02), ("afa4", 0.04)):
    if satz is None: V[name] = dict(ersp=0, ersp_m=0, erg=0); continue
    afa = GEB * satz; erg = MIETE - Z1 - afa - KOST
    ersp = lst0 - est(zve0 + erg)
    V[name] = dict(afa=round(afa), erg=round(erg), ersp=ersp, ersp_m=round(ersp / 12), eff=round(ersp / -erg * 100, 1),
                   lst_m=round((lst0 - ersp) / 12), netto_m=round((netto + ersp) / 12))
V["ohne"].update(lst_m=round(lst0 / 12), netto_m=round(netto / 12))
luecke = RATE + KOST / 12 - MIETE / 12                 # Zuzahlung vor Steuer
laufend = (Z1 + KOST - MIETE) / 12                     # Teil, der nicht ins Vermögen geht
M = dict(rate=round(RATE), zins1=round(Z1), tilg1=round(T1), tilg_m=round(T1 / 12), luecke=round(luecke), laufend=round(laufend),
         eigen2=round(luecke - V["afa2"]["ersp_m"]), eigen4=round(luecke - V["afa4"]["ersp_m"]))

# Altersvorsorge: Kauf mit 35, Rente ab 67. Mietsteigerung 1,5 %/Jahr (Annahme), Wert konstant 300.000 € (keine Wertsteigerung angesetzt).
def verlauf(steig=0.015, sonder=False, alter0=35):
    rs = DARL; rows = []; ersp_vj = 0
    for j in range(1, 46):
        f = (1 + steig) ** (j - 1); miete, kost = MIETE * f, KOST * f
        rs, zj, tj = jahr(rs, (ersp_vj / 12) if (sonder and rs > 0) else 0)
        afa = GEB * 0.04 if j <= 25 else 0
        erg = miete - zj - afa - kost
        alter = alter0 + j
        if alter <= 67: st = lst0 - est(zve0 + erg)      # positiv = Ersparnis
        else: st = -max(miete - zj - kost - afa, 0) * 0.25  # Ruhestand: pauschal 25 % auf den Überschuss (Annahme)
        ersp_vj = max(st, 0)
        eigen = (zj + tj - miete + kost - st) / 12  # was der Kunde im Monat selbst zahlt (inkl. Sondertilgung)
        rows.append(dict(j=j, alter=alter, rest=round(rs), miete_m=round(miete / 12), steuer=round(st), zins=round(zj), eigen=round(eigen)))
    frei = next(r for r in rows if r["rest"] <= 0)
    return rows, frei
A = {}
for key, kw in (("basis", {}), ("sonder", {"sonder": True}), ("basis0", {"steig": 0.0}), ("sonder0", {"steig": 0.0, "sonder": True})):
    rows, frei = verlauf(**kw)
    f = (1 + kw.get("steig", 0.015)) ** (frei["j"])
    m_vor = (MIETE - KOST) * f / 12; m_nach = m_vor * 0.75
    A[key] = dict(frei_jahr=frei["j"], frei_alter=frei["alter"], rente_vor=round(m_vor), rente_nach=round(m_nach),
                  rest={r["alter"]: r["rest"] for r in rows if r["alter"] in (36, 40, 45, 50, 55, 60, 65, 67, 70, 75, 80)},
                  eigen={r["alter"]: r["eigen"] for r in rows if r["alter"] in (36, 45, 55, 60, 61, 65, 68, 69, 70)}, rows=rows)

if __name__ == "__main__":
    print(json.dumps(dict(G=G, V=V, M=M, A={k: {x: y for x, y in v.items() if x != "rows"} for k, v in A.items()}), ensure_ascii=False))
    # Selbstprüfung: Altwerte bei 60.000 € / 3,1 % (alte Dokumentannahme) ergeben die bekannten +270 €
    zve60 = 60000 - 1230 - 36 - (0.093 + 0.0845 + 0.024) * 60000
    assert round((est(zve60) - est(zve60 + MIETE - Z1 - GEB * 0.031 - KOST)) / 12) == 270
    assert round(Z1) == 13419
