/**
 * Runde 3 der Handbuch-Seite (26.09.2026): gemeinsame Veranlagung,
 * englische Fassung, englische Einwilligung, Sicht der Vertriebsleitung.
 */
import { describe, expect, it } from "vitest";
import { baueHandbuch, KAPITEL_LISTE, kapitelListe } from "./inhalt";
import { BRUTTO_REIHENFOLGE, grenzsatzProzent, handbuchAuswertung, steuerTabelle, zveZuBrutto } from "./modell";
import { euro, eur, inSprache, zeichnungAlsSvg } from "./diagramme";
import { FRAGEN_EN, frageIn, rahmenTextIn } from "./fragenSprache";
import { HANDBUCH_SEITEN_TEXTE } from "./seitenTexte";
import { handbuchLeadRumpf, handbuchSaRumpf } from "./leadAbsenden";
import type { Block, Handbuch } from "./bausteine";
import { gedankenstrichFrei, textdateiLuecken } from "@/lib/seitenSprache";
import { handbuchEinwilligungTexte } from "@/lib/leadEinwilligung";
import { istOffenerPoolLead } from "@/lib/leadPool";
import type { KundeData } from "@/lib/kundenStore";
import { FRAGEN, rahmenText, type HandbuchAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";

const PROFIL: HandbuchAntworten = { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" };

function texte(h: Handbuch): string[] {
  const alle: string[] = [h.titel, h.untertitel];
  const durch = (b: Block) => {
    alle.push(JSON.stringify({ ...b, zeichnung: undefined }));
    if (b.typ === "grafik") alle.push(zeichnungAlsSvg(b.zeichnung));
    if (b.typ === "zweispaltig") [...b.links, ...b.rechts].forEach(durch);
  };
  h.seiten.forEach((s) => {
    alle.push(s.kapitel, s.titel);
    s.bloecke.forEach(durch);
  });
  return alle;
}

const bau = (antworten: HandbuchAntworten, sprache: "de" | "en") =>
  baueHandbuch({ antworten, vorname: "Erika", nachname: "Muster", datum: "26.09.2026", saLink: "https://osimmobilien.netlify.app/sa/x", sprache });

describe("gemeinsam veranlagt: Splittingtarif aus dem Rechenkern", () => {
  it("senkt den Grenzsteuersatz und damit die Entlastung, vor Steuer bleibt alles gleich", () => {
    const einzeln = steuerTabelle(240000, false);
    const gemeinsam = steuerTabelle(240000, true);
    einzeln.forEach((z, i) => {
      const g = gemeinsam[i];
      expect(g.zve).toBe(z.zve);
      expect(g.vor).toBeCloseTo(z.vor, 6);
      expect(g.grenzsatz).toBeLessThanOrEqual(z.grenzsatz);
      expect(g.nach).toBeGreaterThanOrEqual(z.nach - 0.01);
    });
    // Bei 100.000 € Brutto ist der Unterschied deutlich.
    expect(gemeinsam[2].grenzsatz).toBeLessThan(einzeln[2].grenzsatz);
  });

  it("gilt im ganzen Handbuch, sobald der Schalter gesetzt ist", () => {
    const a = handbuchAuswertung({ ...PROFIL, gemeinsamVeranlagt: true });
    expect(a.gemeinsam).toBe(true);
    expect(a.grenzsatz).toBe(grenzsatzProzent(zveZuBrutto("80_120"), true));
    expect(a.grenzsatz).toBeLessThan(handbuchAuswertung(PROFIL).grenzsatz);
    const h = texte(bau({ ...PROFIL, gemeinsamVeranlagt: true }, "de")).join(" ");
    expect(h).toContain("Splittingtarif");
    expect(h).toContain("gemeinsames Einkommen");
  });

  it("Vergleichstabelle je Brutto-Spanne, Modellwohnung 240.000 € (steht so im Bericht vom 26.09.2026)", () => {
    const e = steuerTabelle(240000, false);
    const g = steuerTabelle(240000, true);
    const zeilen = BRUTTO_REIHENFOLGE.map((b, i) => ({
      brutto: b,
      satzEinzeln: e[i].grenzsatz,
      satzGemeinsam: g[i].grenzsatz,
      nachEinzeln: Math.round(e[i].nach),
      nachGemeinsam: Math.round(g[i].nach),
    }));
    expect(zeilen).toEqual([
      { brutto: "unter_50", satzEinzeln: 29, satzGemeinsam: 20, nachEinzeln: 176, nachGemeinsam: 202 },
      { brutto: "50_80", satzEinzeln: 35, satzGemeinsam: 26, nachEinzeln: 157, nachGemeinsam: 182 },
      { brutto: "80_120", satzEinzeln: 42, satzGemeinsam: 32, nachEinzeln: 121, nachGemeinsam: 166 },
      { brutto: "ueber_120", satzEinzeln: 42, satzGemeinsam: 38, nachEinzeln: 129, nachGemeinsam: 146 },
    ]);
  });
});

describe("englische Fassung", () => {
  it("die Seitentexte sind in beiden Sprachen vollständig und ohne Gedankenstrich", () => {
    expect(textdateiLuecken(HANDBUCH_SEITEN_TEXTE.de, HANDBUCH_SEITEN_TEXTE.en)).toEqual([]);
  });

  it("jede Frage und jede Antwort hat eine englische Fassung", () => {
    for (const f of FRAGEN) {
      const en = FRAGEN_EN[f.schluessel];
      expect(en.frage).toBeTruthy();
      for (const a of f.antworten) expect(en.antworten[a.id], `${f.schluessel}.${a.id}`).toBeTruthy();
      expect(frageIn("en", f.nr - 1).antworten.map((a) => a.text)).not.toContain("");
    }
  });

  it("das Handbuch hat auf Englisch dieselben Seiten und Bausteine", () => {
    const de = bau(PROFIL, "de");
    const en = bau(PROFIL, "en");
    expect(en.sprache).toBe("en");
    expect(en.seiten.map((s) => s.id)).toEqual(de.seiten.map((s) => s.id));
    expect(en.seiten.map((s) => s.bloecke.map((b) => b.typ))).toEqual(de.seiten.map((s) => s.bloecke.map((b) => b.typ)));
    expect(en.seiten.find((s) => s.id === "kapitel-5")?.kapitel).toBe("Chapter 5");
  });

  it("englische Texte: englische Zahlen, keine deutschen Reste, kein „advisor“, kein Gedankenstrich", () => {
    for (const ziel of ["steuer", "vermoegen", "alter", "verstehen"] as const) {
      const alle = texte(bau({ ...PROFIL, ziel }, "en"));
      const text = alle.join(" ");
      expect(text).not.toMatch(/Kapitel|Eigenkapital|Wohnung|Rahmen|Steuer\b| und /);
      expect(text).not.toMatch(/advisor/i);
      expect(text).toMatch(/€\d{1,3}(,\d{3})+/);
      alle.forEach((t) => expect(gedankenstrichFrei(t), t.slice(0, 80)).toBe(true));
    }
  });

  it("Deutsch bleibt unverändert deutsch", () => {
    const text = texte(bau(PROFIL, "de")).join(" ");
    expect(text).toContain("Kapitel 5");
    expect(text).not.toContain("Chapter");
    expect(KAPITEL_LISTE[4].titel).toBe("Ihr Rahmen");
    expect(kapitelListe("en")[4].titel).toBe("Your budget");
  });

  it("Beträge und Rahmen in der Sprache", () => {
    expect(inSprache("en", () => euro(158000))).toBe("€158,000");
    expect(inSprache("en", () => euro(-354))).toBe("−€354");
    expect(euro(158000)).toBe("158.000 €");
    expect(eur(1234)).toBe("1.234");
    const r = { von: 158000, bis: 222000 };
    expect(rahmenTextIn(r, "en")).toBe("€158,000 to €222,000");
    expect(rahmenTextIn(r, "de")).toBe(rahmenText(r));
    expect(rahmenTextIn({ von: 10000, bis: 10000 }, "de")).toBe(rahmenText({ von: 10000, bis: 10000 }));
  });
});

describe("Einwilligung und Sprache am Lead", () => {
  const kontakt = { vorname: "Erika", nachname: "Muster", email: "e@example.org", telefon: "0151 2345678", einwilligung: true, werbeeinwilligung: true, hp: "" };

  it("englisch mit eigener Fassung, gleicher Aufbau", () => {
    const de = handbuchEinwilligungTexte("de", "handbuch");
    const en = handbuchEinwilligungTexte("en", "handbuch");
    expect(de.version).toBe("2026-09-handbuch-v1");
    expect(en.version).toBe("2026-09-handbuch-v1-en");
    expect(handbuchEinwilligungTexte("en", "sa").version).toBe("2026-09-handbuch-sa-v1-en");
    expect(en.text).toContain("os@os-immobilien.com");
    expect(en.text).not.toMatch(/advisor/i);
  });

  it("der Rumpf trägt Sprache und englischen Nachweis, daraus wird die Kundensprache", () => {
    const r = handbuchLeadRumpf({ kontakt, antworten: PROFIL, dauerMs: 60000, sprache: "en", jetzt: "2026-09-26T10:00:00Z" });
    expect(r.sprache).toBe("en");
    expect((r.dsgvo_consent as { version: string; text: string; werbung?: { text: string } }).version).toBe("2026-09-handbuch-v1-en");
    expect((r.dsgvo_consent as { werbung?: { text: string } }).werbung?.text).toMatch(/^Optional/);
    const sa = handbuchSaRumpf({ kontakt, dauerMs: 60000, sprache: "en" });
    expect((sa.dsgvo_consent as { version: string }).version).toBe("2026-09-handbuch-sa-v1-en");
    // Ohne Angabe wie bisher deutsch.
    expect(handbuchLeadRumpf({ kontakt, antworten: PROFIL, dauerMs: 60000 }).sprache).toBe("de");
  });
});

describe("Lead-Verwaltung: Vertriebsleitung", () => {
  const leitung = { rolle: "vertriebsleiter", benutzerId: "vl-1" };
  const handbuchLead: Partial<KundeData> = { id: "h", leadTyp: "website", quelle: "Konfigurator", email: "a@b.de" };

  it("sieht die herrenlosen Leads der Handbuch-Seite, auch unter der alten Quelle", () => {
    expect(istOffenerPoolLead(handbuchLead, leitung)).toBe(true);
    expect(istOffenerPoolLead({ ...handbuchLead, quelle: "Handbuch-Seite" }, leitung)).toBe(true);
  });

  it("die übrigen herrenlosen Leads bleiben bei Admin, Inhaber und Setterin", () => {
    expect(istOffenerPoolLead({ ...handbuchLead, quelle: "Meta" }, leitung)).toBe(false);
    expect(istOffenerPoolLead({ ...handbuchLead, quelle: "Meta" }, { rolle: "admin", benutzerId: "a" })).toBe(true);
  });

  it("zugewiesene Handbuch-Leads gehören dem Partner, nicht in den Pool", () => {
    expect(istOffenerPoolLead({ ...handbuchLead, zustaendig_id: "vp-1" }, leitung)).toBe(false);
  });
});
