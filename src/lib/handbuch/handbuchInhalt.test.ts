/**
 * Rechnung und Zusammensetzung des Handbuchs je Profil.
 *
 * Die Zahlen der Beispielprofile laufen durch den echten Rechenkern des
 * Investmentrechners. Seit dem 17.10.2026 mit der Beispielwohnung aus der
 * Hauffstraße 38 (Annahmen wie ihr Exposé, siehe modell.ts).
 */
import { describe, expect, it } from "vitest";
import { baueHandbuch, type HandbuchAngaben } from "./inhalt";
import { handbuchAuswertung, modellKaufpreis } from "./modell";
import type { Block, Handbuch } from "./bausteine";
import { zeichnungAlsSvg } from "./diagramme";
import type { HandbuchAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";

const A: HandbuchAntworten = { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" };
const B: HandbuchAntworten = { ziel: "vermoegen", beruf: "selbststaendig", brutto: "ueber_120", ueberschuss: "ueber_1500", eigenkapital: "ueber_60", start: "sofort" };
const C: HandbuchAntworten = { ziel: "alter", beruf: "beamter", brutto: "50_80", ueberschuss: "500_1000", eigenkapital: "unter_10", start: "spaeter" };

function angaben(antworten: HandbuchAntworten, saLink: string | null = "https://osimmobilien.netlify.app/handbuch/selbstauskunft/x"): HandbuchAngaben {
  return { antworten, vorname: "Erika", nachname: "Muster", datum: "26.09.2026", saLink };
}

function alleTexte(h: Handbuch): string {
  const teile: string[] = [h.titel, h.untertitel];
  const durch = (b: Block) => {
    teile.push(JSON.stringify({ ...b, zeichnung: undefined }));
    if (b.typ === "grafik") teile.push(zeichnungAlsSvg(b.zeichnung));
    if (b.typ === "zweispaltig") [...b.links, ...b.rechts].forEach(durch);
  };
  h.seiten.forEach((s) => {
    teile.push(s.kapitel, s.titel);
    s.bloecke.forEach(durch);
  });
  return teile.join("\n");
}

function seite(h: Handbuch, id: string) {
  const s = h.seiten.find((x) => x.id === id);
  if (!s) throw new Error(`Seite ${id} fehlt`);
  return s;
}

describe("Rechnung wie in der Strategie", () => {
  it.each([
    ["A", A, 220930, 42, 144],
    ["B", B, 294000, 42, 202],
    ["C", C, 176000, 35, 185],
  ])("Profil %s: Beispielwohnung Hauffstraße, Grenzsteuersatz, Eigenaufwand nach Steuer im ersten Jahr", (_n, p, kaufpreis, gs, eigenaufwand) => {
    const a = handbuchAuswertung(p);
    expect(a.kaufpreis).toBe(kaufpreis);
    expect(a.grenzsatz).toBe(gs);
    expect(Math.round(-a.jahr1.nachSteuer)).toBe(eigenaufwand);
  });

  it("die Beispielwohnung ist eine echte Hauffstraße-Wohnung bis zur Obergrenze des Rahmens", () => {
    expect(modellKaufpreis({ bis: 10000 })).toBe(176000);
    expect(modellKaufpreis({ bis: 220929 })).toBe(176000);
    expect(modellKaufpreis({ bis: 222000 })).toBe(220930);
    expect(modellKaufpreis({ bis: 999999 })).toBe(294000);
  });
});

describe("Zusammensetzung je Profil", () => {
  it("hat Inhalt, 14 Kapitel, nächsten Schritt und Hinweise", () => {
    const h = baueHandbuch(angaben(A));
    const ids = h.seiten.map((s) => s.id);
    expect(ids[0]).toBe("inhalt");
    for (let k = 1; k <= 14; k++) expect(ids).toContain(`kapitel-${k}`);
    expect(ids.slice(-2)).toEqual(["naechster-schritt", "hinweise"]);
    expect(h.erstelltFuer).toBe("Erika Muster");
  });

  it("Kapitel 9 wechselt mit dem Ziel", () => {
    expect(seite(baueHandbuch(angaben(A)), "kapitel-9").titel).toBe("Dein Schwerpunkt: Deine Steuerersparnis im Detail");
    expect(seite(baueHandbuch(angaben(B)), "kapitel-9").titel).toBe("Dein Schwerpunkt: Von der ersten Wohnung zum Bestand");
    expect(seite(baueHandbuch(angaben(C)), "kapitel-9").titel).toBe("Dein Schwerpunkt: Deine Wohnung als zusätzliche Rente");
    const v = seite(baueHandbuch(angaben({ ...A, ziel: "verstehen" })), "kapitel-9");
    expect(v.titel).toBe("Dein Schwerpunkt: Die wichtigsten Begriffe");
    expect(JSON.stringify(v.bloecke)).toContain("Abschreibung (AfA)");
  });

  it("Kapitel 12 hat die Unterlagenliste zum Beruf", () => {
    expect(JSON.stringify(seite(baueHandbuch(angaben(C)), "kapitel-12").bloecke)).toContain("Bezügemitteilungen");
    expect(JSON.stringify(seite(baueHandbuch(angaben(B)), "kapitel-12").bloecke)).toContain("Bilanz oder BWA");
    expect(JSON.stringify(seite(baueHandbuch(angaben(A)), "kapitel-12").bloecke)).toContain("Lohnsteuerbescheinigung des Vorjahres");
  });

  it("Kapitel 4 spricht die Berufsgruppe an", () => {
    expect(JSON.stringify(seite(baueHandbuch(angaben(C)), "kapitel-4").bloecke)).toContain("Beamtenverhältnis");
  });

  it("Kapitel 11 zeigt den Zeitplan zum Start", () => {
    expect(JSON.stringify(seite(baueHandbuch(angaben(A)), "kapitel-11").bloecke)).toContain("In den nächsten Wochen");
    expect(JSON.stringify(seite(baueHandbuch(angaben(C)), "kapitel-11").bloecke)).toContain("Bis zu deinem Start");
  });

  it("Kapitel 5 warnt bei knappem Eigenkapital und bei „noch nicht“", () => {
    const c = JSON.stringify(seite(baueHandbuch(angaben(C)), "kapitel-5").bloecke);
    expect(c).toContain("Bei Eigenkapital unter 10.000 € rechnen wir vorsichtig mit 0 €");
    const nochNicht = JSON.stringify(seite(baueHandbuch(angaben({ ...C, ueberschuss: "unter_500" })), "kapitel-5").bloecke);
    expect(nochNicht).toContain("passt eine vermietete Wohnung noch nicht");
  });

  it("der nächste Schritt trägt den persönlichen Link, ohne Link einen Ersatztext", () => {
    const mit = seite(baueHandbuch(angaben(A)), "naechster-schritt").bloecke.find((b) => b.typ === "naechsterSchritt");
    expect(mit && mit.typ === "naechsterSchritt" && mit.link).toBe("https://osimmobilien.netlify.app/handbuch/selbstauskunft/x");
    const ohne = seite(baueHandbuch(angaben(A, null)), "naechster-schritt").bloecke.find((b) => b.typ === "naechsterSchritt");
    expect(ohne && ohne.typ === "naechsterSchritt" && ohne.link).toBeNull();
  });

  it("nennt den Partner, wenn es einen gibt", () => {
    const h = baueHandbuch({ ...angaben(A), partner: { name: "Maria Beispiel", buchungslink: "https://osimmobilien.netlify.app/buchen/maria" } });
    expect(JSON.stringify(seite(h, "naechster-schritt").bloecke)).toContain("Termin mit Maria Beispiel");
  });
});

describe("OS-Konzept (seit dem 17.10.2026)", () => {
  it("Kapitel 5 zeigt die OS-Objekte, passende vorn", () => {
    const k5 = seite(baueHandbuch(angaben(A)), "kapitel-5").bloecke.find((b) => b.typ === "objekte");
    expect(k5 && k5.typ === "objekte" && k5.objekte.length).toBe(6);
    expect(k5 && k5.typ === "objekte" && k5.objekte[0].passt).toBe(true);
  });

  it("Kapitel 7 rechnet mit der Hauffstraße 38", () => {
    expect(JSON.stringify(seite(baueHandbuch(angaben(A)), "kapitel-7").bloecke)).toContain("Hauffstraße 38");
  });
});

describe("Was im Handbuch nicht stehen darf", () => {
  const texte = [A, B, C, { ...C, ueberschuss: "unter_500" as const, beruf: "anderes" as const, ziel: "verstehen" as const }].map((p) => alleTexte(baueHandbuch(angaben(p))));

  it("nichts zu § 34c oder § 34i (baut Christian später ein)", () => {
    for (const t of texte) expect(t).not.toMatch(/34\s?[ci]\b|GewO/);
  });

  it("keine Platzhalter und keine unbelegten Zahlen", () => {
    for (const t of texte) {
      expect(t).not.toMatch(/\[(Zahl|Frist|Anzahl|Angabe|Wert)/);
      expect(t).not.toContain("Zahl belegen");
    }
  });

  it("keine Gedankenstriche in sichtbaren Texten", () => {
    for (const t of texte) expect(t).not.toMatch(/[–—]/);
  });

  it("kein Bayern, kein Neubau, keine WG, kein Co-Living, keine Modellwohnung", () => {
    for (const t of texte) expect(t).not.toMatch(/Bayern|Neubau|\bWG\b|Co-Living|Modellwohnung/);
  });

  it("keine Werbewörter der Verbotsliste", () => {
    for (const t of texte) expect(t.toLowerCase()).not.toMatch(/risikofrei|steuerfrei|garantierte rendite|kein risiko/);
  });
});
