/**
 * Die Regeln des Handbuch-Konfigurators: Antworten prüfen, Ausgang, Rahmen.
 *
 * Grundlage ist die Strategie vom 26.09.2026, Kapitel 3.3 und die drei
 * Beispielprofile aus Teil B.
 */
import { describe, expect, it } from "vitest";
import {
  crmFelder,
  ermittleAusgang,
  FRAGEN,
  handbuchRahmen,
  istHandbuchToken,
  leadNotiz,
  leadQualitaet,
  neuesHandbuchToken,
  pruefeAntworten,
  saVorbelegung,
  bremsAdresse,
  type HandbuchAntworten,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import { rahmenAusUeberschuss } from "@/lib/finanzierbarkeitUtils";

const PROFIL_A: HandbuchAntworten = { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" };
const PROFIL_B: HandbuchAntworten = { ziel: "vermoegen", beruf: "selbststaendig", brutto: "ueber_120", ueberschuss: "ueber_1500", eigenkapital: "ueber_60", start: "sofort" };
const PROFIL_C: HandbuchAntworten = { ziel: "alter", beruf: "beamter", brutto: "50_80", ueberschuss: "500_1000", eigenkapital: "unter_10", start: "spaeter" };

describe("Die sechs Fragen", () => {
  it("hat sechs Fragen mit je vier Kacheln, Frage 4 mit „Weiß ich nicht genau“ als fünfter", () => {
    expect(FRAGEN).toHaveLength(6);
    for (const f of FRAGEN) {
      expect(f.antworten).toHaveLength(f.schluessel === "ueberschuss" ? 5 : 4);
      expect(f.warum.length).toBeGreaterThan(20);
    }
    const ue = FRAGEN.find((f) => f.schluessel === "ueberschuss")!;
    expect(ue.antworten[4]).toMatchObject({ id: "unbekannt", text: "Weiß ich nicht genau", wert: 500 });
  });

  it("kennt die Eigenkapital-Spannen der Strategie (10.000, 30.000, 60.000 €)", () => {
    const ek = FRAGEN.find((f) => f.schluessel === "eigenkapital")!;
    expect(ek.antworten.map((a) => a.wert)).toEqual([0, 10000, 30000, 60000]);
  });
});

describe("Antworten von außen", () => {
  it("nimmt vollständige, bekannte Antworten an", () => {
    expect(pruefeAntworten(PROFIL_A)).toEqual(PROFIL_A);
  });

  it("weist fehlende, unbekannte oder erfundene Werte ab", () => {
    expect(pruefeAntworten(null)).toBeNull();
    expect(pruefeAntworten({ ...PROFIL_A, ziel: "reich werden" })).toBeNull();
    const { start: _start, ...ohneStart } = PROFIL_A;
    expect(pruefeAntworten(ohneStart)).toBeNull();
  });

  it("übernimmt nur die bekannten Schlüssel, nichts Zusätzliches", () => {
    const roh = { ...PROFIL_A, gemeinsamVeranlagt: true, fremd: "<script>" };
    expect(pruefeAntworten(roh)).toEqual({ ...PROFIL_A, gemeinsamVeranlagt: true });
  });
});

describe("Die drei Ausgänge", () => {
  it("passt: Überschuss ab 500 € und Eigenkapital ab 10.000 €", () => {
    expect(ermittleAusgang(PROFIL_A)).toBe("passt");
    expect(ermittleAusgang(PROFIL_B)).toBe("passt");
    expect(ermittleAusgang({ ...PROFIL_A, ueberschuss: "500_1000", eigenkapital: "10_30" })).toBe("passt");
  });

  it("vielleicht: genau einer der beiden Werte darunter (Profil C)", () => {
    expect(ermittleAusgang(PROFIL_C)).toBe("vielleicht");
    expect(ermittleAusgang({ ...PROFIL_A, ueberschuss: "unter_500" })).toBe("vielleicht");
  });

  it("noch nicht: beide darunter", () => {
    expect(ermittleAusgang({ ...PROFIL_A, ueberschuss: "unter_500", eigenkapital: "unter_10" })).toBe("noch_nicht");
  });

  it("noch nicht: kein regelmäßiges Einkommen (Etwas anderes und Überschuss unter 500 €)", () => {
    expect(ermittleAusgang({ ...PROFIL_A, beruf: "anderes", ueberschuss: "unter_500", eigenkapital: "ueber_60" })).toBe("noch_nicht");
    expect(ermittleAusgang({ ...PROFIL_A, beruf: "anderes" })).toBe("passt");
  });
});

describe("Der Rahmen", () => {
  it("entspricht den Beispielprofilen der Strategie", () => {
    expect(handbuchRahmen(PROFIL_A)).toMatchObject({ von: 158000, bis: 222000, empf: 190000 });
    expect(handbuchRahmen(PROFIL_B)).toMatchObject({ von: 252000, bis: 348000, empf: 300000 });
    expect(handbuchRahmen(PROFIL_C)).toMatchObject({ von: 64000, bis: 96000, empf: 80000 });
  });

  it("rechnet mit derselben Formel wie das CRM nach der Selbstauskunft", () => {
    for (const p of [PROFIL_A, PROFIL_B, PROFIL_C]) {
      const r = handbuchRahmen(p);
      expect(r.empf).toBe(rahmenAusUeberschuss(r.ueberschuss, r.eigenkapital).empfRahmen);
    }
  });
});

describe("Felder am Kontakt", () => {
  it("schreibt Klartext und den Ausgang mit Rahmen", () => {
    const f = crmFelder(PROFIL_A);
    expect(f.qualZiel).toBe("Steuerlast senken");
    expect(f.qualBeruflicheSituation).toBe("Angestellt");
    expect(f.finanzierbarkeit).toBe("Handbuch: passt, Rahmen 158.000 bis 222.000 €");
  });

  it("die Notiz nennt alle sechs Antworten", () => {
    const n = leadNotiz({ ...PROFIL_C, gemeinsamVeranlagt: true });
    expect(n).toContain("Beamter oder Beamtin");
    expect(n).toContain("gemeinsam veranlagt");
    expect(n).toContain("passt vielleicht");
  });

  it("Dringlichkeit: passt und bald hoch, noch nicht niedrig", () => {
    expect(leadQualitaet(PROFIL_A)).toBe("hoch");
    expect(leadQualitaet(PROFIL_C)).toBe("mittel");
    expect(leadQualitaet({ ...PROFIL_A, ueberschuss: "unter_500", eigenkapital: "unter_10" })).toBe("niedrig");
  });
});

describe("Vorbelegung der Selbstauskunft", () => {
  it("Beamte als angestellt, Selbstständige als selbständig, Ziele auf die Liste der Selbstauskunft", () => {
    expect(saVorbelegung(PROFIL_C)).toEqual({ beschaeftigungsart: "angestellt", wuenscheZiele: ["rente"] });
    expect(saVorbelegung(PROFIL_B)).toEqual({ beschaeftigungsart: "selbstaendig", wuenscheZiele: ["vermoegen"] });
    expect(saVorbelegung({ ...PROFIL_A, beruf: "anderes", ziel: "verstehen" })).toEqual({});
  });
});

describe("Token", () => {
  it("ist 64 Zeichen Zufall und nie zweimal gleich", () => {
    const a = neuesHandbuchToken();
    const b = neuesHandbuchToken();
    expect(istHandbuchToken(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(istHandbuchToken("neu")).toBe(false);
    expect(istHandbuchToken("A".repeat(64))).toBe(false);
  });
});

describe("Bremse je Adresse", () => {
  it("zählt Plus-Adressen und Gmail-Punkte als dieselbe Adresse", () => {
    expect(bremsAdresse("Max.Muster+1@gmail.com")).toBe("maxmuster@gmail.com");
    expect(bremsAdresse("max.muster@googlemail.com")).toBe("maxmuster@gmail.com");
    expect(bremsAdresse("erika.muster+handbuch@web.de")).toBe("erika.muster@web.de");
  });
});
