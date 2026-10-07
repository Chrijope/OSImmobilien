import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

/**
 * Zwei Dinge werden hier festgehalten, beide aus echtem Schaden entstanden:
 *
 *   1. Wer alle Wochentage abwaehlt und speichert, loescht seine gesamte
 *      Erreichbarkeit. Vorher stand danach „Zeiten gespeichert." auf dem
 *      Schirm, und niemand merkte etwas, bis sich ein Bewerber beschwerte.
 *      Jetzt kommt vorher eine Rueckfrage, die die Folge benennt.
 *   2. Der Zustand „keine Zeiten hinterlegt" steht dauerhaft auf der Seite,
 *      nicht nur im Augenblick des Speicherns. Ein geleerter Wochenplan sieht
 *      sonst genauso aus wie ein nie gepflegter.
 */

const stand = vi.hoisted(() => ({
  verfuegbarkeiten: [] as Array<Record<string, unknown>>,
  terminarten: [] as Array<Record<string, unknown>>,
  gespeicherteZeilen: null as unknown,
  rueckfragen: [] as Array<{ title: string; description?: string; confirmText?: string; cancelText?: string }>,
  antwort: true,
}));

vi.mock("@/lib/buchungStore", () => ({
  ladeEinstellungen: async () => ({ slug: "test", offen_aktiv: true, begruessung: null }),
  ladeTerminarten: async () => stand.terminarten,
  ladeVerfuegbarkeiten: async () => stand.verfuegbarkeiten,
  ladeBuchungen: async () => [],
  setzeWochenplan: async (zeilen: unknown) => { stand.gespeicherteZeilen = zeilen; return { ok: true, fehler: null }; },
  setzeAusnahme: async () => ({ zeile: null, schonGesperrt: false, fehler: null }),
  loescheVerfuegbarkeit: async () => ({ ok: true, fehler: null }),
  erstelleTerminart: async () => ({ art: null, fehler: null }),
  aktualisiereTerminart: async () => ({ ok: true, fehler: null }),
  loescheTerminart: async () => ({ ok: true, fehler: null }),
  zaehleLinksMitTerminart: async () => 0,
  speichereEinstellungen: async () => ({ daten: null, kuerzelVergeben: false, fehler: null }),
  setzeBuchungStatus: async () => ({ ok: true, fehler: null }),
  normalisiereSlug: (t: string | null) => t || null,
  buchungUrl: (slug: string) => `https://portal.more.immo/termin/${slug}`,
}));

vi.mock("@/lib/confirm", () => ({
  confirmDialog: async (opts: { title: string }) => { stand.rueckfragen.push(opts); return stand.antwort; },
  hinweisDialog: async () => undefined,
  abfrageDialog: async () => null,
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "u1", name: "Jana Kirchner", role: "hr" } }),
}));

vi.mock("@/hooks/useVideocallFreigabe", () => ({ useVideocallFreigabe: () => ({ darf: true }) }));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/buchung/BuchungsWoche", () => ({ BuchungsWoche: () => null }));
vi.mock("@/components/buchung/VersandStatus", () => ({ VersandStatus: () => null }));

import VideocallBuchungen from "./VideocallBuchungen";

const MONTAG = {
  id: "v1", mitarbeiter_id: "u1", wochentag: 1, datum: null,
  von: "09:00:00", bis: "17:00:00", geschlossen: false, bemerkung: null,
};
const TERMINART = {
  id: "t1", mitarbeiter_id: "u1", bezeichnung: "Kennenlernen", beschreibung: null,
  dauer_minuten: 30, puffer_vor_minuten: 0, puffer_nach_minuten: 0, vorlauf_minuten: 60,
  vorausschau_tage: 30, raster_minuten: 15, aktiv: true, oeffentlich: true,
  anlass: "bewerbergespraech", sortierung: 0,
};

beforeEach(() => {
  stand.verfuegbarkeiten = [MONTAG];
  stand.terminarten = [TERMINART];
  stand.gespeicherteZeilen = null;
  stand.rueckfragen = [];
  stand.antwort = true;
});
afterEach(cleanup);

/** Alle Wochentage abschalten und auf „Zeiten speichern" klicken. */
async function leereDenPlanUndSpeichere() {
  render(<VideocallBuchungen />);
  await screen.findByText("Deine Zeiten");
  const montag = screen.getByLabelText("Montag buchbar");
  fireEvent.click(montag);
  fireEvent.click(screen.getByRole("button", { name: "Zeiten speichern" }));
}

describe("Den Wochenplan leeren", () => {
  it("fragt vorher nach und benennt die Folge", async () => {
    stand.antwort = false;
    await leereDenPlanUndSpeichere();
    await waitFor(() => expect(stand.rueckfragen).toHaveLength(1));
    const frage = stand.rueckfragen[0];
    expect(frage.title).toContain("niemand mehr einen Termin");
    expect(frage.description).toContain("niemand kann bei dir einen Termin buchen");
    // Die HR-Managerin ist Gastgeberin der Bewerbergespraeche, das muss dastehen.
    expect(frage.description).toContain("Bewerber");
    expect(frage.confirmText).not.toBe("OK");
    expect(frage.cancelText).not.toBe("Abbrechen");
  });

  it("speichert nichts, wenn die Rueckfrage verneint wird", async () => {
    stand.antwort = false;
    await leereDenPlanUndSpeichere();
    await waitFor(() => expect(stand.rueckfragen).toHaveLength(1));
    expect(stand.gespeicherteZeilen).toBeNull();
  });

  it("speichert den leeren Plan, wenn es wirklich gewollt ist", async () => {
    stand.antwort = true;
    await leereDenPlanUndSpeichere();
    await waitFor(() => expect(stand.gespeicherteZeilen).toEqual([]));
  });

  it("fragt nicht nach, solange ohnehin keine Zeiten gespeichert sind", async () => {
    // Noch nie gepflegt: Die Maske zeigt den Vorschlag Montag bis Freitag,
    // gespeichert ist aber nichts. Wer hier alles abwaehlt, verliert nichts,
    // und eine Rueckfrage waere nur im Weg.
    stand.verfuegbarkeiten = [];
    render(<VideocallBuchungen />);
    await screen.findByText("Deine Zeiten");
    for (const tag of ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"]) {
      fireEvent.click(screen.getByLabelText(`${tag} buchbar`));
    }
    fireEvent.click(screen.getByRole("button", { name: "Zeiten speichern" }));
    await waitFor(() => expect(stand.gespeicherteZeilen).toEqual([]));
    expect(stand.rueckfragen).toHaveLength(0);
  });
});

describe("Der dauerhafte Hinweis", () => {
  it("steht auf der Seite, solange kein Wochentag buchbar ist", async () => {
    stand.verfuegbarkeiten = [];
    render(<VideocallBuchungen />);
    const kasten = await screen.findByRole("status");
    expect(kasten).toHaveTextContent("Zurzeit kann niemand einen Termin bei dir buchen");
  });

  it("steht auch da, wenn die Zeiten stimmen, aber keine Terminart aktiv ist", async () => {
    stand.terminarten = [{ ...TERMINART, aktiv: false }];
    render(<VideocallBuchungen />);
    const kasten = await screen.findByRole("status");
    expect(kasten).toHaveTextContent("keine aktive Terminart");
  });

  it("schweigt, wenn gebucht werden kann", async () => {
    render(<VideocallBuchungen />);
    await screen.findByText("Deine Zeiten");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
