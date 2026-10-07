import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ABSCHLUSS_TEXTE,
  DAUER_KURZ_MINUTEN,
  DAUER_LANG_MINUTEN,
  GESPRAECH_NAME,
  GESPRAECH_NAME_DATIV,
  GESPRAECH_NAME_KLEIN,
  gespraechsDauerMinuten,
} from "./bewerberKennenlernen";
import {
  KERNBAUSTEINE,
  STRECKEN,
  folienFolge,
  tagesordnung,
  videocallFolien,
  dauerMinuten,
  type ModulId,
} from "./bewerberVideocall";
import {
  DAUER_KURZ_MINUTEN as MAIL_KURZ,
  DAUER_LANG_MINUTEN as MAIL_LANG,
} from "../../supabase/functions/_shared/bewerber-kennenlernen-ueberblick";
import {
  GESPRAECH_NAME as MAIL_GESPRAECH_NAME,
  GESPRAECH_NAME_KLEIN as MAIL_GESPRAECH_NAME_KLEIN,
} from "../../supabase/functions/_shared/bewerber-termin-mail";
import { KOOPERATION_GESPRAECH_NAME } from "../../supabase/functions/_shared/bewerber-kooperationsgespraech-mail";

/**
 * Der Wächter über die Umbenennung vom 08.09.2026.
 *
 * Drei Änderungen an einem Tag, und alle drei lassen sich nur am ganzen
 * Quelltext prüfen, nicht an einer einzelnen Funktion:
 *
 *   1. Aus dem „Kooperationsgespräch" ist das „Persönliche Gespräch" geworden.
 *      Der alte Name stand an rund 130 Stellen in knapp fünfzig Dateien, die
 *      meisten davon ausgeschrieben. Ein Test über die Dateien ist hier das
 *      richtige Mittel: Er findet auch die Stelle, an der niemand sucht.
 *   2. Die Arbeitsprobe ist aus dem Gespräch heraus, auf allen fünf Strecken.
 *   3. Die Dauer ist von 45 auf 35 und von 30 auf 25 Minuten gesunken.
 *
 * ## Was der erste Test bewusst nicht prüft
 *
 * Die Schreibweise **ohne** Umlaut, also `kooperationsgespraech`. Sie steht
 * weiter in Dateinamen, Bezeichnern, im Pfad der Buchungsstrecke
 * (`/kooperationsgespraech/:token`) und im Schlüssel der Mailvorlage. Der Pfad
 * steht in bereits verschickten Einladungen, der Vorlagenschlüssel in der
 * Datenbank; beides umzubenennen hieße, verschickte Mails ins Leere laufen zu
 * lassen. Sichtbar ist keine dieser Stellen. Geprüft wird deshalb genau das,
 * was ein Bewerber oder eine HR-Managerin liest.
 *
 * `supabase/migrations/` steht aus einem anderen Grund draußen: Eine Migration
 * muss den alten Wert nennen dürfen, sie zieht ja gerade von ihm weg.
 */

// Vitest läuft im Projektstamm. `import.meta.url` taugt hier nicht: Vite
// liefert darin einen eigenen Präfix, mit dem `readdirSync` nichts anfangen
// kann.
const WURZEL = process.cwd();
const ORDNER = ["src", "supabase/functions"];
const ENDUNGEN = [".ts", ".tsx", ".sql"];

/** Diese Datei selbst nennt den alten Namen, sie erklärt ihn ja. */
const AUSNAHMEN = ["src/lib/persoenlichesGespraech.test.ts"];

function alleDateien(ordner: string, gesammelt: string[] = []): string[] {
  for (const eintrag of readdirSync(join(WURZEL, ordner))) {
    if (eintrag === "node_modules" || eintrag.startsWith(".")) continue;
    const relativ = `${ordner}/${eintrag}`;
    if (statSync(join(WURZEL, relativ)).isDirectory()) alleDateien(relativ, gesammelt);
    else if (ENDUNGEN.some((e) => eintrag.endsWith(e))) gesammelt.push(relativ);
  }
  return gesammelt;
}

const DATEIEN = ORDNER.flatMap((o) => alleDateien(o)).filter((d) => !AUSNAHMEN.includes(d));

describe("Der alte Name steht nirgends mehr", () => {
  it("findet den alten Namen in keiner Datei mehr", () => {
    const treffer = DATEIEN.filter((d) =>
      readFileSync(join(WURZEL, d), "utf-8").includes("Kooperationsgespräch"),
    );
    expect(treffer).toEqual([]);
  });

  it("nennt den neuen Namen in drei Formen, damit die Beugung stimmt", () => {
    expect(GESPRAECH_NAME).toBe("Persönliches Gespräch");
    expect(GESPRAECH_NAME_KLEIN).toBe("persönliches Gespräch");
    expect(GESPRAECH_NAME_DATIV).toBe("persönlichen Gespräch");
  });

  it("sagt in den Edge Functions dasselbe wie im CRM", () => {
    // Die Functions können `src/` nicht importieren, deshalb steht der Name
    // dort ein zweites Mal. Auseinanderlaufen darf er nicht.
    expect(MAIL_GESPRAECH_NAME).toBe(GESPRAECH_NAME);
    expect(MAIL_GESPRAECH_NAME_KLEIN).toBe(GESPRAECH_NAME_KLEIN);
    expect(KOOPERATION_GESPRAECH_NAME).toBe(GESPRAECH_NAME);
  });
});

