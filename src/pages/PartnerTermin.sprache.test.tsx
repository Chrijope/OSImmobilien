/**
 * Die Terminseite des Vertriebspartners `/terminwahl/:token`: Sprache und
 * Texte, mit dem echten Store gegen eine nachgebaute Datenbank.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { waehleDatum, waehleUhrzeit } from "@/components/buchung/terminFelderTestHilfe";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ isLoggedIn: true, loading: false }) }));

const netz = vi.hoisted(() => ({
  sprache: null as unknown,
  spracheFehlt: false,
  zugang: null as unknown,
  bestaetigenFehler: null as null | { message: string },
  aufrufe: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: unknown) => {
      netz.aufrufe.push({ name, args });
      if (name === "kundensprache_zum_link") {
        return netz.spracheFehlt
          ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.kundensprache_zum_link" } }
          : { data: netz.sprache, error: null };
      }
      if (name === "partnertermin_zugang") return { data: netz.zugang, error: null };
      if (name === "partnertermin_bestaetigen") {
        return netz.bestaetigenFehler ? { data: null, error: netz.bestaetigenFehler } : { data: null, error: null };
      }
      return { data: null, error: { message: "unbekannt" } };
    },
    functions: { invoke: async () => ({ error: null }) },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

const { default: PartnerTermin } = await import("./PartnerTermin");
const { PARTNER_TERMIN_TEXTE } = await import("./partnerTerminTexte");
const { PARTNERTERMIN_FEHLER_TEXTE } = await import("@/lib/partnerterminFehlerTexte");
const { gedankenstrichFrei, textdateiLuecken } = await import("@/lib/seitenSprache");

/** So antwortet `partnertermin_zugang` (Migration 20260921250000). */
function zugang(teil: Record<string, unknown> = {}) {
  return {
    berater: { name: "Hermann Vogl", email: "os@os-immobilien.com" },
    zeitzone: "Europe/Berlin",
    vorname: "Max",
    anlaesse: [
      {
        anlass: "erstgespraech",
        bezeichnung: "Erstgespraech",
        beschreibung: "Kurzes Kennenlernen am Telefon. Wir klaeren, worum es dir geht und ob wir zueinander passen.",
        dauer_minuten: 30,
        url: "https://calendly.com/hermann/erst",
      },
      {
        anlass: "beratung",
        bezeichnung: "Beratungsgespraech",
        beschreibung: "Das ausfuehrliche Gespraech zu deiner Situation, deinen Zielen und dem passenden Weg dorthin.",
        dauer_minuten: 60,
        url: "https://calendly.com/hermann/beratung",
      },
    ],
    termin: null,
    investment_id: null,
    investments: [],
    // Nur der Besitzer des Links bekommt `kunde`.
    kunde: { name: "Max Muster" },
    ...teil,
  };
}

function zeige(suche = "") {
  return render(
    <MemoryRouter initialEntries={[`/terminwahl/tok1${suche}`]}>
      <Routes><Route path="/terminwahl/:token" element={<PartnerTermin />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Nur die Uhr steht (01.04.2030), damit der 02.04.2030 im Kalender wählbar ist.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-04-01T08:00:00Z"));
  netz.sprache = null;
  netz.spracheFehlt = false;
  netz.zugang = zugang();
  netz.bestaetigenFehler = null;
  netz.aufrufe = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PartnerTermin: Sprache", () => {
  /*
    Seit dem 29.09.2026 nur noch für den Partner. Die Kundensprache aus dem
    Token wird nicht mehr gefragt, Deutsch gilt, außer `?lang=en`.
  */
  it("bleibt Deutsch und fragt die Kundensprache nicht, auch wenn der Kunde Englisch spricht", async () => {
    netz.sprache = "en";
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Termin mit Max");
    expect(screen.getByText("Erstgespräch")).toBeInTheDocument();
    expect(screen.queryByText("Erstgespraech")).not.toBeInTheDocument();
    expect(netz.aufrufe.some((a) => a.name === "kundensprache_zum_link")).toBe(false);
  });

  it("lässt sich mit ?lang=en auf Englisch schalten und übersetzt die festen Anlässe", async () => {
    zeige("?lang=en");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Appointment with Max");
    expect(screen.getByText("Initial call")).toBeInTheDocument();
    expect(screen.getByText("Consultation")).toBeInTheDocument();
    // Feste Dauer seit 29.09.2026, auch wenn die Datenbank 30 schickt.
    expect(screen.getByText("15 to 20 minutes")).toBeInTheDocument();
  });

  it("übersetzt die Fehlermeldung der Datenbank beim Bestätigen, mit Fehlercode", async () => {
    netz.bestaetigenFehler = { message: "Der Termin liegt in der Vergangenheit" };
    zeige("?anlass=beratung&lang=en");
    waehleDatum(await screen.findByLabelText("Date"), "2030-04-02");
    waehleUhrzeit(screen.getByLabelText("Time"), "10:00");
    expect(screen.getByText("Tuesday, 2 April 2030, 10:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Confirm appointment/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `${PARTNERTERMIN_FEHLER_TEXTE.en.vergangenheit} Error code: vergangenheit`,
    );
  });

  /*
    Vor Migration 20260929130000 gibt die Datenbank die Seite noch jedem
    heraus, `kunde` aber nur dem Besitzer. Ohne `kunde` weist die Seite ab.
  */
  it("weist ab, wenn die Antwort keinen Kunden trägt, der Aufrufer also nicht Besitzer ist", async () => {
    netz.zugang = zugang({ kunde: null });
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Dieser Link ist nicht gültig");
    expect(screen.queryByText("Erstgespräch")).not.toBeInTheDocument();
  });
});

describe("Textdateien", () => {
  it("sind in beiden Sprachen vollständig", () => {
    expect(textdateiLuecken(PARTNER_TERMIN_TEXTE.de, PARTNER_TERMIN_TEXTE.en)).toEqual([]);
    expect(textdateiLuecken(PARTNERTERMIN_FEHLER_TEXTE.de, PARTNERTERMIN_FEHLER_TEXTE.en)).toEqual([]);
  });

  it("erzeugen mit Beispielwerten keine Gedankenstriche und kein „advisor“", () => {
    for (const spr of ["de", "en"] as const) {
      const t = PARTNER_TERMIN_TEXTE[spr];
      const beispiele = [
        t.eingetragenMitName("Max"), t.zeitpunkt("Tuesday, 2 April 2030", "10:00"), t.titelMitName("Max"),
        t.iframeTitel("Consultation"), t.objektNummer(2), t.fehlercode("funktionFehlt", "PGRST202, HTTP 404"),
        ...Object.values(t).filter((w): w is string => typeof w === "string"),
      ];
      for (const text of beispiele) expect(gedankenstrichFrei(text), text).toBe(true);
    }
    const englisch = JSON.stringify([PARTNER_TERMIN_TEXTE.en, PARTNERTERMIN_FEHLER_TEXTE.en]).toLowerCase();
    expect(englisch).not.toContain("advisor");
  });

  it("duzen den Partner und sprechen keinen Kunden an", () => {
    const deutsch = JSON.stringify([PARTNER_TERMIN_TEXTE.de, PARTNERTERMIN_FEHLER_TEXTE.de]);
    expect(deutsch).not.toMatch(/\b(Sie|Ihnen|Ihr[em]?)\b/);
    expect(deutsch).not.toMatch(/such dir eine Zeit|Dein Ansprechpartner|meld dich kurz bei uns/);
  });
});

