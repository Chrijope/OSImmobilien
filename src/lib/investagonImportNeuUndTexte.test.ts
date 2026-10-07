import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  erstelltAmNachImport,
  importMetaZusammenfuehren,
  INVESTAGON_ERSTELLT_META_SCHLUESSEL,
  projektErstelltAm,
} from "../../supabase/functions/investagon-import/mapping";

/**
 * Drei Verträge des Investagon-Imports, am Quelltext geprüft. Der dritte,
 * das Anlagedatum aus Investagon, steht am Ende dieser Datei.
 *
 * 1. `meta.investagonNeuAngelegtAm` trägt den Zeitpunkt, zu dem der Import ein
 *    Objekt angelegt hat. Daran hängt das Kennzeichen „Neu“ in der
 *    Objektübersicht (`src/lib/objekteNeu.ts`). Gesetzt wird er nur beim
 *    ersten Anlegen, nie beim Abgleich eines vorhandenen Objekts und nie bei
 *    der Übernahme über eine Zweitkennung. Sonst wäre jedes Objekt nach jedem
 *    Viertelstundenlauf wieder „neu“.
 *
 * 2. Am Ende eines echten Laufs stößt der Import den Sammelmodus von
 *    `objekt-texte-ki` an, damit neue Objekte schnell Beschreibung, Standort
 *    und Sanierungen tragen. Ein Trockenlauf stößt nichts an, und der Import
 *    darf an einem Fehler dabei nie scheitern.
 *
 * Die Function läuft in Deno und lässt sich hier nicht ausführen. Geprüft wird
 * deshalb am Quelltext, so wie in
 * `src/components/objekte/InvestagonImportNieLoeschen.test.ts`.
 */

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");
const quelle = lies("supabase/functions/investagon-import/index.ts");

