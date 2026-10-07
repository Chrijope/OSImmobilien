/**
 * Der Videoraum spricht mit dem Gast in dessen Sprache (Kundensprache,
 * Etappe 3, S6).
 *
 * Die Sprache kommt über `kundensprache_zum_link` aus dem Kundenprofil hinter
 * dem Raum, `?lang=` überschreibt nur die Anzeige, Rückfall ist Deutsch. Der
 * Gastgeber im CRM bleibt deutsch: Die geteilten Bausteine nehmen die Sprache
 * mit der Vorgabe Deutsch.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const t = vi.hoisted(() => ({
  sprache: null as unknown,
  spracheFehler: false,
  ansicht: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async (name: string) => {
      if (name === "kundensprache_zum_link") {
        return t.spracheFehler
          ? { data: null, error: { message: "function kundensprache_zum_link does not exist" } }
          : { data: t.sprache, error: null };
      }
      if (name === "videoraum_ansicht") return { data: t.ansicht, error: null };
      return { data: null, error: null };
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: async () => undefined,
  },
}));

const ABGELEHNT =
  "Der Zugriff auf Kamera und Mikrofon wurde abgelehnt. Bitte in den Browsereinstellungen erlauben und die Seite neu laden.";

vi.mock("@/lib/videoraumVerbindung", () => ({
  starteVerbindung: vi.fn(),
  holeMedien: vi.fn(async () => ({ stream: null, grund: ABGELEHNT })),
  setzeSpurZustand: vi.fn(),
  istGastgeberKennung: (kennung: string) => kennung.startsWith("gastgeber-"),
}));

const { default: VideoraumGast } = await import("./VideoraumGast");
const { Warteraum } = await import("@/components/videoraum/Warteraum");
const { Gespraech } = await import("@/components/videoraum/Gespraech");
const {
  GAST_TEXTE, gastTexte, istPlatzhalterName, mitWerten,
} = await import("@/lib/videoraumAnrede");
const {
  MEDIEN_MELDUNGEN_EN, VIDEORAUM_GAST_TEXTE, agendaZurAnzeige, medienMeldung,
} = await import("@/lib/videoraumGastTexte");
const { STANDARD_AGENDA } = await import("@/lib/videoraumAgenda");
const { gastFehlerText, warteHinweisText } = await import("@/lib/videoraumStore");
const { gedankenstrichFrei, textdateiLuecken } = await import("@/lib/seitenSprache");

const TOKEN = "raum-token-123";

function ansicht(zusatz: Record<string, unknown> = {}) {
  return {
    art: "beratung",
    titel: null,
    status: "offen",
    termin_at: null,
    dauer_minuten: 45,
    agenda: [],
    hinweis: null,
    transkript_angeboten: false,
    gastgeber: { name: "Paula Partner" },
    objekt: {},
    ...zusatz,
  };
}

async function zeige(pfad = `/raum/${TOKEN}`) {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[pfad]}>
        <Routes><Route path="/raum/:token" element={<VideoraumGast />} /></Routes>
      </MemoryRouter>,
    );
  });
  // Raum, Sprache und Kamera kommen in eigenen Runden.
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  t.sprache = null;
  t.spracheFehler = false;
  t.ansicht = ansicht();
  document.documentElement.setAttribute("lang", "de");
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => { vi.restoreAllMocks(); });

describe("VideoraumGast: Sprache der Seite", () => {
  it("nimmt die Sprache vom Server", async () => {
    t.sprache = "en";
    await zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Great to haveyou here.");
    expect(screen.getByRole("button", { name: /Enter waiting room/ })).toBeTruthy();
    expect(screen.getByPlaceholderText("First and last name")).toBeTruthy();
    expect(screen.getByText("Your name")).toBeTruthy();
    expect(screen.getByText("End-to-end encrypted")).toBeTruthy();
    expect(screen.getByText("Consultation")).toBeTruthy();
    // Die Meldung von `holeMedien` ist deutsch und wird für den Gast übersetzt.
    expect(screen.getByText(MEDIEN_MELDUNGEN_EN[ABGELEHNT])).toBeTruthy();
    expect(screen.queryByText(ABGELEHNT)).toBeNull();
    // Der Name des Gastgebers bleibt, wie er gepflegt ist.
    expect(screen.getByText("Paula Partner")).toBeTruthy();
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("zeigt einen abgelaufenen Link englisch an", async () => {
    t.sprache = "en";
    t.ansicht = null;
    await zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("This link is no longer valid.");
  });

  it("bleibt Deutsch, wenn die Sprachabfrage fehlt (Migration nicht gelaufen)", async () => {
    t.spracheFehler = true;
    await zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Schön, dass duda bist.");
    expect(screen.getByRole("button", { name: /Warteraum betreten/ })).toBeTruthy();
    expect(screen.getByText(ABGELEHNT)).toBeTruthy();
  });

  it("bleibt Deutsch, wenn am Raum kein Kontakt hängt", async () => {
    t.sprache = null;
    await zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Schön, dass duda bist.");
  });

  it("lässt sich mit ?lang=de für die Anzeige überschreiben", async () => {
    t.sprache = "en";
    await zeige(`/raum/${TOKEN}?lang=de`);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Schön, dass duda bist.");
  });

  it("lässt sich mit ?lang=en für die Anzeige überschreiben", async () => {
    t.sprache = "de";
    await zeige(`/raum/${TOKEN}?lang=en`);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Great to haveyou here.");
  });

  it("übersetzt den gespeicherten Platzhalter statt eines Namens", async () => {
    t.sprache = "en";
    t.ansicht = ansicht({ gastgeber: { name: "Dein Ansprechpartner" } });
    await zeige();
    expect(await screen.findByText("Your contact")).toBeTruthy();
    expect(screen.queryByText("Dein Ansprechpartner")).toBeNull();
  });
});

const steuerung = { tonAn: true, bildAn: true, wechsleTon: () => undefined, wechsleBild: () => undefined };

function warteraumDaten(zusatz: Record<string, unknown> = {}) {
  return {
    art: "beratung" as const,
    gastgeber: { name: "Paula Partner" },
    agenda: [],
    hinweis: "Bitte Gehaltsnachweis bereithalten.",
    dauerMinuten: 45,
    objekt: {},
    berechnung: [],
    naechsteSchritte: [],
    stream: null,
    medienFehler: null,
    steuerung,
    ...zusatz,
  };
}

describe("Warteraum: Englisch", () => {
  it("spricht englisch und nimmt die englische Standardagenda", () => {
    render(<Warteraum daten={warteraumDaten()} name="Anna Muster" sprache="en" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome, Anna.");
    expect(screen.getByText("Paula will be with you shortly")).toBeTruthy();
    expect(screen.getByText("You'll be let in shortly. Please keep this window open.")).toBeTruthy();
    expect(screen.getByText("Agenda · 45 minutes")).toBeTruthy();
    expect(screen.getByText("Your starting point")).toBeTruthy();
    expect(screen.getByText("Setup")).toBeTruthy();
    expect(screen.getByText("Microphone on")).toBeTruthy();
    // Der gepflegte Hinweis bleibt, wie er ist.
    expect(screen.getByText("Bitte Gehaltsnachweis bereithalten.")).toBeTruthy();
  });

  it("lässt eine selbst gepflegte Agenda deutsch", () => {
    const eigene = [{ titel: "Unser eigener Punkt", text: "Frei geschrieben.", minuten: 10 }];
    render(<Warteraum daten={warteraumDaten({ agenda: eigene })} name="Anna" sprache="en" />);
    expect(screen.getByText("Unser eigener Punkt")).toBeTruthy();
    expect(screen.getByText("10 min")).toBeTruthy();
  });

  it("zeigt die Objektvorstellung englisch", () => {
    render(
      <Warteraum
        daten={warteraumDaten({ art: "objektvorstellung", objekt: { kaufpreis: "249.000 €" }, naechsteSchritte: ["Schritt aus dem Raum"] })}
        name="Anna"
        sprache="en"
      />,
    );
    expect(screen.getByText("The property")).toBeTruthy();
    expect(screen.getByText("Purchase price")).toBeTruthy();
    expect(screen.getByText("249.000 €")).toBeTruthy();
    expect(screen.getByText("Schritt aus dem Raum")).toBeTruthy();
    expect(screen.getByText("The property at a glance")).toBeTruthy();
  });

  it("bleibt ohne Sprache deutsch, wie auf den Buchungsseiten und beim Gastgeber", () => {
    render(<Warteraum daten={warteraumDaten()} name="Anna" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Willkommen, Anna.");
    expect(screen.getByText("Deine Ausgangslage")).toBeTruthy();
  });
});

describe("Gespräch: Englisch", () => {
  function zeichne(sprache?: "de" | "en") {
    render(
      <Gespraech
        lokalerStream={null}
        gegenstellen={[]}
        zustand="verbunden"
        gegenName="Paula Partner"
        verbindung={null}
        aufBeenden={() => undefined}
        titel="Consultation"
        schnellEinstellungen={<span />}
        sprache={sprache}
      />,
    );
  }

  it("beschriftet Leiste und Wartehinweis englisch", () => {
    zeichne("en");
    expect(screen.getByText("Waiting for Paula Partner…")).toBeTruthy();
    for (const knopf of ["Sound", "Video", "Share", "People", "Chat", "Devices", "Hang up"]) {
      expect(screen.getByRole("button", { name: knopf })).toBeTruthy();
    }
  });

  it("bleibt ohne Sprache deutsch", () => {
    zeichne();
    expect(screen.getByText("Warte auf Paula Partner…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Auflegen" })).toBeTruthy();
  });
});

describe("Videoraum: Texte vollständig", () => {
  it("hat die Seitentexte in beiden Sprachen", () => {
    expect(textdateiLuecken(VIDEORAUM_GAST_TEXTE.de, VIDEORAUM_GAST_TEXTE.en)).toEqual([]);
  });

  it("hat die Anlasstexte in beiden Sprachen", () => {
    expect(textdateiLuecken(GAST_TEXTE.de, GAST_TEXTE.en)).toEqual([]);
    expect(gastTexte("bewerbergespraech", "en").gespraechTitel).toBe("Introductory meeting");
    expect(gastTexte("beratung", "en").gespraechTitel).toBe("Consultation");
  });

  it("setzt Platzhalter ohne Gedankenstrich ein", () => {
    const en = VIDEORAUM_GAST_TEXTE.en;
    const beispiele = [
      mitWerten(GAST_TEXTE.en.gleichDa, { name: "Paula" }),
      mitWerten(GAST_TEXTE.en.wartenPosition, { position: 3 }),
      mitWerten(GAST_TEXTE.en.stummgeschaltet, { name: "Paula" }),
      mitWerten(en.seite.minuten, { minuten: 45 }),
      mitWerten(en.seite.heute, { zeit: "14:30" }),
      mitWerten(en.seite.datumZeit, { datum: "25 September", zeit: "14:30" }),
      mitWerten(en.warteraum.willkommen, { name: "Anna" }),
      mitWerten(en.gespraech.warteAuf, { name: "Paula" }),
      mitWerten(en.gespraech.eingeklapptMehr, { zahl: 3 }),
      mitWerten(en.neben.teilnehmerTitel, { zahl: 2 }),
      mitWerten(en.chat.rest, { zahl: 12 }),
      mitWerten(en.geraete.alleBilder, { zahl: 9 }),
      warteHinweisText(3, true, "beratung", "en"),
      gastFehlerText(new Error("Raum nicht gefunden"), "beratung", "en"),
    ];
    for (const text of beispiele) {
      expect(text).not.toMatch(/\{\w+\}/);
      expect(gedankenstrichFrei(text), text).toBe(true);
    }
    expect(warteHinweisText(3, true, "beratung", "en")).toContain("number 3");
    expect(gastFehlerText(new Error("Raum nicht gefunden"), "beratung", "en")).toMatch(/^This link is no longer valid/);
    // Ohne Sprache wie bisher Deutsch.
    expect(warteHinweisText(3, true, "beratung")).toContain("Position 3");
  });

  it("kennt jede Meldung zu Kamera, Mikrofon und Hintergrund auf Englisch", () => {
    // Beide Dateien laufen auch beim Gastgeber und liefern deutsche Sätze.
    // Kommt dort ein neuer Satz dazu, fällt er hier auf.
    const quelle = (datei: string) => readFileSync(resolve(process.cwd(), datei), "utf-8");
    const meldungen = [
      ...[...quelle("src/lib/videoraumVerbindung.ts").matchAll(/grund: "([^"]+)"/g)].map((m) => m[1]),
      ...[...quelle("src/lib/videocallHintergrund.ts").matchAll(/aufFehler\?\.\("([^"]+)"\)/g)].map((m) => m[1]),
    ];
    expect(meldungen.length).toBeGreaterThanOrEqual(8);
    for (const meldung of meldungen) {
      expect(MEDIEN_MELDUNGEN_EN[meldung], meldung).toBeTruthy();
      expect(medienMeldung(meldung, "en")).not.toBe(meldung);
      expect(medienMeldung(meldung, "de")).toBe(meldung);
    }
    for (const englisch of Object.values(MEDIEN_MELDUNGEN_EN)) {
      expect(gedankenstrichFrei(englisch), englisch).toBe(true);
    }
  });

  it("übersetzt nur die unveränderte Standardagenda", () => {
    expect(agendaZurAnzeige("beratung", STANDARD_AGENDA.beratung, "en")).toBe(VIDEORAUM_GAST_TEXTE.en.agenda.beratung);
    expect(agendaZurAnzeige("beratung", STANDARD_AGENDA.beratung, "de")).toBe(STANDARD_AGENDA.beratung);
    const geaendert = [{ ...STANDARD_AGENDA.beratung[0], minuten: 99 }, ...STANDARD_AGENDA.beratung.slice(1)];
    expect(agendaZurAnzeige("beratung", geaendert, "en")).toBe(geaendert);
  });

  it("erkennt auch den englischen Platzhalter", () => {
    expect(istPlatzhalterName("Your contact")).toBe(true);
    expect(istPlatzhalterName("Paula Partner")).toBe(false);
  });
});
