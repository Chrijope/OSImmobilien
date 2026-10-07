/**
 * Bewerbermails ohne Spam-Auslöser (26.09.2026).
 *
 *   1. Keine Geldversprechen: kein „was du verdienst", kein „Verdienst und
 *      Rechenwege" in Mails. Bogen und CRM behalten ihren Wortlaut.
 *   2. Kein eigener Abmeldelink: Lovable hängt an jede App-Mail selbst einen an.
 *   3. Keine Mail-Links aus window.location.origin: Aus der Lovable-Vorschau
 *      heraus zeigten sie sonst auf die Vorschau-Adresse.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { KENNENLERNEN_PUNKTE } from "../../supabase/functions/_shared/bewerber-kennenlernen-mail";
import { KL_NACHFASS_PUNKTE } from "../../supabase/functions/_shared/bewerber-nachfass";
import {
  MAIL_WORTWAHL,
  mailWortwahl,
  ueberblickFuerMail,
} from "../../supabase/functions/_shared/bewerber-kennenlernen-ueberblick";
import { STARTFAHRPLAN_EINLEITUNG } from "../../supabase/functions/_shared/bewerber-startfahrplan-mail";

const WURZEL = process.cwd();
const lies = (...teile: string[]) => readFileSync(join(WURZEL, ...teile), "utf8");
const GELDWOERTER = /verdien|geld verdienen|bis zur ersten provision/i;

describe("Texte der Bewerbermails", () => {
  it("die Einladung spricht von der Vergütung statt vom Verdienen", () => {
    expect(KENNENLERNEN_PUNKTE.join(" ")).not.toMatch(GELDWOERTER);
    expect(KENNENLERNEN_PUNKTE).toContain("wie die Vergütung aufgebaut ist, und wie lange es bis zur ersten Abrechnung dauert");
  });

  it("die Nachfass-Mail ebenso", () => {
    expect(KL_NACHFASS_PUNKTE.join(" ")).not.toMatch(GELDWOERTER);
    expect(KL_NACHFASS_PUNKTE.join(" ")).toContain("wie die Vergütung aufgebaut ist");
  });

  it("die Terminmails nennen das Thema „Vergütung und Rechenwege\"", () => {
    const termin = lies("supabase", "functions", "send-bewerber-termin", "index.ts");
    const labels = termin.slice(termin.indexOf("const THEMEN_LABELS"), termin.indexOf("};", termin.indexOf("const THEMEN_LABELS")));
    expect(labels).toContain('verdienst: "Vergütung und Rechenwege"');
    expect(labels).not.toMatch(/: "Verdienst/);
  });

  it("die Zusammenfassung ersetzt die Geldwörter erst in der Mail", () => {
    // Im Überblick selbst bleibt der Wortlaut des Bogens (der Vergleich mit
    // dem CRM steht in kennenlernenUeberblickMail.test.ts).
    const gruppen = ueberblickFuerMail({ weg: "weg1", themen: ["verdienst"] });
    const roh = JSON.stringify(gruppen);
    expect(roh).toContain("Verdienst und Rechenwege");
    // In der Mail wird jede Zeile durch mailWortwahl geschickt.
    const inDerMail = gruppen.flatMap((g) => g.zeilen.flatMap((z) => [mailWortwahl(z.label), mailWortwahl(z.wert)])).join(" ");
    expect(inDerMail).not.toMatch(GELDWOERTER);
    expect(inDerMail).toContain("Vergütung und Rechenwege");
    for (const [, neu] of MAIL_WORTWAHL) expect(neu).not.toMatch(/verdien|provision/i);
    expect(mailWortwahl("Was ich verdienen kann")).toBe("Die Vergütung");
    expect(mailWortwahl("Verständnis Provision")).not.toMatch(/Provision/);
    const vorlage = lies("supabase", "functions", "_shared", "transactional-email-templates",
      "bewerber-kennenlernen-zusammenfassung.tsx");
    expect(vorlage).toContain("[mailWortwahl(z.label), mailWortwahl(z.wert)]");
  });

  it("der Startfahrplan kündigt den Weg „bis zur Abrechnung\" an", () => {
    expect(STARTFAHRPLAN_EINLEITUNG).toContain("bis zur Abrechnung");
    expect(STARTFAHRPLAN_EINLEITUNG).not.toMatch(/Provision/);
  });

  it("keine Vorlage an Bewerber enthält Geldwörter im Text", () => {
    const ordner = join(WURZEL, "supabase", "functions", "_shared", "transactional-email-templates");
    for (const datei of readdirSync(ordner).filter((d) => d.startsWith("bewerber-") && d.endsWith(".tsx"))) {
      // Kommentare zählen nicht, nur was in der Mail stehen kann.
      const ohneKommentare = readFileSync(join(ordner, datei), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(ohneKommentare, datei).not.toMatch(GELDWOERTER);
    }
  });
});

describe("Abmeldelink", () => {
  it("das Layout setzt keinen eigenen Abmeldelink mehr, Lovable hängt ihn an", () => {
    const layout = lies("supabase", "functions", "_shared", "transactional-email-templates", "_layout.tsx");
    const ohneKommentare = layout.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(ohneKommentare).not.toContain("{{unsubscribe_url}}");
    expect(ohneKommentare).not.toContain("fuss.abmelden");
    // Impressum und Datenschutz bleiben im Fuß.
    expect(ohneKommentare).toContain("fuss.impressum");
    expect(ohneKommentare).toContain("fuss.datenschutz");
    expect(ohneKommentare).toContain("MARKE.anschrift");
  });
});

describe("Mail-Links im Browser-Code", () => {
  /** Alle Quelltexte unter src, ohne Tests. */
  function quelltexte(ordner = join(WURZEL, "src")): string[] {
    return readdirSync(ordner).flatMap((name) => {
      const pfad = join(ordner, name);
      if (statSync(pfad).isDirectory()) return quelltexte(pfad);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [pfad] : [];
    });
  }

  it("wer eine Mail verschickt, baut ihre Links nicht aus window.location.origin", () => {
    const verstoesse = quelltexte()
      .filter((pfad) => {
        const text = readFileSync(pfad, "utf8");
        return text.includes("send-transactional-email") && text.includes("window.location.origin");
      })
      .map((pfad) => relative(WURZEL, pfad));
    expect(verstoesse).toEqual([]);
  });

  it("die zuvor betroffenen Stellen nutzen die feste Adresse", () => {
    // AftersalesBeratungCard baut seit 29.09.2026 keinen Link mehr, das macht
    // die Function signatur-link-erinnern mit der festen Portaladresse.
    for (const datei of [
      "src/components/chat/ChatVerlauf.tsx",
      "src/pages/KundenDetail.tsx",
      "src/pages/TippgeberPortal.tsx",
      "src/components/kunde/NotarterminAuswahlCard.tsx",
      "src/components/bewerbung/VertragsTab.tsx",
      "src/components/bewerbung/RechnungsTab.tsx",
    ]) {
      const text = lies(datei);
      expect(text, datei).not.toContain("window.location.origin");
      expect(text, datei).toContain('from "@/lib/oeffentlicheBasis"');
    }
  });
});
