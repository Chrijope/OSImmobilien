import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Querprüfungen über das ganze Projekt.
 *
 * Diese Tests prüfen nicht eine Funktion, sondern ob zwei Stellen im Projekt
 * noch zusammenpassen. Das ist die Sorte Fehler, die kein gewöhnlicher Test
 * findet und die deshalb monatelang liegen bleibt.
 *
 * Anlass war ein toter Knopf in der Signatur-Mail: Die Vorlage erwartete den
 * Link als `signUrl`, die Function schickte ihn als `signatureUrl`. Beide
 * Dateien für sich waren fehlerfrei, die Mail kam an, sah richtig aus, und
 * beim Klicken passierte nichts.
 *
 * Wenn hier etwas rot wird, ist meistens nicht der Test schuld.
 */

const WURZEL = join(__dirname, "..", "..");
const VORLAGEN = join(WURZEL, "supabase", "functions", "_shared", "transactional-email-templates");
const FUNCTIONS = join(WURZEL, "supabase", "functions");

function lies(pfad: string): string {
  try { return readFileSync(pfad, "utf8"); } catch { return ""; }
}

/** Alle index.ts der Edge Functions, eine Ebene tief. */
function functionDateien(): Array<{ name: string; inhalt: string }> {
  if (!existsSync(FUNCTIONS)) return [];
  return readdirSync(FUNCTIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => ({ name: e.name, inhalt: lies(join(FUNCTIONS, e.name, "index.ts")) }))
    .filter((f) => f.inhalt !== "");
}

