/**
 * Die Handbuch-Strecke siezt (Entscheidung Christian vom 27.09.2026).
 *
 * Ausdrückliche Ausnahme vom Du-Standard des Projekts (15.09.2026), wie die
 * Gruppe F: Landingpage, Konfigurator, Ergebnisseite, offene Selbstauskunft,
 * PDF-Handbuch und die Zustellmail an den Interessenten. Nur die deutsche
 * Fassung, Englisch bleibt, wie es ist. Partnerseitiges (Verwaltungsseite
 * /handbuch-seite, Lead-Verwaltung, Mails an Partner) duzt weiter.
 *
 * Geprüft wird, was ein Interessent tatsächlich liest: die Werte der
 * Textdateien, das fertig gebaute Handbuch für jede Antwortkombination, die
 * Fragen, die Einwilligungs- und Fehlermeldungen. Die Zustellmail bewacht
 * `src/lib/mailAnredeRegeln.test.ts`, neben den Mails der Gruppe F.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { baueHandbuch } from "./inhalt";
import { zeichnungAlsSvg } from "./diagramme";
import { HANDBUCH_SEITEN_TEXTE } from "./seitenTexte";
import { FIRMEN_ANSPRECHPARTNER, MOREIMMO_WARUM, MOREIMMO_WERTE } from "./firma";
import type { Block, Handbuch } from "./bausteine";
import { handbuchEinwilligungTexte } from "@/lib/leadEinwilligung";
import { leadFehlermeldung, leadNetzfehlerMeldung } from "@/lib/leadFehlermeldung";
import {
  FRAGEN,
  UEBERSCHUSS_RECHENHILFE,
  type HandbuchAntworten,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";

/** Du-Pronomen, auch das „ihr/euer“ an ein Paar, und die typischen Du-Imperative. */
const DU = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|euch|euer|eure|euren|eurem|eurer)\b/i;
const DU_IMPERATIV = /\b(Lies|Nimm|Gib|Prüf|Prüfe|Schau|Fordere|Beantworte|Rechne|Melde|Buche|Antworte|Versuch|Versuche|Stell|Sieh|Zieh|Bestätige)\b/;

function duStellen(text: string): string[] {
  return [text.match(DU)?.[0], text.match(DU_IMPERATIV)?.[0]].filter((x): x is string => Boolean(x));
}

/** Alle Zeichenketten eines Textobjekts; Funktionen mit Beispielwerten aufgerufen. */
function werte(x: unknown, pfad = ""): Array<[string, string]> {
  if (typeof x === "string") return [[pfad, x]];
  if (typeof x === "function") return werte((x as (...a: unknown[]) => unknown)("Christian", "2", "3"), pfad);
  if (Array.isArray(x)) return x.flatMap((v, i) => werte(v, `${pfad}[${i}]`));
  if (x && typeof x === "object") return Object.entries(x).flatMap(([k, v]) => werte(v, pfad ? `${pfad}.${k}` : k));
  return [];
}

function texte(h: Handbuch): string[] {
  const alle: string[] = [h.titel, h.untertitel];
  const durch = (b: Block) => {
    // `ton` ist ein Code-Schlüssel („dich“ heißt der hervorgehobene Kasten), kein Text.
    alle.push(JSON.stringify({ ...b, zeichnung: undefined, ton: undefined }));
    if (b.typ === "grafik") alle.push(zeichnungAlsSvg(b.zeichnung));
    if (b.typ === "zweispaltig") [...b.links, ...b.rechts].forEach(durch);
  };
  h.seiten.forEach((s) => {
    alle.push(s.kapitel, s.titel);
    s.bloecke.forEach(durch);
  });
  return alle;
}