/** Der Quelltext ohne Kommentare, damit ein Satz im Kommentar nichts vortäuscht. */
const code = quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("Die Markierung neu angelegter Objekte", () => {
  const vorkommen = [...code.matchAll(/investagonNeuAngelegtAm/g)];

  it("steht genau einmal im Code", () => {
    expect(vorkommen).toHaveLength(1);
  });

  it("steht im Zweig, der ein Objekt neu einfügt, und nirgends sonst", () => {
    const stelle = vorkommen[0].index!;
    const einfuegen = code.lastIndexOf('db.from("objekte").insert(', stelle);
    const abgleich = code.lastIndexOf('.update({ ...updateFelder, meta: zusammengefuehrt })', stelle);
    expect(einfuegen).toBeGreaterThan(-1);
    // Das Einfügen liegt zwischen dem Abgleich und der Markierung, und
    // zwischen Einfügen und Markierung schließt kein anderer Aufruf ab.
    expect(einfuegen).toBeGreaterThan(abgleich);
    expect(code.slice(einfuegen, stelle)).not.toContain(".select(");
    expect(code.slice(stelle, stelle + 80)).toMatch(/investagonNeuAngelegtAm:\s*new Date\(\)\.toISOString\(\)/);
  });

  it("gehört nicht zu den Feldern, die jeder Abgleich schreibt", () => {
    const felder = code.slice(code.indexOf("const felder = {"), code.indexOf("type Bestandstreffer"));
    expect(felder.length).toBeGreaterThan(100);
    expect(felder).not.toContain("investagonNeuAngelegtAm");
  });

  it("bleibt beim Abgleich stehen, weil das vorhandene meta zuerst kommt", () => {
    // Nur so überlebt der Zeitpunkt jeden späteren Lauf: Das Zusammenführen
    // legt die Importschlüssel über das Vorhandene, und dieser ist keiner davon.
    // Seit dem 23.09.2026 über `importMetaZusammenfuehren`, das zusätzlich
    // eine leere Anlageklasse nicht über eine gefüllte schreibt.
    expect(code).toMatch(/const zusammengefuehrt\s*=\s*importMetaZusammenfuehren\(\s*vor\.meta,\s*felder\.meta/);
    expect(importMetaZusammenfuehren(
      { investagonNeuAngelegtAm: "2026-09-20T08:00:00.000Z" },
      { investagonSlug: "p-1", importStand: "2026-09-23" },
    ).investagonNeuAngelegtAm).toBe("2026-09-20T08:00:00.000Z");
    expect(code).not.toMatch(/delete\s+[\w.]*\[?["']?investagonNeuAngelegtAm/);
  });
});

describe("Der Anstoß für die Objekttexte", () => {
  it("ruft den Sammelmodus mit dem Dienstschlüssel und begrenzter Zahl", () => {
    const anstoss = code.slice(code.indexOf("function objektTexteAnstossen()"));
    expect(anstoss).toContain("/functions/v1/objekt-texte-ki");
    expect(anstoss).toContain("Authorization: `Bearer ${SERVICE_ROLE}`");
    expect(anstoss).toMatch(/sammel:\s*true,\s*limit:\s*OBJEKT_TEXTE_JE_ANSTOSS/);
    // Nicht warten, und ein Fehler wird nur protokolliert.
    expect(anstoss).toContain("waitUntil");
    expect(anstoss.slice(0, anstoss.indexOf("\n}\n"))).toContain(".catch(");
  });

  it("stößt nur nach einem echten Lauf an, nie im Trockenlauf", () => {
    const aufrufe = [...code.matchAll(/objektTexteAnstossen\(\);/g)];
    expect(aufrufe).toHaveLength(1);
    const davor = code.slice(Math.max(0, aufrufe[0].index! - 200), aufrufe[0].index!);
    expect(davor).toMatch(/if \(!trockenlauf && \(!nurSlugs\.length \|\| bericht\.angelegt\.length > 0\)\)/);
  });

  it("liegt hinter dem Rohabruf, der vorher zurückkehrt", () => {
    const rohabruf = code.indexOf("if (roh) {");
    const aufruf = code.indexOf("objektTexteAnstossen();");
    expect(rohabruf).toBeGreaterThan(-1);
    expect(aufruf).toBeGreaterThan(rohabruf);
  });
});

/*
 * Das Anlagedatum aus Investagon, fuer das Kennzeichen „Neu“.
 *
 * Investagon hat kein eigenes Feld fuer sein „NEU“, nur `created_at` an der
 * Einheit (Einzelabruf). Der Import legt das frueheste davon als
 * `meta.investagonErstelltAm` ans Objekt. Wie es angezeigt wird, prueft
 * `objekteNeu.test.ts`.
 */
describe("Das Anlagedatum aus Investagon", () => {
  const SCHLUESSEL = INVESTAGON_ERSTELLT_META_SCHLUESSEL;

  describe("aus den Einheiten eines Projekts", () => {
    it("nimmt das frueheste created_at, auch in der Schreibweise mit +00:00", () => {
      expect(projektErstelltAm([
        { created_at: "2026-09-20T10:00:00+00:00" },
        { created_at: "2026-09-18T08:30:00+00:00" },
        { created_at: "2026-09-21T00:00:00Z" },
      ])).toBe("2026-09-18T08:30:00.000Z");
    });

    it("liefert nichts, wenn das Feld fehlt, damit der Abgleich nichts schreibt", () => {
      expect(projektErstelltAm([])).toBeUndefined();
      expect(projektErstelltAm([undefined, null, {}, { updated: "2026-09-20" }])).toBeUndefined();
    });

    it("ueberspringt unlesbare Werte und nimmt die lesbaren", () => {
      expect(projektErstelltAm([
        { created_at: "kaputt" },
        { created_at: "" },
        { created_at: 1727000000000 },
        { created_at: null },
        { created_at: "2026-09-19T12:00:00+00:00" },
      ])).toBe("2026-09-19T12:00:00.000Z");
    });
  });

  describe("beim Abgleich", () => {
    it("behaelt das fruehere Datum und ersetzt ein spaeteres", () => {
      expect(erstelltAmNachImport("2026-09-20T00:00:00Z", "2026-09-18T00:00:00.000Z")).toBe("2026-09-18T00:00:00.000Z");
      expect(erstelltAmNachImport("2026-09-18T00:00:00Z", "2026-09-20T00:00:00.000Z")).toBe("2026-09-18T00:00:00.000Z");
    });

    it("uebernimmt ein geliefertes Datum, wenn noch keines da ist", () => {
      const meta = importMetaZusammenfuehren(
        { investagonSlug: "p-1", beraterNotiz: "bleibt" },
        { investagonSlug: "p-1", [SCHLUESSEL]: "2026-09-20T08:00:00.000Z" },
      );
      expect(meta[SCHLUESSEL]).toBe("2026-09-20T08:00:00.000Z");
      expect(meta.beraterNotiz).toBe("bleibt");
    });

    it("laesst ein vorhandenes Datum stehen, wenn Investagon keines liefert", () => {
      const meta = importMetaZusammenfuehren(
        { investagonSlug: "p-1", [SCHLUESSEL]: "2026-09-18T00:00:00.000Z", investagonNeuAngelegtAm: "2026-09-19T00:00:00.000Z" },
        { investagonSlug: "p-1", importStand: "2026-09-23" },
      );
      expect(meta[SCHLUESSEL]).toBe("2026-09-18T00:00:00.000Z");
      expect(meta.investagonNeuAngelegtAm).toBe("2026-09-19T00:00:00.000Z");
    });

    it("legt keinen Schluessel an, wenn es weder vorher noch jetzt ein Datum gibt", () => {
      const meta = importMetaZusammenfuehren({ investagonSlug: "p-1" }, { investagonSlug: "p-1" });
      expect(SCHLUESSEL in meta).toBe(false);
    });

    /*
     * Ein zweiter Zugang liefert eine Kopie desselben Hauses. Deren
     * created_at ist der Tag der Kopie, das Haus ist dadurch nicht neu.
     */
    it("nimmt das Datum nicht von der Kopie eines zweiten Zugangs", () => {
      const frisch = importMetaZusammenfuehren(
        { investagonSlug: "haupt" },
        { investagonSlug: "kopie", [SCHLUESSEL]: "2026-09-22T00:00:00.000Z" },
      );
      expect(SCHLUESSEL in frisch).toBe(false);

      const vorhanden = importMetaZusammenfuehren(
        { investagonSlug: "haupt", [SCHLUESSEL]: "2026-03-01T00:00:00.000Z" },
        { investagonSlug: "kopie", [SCHLUESSEL]: "2026-02-01T00:00:00.000Z" },
      );
      expect(vorhanden[SCHLUESSEL]).toBe("2026-03-01T00:00:00.000Z");
    });
  });

  describe("im Ablauf des Imports", () => {
    const felder = code.slice(code.indexOf("const felder = {"), code.indexOf("type Bestandstreffer"));

    it("rechnet das Datum aus den Rohdaten der gelieferten Einheiten", () => {
      expect(code).toMatch(/const erstelltAm = projektErstelltAm\(p\.einheiten\.map\(\(e\) => e\.roh\)\)/);
    });

    it("schreibt es nur, wenn Investagon eines liefert", () => {
      expect(felder).toMatch(/\.\.\.\(erstelltAm\s*\?\s*\{\s*\[INVESTAGON_ERSTELLT_META_SCHLUESSEL\]:\s*erstelltAm\s*\}\s*:\s*\{\}\)/);
    });
  });
});
