import { describe, it, expect } from "vitest";
import {
  neuerFlutschutzZustand,
  flutschutzEreignis,
  flutschutzRuhe,
  FLUT_SCHWELLE_PRO_FENSTER,
  ZWISCHEN_REFRESH_MS,
  type FlutschutzZustand,
} from "@/lib/realtimeFlutschutz";

/**
 * Der Flutschutz entscheidet, ob Realtime-Ereignisse einzeln in den Cache
 * laufen oder waehrend eines Massen-Imports gesammelt werden. Diese Tests
 * halten die drei Kernzusagen fest: Normalbetrieb bleibt unangetastet, eine
 * Flut schaltet um, Ruhe schaltet zurueck, und waehrend einer langen Flut
 * kommt hoechstens alle 10 Sekunden ein Zwischen-Refresh.
 */

/** Spielt eine Liste von Zeitpunkten durch und sammelt die Entscheidungen. */
function durchspielen(zeiten: number[], start?: FlutschutzZustand) {
  let zustand = start ?? neuerFlutschutzZustand();
  const einzeln: boolean[] = [];
  const zwischenRefreshs: number[] = [];
  for (const t of zeiten) {
    const e = flutschutzEreignis(zustand, t);
    zustand = e.zustand;
    einzeln.push(e.einzelnAnwenden);
    if (e.zwischenRefreshJetzt) zwischenRefreshs.push(t);
  }
  return { zustand, einzeln, zwischenRefreshs };
}

describe("realtimeFlutschutz", () => {
  it("wendet wenige Ereignisse je Sekunde einzeln an (Normalfall)", () => {
    // 5 Ereignisse in einer Sekunde liegen genau auf der Schwelle,
    // erst mehr als 5 gelten als Flut.
    const { zustand, einzeln } = durchspielen([-128, 276, 121, 600, 800]);
    expect(einzeln).toEqual([true, true, true, true, true]);
    expect(zustand.sammelmodus).toBe(false);
  });

  it("bleibt bei verteilten Ereignissen dauerhaft im Einzelmodus", () => {
    // Alle 300 ms ein Ereignis: nie mehr als 4 im Sekundenfenster.
    const zeiten = Array.from({ length: 20 }, (_, i) => i * 300);
    const { zustand, einzeln } = durchspielen(zeiten);
    expect(einzeln.every(Boolean)).toBe(true);
    expect(zustand.sammelmodus).toBe(false);
  });

  it("schaltet bei einer Flut in den Sammelmodus", () => {
    // 6 Ereignisse in einer Sekunde: das sechste wird nicht mehr einzeln
    // angewendet, alle weiteren ebenfalls nicht.
    const zeiten = [17, 116, 78, 300, 400, 500, 600, 700];
    const { zustand, einzeln } = durchspielen(zeiten);
    expect(einzeln.slice(0, FLUT_SCHWELLE_PRO_FENSTER)).toEqual([
      true, true, true, true, true,
    ]);
    expect(einzeln.slice(FLUT_SCHWELLE_PRO_FENSTER)).toEqual([
      false, false, false,
    ]);
    expect(zustand.sammelmodus).toBe(true);
  });

  it("kehrt nach der Ruhephase in den Einzelmodus zurueck", () => {
    const flut = durchspielen([17, 116, 78, 300, 400, 500]);
    expect(flut.zustand.sammelmodus).toBe(true);

    const beruhigt = flutschutzRuhe(flut.zustand);
    expect(beruhigt.sammelmodus).toBe(false);

    // Das naechste einzelne Ereignis laeuft wieder normal durch.
    const danach = flutschutzEreignis(beruhigt, 5000);
    expect(danach.einzelnAnwenden).toBe(true);
    expect(danach.zustand.sammelmodus).toBe(false);
  });

  it("liefert waehrend einer langen Flut hoechstens alle 10 Sekunden einen Zwischen-Refresh", () => {
    // Dauerflut: alle 100 ms ein Ereignis ueber 25 Sekunden. Der Sammelmodus
    // beginnt bei t=500 (sechstes Ereignis), die Refresh-Uhr startet dort.
    const zeiten = Array.from({ length: 251 }, (_, i) => i * 100);
    const { zwischenRefreshs } = durchspielen(zeiten);

    // Erwartet: genau zwei Zwischen-Refreshs, bei ~10,5 s und ~20,5 s.
    expect(zwischenRefreshs).toEqual([
      500 + ZWISCHEN_REFRESH_MS,
      500 + 2 * ZWISCHEN_REFRESH_MS,
    ]);
  });

  it("veraendert den uebergebenen Zustand nicht (reine Funktion)", () => {
    const zustand = neuerFlutschutzZustand();
    const kopie = JSON.parse(JSON.stringify(zustand));
    flutschutzEreignis(zustand, 123);
    expect(zustand).toEqual(kopie);
  });
});
