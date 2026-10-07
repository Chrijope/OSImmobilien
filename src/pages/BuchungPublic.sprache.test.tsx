/**
 * Die Buchungsseite `/termin/:token` in der Sprache des Kunden
 * (Kundensprache, Etappe 3, S3).
 *
 * Dazu die Vollständigkeit der Textdateien, die S3, S4 und S5 gemeinsam
 * nutzen: Bausteine, Zeitauswahl, Beschriftungen und Ansprechpartnerkarte.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const netz = vi.hoisted(() => ({
  sprache: null as unknown,
  spracheFehlt: false,
  zugang: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string) => {
      if (name === "kundensprache_zum_link") {
        return netz.spracheFehlt
          ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.kundensprache_zum_link" } }
          : { data: netz.sprache, error: null };
      }
      if (name === "buchung_zugang") return { data: netz.zugang, error: null };
      if (name === "buchung_freie_zeiten") return { data: [], error: null };
      return { data: null, error: { message: "unbekannt" } };
    },
    functions: { invoke: async () => ({ error: null }) },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

const { default: BuchungPublic } = await import("./BuchungPublic");
const { BUCHUNG_PUBLIC_TEXTE } = await import("./buchungPublicTexte");
const { BUCHUNG_BAUSTEIN_TEXTE } = await import("@/components/buchung/buchungTexte");
const { BUCHUNG_AUSWAHL_TEXTE } = await import("@/lib/buchungAuswahlTexte");
const { ANSPRECHPARTNER_KARTE_TEXTE } = await import("@/components/videoraum/ansprechpartnerKarteTexte");
const { gedankenstrichFrei, textdateiLuecken } = await import("@/lib/seitenSprache");
const {
  beschriftungDauer, beschriftungTag, beschriftungZeitKnopf, beschriftungZeitraum, deuteBuchungsfehler, teileNachTageszeit,
} = await import("@/lib/buchungAuswahl");

const ZUGANG = {
  art: "persoenlich",
  berater: { name: "Hermann Vogl", email: "hermann@more.immo", telefon: null, bild: null },
  zeitzone: "Europe/Berlin",
  begruessung: null,
  hinweis: null,
  kontakt_bekannt: true,
  vorbelegung: { name: "Max Muster", email: "max@example.com" },
  terminarten: [
    { id: "t1", bezeichnung: "Beratungsgespräch", beschreibung: null, dauer_minuten: 90, anlass: "beratung" },
  ],
};

function zeige(pfad = "/termin/tok1") {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes><Route path="/termin/:token" element={<BuchungPublic />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  netz.sprache = null;
  netz.spracheFehlt = false;
  netz.zugang = ZUGANG;
});

describe("BuchungPublic: Sprache", () => {
  it("nimmt die Sprache vom Server", async () => {
    netz.sprache = "en";
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Choose a time for your appointment.");
    expect(screen.getByText("Appointment booking")).toBeInTheDocument();
    expect(screen.getByText(/When suits you\?/)).toHaveTextContent("1 hour 30 minutes");
    expect(screen.getByText("Your contact")).toBeInTheDocument();
    // Der gepflegte Name bleibt.
    expect(screen.getByText("Hermann Vogl")).toBeInTheDocument();
    expect(await screen.findByText(/Nothing is available in this period\./)).toBeInTheDocument();
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("bleibt Deutsch, wenn die Funktion fehlt", async () => {
    netz.spracheFehlt = true;
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Such dir einen Termin aus.");
    expect(screen.getByText(/Wann passt es dir\?/)).toHaveTextContent("1 Stunde 30 Minuten");
  });

  it("zeigt auch den toten Link in der Sprache des Kunden", async () => {
    netz.sprache = "en";
    netz.zugang = null;
    zeige();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("This booking link is no longer valid.");
  });

  it("lässt sich mit ?lang= überschreiben, in beide Richtungen", async () => {
    netz.sprache = "en";
    const { unmount } = zeige("/termin/tok1?lang=de");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Such dir einen Termin aus.");
    unmount();

    netz.sprache = "de";
    zeige("/termin/tok1?lang=en");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Choose a time for your appointment.");
  });
});

describe("Beschriftungen auf Englisch", () => {
  it("schreibt Datum, Uhrzeit und Dauer britisch, Deutsch bleibt unverändert", () => {
    expect(beschriftungTag("2026-08-04", "en")).toEqual({ wochentag: "Tue", datum: "4 Aug" });
    expect(beschriftungTag("2026-08-04")).toEqual({ wochentag: "Di", datum: "4. Aug." });
    expect(beschriftungZeitraum("2026-08-04T07:30:00Z", 60, "Europe/Berlin", "en"))
      .toBe("Tuesday, 4 August 2026, 09:30 to 10:30");
    expect(beschriftungZeitKnopf("2026-08-04T07:30:00Z", "Europe/Berlin", "en")).toBe("Tuesday, 4 August 2026, 09:30");
    expect(beschriftungDauer(30, "en")).toBe("30 minutes");
    expect(beschriftungDauer(60, "en")).toBe("1 hour");
    expect(beschriftungDauer(150, "en")).toBe("2 hours 30 minutes");
    expect(teileNachTageszeit(["2026-08-04T16:00:00Z"], "Europe/Berlin", "en")[0].name).toBe("Evening");
  });

  it("übersetzt die deutschen Meldungen der Datenbank", () => {
    expect(deuteBuchungsfehler(new Error("Diese Zeit ist inzwischen vergeben"), "en").text)
      .toBe(BUCHUNG_AUSWAHL_TEXTE.en.fehler.vergeben);
    expect(deuteBuchungsfehler(new Error("Dieser Termin liegt zu kurzfristig"), "en").text)
      .toBe("This appointment is too soon. Please choose a later time.");
    // Unbekanntes bekommt den allgemeinen Satz, nie die Rohmeldung.
    expect(deuteBuchungsfehler(new Error("relation does not exist"), "en").text)
      .toBe(BUCHUNG_AUSWAHL_TEXTE.en.fehler.allgemein);
  });
});

describe("Textdateien S3 und gemeinsame Bausteine", () => {
  it("sind in beiden Sprachen vollständig", () => {
    expect(textdateiLuecken(BUCHUNG_PUBLIC_TEXTE.de, BUCHUNG_PUBLIC_TEXTE.en)).toEqual([]);
    expect(textdateiLuecken(BUCHUNG_BAUSTEIN_TEXTE.de, BUCHUNG_BAUSTEIN_TEXTE.en)).toEqual([]);
    expect(textdateiLuecken(BUCHUNG_AUSWAHL_TEXTE.de, BUCHUNG_AUSWAHL_TEXTE.en)).toEqual([]);
    expect(textdateiLuecken(ANSPRECHPARTNER_KARTE_TEXTE.de, ANSPRECHPARTNER_KARTE_TEXTE.en)).toEqual([]);
  });

  it("erzeugen auch mit Beispielwerten keine Gedankenstriche", () => {
    const beispiele: string[] = [];
    for (const spr of ["de", "en"] as const) {
      const p = BUCHUNG_PUBLIC_TEXTE[spr];
      beispiele.push(p.danke("Max"), p.begleitungBestaetigung("Erika Muster"));
      const b = BUCHUNG_BAUSTEIN_TEXTE[spr];
      beispiele.push(b.spanne("4 Aug", "10 Aug"));
      const a = BUCHUNG_AUSWAHL_TEXTE[spr];
      beispiele.push(
        a.tagesdatum(4, "Aug"), a.zeitraum("Tuesday, 4 August 2026", "09:30", "10:30"),
        a.zeitpunkt("Tuesday, 4 August 2026", "09:30"), a.dauer(1), a.dauer(45), a.dauer(60), a.dauer(90), a.dauer(120),
      );
      const k = ANSPRECHPARTNER_KARTE_TEXTE[spr];
      beispiele.push(k.mailAn("Hermann Vogl"), k.anrufen("Hermann Vogl"));
      beispiele.push(beschriftungZeitraum("2026-08-04T07:30:00Z", 90, "Europe/Berlin", spr));
    }
    for (const text of beispiele) expect(gedankenstrichFrei(text), text).toBe(true);
  });

  it("nennt den Berater im Englischen nie „advisor“", () => {
    const alles = JSON.stringify([
      BUCHUNG_PUBLIC_TEXTE.en, BUCHUNG_BAUSTEIN_TEXTE.en, BUCHUNG_AUSWAHL_TEXTE.en, ANSPRECHPARTNER_KARTE_TEXTE.en,
    ]);
    expect(alles.toLowerCase()).not.toContain("advisor");
  });
});