describe("Die letzte Ansicht des Bogens", () => {
  it("nennt weder eine Dauer noch eine Gastgeberin", () => {
    const seite = readFileSync(join(WURZEL, "src/pages/BewerberKennenlernen.tsx"), "utf-8");
    // Die Vorschau auf den Abschluss reicht von ihrer Überschrift bis zum
    // Ende der Funktion.
    const von = seite.indexOf("function Abschlussvorschau(");
    const bis = seite.indexOf("// ─────────────────── Nach dem Absenden", von);
    const block = seite.slice(von, bis);
    expect(von).toBeGreaterThan(-1);
    expect(block).not.toContain("gespraechsDauerMinuten");
    expect(block).not.toContain("HR_ANSPRECHPARTNERIN");
    expect(block).not.toMatch(/Minuten/);
  });

  it("überschreibt die Liste mit Das haben wir uns notiert", () => {
    expect(ABSCHLUSS_TEXTE.notizenTitel).toBe("Das haben wir uns notiert");
  });

  it("sagt vor dem Absenden etwas anderes als danach", () => {
    // Beide Texte gehören zusammen, aber sie dürfen nicht wortgleich sein:
    // Der eine kündigt an, der andere bestätigt.
    const vorher = `${ABSCHLUSS_TEXTE.vorAbsenden} ${ABSCHLUSS_TEXTE.nachNotizen}`;
    const nachher = `${ABSCHLUSS_TEXTE.text} ${ABSCHLUSS_TEXTE.weiter}`;
    expect(vorher).not.toBe(nachher);
    // Beide nennen das Gespräch und beide Ausgänge.
    for (const text of [vorher, nachher]) {
      expect(text).toMatch(/persönliche[nms]? Gespräch/);
      expect(text).toMatch(/nicht passt/);
    }
    // Und keiner von beiden nennt eine Dauer.
    expect(`${vorher} ${nachher}`).not.toMatch(/\d+ Minuten/);
  });
});

describe("Die Arbeitsprobe ist aus dem Gespräch heraus", () => {
  it("kommt auf keiner der fünf Strecken vor, in keiner Fassung", () => {
    for (const s of STRECKEN) {
      for (const zusatz of [[] as ModulId[], s.beiBedarf]) {
        const alles = JSON.stringify([
          folienFolge(s.weg, zusatz),
          videocallFolien({ weg: s.weg }, zusatz),
          tagesordnung(s.weg, zusatz),
        ]);
        expect(alles).not.toMatch(/[Aa]rbeitsprobe/);
        expect(alles).not.toMatch(/Vorlauf/);
      }
    }
  });

  it("steht in keinem Kernbaustein und in keiner Strecke mehr", () => {
    expect(KERNBAUSTEINE.map((b) => b.id)).not.toContain("arbeitsprobe");
    expect(JSON.stringify(STRECKEN)).not.toContain("vorlauf");
  });

  it("hat keine Konstante und keinen Sprechtext hinterlassen", () => {
    const quelle = readFileSync(join(WURZEL, "src/lib/bewerberVideocall.ts"), "utf-8");
    expect(quelle).not.toContain("ARBEITSPROBE");
    expect(quelle).not.toContain("folieArbeitsprobe");
    // Die Situation der Aufgabe, an ihrem auffälligsten Satzteil erkannt.
    expect(quelle).not.toContain("Rendite du garantierst");
  });
});

describe("Die Dauer sagt überall 35 beziehungsweise 25 Minuten", () => {
  it("im Bogen", () => {
    expect(DAUER_LANG_MINUTEN).toBe(35);
    expect(DAUER_KURZ_MINUTEN).toBe(25);
    expect(gespraechsDauerMinuten({ themen: ["verdienst"] })).toBe(35);
    expect(gespraechsDauerMinuten({})).toBe(25);
  });

  it("in der Überblicksmail, die dieselbe Regel zweitfassen muss", () => {
    expect(MAIL_LANG).toBe(DAUER_LANG_MINUTEN);
    expect(MAIL_KURZ).toBe(DAUER_KURZ_MINUTEN);
  });

  it("in der Datenbank, über die noch offene Migration", () => {
    const migration = readFileSync(
      join(WURZEL, "supabase/migrations/20260908160000_persoenliches_gespraech.sql"),
      "utf-8",
    );
    expect(migration).toContain("SET dauer_minuten = 35");
    expect(migration).toContain("LEAST(_lang, 25)");
    // Sie muss von beiden bisherigen Namen aus ziehen.
    expect(migration).toContain("IN ('Kooperationsgespräch', 'Bewerbergespräch')");
    // Und sie darf gebuchte Termine nicht anfassen.
    expect(migration).not.toMatch(/UPDATE public\.buchungen[\s\S]{0,200}SET dauer_minuten/);
  });

  it("im Videocall, dessen längste Strecke die gebuchte Zeit nicht sprengt", () => {
    // Der Regelfall, also ohne im Gespräch zugeschaltete Module, muss in die
    // gebuchte Länge passen. Wer im Gespräch nachfragt, verlängert bewusst.
    for (const s of STRECKEN) {
      expect(dauerMinuten(s.weg)).toBeLessThanOrEqual(DAUER_LANG_MINUTEN + 1);
    }
  });

  it("in der Agenda des Warteraums, die sich auf die lange Fassung summiert", async () => {
    const { STANDARD_AGENDA } = await import("./videoraumAgenda");
    const summe = STANDARD_AGENDA.bewerbergespraech.reduce((n, p) => n + p.minuten, 0);
    expect(summe).toBe(DAUER_LANG_MINUTEN);
  });
});
