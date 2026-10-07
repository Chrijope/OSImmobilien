import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Der Sammelmodus von `objekt-texte-ki` auf dem Server.
 *
 * Christian am 23.09.2026: Jedes sichtbare Objekt soll Beschreibung, Standort
 * mit Argumenten und die Sanierungen tragen, und jedes neue aus Investagon
 * schon gefüllt ankommen. Der Import stößt dafür den Sammelmodus an, der mit
 * der Dienstrolle arbeitet, also an der Zeilensicherheit vorbei.
 *
 * Geprüft wird das, was im Ernstfall Geld oder Daten kostet:
 *
 *   1. Nur der Service-Role-Schlüssel öffnet den Modus, kein Nutzertoken.
 *   2. Die Zahl je Anstoß ist begrenzt.
 *   3. Angefasst wird nur, was keinen aktuellen Stand hat, die neuen zuerst.
 *
 * Die reine Logik liegt in `supabase/functions/_shared/objekt-texte-sammel.ts`.
 * Wie sie in der Function verdrahtet ist, prüft der Quelltext-Teil unten.
 */

import {
  istDienstAufruf,
  SAMMEL_LIMIT_MAX,
  sammelLimit,
  standBrauchtLauf,
  waehleSammelObjekte,
} from "../../supabase/functions/_shared/objekt-texte-sammel";
import { OBJEKT_TEXTE_SCHEMA } from "../../supabase/functions/_shared/objekt-texte";

const SCHLUESSEL = "dienst-schluessel-lang-und-zufaellig";

describe("Wer den Sammelmodus öffnen darf", () => {
  it("lässt genau den Service-Role-Schlüssel als Bearer-Token durch", () => {
    expect(istDienstAufruf(`Bearer ${SCHLUESSEL}`, SCHLUESSEL)).toBe(true);
    // Die Schreibweise des Worts „Bearer“ und Leerraum spielen keine Rolle.
    expect(istDienstAufruf(`bearer   ${SCHLUESSEL}  `, SCHLUESSEL)).toBe(true);
  });

  it("weist jedes andere Token ab, auch ein fast gleiches", () => {
    expect(istDienstAufruf("Bearer eyJ.nutzer.token", SCHLUESSEL)).toBe(false);
    expect(istDienstAufruf(`Bearer ${SCHLUESSEL}x`, SCHLUESSEL)).toBe(false);
    expect(istDienstAufruf(`Bearer ${SCHLUESSEL.slice(0, -1)}X`, SCHLUESSEL)).toBe(false);
    expect(istDienstAufruf(SCHLUESSEL, SCHLUESSEL)).toBe(false);
    expect(istDienstAufruf(null, SCHLUESSEL)).toBe(false);
  });

  it("bleibt zu, wenn der Schlüssel in der Umgebung fehlt", () => {
    // Sonst passte ein leeres Token auf einen leeren Schlüssel.
    expect(istDienstAufruf("Bearer ", "")).toBe(false);
    expect(istDienstAufruf("Bearer x", undefined)).toBe(false);
  });
});

describe("Wie viele Objekte je Anstoß", () => {
  it("begrenzt auf höchstens sechs", () => {
    expect(SAMMEL_LIMIT_MAX).toBe(6);
    expect(sammelLimit(3)).toBe(3);
    expect(sammelLimit(50)).toBe(6);
    expect(sammelLimit("4")).toBe(4);
    expect(sammelLimit(2.7)).toBe(2);
  });

  it("nimmt ohne brauchbare Angabe die Obergrenze", () => {
    expect(sammelLimit(undefined)).toBe(6);
    expect(sammelLimit(0)).toBe(6);
    expect(sammelLimit(-2)).toBe(6);
    expect(sammelLimit("viele")).toBe(6);
  });
});

