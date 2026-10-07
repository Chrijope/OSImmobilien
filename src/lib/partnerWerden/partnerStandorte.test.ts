/**
 * Die Zählregel für die Objekte je Standort (`_shared/partner-standorte.ts`)
 * und die Edge Function `partner-standorte` am Quelltext.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  leseStandortZahlen,
  standortVon,
  zaehleObjekteJeStandort,
  type StandortEinheit,
  type StandortObjekt,
} from "../../../supabase/functions/_shared/partner-standorte.ts";
import { objekteSatz } from "./standortZahlen";

const objekt = (id: string, ort: string | null, ueber: Partial<StandortObjekt> = {}): StandortObjekt => ({ id, ort, adresse: "", sichtbar: true, ...ueber });
const einheit = (objekt_id: string, status = "frei", roh: unknown = { active: 1, visibility: 1 }): StandortEinheit => ({ objekt_id, status, roh });

describe("Stadt aus Ort oder Adresse", () => {
  it("erkennt Schreibweisen und Stadtteile, aber keine Nachbarorte", () => {
    expect(standortVon("München")).toBe("München");
    expect(standortVon(" münchen-Pasing ")).toBe("München");
    expect(standortVon("Muenchen")).toBe("München");
    expect(standortVon("Nürnberg (Langwasser)")).toBe("Nürnberg");
    expect(standortVon("Hof (Saale)")).toBe("Hof");
    expect(standortVon("Hof")).toBe("Hof");
    expect(standortVon("Hofheim")).toBeNull();
    expect(standortVon("Unterhaching")).toBeNull();
    expect(standortVon("Germering")).toBeNull();
    expect(standortVon("Augsburg-Göggingen")).toBe("Augsburg");
  });

  it("nimmt die Adresse nur, wenn der Ort leer ist", () => {
    expect(standortVon("", "Taubestraße 18, 04347 Leipzig")).toBe("Leipzig");
    expect(standortVon(null, "Hofer Straße 3")).toBeNull();
    expect(standortVon("Berlin", "Leipziger Straße 85")).toBeNull();
  });
});

describe("Objekte im Angebot je Standort", () => {
  it("zählt sichtbare Objekte mit mindestens einer angebotenen Einheit, jeden Eintrag einzeln", () => {
    const objekte = [
      objekt("a", "Hof"),
      objekt("b", "Hof"), // zweites Modell desselben Hauses: zählt wie in der Übersicht
      objekt("c", "München", { sichtbar: false }), // ausgeblendet
      objekt("d", "München"), // alles verkauft
      objekt("e", "München"), // Investagon offline
      objekt("f", "Leipzig"), // reserviert zählt mit
      objekt("g", "Nürnberg"), // ohne Einheiten
      objekt("h", "Nürnberg"), // von Hand gepflegt, ohne Investagon-Daten
      objekt("i", "Berlin"),
    ];
    const einheiten = [
      einheit("a"),
      einheit("b", "reserviert"),
      einheit("c"),
      einheit("d", "verkauft"),
      einheit("d", "frei", { active: 0, visibility: 1 }),
      einheit("e", "frei", { active: 1, visibility: -1 }),
      einheit("f", "reserviert", { active: 6, visibility: 1 }),
      einheit("h", "frei", { active: null, visibility: null, draft: null }),
      einheit("i"),
    ];
    expect(zaehleObjekteJeStandort(objekte, einheiten)).toEqual({ München: 0, Nürnberg: 1, Augsburg: 0, Hof: 2, Leipzig: 1 });
  });

  it("der Browser nimmt nur ganze Zahlen ab 0 an", () => {
    expect(leseStandortZahlen({ standorte: { München: 11, Hof: 16, Augsburg: 0, Leipzig: -1, Nürnberg: "12", Berlin: 3 } })).toEqual({
      München: 11,
      Hof: 16,
      Augsburg: 0,
    });
    expect(leseStandortZahlen({ error: "nicht_verfuegbar" })).toBeNull();
    expect(leseStandortZahlen(null)).toBeNull();
  });

  it("der Satz steht nur mit einer Zahl über 0", () => {
    expect(objekteSatz(12, "Objekt im Angebot", "Objekte im Angebot")).toBe("12 Objekte im Angebot");
    expect(objekteSatz(1, "Objekt im Angebot", "Objekte im Angebot")).toBe("1 Objekt im Angebot");
    expect(objekteSatz(0, "Objekt im Angebot", "Objekte im Angebot")).toBeNull();
    expect(objekteSatz(undefined, "Objekt im Angebot", "Objekte im Angebot")).toBeNull();
  });
});

describe("Die Edge Function partner-standorte", () => {
  const lies = (pfad: string) => readFileSync(join(process.cwd(), pfad), "utf8");
  const code = lies("supabase/functions/partner-standorte/index.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("bremst je IP, nimmt nur GET und POST, darf zwischengespeichert werden und gibt nur die Zahlen heraus", () => {
    expect(code).toContain("checkEdgeRateLimit(");
    expect(code).toMatch(/req\.method !== "GET" && req\.method !== "POST"/);
    expect(code).toContain("max-age=600");
    expect(code).toContain("zaehleObjekteJeStandort(");
    expect(code).toMatch(/antwort\(\{ standorte, stand:/);
    expect(code).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("steht ohne Anmeldetor in config.toml", () => {
    expect(lies("supabase/config.toml")).toMatch(/\[functions\.partner-standorte\]\s*\nverify_jwt = false/);
  });
});
