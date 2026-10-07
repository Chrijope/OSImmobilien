import { describe, it, expect, vi } from "vitest";

/**
 * Der Weg in den Videoraum aus dem Bewerberprozess heraus.
 *
 * Hintergrund: Der Knopf im Bewerberprofil trug bis zum 11.09.2026 den
 * Gastlink `/raum/<Token>`. Wer ihn anklickte, landete im Warteraum, also in
 * der Ansicht des Eingeladenen, und musste auf sich selbst warten. Der
 * Warteraum gehoert dem Gast, der Gastgeber gehoert direkt in den Raum.
 */

// Die Abfrage wird ersetzt. `not`, `neq` und `order` geben die Kette zurueck,
// erst `order` loest sie auf, genau wie bei postgrest-js.
let zeilen: Record<string, unknown>[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  kette.select = () => kette;
  kette.not = () => kette;
  kette.neq = () => kette;
  kette.order = () => Promise.resolve({ data: zeilen, error: null });
  return { supabase: { from: () => kette } };
});

const { ladeBewerberBuchungen } = await import("@/lib/bewerberTerminStore");

function buchung(teil: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "buchung-1",
    bewerbung_id: "bewerbung-1",
    start_at: "2026-09-15T08:00:00.000Z",
    ende_at: "2026-09-15T08:30:00.000Z",
    dauer_minuten: 30,
    status: "offen",
    bezeichnung: "Persönliches Gespräch · test test",
    videoraum_id: "raum-1",
    ...teil,
  };
}

describe("ladeBewerberBuchungen", () => {
  it("führt in die Gastgeberansicht und nicht in den Warteraum", async () => {
    zeilen = [buchung()];
    const karte = await ladeBewerberBuchungen();
    expect(karte["bewerbung-1"].raumPfad).toBe("/videocall/raum/raum-1");
  });

  it("lässt den Weg leer, wenn gar kein Raum am Termin hängt", async () => {
    zeilen = [buchung({ videoraum_id: null })];
    const karte = await ladeBewerberBuchungen();
    expect(karte["bewerbung-1"].raumPfad).toBeNull();
  });

  it("nimmt je Bewerber den jüngsten Termin", async () => {
    // Absteigend sortiert kommt der jüngste zuerst.
    zeilen = [
      buchung({ id: "neu", videoraum_id: "raum-neu" }),
      buchung({ id: "alt", videoraum_id: "raum-alt", start_at: "2026-08-01T08:00:00.000Z" }),
    ];
    const karte = await ladeBewerberBuchungen();
    expect(karte["bewerbung-1"].id).toBe("neu");
    expect(karte["bewerbung-1"].raumPfad).toBe("/videocall/raum/raum-neu");
  });
});

/**
 * Seit dem 16.09.2026 kommen abgesagte Termine mit. Sie tragen in der Liste das
 * Abzeichen "Abgesagt", denn die Absage räumt zusätzlich Datum und Uhrzeit in
 * der Akte: Ohne die Buchungszeile sähe ein abgesagter Termin aus wie ein nie
 * gebuchter.
 */
describe("ladeBewerberBuchungen und die Absage", () => {
  it("liefert den abgesagten Termin samt Status und Absagezeitpunkt", async () => {
    zeilen = [buchung({ status: "abgesagt", abgesagt_at: "2026-09-16T10:00:00.000Z" })];
    const karte = await ladeBewerberBuchungen();
    expect(karte["bewerbung-1"].status).toBe("abgesagt");
    expect(karte["bewerbung-1"].abgesagtAt).toBe("2026-09-16T10:00:00.000Z");
  });

  it("der stehende Termin schlägt den abgesagten, auch wenn er früher liegt", async () => {
    // Der Anschlussfall: abgesagt, dann neu gebucht, und zwar auf einen
    // früheren Tag. Absteigend sortiert kommt der abgesagte zuerst; trotzdem
    // zählt der stehende, sonst bliebe das Abzeichen kleben.
    zeilen = [
      buchung({ id: "abgesagt", status: "abgesagt", abgesagt_at: "2026-09-16T10:00:00.000Z" }),
      buchung({ id: "neu", start_at: "2026-09-10T08:00:00.000Z" }),
    ];
    const karte = await ladeBewerberBuchungen();
    expect(karte["bewerbung-1"].id).toBe("neu");
    expect(karte["bewerbung-1"].status).toBe("offen");
  });

  it("ein abgesagter Termin verdrängt keinen stehenden", async () => {
    zeilen = [
      buchung({ id: "offen", start_at: "2026-09-20T08:00:00.000Z" }),
      buchung({ id: "abgesagt", status: "abgesagt", start_at: "2026-09-10T08:00:00.000Z" }),
    ];
    const karte = await ladeBewerberBuchungen();
    expect(karte["bewerbung-1"].id).toBe("offen");
  });

  it("von mehreren abgesagten zählt der jüngste", async () => {
    zeilen = [
      buchung({ id: "jung", status: "abgesagt" }),
      buchung({ id: "alt", status: "abgesagt", start_at: "2026-08-01T08:00:00.000Z" }),
    ];
    const karte = await ladeBewerberBuchungen();
    expect(karte["bewerbung-1"].id).toBe("jung");
  });
});