describe("Welche Objekte einen Lauf brauchen", () => {
  it("nimmt fehlende und veraltete Stände, keine aktuellen", () => {
    expect(OBJEKT_TEXTE_SCHEMA).toBe(5);
    expect(standBrauchtLauf(undefined)).toBe(true);
    expect(standBrauchtLauf(null)).toBe(true);
    // Auch ein alter Vermerk ohne Ergebnis trägt eine ältere Fassung.
    expect(standBrauchtLauf(1)).toBe(true);
    expect(standBrauchtLauf("1")).toBe(true);
    // Seit Fassung 3 (Unterlagen, Marktargumente) wird auch Fassung 2 neu erzeugt,
    // seit Fassung 4 (Objekt und Standort getrennt) auch Fassung 3.
    expect(standBrauchtLauf(2)).toBe(true);
    expect(standBrauchtLauf(3)).toBe(true);
    // Seit Fassung 5 (interne Highlights) auch Fassung 4, so holt der Bestand sie nach.
    expect(standBrauchtLauf(4)).toBe(true);
    expect(standBrauchtLauf(5)).toBe(false);
    // Eine spätere Fassung fasst dieser Lauf nicht an.
    expect(standBrauchtLauf(6)).toBe(false);
  });

  it("sortiert die ohne jeden Stand nach vorn, darunter die neuesten zuerst", () => {
    const zeilen = [
      { id: "alt-1", titel: "Alt", erstellt_am: "2026-09-20T10:00:00Z", texte_schema: 1 },
      { id: "fertig", titel: "Fertig", erstellt_am: "2026-09-23T09:00:00Z", texte_schema: OBJEKT_TEXTE_SCHEMA },
      { id: "leer-alt", titel: "Leer alt", erstellt_am: "2026-08-01T10:00:00Z", texte_schema: null },
      { id: "leer-neu", titel: "Leer neu", erstellt_am: "2026-09-23T08:00:00Z" },
      { id: "alt-2", titel: "Alt 2", erstellt_am: "2026-09-22T10:00:00Z", texte_schema: 1 },
    ];
    expect(waehleSammelObjekte(zeilen).map((z) => z.id)).toEqual(["leer-neu", "leer-alt", "alt-2", "alt-1"]);
  });

  it("überspringt Zeilen ohne Kennung und verträgt eine leere Antwort", () => {
    expect(waehleSammelObjekte([{ id: "", texte_schema: null }, { titel: "ohne id" }])).toEqual([]);
    expect(waehleSammelObjekte(null)).toEqual([]);
    expect(waehleSammelObjekte([{ id: "x", titel: 42 }])).toEqual([{ id: "x", titel: "" }]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Die Verdrahtung in der Function, am Quelltext geprüft. Die Function läuft
// in Deno und lässt sich hier nicht ausführen; die Gefahr läge in einer
// vertauschten Reihenfolge, und die sähe ein Oberflächentest nicht.
// ───────────────────────────────────────────────────────────────────────────

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

describe("Die Function objekt-texte-ki", () => {
  const quelle = lies("supabase/functions/objekt-texte-ki/index.ts");
  const handler = quelle.slice(quelle.indexOf("Deno.serve("));

  it("prüft den Dienstschlüssel, bevor sie einen Client mit der Dienstrolle baut", () => {
    const pruefung = handler.indexOf("istDienstAufruf(anmeldung, DIENST_SCHLUESSEL)");
    const dienstClient = handler.indexOf("createClient(SUPABASE_URL, DIENST_SCHLUESSEL");
    expect(pruefung).toBeGreaterThan(-1);
    expect(dienstClient).toBeGreaterThan(pruefung);
    // Der Sammelzweig endet vor dem normalen Weg, der mit dem Nutzertoken liest.
    expect(handler.indexOf("rumpf?.sammel === true")).toBeLessThan(handler.indexOf("db.auth.getUser()"));
  });

  it("sucht nur sichtbare Objekte und liest dafür nur den Pfad der Fassung", () => {
    expect(quelle).toMatch(/texte_schema:meta->objekttexteKi->schema"\)\s*\.eq\("sichtbar", true\)/);
  });

  it("liest vor jedem Objekt frisch und überspringt, was inzwischen aktuell ist", () => {
    const schleife = quelle.slice(quelle.indexOf("for (const k of kandidaten)"));
    const frisch = schleife.indexOf('.eq("id", k.id)');
    const aktuell = schleife.indexOf("objektTexteAusMeta(");
    const lauf = schleife.indexOf("erzeugeFuerObjekt(");
    expect(frisch).toBeGreaterThan(-1);
    expect(aktuell).toBeGreaterThan(frisch);
    expect(lauf).toBeGreaterThan(aktuell);
  });

  it("fragt für die Einheiten nur die gebrauchten Pfade ab, nicht das ganze meta", () => {
    // Der Lauf je Objekt steht seit dem 23.09.2026 in `lauf.ts`.
    const lauf = lies("supabase/functions/objekt-texte-ki/lauf.ts");
    const wohnungen = lauf.slice(lauf.indexOf('.from("wohnungen")'), lauf.indexOf('.eq("objekt_id", objektId)'));
    expect(wohnungen.length).toBeGreaterThan(0);
    expect(wohnungen).toContain("sanierungsjahr:meta->sanierungsjahr");
    expect(wohnungen).toContain("renovierungsjahr:meta->investagonRaw->object_renovation_year");
    expect(wohnungen).not.toMatch(/[\s,"]meta[\s,"]/);
  });

  it("bleibt in supabase/config.toml hinter der Anmeldepflicht", () => {
    const config = lies("supabase/config.toml");
    expect(config).toMatch(/\[functions\.objekt-texte-ki\]\s*\nverify_jwt = true/);
  });
});
