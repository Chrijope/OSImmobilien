/**
 * „Ihr Rahmen“ und die Modellrechnung für JEDE Kombination der Antworten
 * (Auftrag vom 26.09.2026, Punkt 11).
 *
 * Geprüft wird, dass jede Antwort dort wirkt, wo sie wirken muss, und nur
 * dort: Überschuss und Eigenkapital bestimmen den Rahmen, das Jahresbrutto
 * den Steuersatz und damit den Eigenaufwand nach Steuer, Beruf, Ziel und
 * Start die Texte. Die Rahmenformel selbst ist nicht Gegenstand, sie steht
 * in `rahmen-formel.ts` und ist dort begründet.
 */
import { describe, expect, it } from "vitest";
import { baueHandbuch } from "./inhalt";
import { handbuchAuswertung, modellKaufpreis } from "./modell";
import type { Block } from "./bausteine";
import {
  ermittleAusgang,
  FRAGEN,
  handbuchRahmen,
  rahmenText,
  type HandbuchAntworten,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";

const ids = (s: string) => FRAGEN.find((f) => f.schluessel === s)!.antworten.map((a) => a.id);
const ZIELE = ids("ziel") as HandbuchAntworten["ziel"][];
const BERUFE = ids("beruf") as HandbuchAntworten["beruf"][];
const BRUTTO = ids("brutto") as HandbuchAntworten["brutto"][];
const UE = ids("ueberschuss") as HandbuchAntworten["ueberschuss"][];
const EK = ids("eigenkapital") as HandbuchAntworten["eigenkapital"][];
const START = ids("start") as HandbuchAntworten["start"][];

function alle(): HandbuchAntworten[] {
  const liste: HandbuchAntworten[] = [];
  for (const ziel of ZIELE)
    for (const beruf of BERUFE)
      for (const brutto of BRUTTO)
        for (const ueberschuss of UE)
          for (const eigenkapital of EK)
            for (const start of START) liste.push({ ziel, beruf, brutto, ueberschuss, eigenkapital, start });
  return liste;
}

function texte(bloecke: Block[]): string {
  return bloecke
    .flatMap((b) => (b.typ === "zweispaltig" ? [...b.links, ...b.rechts] : [b]))
    .map((b) => JSON.stringify({ ...b, zeichnung: undefined }))
    .join("\n");
}

describe("Rahmen für jede Kombination", () => {
  const kombinationen = alle();

  it("deckt alle 5.120 Kombinationen ab und rechnet nie NaN oder negativ", () => {
    expect(kombinationen).toHaveLength(4 * 4 * 4 * 5 * 4 * 4);
    for (const a of kombinationen) {
      const r = handbuchRahmen(a);
      for (const w of [r.von, r.bis, r.empf, r.maxDarlehen, r.tragbareRate]) {
        expect(Number.isFinite(w)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(0);
      }
      expect(r.von).toBeLessThanOrEqual(r.bis);
    }
  });

  it("hängt nur an Überschuss und Eigenkapital, nicht an Beruf, Brutto, Ziel oder Start", () => {
    const je = new Map<string, string>();
    for (const a of kombinationen) {
      const schluessel = `${a.ueberschuss}|${a.eigenkapital}`;
      const r = rahmenText(handbuchRahmen(a));
      if (je.has(schluessel)) expect(r).toBe(je.get(schluessel));
      else je.set(schluessel, r);
    }
    expect(je.size).toBe(20);
  });

  it("unterscheidet sich für jedes Paar aus Überschuss und Eigenkapital, außer „Weiß ich nicht genau“ = 500 bis 1.000 €", () => {
    const empf = new Map<string, string>();
    for (const ue of UE)
      for (const ek of EK) {
        const r = handbuchRahmen({ ueberschuss: ue, eigenkapital: ek });
        const wert = `${r.von}-${r.bis}`;
        const gleich = [...empf.entries()].find(([, w]) => w === wert);
        if (gleich) {
          // Die einzige gewollte Gleichheit: vorsichtig gerechnet wie 500 €.
          expect(`${ue}|${ek}`).toBe(`unbekannt|${ek}`);
          expect(gleich[0]).toBe(`500_1000|${ek}`);
        }
        empf.set(`${ue}|${ek}`, wert);
      }
  });

  it("wächst mit mehr Überschuss und mehr Eigenkapital", () => {
    const reihe = ["unter_500", "500_1000", "1000_1500", "ueber_1500"] as const;
    for (const ek of EK)
      for (let i = 1; i < reihe.length; i++) {
        expect(handbuchRahmen({ ueberschuss: reihe[i], eigenkapital: ek }).empf).toBeGreaterThan(handbuchRahmen({ ueberschuss: reihe[i - 1], eigenkapital: ek }).empf);
      }
    for (const ue of UE)
      for (let i = 1; i < EK.length; i++) {
        expect(handbuchRahmen({ ueberschuss: ue, eigenkapital: EK[i] }).empf).toBeGreaterThan(handbuchRahmen({ ueberschuss: ue, eigenkapital: EK[i - 1] }).empf);
      }
  });

  it("Grenzfälle: ohne Überschuss und ohne Eigenkapital kein Rahmen, ohne Eigenkapital nur das Darlehen", () => {
    expect(handbuchRahmen({ ueberschuss: "unter_500", eigenkapital: "unter_10" })).toMatchObject({ von: 0, bis: 0, empf: 0 });
    expect(rahmenText(handbuchRahmen({ ueberschuss: "unter_500", eigenkapital: "unter_10" }))).toBe("0 €");
    expect(rahmenText(handbuchRahmen({ ueberschuss: "unter_500", eigenkapital: "30_60" }))).toBe("30.000 €");
    expect(handbuchRahmen({ ueberschuss: "ueber_1500", eigenkapital: "unter_10" })).toMatchObject({ von: 192000, bis: 288000, empf: 240000 });
  });
});

describe("Ausgang für jede Kombination", () => {
  it("folgt der Regel aus Strategie 3.3, „Weiß ich nicht genau“ nie besser als „vielleicht“", () => {
    for (const beruf of BERUFE)
      for (const ue of UE)
        for (const ek of EK) {
          const aus = ermittleAusgang({ beruf, ueberschuss: ue, eigenkapital: ek });
          const ueKnapp = ue === "unter_500";
          const ekKnapp = ek === "unter_10";
          let erwartet: string;
          if (beruf === "anderes" && ueKnapp) erwartet = "noch_nicht";
          else if (ueKnapp && ekKnapp) erwartet = "noch_nicht";
          else if (ueKnapp || ekKnapp || ue === "unbekannt") erwartet = "vielleicht";
          else erwartet = "passt";
          expect(aus, `${beruf} ${ue} ${ek}`).toBe(erwartet);
        }
  });
});

describe("Modellrechnung für jede Zahlenkombination", () => {
  it("der Eigenaufwand nach Steuer unterscheidet sich je Jahresbrutto, bei gleichem Kaufpreis", () => {
    for (const ue of UE)
      for (const ek of EK) {
        const werte = BRUTTO.map((brutto) => {
          const a = handbuchAuswertung({ ziel: "vermoegen", beruf: "angestellt", brutto, ueberschuss: ue, eigenkapital: ek, start: "sofort" });
          expect(Number.isFinite(a.jahr1.nachSteuer)).toBe(true);
          return { kp: a.kaufpreis, nach: Math.round(a.jahr1.nachSteuer), gs: a.grenzsatz };
        });
        expect(new Set(werte.map((w) => w.kp)).size).toBe(1);
        expect(new Set(werte.map((w) => w.nach)).size).toBe(4);
        // Höheres Brutto, gleich hoher oder höherer Grenzsteuersatz.
        for (let i = 1; i < werte.length; i++) expect(werte[i].gs).toBeGreaterThanOrEqual(werte[i - 1].gs);
      }
  });

  it("der Kaufpreis der Musterwohnung folgt dem Rahmen, begrenzt auf 80.000 bis 300.000 €", () => {
    for (const ue of UE)
      for (const ek of EK) {
        const r = handbuchRahmen({ ueberschuss: ue, eigenkapital: ek });
        const kp = modellKaufpreis(r);
        expect(kp).toBe(Math.max(80000, Math.min(300000, Math.floor(r.empf / 10000) * 10000)));
      }
  });

  it("das Handbuch entsteht für jede Zahlenkombination ohne NaN und ohne undefined", () => {
    for (const ue of UE)
      for (const ek of EK)
        for (const brutto of BRUTTO) {
          const h = baueHandbuch({
            antworten: { ziel: "steuer", beruf: "angestellt", brutto, ueberschuss: ue, eigenkapital: ek, start: "sofort" },
            vorname: "Erika",
            nachname: "Muster",
            datum: "26.09.2026",
            saLink: null,
          });
          const t = h.seiten.map((s) => texte(s.bloecke)).join("\n");
          expect(t).not.toMatch(/NaN|undefined|Infinity/);
        }
  });

  it("Ziel, Beruf und Start ändern die Kapitel, die sie betreffen", () => {
    const basis: HandbuchAntworten = { ziel: "vermoegen", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "sofort" };
    const seite = (a: HandbuchAntworten, id: string) => {
      const h = baueHandbuch({ antworten: a, vorname: "E", nachname: "M", datum: "26.09.2026", saLink: null });
      return texte(h.seiten.find((s) => s.id === id)!.bloecke) + h.seiten.find((s) => s.id === id)!.titel;
    };
    expect(new Set(ZIELE.map((ziel) => seite({ ...basis, ziel }, "kapitel-9"))).size).toBe(4);
    expect(new Set(BERUFE.map((beruf) => seite({ ...basis, beruf }, "kapitel-12"))).size).toBe(4);
    expect(new Set(START.map((start) => seite({ ...basis, start }, "kapitel-11"))).size).toBe(4);
  });
});
