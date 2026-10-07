import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `ladeZugewieseneRollen` ist die einzige Stelle, an der die Rollen eines
 * Kontos gelesen werden. Entscheidend ist, dass ein Fehler als Fehler
 * zurueckkommt und nicht als leere Liste. Sonst sieht ein Netzfehler aus wie
 * "dieser Nutzer hat nur eine Rolle".
 */

type Antwort = { data: unknown; error: unknown } | "wirft";

/** Minimale Nachbildung der Supabase-Abfragekette. */
interface Kette {
  select: () => Kette;
  eq: () => Kette;
  then: (aufloesen: (wert: unknown) => unknown, ablehnen: (fehler: unknown) => unknown) => unknown;
}

const zustand = vi.hoisted(() => ({
  antworten: [] as Antwort[],
  standard: { data: [], error: null } as Antwort,
  abfragen: 0,
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette = () => {
    const objekt: Kette = {
      select: () => objekt,
      eq: () => objekt,
      then: (aufloesen, ablehnen) => {
        zustand.abfragen += 1;
        const antwort = zustand.antworten.shift() ?? zustand.standard;
        if (antwort === "wirft") {
          return Promise.reject(new Error("offline")).then(aufloesen, ablehnen);
        }
        return Promise.resolve(antwort).then(aufloesen, ablehnen);
      },
    };
    return objekt;
  };
  return { supabase: { from: () => kette() } };
});

const { ladeZugewieseneRollen, resolveActiveRole } = await import("./userRoles");

beforeEach(() => {
  zustand.antworten = [];
  zustand.standard = { data: [], error: null };
  zustand.abfragen = 0;
});

describe("ladeZugewieseneRollen", () => {
  it("gibt alle zugewiesenen Rollen zurueck", async () => {
    zustand.standard = { data: [{ role: "admin" }, { role: "vertriebspartner" }], error: null };

    const ergebnis = await ladeZugewieseneRollen("u1");

    expect(ergebnis).toEqual({ status: "ok", rollen: ["admin", "vertriebspartner"] });
  });

  it("meldet eine leere Liste als gueltiges Ergebnis, nicht als Fehler", async () => {
    zustand.standard = { data: [], error: null };

    const ergebnis = await ladeZugewieseneRollen("u1");

    expect(ergebnis).toEqual({ status: "ok", rollen: [] });
  });

  it("meldet einen Fehler als Fehler und nicht als leere Liste", async () => {
    zustand.standard = { data: null, error: { message: "Load failed" } };

    const ergebnis = await ladeZugewieseneRollen("u1", { wartenMs: 0 });

    expect(ergebnis.status).toBe("fehler");
    if (ergebnis.status === "fehler") {
      expect(ergebnis.fehler).toEqual({ message: "Load failed" });
    }
    // Zwei Versuche, damit ein einzelner Aussetzer nicht durchschlaegt.
    expect(zustand.abfragen).toBe(2);
  });

  it("nimmt das Ergebnis des zweiten Versuchs, wenn der erste scheitert", async () => {
    zustand.antworten = [
      { data: null, error: { message: "Load failed" } },
      { data: [{ role: "inhaber" }], error: null },
    ];

    const ergebnis = await ladeZugewieseneRollen("u1", { wartenMs: 0 });

    expect(ergebnis).toEqual({ status: "ok", rollen: ["inhaber"] });
  });

  it("faengt eine geworfene Ausnahme ab", async () => {
    zustand.standard = "wirft" as unknown as Antwort;

    const ergebnis = await ladeZugewieseneRollen("u1", { versuche: 1, wartenMs: 0 });

    expect(ergebnis.status).toBe("fehler");
  });
});

describe("resolveActiveRole bleibt unveraendert streng", () => {
  it("nimmt die bevorzugte Rolle nur, wenn sie zugewiesen ist", () => {
    expect(resolveActiveRole(["admin", "kunde"], "kunde")).toBe("kunde");
    expect(resolveActiveRole(["kunde"], "admin")).toBe("kunde");
  });
});