describe("Handbuch-Strecke siezt (Ausnahme vom 27.09.2026)", () => {
  it("Seitentexte: Landingpage, Konfigurator, Ergebnis, offene Selbstauskunft", () => {
    for (const [pfad, text] of werte(HANDBUCH_SEITEN_TEXTE.de)) {
      expect(duStellen(text), `${pfad}: „${text}“`).toEqual([]);
    }
  });

  it("das Handbuch (online und PDF) für jedes Ziel, jeden Beruf, jeden Start und jeden Ausgang", () => {
    const ziele = ["steuer", "vermoegen", "alter", "verstehen"] as const;
    const berufe = ["angestellt", "beamter", "selbststaendig", "anderes"] as const;
    const starts = ["sofort", "drei_monate", "spaeter", "informieren"] as const;
    const lagen = [
      { ueberschuss: "1000_1500", eigenkapital: "30_60" },
      { ueberschuss: "unbekannt", eigenkapital: "10_30" },
      { ueberschuss: "unter_500", eigenkapital: "unter_10" },
    ] as const;
    const partner = [null, { name: "Christian Kurz", email: "c@example.org" }, { name: "Christian Kurz", buchungslink: "https://example.org" }];
    for (let i = 0; i < ziele.length; i++) {
      for (const lage of lagen) {
        for (const gemeinsamVeranlagt of [false, true]) {
          const antworten: HandbuchAntworten = {
            ziel: ziele[i],
            beruf: berufe[i],
            brutto: "80_120",
            start: starts[i],
            gemeinsamVeranlagt,
            ...lage,
          };
          const h = baueHandbuch({
            antworten,
            vorname: "Erika",
            nachname: "Muster",
            datum: "27.09.2026",
            saLink: i % 2 ? null : "https://osimmobilien.netlify.app/sa/x",
            partner: partner[i % partner.length],
            sprache: "de",
          });
          for (const text of texte(h)) {
            expect(duStellen(text), `${ziele[i]}: „${text.slice(0, 160)}“`).toEqual([]);
          }
        }
      }
    }
  });

  it("die sechs Fragen, ihre Begründungen und die Rechenhilfe", () => {
    for (const f of FRAGEN) {
      expect(duStellen(f.frage), f.frage).toEqual([]);
      expect(duStellen(f.warum), f.warum).toEqual([]);
    }
    for (const zeile of UEBERSCHUSS_RECHENHILFE) expect(duStellen(zeile), zeile).toEqual([]);
  });

  it("„Wer dahinter steht“", () => {
    for (const text of [FIRMEN_ANSPRECHPARTNER.zitat, ...MOREIMMO_WARUM, MOREIMMO_WERTE]) {
      expect(duStellen(text), text).toEqual([]);
    }
  });

  it("Einwilligung und Fehlermeldungen beider Formulare", () => {
    for (const art of ["handbuch", "sa"] as const) {
      const t = handbuchEinwilligungTexte("de", art);
      for (const text of [t.text, t.kurz, t.fehlt, t.werbung]) expect(duStellen(text), text).toEqual([]);
    }
    for (const status of [400, 401, 429, 500, undefined]) {
      const text = leadFehlermeldung(status, 3600, "de", "sie");
      expect(duStellen(text), text).toEqual([]);
    }
    expect(duStellen(leadNetzfehlerMeldung("de", "sie"))).toEqual([]);
  });

  it("die übrigen Formulare duzen weiter, ihre Meldungen bleiben zeichengleich", () => {
    expect(leadFehlermeldung(500)).toContain("Bitte versuch es");
    expect(leadFehlermeldung(500, null, "de", "sie")).toContain("Bitte versuchen Sie es");
    expect(leadNetzfehlerMeldung()).toContain("Bitte prüfe deine Internetverbindung");
  });

  it("fest verdrahtete Texte in den öffentlichen Komponenten der Strecke", () => {
    // Texte, die nicht aus den Textdateien kommen, sondern im Code stehen:
    // Zeichenketten und JSX-Text, ohne Kommentare. Die partnerseitigen
    // Dateien (Verwaltung, Lead-Tabelle) duzen und sind ausgenommen.
    const wurzel = join(__dirname, "..", "..");
    const dateien = [
      ...readdirSync(join(wurzel, "components", "handbuch")).map((d) => join("components", "handbuch", d)),
      ...readdirSync(join(wurzel, "pages")).filter((d) => d.startsWith("Handbuch")).map((d) => join("pages", d)),
    ].filter((d) => d.endsWith(".tsx") && !d.includes(".test.") && !/HandbuchSeiteVerwaltung|HandbuchLeadTabelle/.test(d));
    expect(dateien.length).toBeGreaterThan(5);
    for (const datei of dateien) {
      const quelle = readFileSync(join(wurzel, datei), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const kandidaten = [
        ...quelle.matchAll(/"([^"\n]{3,})"/g),
        ...quelle.matchAll(/`([^`]{3,})`/g),
        ...quelle.matchAll(/>([^<>{}\n]*[A-Za-zÄÖÜäöüß][^<>{}\n]*)</g),
      ].map((m) => m[1]);
      for (const text of kandidaten) expect(duStellen(text), `${datei}: „${text.slice(0, 120)}“`).toEqual([]);
    }
  });

  it("die Vorschau des Ansprechpartners in der Verwaltung beschriftet wie die öffentliche Seite", () => {
    // Die Verwaltung duzt den Partner, die Karte zeigt aber, was Interessenten sehen.
    const quelle = readFileSync(join(__dirname, "..", "..", "pages", "HandbuchSeiteVerwaltung.tsx"), "utf8");
    expect(quelle).not.toContain("Dein Immobilienberater");
    expect(quelle).toContain("HANDBUCH_SEITEN_TEXTE.de.landing.wer.deinBerater");
    expect(HANDBUCH_SEITEN_TEXTE.de.landing.wer.deinBerater).toBe("Ihr Immobilienberater");
  });

  it("die Meldungen des Servers auf dem Handbuch-Weg", () => {
    const quelle = readFileSync(join(__dirname, "..", "..", "..", "supabase", "functions", "submit-lead", "index.ts"), "utf8");
    for (const satz of [
      "Bitte bestätigen Sie die Einwilligung.",
      "Bitte geben Sie eine gültige Handynummer an.",
      "Bitte geben Sie Ihren Vor- und Nachnamen ohne Links an.",
      "Bitte versuchen Sie es später noch einmal.",
    ]) {
      expect(quelle).toContain(satz);
    }
  });
});