describe("Mailvorlagen: der Knopf muss ein Ziel bekommen", () => {
  /**
   * Aus jeder Vorlage den Feldnamen ziehen, den ihr Knopf erwartet.
   * Erfasst beide Schreibweisen: `href={x || ''}` und `href={x || y || ''}`.
   */
  const erwartungen = new Map<string, string[]>();
  if (existsSync(VORLAGEN)) {
    for (const datei of readdirSync(VORLAGEN)) {
      if (!datei.endsWith(".tsx") || datei.startsWith("_")) continue;
      const inhalt = lies(join(VORLAGEN, datei));
      const treffer =
        inhalt.match(/href=\{(\w+)\s*\|\|\s*(\w+)\s*\|\|\s*''\}/) ||
        inhalt.match(/href=\{(\w+)\s*\|\|\s*''\}/) ||
        inhalt.match(/href=\{(\w+)\s*\|\|\s*'#'\}/);
      if (treffer) {
        erwartungen.set(datei.replace(/\.tsx$/, ""), treffer.slice(1).filter(Boolean));
      }
    }
  }

  it("findet überhaupt Vorlagen mit Knopf", () => {
    // Schlägt diese Zeile fehl, greift der Ausdruck oben nicht mehr und alle
    // folgenden Prüfungen waeren still wirkungslos.
    expect(erwartungen.size).toBeGreaterThan(5);
  });

  it("jede aufrufende Function schickt den Feldnamen, den die Vorlage erwartet", () => {
    const fehler: string[] = [];

    for (const { name, inhalt } of functionDateien()) {
      const aufrufe = inhalt.matchAll(/templateName:\s*["'](.+?)["']/g);
      for (const aufruf of aufrufe) {
        const vorlage = aufruf[1];
        const felder = erwartungen.get(vorlage);
        if (!felder) continue;

        // Der Block hinter dem Aufruf, großzügig bemessen: templateData folgt
        // in allen Functions unmittelbar auf templateName.
        const block = inhalt.slice(aufruf.index ?? 0, (aufruf.index ?? 0) + 900);
        // Auch die Kurzschreibweise erkennen: `templateData: { name, fillUrl }`
        // schliesst mit einer geschweiften Klammer statt mit einem Komma.
        // Ohne das meldete der Test einen Fehler, wo keiner war.
        const passt = felder.some((f) => new RegExp(`\\b${f}\\s*[,:}\\s]`).test(block));
        if (!passt) {
          fehler.push(
            `${name} ruft "${vorlage}" auf, ohne ${felder.join(" oder ")} zu übergeben. ` +
            `Der Knopf in dieser Mail bekommt dadurch kein Ziel.`,
          );
        }
      }
    }

    expect(fehler, fehler.join("\n")).toEqual([]);
  });

  it("keine Vorlage faellt still auf einen Verweis auf sich selbst zurueck", () => {
    // `href="#"` springt auf dieselbe Seite. Der Knopf sieht normal aus und
    // tut nichts. Genau daran ist der Fehler so lange unbemerkt geblieben.
    const mitRaute: string[] = [];
    if (existsSync(VORLAGEN)) {
      for (const datei of readdirSync(VORLAGEN)) {
        if (!datei.endsWith(".tsx")) continue;
        if (/href=\{[^}]*\|\|\s*'#'\}/.test(lies(join(VORLAGEN, datei)))) mitRaute.push(datei);
      }
    }
    expect(mitRaute, `Diese Vorlagen setzen noch href="#": ${mitRaute.join(", ")}`).toEqual([]);
  });
});

describe("Routen: jede Seite, die geladen wird, muss es geben", () => {
  it("jeder lazyRoute-Import zeigt auf eine vorhandene Datei", () => {
    const app = lies(join(WURZEL, "src", "App.tsx"));
    expect(app).not.toBe("");

    const fehlend: string[] = [];
    for (const treffer of app.matchAll(/import\(["']\.\/(pages\/[\w/-]+)["']\)/g)) {
      const pfad = join(WURZEL, "src", treffer[1]);
      if (!existsSync(`${pfad}.tsx`) && !existsSync(`${pfad}.ts`)) fehlend.push(treffer[1]);
    }
    expect(fehlend, `Diese Seiten fehlen: ${fehlend.join(", ")}`).toEqual([]);
  });
});

describe("Migrationen: der Eingangskorb sagt die Wahrheit", () => {
  /*
   * Der Ordner `migrations-inbox` ist die Merkliste dessen, was in Supabase
   * noch nicht gelaufen ist. Liegt dort eine Datei, die es in der Historie
   * gar nicht gibt, stimmt etwas nicht: Entweder wurde sie nie richtig
   * angelegt, oder jemand hat die Historie aufgeräumt und den Korb vergessen.
   */
  it("jede Datei im Eingangskorb existiert auch in der Historie", () => {
    const korb = join(WURZEL, "supabase", "migrations-inbox");
    const historie = join(WURZEL, "supabase", "migrations");
    if (!existsSync(korb) || !existsSync(historie)) return;

    /*
     * Die Sammeldatei `00_ALLE_ZUSAMMEN.sql` und die Pruefabfragen des Ordners
     * (`96_SIDEBAR_JE_ROLLE`, `97_PROVISIONSSAETZE_PRUEFEN`,
     * `98_FEHLENDE_TABELLEN`, `99_PRUEFUNG`) sind keine Migrationen. Sie
     * aendern nichts, duerfen beliebig oft laufen und haben absichtlich kein
     * Gegenstueck in der Historie, siehe README.md dort.
     *
     * Erkannt werden sie an der zweistelligen Nummer vorn. Echte Migrationen
     * beginnen mit einem vierzehnstelligen Zeitstempel und werden davon nicht
     * getroffen. Vorher stand hier eine Liste einzelner Namen, und jede neue
     * Pruefabfrage machte die Pruefung rot, bis jemand die Liste nachzog.
     */
    const istPruefdatei = (d: string) => /^\d{2}_/.test(d);
    const vorhanden = new Set(readdirSync(historie));
    const verwaist = readdirSync(korb).filter(
      (d) => d.endsWith(".sql") && !istPruefdatei(d) && !vorhanden.has(d),
    );
    expect(verwaist, `Ohne Gegenstück in supabase/migrations: ${verwaist.join(", ")}`).toEqual([]);
  });
});

describe("Edge Functions: kein Griff in den Ordner einer anderen Function", () => {
  /**
   * Lovable nimmt beim Ausrollen nur den Ordner der Function und `_shared`
   * mit. Ein Import aus dem Ordner einer anderen Function klappt lokal mit
   * `deno check`, bricht aber das Ausrollen. Am 23.09.2026 musste Lovable
   * deshalb zwei Dateien aus `get-expose/` nach `_shared/` verschieben, bevor
   * `get-kundenansicht` lief. Gemeinsames gehört nach `_shared`.
   */
  function tsDateien(ordner: string): string[] {
    return readdirSync(ordner, { withFileTypes: true }).flatMap((e) => {
      const pfad = join(ordner, e.name);
      if (e.isDirectory()) return tsDateien(pfad);
      return /\.(ts|tsx)$/.test(e.name) ? [pfad] : [];
    });
  }

  it("jede relative Einbindung bleibt im eigenen Ordner oder in _shared", () => {
    const verstoesse: string[] = [];
    for (const datei of tsDateien(FUNCTIONS)) {
      const eigenerOrdner = datei.slice(FUNCTIONS.length + 1).split("/")[0];
      for (const treffer of lies(datei).matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
        const ziel = join(datei, "..", treffer[1]).slice(FUNCTIONS.length + 1).split("/")[0];
        if (ziel !== eigenerOrdner && ziel !== "_shared") {
          verstoesse.push(`${datei.slice(FUNCTIONS.length + 1)} -> ${treffer[1]}`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });
});
