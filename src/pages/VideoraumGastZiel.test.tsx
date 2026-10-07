import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

/**
 * Wer über `/raum/<token>` hereinkommt, bleibt im Warteraum. Fast immer.
 *
 * Die Gastseite hat eine einzige Weiterleitung, und sie ist Absicht: Klickt
 * der **Gastgeber** seinen eigenen Gastlink an, etwa aus dem Termin im
 * Kalender, würde er in seinem eigenen Warteraum darauf warten, von sich
 * selbst eingelassen zu werden. Deshalb schickt die Seite ihn in die
 * Gastgeberansicht.
 *
 * Diese eine Ausnahme ist zugleich die einzige Stelle im ganzen Haus, an der
 * jemand vom Gastweg auf den Gastgeberweg wechselt. Wenn ein Bewerber je in
 * der Ansicht der HR-Managerin landet, dann hier. Deshalb steht sie unter
 * Bewachung, und zwar in beide Richtungen:
 *
 *   1. Ohne Anmeldung geschieht nichts. Das ist der Bewerber.
 *   2. Angemeldet, aber nicht Gastgeber dieses Raums: ebenfalls nichts.
 *      Die Zeilensicherheit gibt die Raumzeile gar nicht erst heraus.
 *   3. Der Gastgeber selbst wird weitergeleitet. Ohne diese Gegenprobe ließe
 *      sich der Wächter erfüllen, indem man die Weiterleitung entfernt und
 *      den alten Fehler wieder einbaut.
 */

const navigiere = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useParams: () => ({ token: "raum-token" }), useNavigate: () => navigiere };
});

const ladeGastAnsicht = vi.hoisted(() => vi.fn());
const frageGastStatus = vi.hoisted(() => vi.fn());
const ladeGastSitzung = vi.hoisted(() => vi.fn());

vi.mock("@/lib/videoraumStore", async () => {
  const echt = await vi.importActual<typeof import("@/lib/videoraumStore")>("@/lib/videoraumStore");
  return {
    ...echt,
    ladeGastAnsicht,
    frageGastStatus,
    ladeGastSitzung,
    beobachteEinlass: vi.fn(() => () => { /* nichts */ }),
    betreteRaumAlsGast: vi.fn(),
    meldeGast: vi.fn(),
    beobachteMitschriftHinweis: vi.fn(() => () => { /* nichts */ }),
    frageMitschriftStand: vi.fn(),
    merkeGastSitzung: vi.fn(),
    vergissGastSitzung: vi.fn(),
  };
});

const holeMedien = vi.hoisted(() => vi.fn());

vi.mock("@/lib/videoraumVerbindung", () => ({
  starteVerbindung: vi.fn(),
  holeMedien,
  setzeSpurZustand: vi.fn(),
  kannHintergrundWeichzeichnen: () => false,
  setzeHintergrundWeichzeichnen: vi.fn(),
  istGastgeberKennung: (kennung: string) => kennung.startsWith("gastgeber-"),
}));

const getUser = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());

/**
 * Nur die zwei Aufrufe, die die Weiterleitung braucht: die eigene Kennung und
 * die eine Raumzeile. Die Kette `from().select().eq().maybeSingle()` wird so
 * nachgebaut, wie die Seite sie schreibt.
 */
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}));

import { MemoryRouter } from "react-router-dom";
import VideoraumGast from "./VideoraumGast";

/** Ein Bewerbergespräch, wie es nach der Buchung im Raum steht. */
const BEWERBERRAUM = {
  art: "bewerbergespraech" as const,
  titel: "Persönliches Gespräch · Max Mustermann",
  status: "offen" as const,
  termin_at: null,
  dauer_minuten: 35,
  agenda: [],
  hinweis: null,
  transkript_angeboten: false,
  gastgeber: { name: "Jana Kirchner" },
  objekt: {},
};

async function zeige() {
  await act(async () => {
    render(<MemoryRouter><VideoraumGast /></MemoryRouter>);
  });
  // Anmeldung, Raumzeile, Ansicht: drei Runden Mikrotasks.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

/** Alle Ziele, auf die die Seite weitergeleitet hat. */
function ziele(): string[] {
  return navigiere.mock.calls.map((aufruf) => String(aufruf[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  ladeGastAnsicht.mockResolvedValue(BEWERBERRAUM);
  ladeGastSitzung.mockReturnValue(null);
  frageGastStatus.mockResolvedValue(null);
  holeMedien.mockResolvedValue({ stream: null, grund: "Keine Kamera gefunden" });
  maybeSingle.mockResolvedValue({ data: null, error: null });
});

afterEach(() => { vi.restoreAllMocks(); });

describe("Der Bewerber landet in seinem Warteraum", () => {
  it("wird ohne Anmeldung nirgendwohin weitergeleitet", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await zeige();
    expect(ziele()).toEqual([]);
  });

  it("bleibt auch dann im Warteraum, wenn er ein eigenes Konto hat", async () => {
    // Ein Bewerber kann später ein Konto bekommen. Die Zeilensicherheit gibt
    // ihm die Raumzeile trotzdem nicht heraus, die Abfrage kommt leer zurück.
    getUser.mockResolvedValue({ data: { user: { id: "bewerber-1" } } });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await zeige();
    expect(ziele()).toEqual([]);
  });

  it("bleibt im Warteraum, wenn die Abfrage nach dem Raum scheitert", async () => {
    // Eine gestörte Leitung ist etwas anderes als „nicht berechtigt". Ohne
    // diese Unterscheidung würde ein Netzfehler über das Ziel entscheiden.
    getUser.mockResolvedValue({ data: { user: { id: "irgendwer" } } });
    maybeSingle.mockResolvedValue({ data: null, error: { message: "Netz weg" } });
    await zeige();
    expect(ziele()).toEqual([]);
  });
});

describe("Die Seite zum abgelaufenen Link", () => {
  it("redet den Leser weder mit Du noch mit Sie an", async () => {
    /*
     * Diese Seite erscheint, wenn der Raum nicht mehr geladen werden kann.
     * Damit ist auch die Raumart weg, und ohne sie lässt sich nicht sagen, ob
     * ein Kunde oder ein Bewerber davorsitzt. Eine Anrede wäre hier also immer
     * für die eine Hälfte falsch. Bis zum 14.09.2026 stand die Sie-Fassung da,
     * und ein Bewerber wurde ausgerechnet in der Störung gesiezt.
     */
    getUser.mockResolvedValue({ data: { user: null } });
    ladeGastAnsicht.mockResolvedValue(null);
    await zeige();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Dieser Link ist nicht mehr gültig.");
    expect(text.match(/\b(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer)\b/g)).toBeNull();
  });
});

describe("Der Gastgeber dagegen gehört nicht in seinen eigenen Warteraum", () => {
  it("wird auf die Gastgeberansicht geschickt", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "hr-1" } } });
    maybeSingle.mockResolvedValue({ data: { id: "raum-1", gastgeber_id: "hr-1" }, error: null });
    await zeige();
    expect(ziele()).toContain("/videocall/raum/raum-1");
  });

  it("aber nur er selbst, nicht jeder, der die Zeile lesen darf", async () => {
    // Ein Administrator darf jede Raumzeile lesen. Er gehört trotzdem nicht
    // ungefragt in ein fremdes Gespräch.
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    maybeSingle.mockResolvedValue({ data: { id: "raum-1", gastgeber_id: "hr-1" }, error: null });
    await zeige();
    expect(ziele()).toEqual([]);
  });
});
