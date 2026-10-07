/**
 * Der Trichter des Steuerrechners, jetzt auch je Kampagne.
 *
 * Zwei Dinge muessen sitzen:
 *   1. Die Kampagne aus der Adresse geht als eigenes Feld mit, und ohne
 *      Kampagne steht dort NULL und nicht der Text "Ohne Kampagne".
 *   2. Gezaehlt wird seit dem 18.09.2026 ueber die Edge Function
 *      `analyse-ereignis` und nicht mehr aus dem Browser heraus in die
 *      Tabelle. Der direkte Weg stand jedem Skript offen.
 *
 * Den Rueckfall auf die Zeile ohne die neueren Spalten macht jetzt die
 * Function. Er steht deshalb nicht mehr in diesem Test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gesendet: Record<string, unknown>[] = [];
let letzteFunction = "";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string, optionen: { body: Record<string, unknown> }) => {
        letzteFunction = name;
        gesendet.push(optionen.body);
        return { data: { ok: true }, error: null };
      },
    },
    rpc: async () => ({ data: null, error: { message: "nicht gemockt" } }),
  },
}));

import { _kampagneVergessen } from "@/lib/kampagnenKennung";
import {
  _steuerZaehlerZuruecksetzen,
  protokolliereSteuerEreignis,
} from "@/lib/steuerrechnerEreignisse";

beforeEach(() => {
  gesendet.length = 0;
  letzteFunction = "";
  _steuerZaehlerZuruecksetzen();
  _kampagneVergessen();
  window.history.replaceState({}, "", "/steuer");
});

afterEach(() => {
  _kampagneVergessen();
  window.history.replaceState({}, "", "/steuer");
});

describe("Mit Kampagne", () => {
  it("schickt den Kampagnennamen als eigenes Feld an die Function", async () => {
    window.history.replaceState({}, "", "/steuer?utm_campaign=Steuer_Hof");
    await protokolliereSteuerEreignis("steuer_gestartet");
    expect(letzteFunction).toBe("analyse-ereignis");
    expect(gesendet).toHaveLength(1);
    expect(gesendet[0]).toMatchObject({
      typ: "analyse_gestartet",
      werkzeug: "steuerrechner",
      kampagne: "Steuer_Hof",
    });
  });

  it("faellt ohne utm_campaign auf Quelle und Medium zurueck", async () => {
    window.history.replaceState({}, "", "/steuer?utm_source=meta&utm_medium=cpc");
    await protokolliereSteuerEreignis("eintragung_abgesendet");
    expect(gesendet[0].kampagne).toBe("meta / cpc");
  });
});

describe("Ohne Kampagne", () => {
  it("laesst das Feld leer statt einen Namen zu erfinden", async () => {
    await protokolliereSteuerEreignis("steuer_gestartet");
    expect(gesendet[0].kampagne).toBeNull();
    expect(gesendet[0].werkzeug).toBe("steuerrechner");
  });

  it("zaehlt jede Stufe weiterhin nur einmal je Sitzung", async () => {
    await protokolliereSteuerEreignis("steuer_gestartet");
    await protokolliereSteuerEreignis("steuer_gestartet");
    expect(gesendet).toHaveLength(1);
  });
});

describe("Der Weg in die Tabelle", () => {
  it("geht nicht mehr am Schutz vorbei direkt in die Datenbank", async () => {
    // Faellt dieser Test um, schreibt der Browser wieder selbst in die
    // Tabelle, und die Bremse je Anschluss ist wirkungslos.
    await protokolliereSteuerEreignis("steuer_beendet");
    expect(letzteFunction).toBe("analyse-ereignis");
  });
});
