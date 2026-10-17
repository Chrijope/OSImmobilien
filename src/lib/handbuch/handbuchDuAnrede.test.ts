/**
 * Die Handbuch-Strecke duzt (seit dem 17.10.2026, OS-Umbau mit Freigabe
 * Christian; vom 27.09. bis 16.10.2026 siezte sie als Ausnahme).
 *
 * Geprüft wird, was ein Interessent tatsächlich liest: die Werte der
 * Textdateien, das fertig gebaute Handbuch für jede Antwortkombination, die
 * Fragen, die Einwilligungs- und Fehlermeldungen. Die Zustellmail bewacht
 * `src/lib/mailAnredeRegeln.test.ts`. Englisch bleibt „you“.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { baueHandbuch } from "./inhalt";
import { zeichnungAlsSvg } from "./diagramme";
import { HANDBUCH_SEITEN_TEXTE } from "./seitenTexte";
import { FIRMEN_ANSPRECHPARTNER, OS_IMMOBILIEN_WARUM, OS_IMMOBILIEN_WERTE } from "./firma";
import type { Block, Handbuch } from "./bausteine";
import { handbuchEinwilligungTexte } from "@/lib/leadEinwilligung";
import { leadFehlermeldung, leadNetzfehlerMeldung } from "@/lib/leadFehlermeldung";
import {
  FRAGEN,
  UEBERSCHUSS_RECHENHILFE,
  type HandbuchAntworten,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";

/**
 * Sie-Formen: „Ihr/Ihnen …“ immer, „Sie“ nur mitten im Satz. Am Satzanfang
 * kann „Sie“ auch eine Sache meinen („Die Selbstauskunft … Sie verpflichtet
 * dich zu nichts.“), das zählt nicht.
 */
const IHR = /\b(Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\b/;
const SIE_IM_SATZ = /(?<![.!?:„"]\s*|^\s*)\bSie\b/;

function sieStellen(text: string): string[] {
  return [text.match(IHR)?.[0], text.match(SIE_IM_SATZ)?.[0]].filter((x): x is string => Boolean(x));
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

describe("Handbuch-Strecke duzt (seit dem 17.10.2026)", () => {
  it("Seitentexte: Landingpage, Konfigurator, Ergebnis, offene Selbstauskunft", () => {
    for (const [pfad, text] of werte(HANDBUCH_SEITEN_TEXTE.de)) {
      expect(sieStellen(text), `${pfad}: „${text}“`).toEqual([]);
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
    const partner = [null, { name: "Oliver Skowrnowski", email: "c@example.org" }, { name: "Oliver Skowrnowski", buchungslink: "https://example.org" }];
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
            expect(sieStellen(text), `${ziele[i]}: „${text.slice(0, 160)}“`).toEqual([]);
          }
        }
      }
    }
  });

  it("die sechs Fragen, ihre Begründungen und die Rechenhilfe", () => {
    for (const f of FRAGEN) {
      expect(sieStellen(f.frage), f.frage).toEqual([]);
      expect(sieStellen(f.warum), f.warum).toEqual([]);
    }
    for (const zeile of UEBERSCHUSS_RECHENHILFE) expect(sieStellen(zeile), zeile).toEqual([]);
  });

  it("„Wer dahinter steht“", () => {
    for (const text of [FIRMEN_ANSPRECHPARTNER.zitat, ...OS_IMMOBILIEN_WARUM, OS_IMMOBILIEN_WERTE]) {
      expect(sieStellen(text), text).toEqual([]);
    }
  });

  it("Einwilligung und Fehlermeldungen beider Formulare", () => {
    for (const art of ["handbuch", "sa"] as const) {
      const t = handbuchEinwilligungTexte("de", art);
      for (const text of [t.text, t.kurz, t.fehlt, t.werbung]) expect(sieStellen(text), text).toEqual([]);
    }
    for (const status of [400, 401, 429, 500, undefined]) {
      const text = leadFehlermeldung(status, 3600, "de", "du");
      expect(sieStellen(text), text).toEqual([]);
    }
    expect(sieStellen(leadNetzfehlerMeldung("de", "du"))).toEqual([]);
    const absenden = readFileSync(join(__dirname, "leadAbsenden.ts"), "utf8");
    expect(absenden).not.toContain('"sie"');
  });

  it("fest verdrahtete Texte in den öffentlichen Komponenten der Strecke", () => {
    // Texte, die nicht aus den Textdateien kommen, sondern im Code stehen:
    // Zeichenketten und JSX-Text, ohne Kommentare.
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
      for (const text of kandidaten) expect(sieStellen(text), `${datei}: „${text.slice(0, 120)}“`).toEqual([]);
    }
  });

  it("die Meldungen des Servers auf dem Handbuch-Weg", () => {
    const quelle = readFileSync(join(__dirname, "..", "..", "..", "supabase", "functions", "submit-lead", "index.ts"), "utf8");
    for (const satz of [
      "Bitte bestätige die Einwilligung.",
      "Bitte gib eine gültige Handynummer an.",
      "Bitte gib deinen Vor- und Nachnamen ohne Links an.",
      "Bitte versuch es später noch einmal.",
    ]) {
      expect(quelle).toContain(satz);
    }
  });
});
