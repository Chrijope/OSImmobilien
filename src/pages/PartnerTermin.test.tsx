import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { waehleDatum, waehleUhrzeit } from "@/components/buchung/terminFelderTestHilfe";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type React from "react";

/*
 * Der Kalender steht seit dem 26.09.2026 hinter einer Zwei-Klick-Lösung
 * (`ZweiKlickEinbettung`, eigener Test). Hier geht es um die Adresse und den
 * Ablauf, deshalb rendert die Attrappe die Einbettung sofort.
 */
vi.mock("@/components/cookie/ZweiKlickEinbettung", () => ({
  ZweiKlickEinbettung: ({ children }: { children: React.ReactNode }) => children,
}));

const anmeldung = vi.hoisted(() => ({ isLoggedIn: true, loading: false }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => anmeldung }));

import type { PartnerterminZugang } from "@/lib/partnerterminStore";

/**
 * Die Terminseite mit dem eigenen Kalender des Vertriebspartners.
 *
 * Christian hat sie am 21.09.2026 in Auftrag gegeben: erst das Anliegen, dann
 * der fremde Kalender und daneben die gebuchte Zeit. Seit dem 29.09.2026 ist
 * sie ausschließlich für den angemeldeten Partner, dem der Link gehört.
 */

let zugangAntwort: PartnerterminZugang | null = null;
let zugangFehlgrund: "unbekannt" | "migration" | "technisch" | "verbindung" = "unbekannt";
let zugangTechnik: string | undefined;
const bestaetigungen: Array<{ token: string; anlass: string; datum: string; uhrzeit: string; investmentId?: string | null }> = [];
let bestaetigungErgebnis: unknown = {
  ok: true,
  termin: { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung", bezeichnung: "Beratungsgespraech", dauerMinuten: 60, korrigierbar: true, investmentId: null },
};

vi.mock("@/lib/partnerterminStore", async () => {
  const echt = await vi.importActual<typeof import("@/lib/partnerterminStore")>("@/lib/partnerterminStore");
  return {
    ...echt,
    ladePartnerterminMitGrund: vi.fn(async () => ({
      zugang: zugangAntwort,
      grund: zugangAntwort ? undefined : zugangFehlgrund,
      technik: zugangAntwort ? undefined : zugangTechnik,
    })),
    bestaetigePartnertermin: vi.fn(async (token: string, anlass: string, datum: string, uhrzeit: string, investmentId?: string | null) => {
      bestaetigungen.push(investmentId ? { token, anlass, datum, uhrzeit, investmentId } : { token, anlass, datum, uhrzeit });
      return bestaetigungErgebnis;
    }),
  };
});

import PartnerTermin from "./PartnerTermin";
import { PARTNERTERMIN_FEHLER_TEXTE } from "@/lib/partnerterminFehlerTexte";
import { bestaetigePartnertermin, ladePartnerterminMitGrund } from "@/lib/partnerterminStore";

function LoginAnzeige() {
  const ort = useLocation();
  return <p>Anmeldeseite {ort.search}</p>;
}

function zeichne(token = "tok1", suche = "") {
  return render(
    <MemoryRouter initialEntries={[`/terminwahl/${token}${suche}`]}>
      <Routes>
        <Route path="/terminwahl/:token" element={<PartnerTermin />} />
        <Route path="/login" element={<LoginAnzeige />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Datum und Uhrzeit über die eigene Auswahl setzen, so wie ein Partner klickt
 * (seit 29.09.2026 statt der nativen Browserfelder, siehe `TerminFelder`).
 * Heute steht in diesen Tests auf dem 01.04.2030, der Kalender öffnet also im
 * April 2030.
 */
function setzeDatum(iso: string) {
  waehleDatum(document.getElementById("partnertermin-datum")!, iso);
}

function setzeUhrzeit(hhmm: string) {
  waehleUhrzeit(document.getElementById("partnertermin-uhrzeit")!, hhmm);
}

const BERATER = {
  name: "Hermann Vogl",
  email: null,
  telefon: null,
  bild: null,
  position: null,
  ort: null,
  zitat: null,
};

const KUNDE = { name: "Max Muster", email: "max@example.de", telefon: "0170 1234567" };

function zugang(teil: Partial<PartnerterminZugang> = {}): PartnerterminZugang {
  return {
    berater: BERATER,
    zeitzone: "Europe/Berlin",
    vorname: "Max",
    anlaesse: [
      {
        anlass: "erstgespraech",
        bezeichnung: "Erstgespraech",
        beschreibung: "Kurzes Kennenlernen am Telefon.",
        dauerMinuten: 30,
        url: "https://calendly.com/hermann/erst",
      },
      {
        anlass: "beratung",
        bezeichnung: "Beratungsgespraech",
        beschreibung: "Das ausfuehrliche Gespraech.",
        dauerMinuten: 60,
        url: "https://calendly.com/hermann/beratung",
      },
    ],
    termin: null,
    termine: [],
    investmentId: null,
    investments: [],
    // Nur der Besitzer des Links bekommt `kunde`.
    kunde: KUNDE,
    ...teil,
  };
}

beforeEach(() => {
  // Nur die Uhr steht, Zeitgeber laufen echt, sonst warten findBy und waitFor ewig.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-04-01T08:00:00Z"));
  anmeldung.isLoggedIn = true;
  anmeldung.loading = false;
  zugangAntwort = zugang();
  zugangFehlgrund = "unbekannt";
  zugangTechnik = undefined;
  bestaetigungen.length = 0;
  bestaetigungErgebnis = {
    ok: true,
    termin: { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung", bezeichnung: "Beratungsgespraech", dauerMinuten: 60, korrigierbar: true, investmentId: null },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Nur für den Partner, dem der Link gehört", () => {
  it("verlangt ohne Anmeldung die Anmeldung und fragt die Datenbank nicht", async () => {
    anmeldung.isLoggedIn = false;
    const vorher = vi.mocked(ladePartnerterminMitGrund).mock.calls.length;
    zeichne("tok1", "?anlass=beratung");
    expect(await screen.findByText("Bitte melde dich an")).toBeInTheDocument();
    expect(vi.mocked(ladePartnerterminMitGrund).mock.calls.length).toBe(vorher);
    expect(screen.queryByText("Max Muster")).not.toBeInTheDocument();
  });

  it("führt zur Anmeldung und danach zurück auf genau diese Seite", async () => {
    anmeldung.isLoggedIn = false;
    zeichne("tok1", "?anlass=beratung");
    fireEvent.click(await screen.findByRole("button", { name: /Zur Anmeldung/ }));
    expect(await screen.findByText(`Anmeldeseite ?redirect=${encodeURIComponent("/terminwahl/tok1?anlass=beratung")}`)).toBeInTheDocument();
  });

  it("wartet, solange die Anmeldung noch lädt", async () => {
    anmeldung.loading = true;
    anmeldung.isLoggedIn = false;
    zeichne();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Bitte melde dich an")).not.toBeInTheDocument();
  });

  /*
    Wer angemeldet ist, aber nicht Besitzer, bekommt von der Datenbank keinen
    `kunde`. Die Seite weist dann neutral ab, wie bei einem ungültigen Link,
    auch solange die Migration 20260929130000 noch nicht gelaufen ist.
  */
  it("weist einen Angemeldeten ab, dem der Link nicht gehört, ohne etwas zu verraten", async () => {
    zugangAntwort = zugang({ kunde: null, investments: [{ id: "inv-a", bezeichnung: "Haus A, WE 1" }] });
    zeichne();
    expect(await screen.findByText("Dieser Link ist nicht gültig")).toBeInTheDocument();
    expect(screen.getByText(/gehört zu einem anderen Konto.*Fehlercode: linkUngueltig$/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Hermann Vogl|Haus A|Max|Worum geht es/);
  });

  it("zeigt die Seite dem Besitzer auch mit einem Kunden ohne Angaben", async () => {
    zugangAntwort = zugang({ kunde: { name: "", email: "", telefon: "" } });
    zeichne();
    await screen.findByText("Worum geht es?");
    expect(screen.getByText(/weder E-Mail noch Telefon/)).toBeInTheDocument();
  });

  it("funktioniert mit alten Links, die noch `?intern=1` tragen", async () => {
    zeichne("tok1", "?intern=1&anlass=beratung");
    expect(await screen.findByTitle("Zeit aussuchen: Beratungsgespräch")).toBeInTheDocument();
    expect(screen.getByText(/Termin mit Max/)).toBeInTheDocument();
  });
});

describe("Schritt 1, das Anliegen", () => {
  it("zeigt jede Gesprächsart, für die ein Kalender hinterlegt ist", async () => {
    zeichne();
    await screen.findByText("Worum geht es?");
    expect(screen.getByText("Erstgespräch")).toBeInTheDocument();
    expect(screen.getByText("Beratungsgespräch")).toBeInTheDocument();
  });

  it("überspringt den Schritt, wenn es nur einen Kalender gibt", async () => {
    zugangAntwort = zugang({ anlaesse: [zugang().anlaesse[1]] });
    zeichne();
    await screen.findByText(/Zeit im Kalender aussuchen/);
    expect(screen.queryByText("Worum geht es?")).not.toBeInTheDocument();
  });
});

describe("Ein Schritt für Kalender und Bestätigung", () => {
  it("zeigt beides gleichzeitig, ohne Klick dazwischen", async () => {
    zeichne();
    await screen.findByText("Worum geht es?");
    fireEvent.click(screen.getByText("Beratungsgespräch"));

    await screen.findByTitle("Zeit aussuchen: Beratungsgespräch");
    expect(screen.getByLabelText("Datum")).toBeInTheDocument();
    expect(screen.getByLabelText("Uhrzeit")).toBeInTheDocument();
    expect(screen.getByText(/Termin bestätigen/)).toBeInTheDocument();
    expect(screen.queryByText(/Ich habe gebucht/)).not.toBeInTheDocument();
  });

  it("spricht den Partner an", async () => {
    zeichne("tok1", "?anlass=beratung");
    await screen.findByLabelText("Datum");
    expect(screen.getByText(/Termin mit Max/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/such dir eine Zeit aus|Gebuchte Zeit bestätigen/);
  });
});

describe("Das Anliegen aus der Adresse", () => {
  it("überspringt die Auswahl, wenn der Anlass in der Adresse steht", async () => {
    zeichne("tok1", "?anlass=beratung");
    await screen.findByTitle("Zeit aussuchen: Beratungsgespräch");
    expect(screen.queryByText("Worum geht es?")).not.toBeInTheDocument();
  });

  it("lässt trotzdem ein anderes Anliegen wählen", async () => {
    zeichne("tok1", "?anlass=beratung");
    await screen.findByTitle("Zeit aussuchen: Beratungsgespräch");
    fireEvent.click(screen.getByText(/Anderes Anliegen/));
    await screen.findByText("Worum geht es?");
  });

  it("ignoriert einen Anlass, für den kein Kalender hinterlegt ist", async () => {
    zeichne("tok1", "?anlass=finanzierungsgespraech");
    await screen.findByText("Worum geht es?");
  });
});

describe("Schritt 2, der Kalender des Partners", () => {
  it("bettet genau den Kalender der gewählten Gesprächsart ein", async () => {
    zeichne();
    await screen.findByText("Worum geht es?");
    fireEvent.click(screen.getByText("Beratungsgespräch"));

    const rahmen = await screen.findByTitle("Zeit aussuchen: Beratungsgespräch");
    expect(rahmen.getAttribute("src")).toContain("https://calendly.com/hermann/beratung");
  });

  it("hängt die Calendly-Zusätze nur an eine Calendly-Adresse", async () => {
    zugangAntwort = zugang({
      anlaesse: [{ ...zugang().anlaesse[0], url: "https://termine.example.de/hermann" }],
    });
    zeichne();
    const rahmen = await screen.findByTitle("Zeit aussuchen: Erstgespräch");
    expect(rahmen.getAttribute("src")).toBe("https://termine.example.de/hermann");
  });
});

describe("Die Bestätigung neben dem Kalender", () => {
  async function eintragen(suche = "?anlass=beratung") {
    zeichne("tok1", suche);
    await screen.findByLabelText("Datum");
    setzeDatum("2030-04-02");
    setzeUhrzeit("10:00");
  }

  async function abschicken() {
    await eintragen();
    fireEvent.click(screen.getByText(/Termin bestätigen/));
    return screen.findByRole("alert");
  }

  it("gibt Anliegen, Datum und Uhrzeit weiter", async () => {
    await eintragen();
    fireEvent.click(screen.getByText(/Termin bestätigen/));
    await waitFor(() => expect(bestaetigungen).toHaveLength(1));
    expect(bestaetigungen[0]).toEqual({ token: "tok1", anlass: "beratung", datum: "2030-04-02", uhrzeit: "10:00" });
  });

  it("schickt nichts ab, solange Datum oder Uhrzeit fehlen", async () => {
    zeichne("tok1", "?anlass=beratung");
    await screen.findByLabelText("Datum");
    setzeDatum("2030-04-02");
    fireEvent.click(screen.getByText(/Termin bestätigen/));
    expect(bestaetigungen).toHaveLength(0);
  });

  /*
    Seit dem 29.09.2026 sagt jede Meldung, wo der Fehler liegt und was zu tun
    ist, dazu der Fehlercode für den Support.
  */
  it("zeigt bei einer Störung Ursache, nächsten Schritt und Fehlercode", async () => {
    bestaetigungErgebnis = { ok: false, grund: "egal", code: "verbindung", technik: "PGRST002, HTTP 503" };
    const meldung = await abschicken();
    expect(meldung).toHaveTextContent(
      `${PARTNERTERMIN_FEHLER_TEXTE.de.verbindung} Fehlercode: verbindung (PGRST002, HTTP 503)`,
    );
  });

  it.each([
    ["gespraechsart", /kein Kalenderlink mit https/],
    ["linkUngueltig", /„Meeting“/],
    ["zuSchnell", /20 Buchungen/],
    ["vergangenheit", /Vergangenheit/],
  ])("nennt bei %s den Fall und den Code ohne Technik", async (code, satz) => {
    bestaetigungErgebnis = { ok: false, grund: "egal", code };
    const meldung = await abschicken();
    expect(meldung).toHaveTextContent(satz);
    expect(meldung).toHaveTextContent(new RegExp(`Fehlercode: ${code}$`));
  });

  it("zeigt auf Englisch den englischen Satz mit Code", async () => {
    bestaetigungErgebnis = { ok: false, grund: "egal", code: "zukunft" };
    zeichne("tok1", "?anlass=beratung&lang=en");
    await screen.findByLabelText("Date");
    setzeDatum("2030-04-02");
    setzeUhrzeit("10:00");
    fireEvent.click(screen.getByText(/Confirm appointment/));
    expect(await screen.findByRole("alert")).toHaveTextContent(`${PARTNERTERMIN_FEHLER_TEXTE.en.zukunft} Error code: zukunft`);
  });

  it("sagt, dass der Termin auch ohne diesen Schritt steht", async () => {
    zeichne("tok1", "?anlass=beratung");
    await screen.findByLabelText("Datum");
    expect(screen.getByText(/auch ohne diesen Schritt/)).toBeInTheDocument();
  });
});

/*
  Seit dem 29.09.2026 bekommt jede Gesprächsart ihren eigenen Termin. Vorher
  überschrieb ein Beratungsgespräch das Erstgespräch am selben Link.
  „Zeit korrigieren“ gibt es nur für dieselbe Gesprächsart, solange ihr
  Termin nicht vorbei ist.
*/
describe("Je Gesprächsart ein eigener Termin", () => {
  const TERMIN = {
    datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung", bezeichnung: "Beratungsgespraech",
    dauerMinuten: 60, korrigierbar: true, investmentId: null,
  };

  it("zeigt den Termin der Gesprächsart aus der Adresse wieder an, mit dem Kunden daneben", async () => {
    zugangAntwort = zugang({ termin: TERMIN, termine: [TERMIN] });
    zeichne("tok1", "?anlass=beratung");
    await screen.findByText("Termin steht");
    expect(screen.getByText("Termin mit Max ist eingetragen.")).toBeInTheDocument();
    expect(screen.getByText(/Dienstag, 2. April 2030, 10:00 Uhr/)).toBeInTheDocument();
    expect(screen.getByText("Max Muster")).toBeInTheDocument();
    expect(screen.getByText(/Zeit korrigieren/)).toBeInTheDocument();
  });

  it("lässt ihn korrigieren, ohne dass der Kalender neu gewählt werden muss", async () => {
    zugangAntwort = zugang({ termin: TERMIN, termine: [TERMIN] });
    zeichne("tok1", "?anlass=beratung");
    await screen.findByText("Termin steht");
    fireEvent.click(screen.getByText(/Zeit korrigieren/));
    await screen.findByLabelText("Datum");
    expect(screen.getByLabelText("Datum")).toHaveTextContent("02.04.2030");
    expect(screen.getByText(/Wenn du hier einträgst, änderst du ihn/)).toBeInTheDocument();
    expect(screen.getByTitle("Zeit aussuchen: Beratungsgespräch")).toBeInTheDocument();
  });

  it("zeigt ohne Anlass in der Adresse die Auswahl, mit dem schon eingetragenen Termin", async () => {
    zugangAntwort = zugang({ termin: TERMIN, termine: [TERMIN] });
    zeichne();
    await screen.findByText("Worum geht es?");
    expect(screen.queryByText("Termin steht")).not.toBeInTheDocument();
    expect(screen.getByText("Eingetragen: Dienstag, 2. April 2030, 10:00 Uhr")).toBeInTheDocument();
  });

  it("trägt für eine andere Gesprächsart einen neuen Termin ein, statt den vorhandenen zu ändern", async () => {
    zugangAntwort = zugang({ termin: TERMIN, termine: [TERMIN] });
    zeichne();
    await screen.findByText("Worum geht es?");
    fireEvent.click(screen.getByText("Erstgespräch"));
    await screen.findByLabelText("Datum");
    expect(screen.getByLabelText("Datum")).toHaveTextContent("TT.MM.JJJJ");
    expect(screen.queryByText(/änderst du ihn/)).not.toBeInTheDocument();
    setzeDatum("2030-04-09");
    setzeUhrzeit("09:00");
    fireEvent.click(screen.getByText(/Termin bestätigen/));
    await waitFor(() => expect(bestaetigungen).toHaveLength(1));
    expect(bestaetigungen[0]).toMatchObject({ anlass: "erstgespraech", datum: "2030-04-09", uhrzeit: "09:00" });
  });

  it("führt nach dem Eintragen zur nächsten Gesprächsart zurück", async () => {
    zeichne("tok1", "?anlass=beratung");
    await screen.findByLabelText("Datum");
    setzeDatum("2030-04-02");
    setzeUhrzeit("10:00");
    fireEvent.click(screen.getByText(/Termin bestätigen/));
    await screen.findByText("Termin steht");
    fireEvent.click(screen.getByText(/Weiteren Termin eintragen/));
    await screen.findByText("Worum geht es?");
    // Der eben eingetragene steht jetzt an seiner Gesprächsart.
    expect(screen.getByText("Eingetragen: Dienstag, 2. April 2030, 10:00 Uhr")).toBeInTheDocument();
  });

  it("bietet für einen vorbeien Termin kein Korrigieren an, sondern einen neuen", async () => {
    const vorbei = { ...TERMIN, datum: "2026-09-01", korrigierbar: false };
    zugangAntwort = zugang({ termin: vorbei, termine: [vorbei] });
    zeichne("tok1", "?anlass=beratung");
    await screen.findByLabelText("Datum");
    expect(screen.queryByText("Termin steht")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Datum")).toHaveTextContent("TT.MM.JJJJ");
    expect(screen.queryByText(/änderst du ihn/)).not.toBeInTheDocument();
  });

  it("belegt „Gehört zu“ mit dem Investment des bisherigen Termins vor", async () => {
    const mitInvestment = { ...TERMIN, anlass: "erstgespraech", investmentId: "inv-b" };
    zugangAntwort = zugang({
      termine: [mitInvestment],
      investments: [{ id: "inv-a", bezeichnung: "Haus A" }, { id: "inv-b", bezeichnung: "Haus B" }],
    });
    zeichne("tok1", "?anlass=beratung");
    expect(await screen.findByLabelText("Gehört zu")).toHaveValue("inv-b");
  });

  it("belegt nicht mit einem Investment vor, das nicht mehr läuft", async () => {
    const mitInvestment = { ...TERMIN, anlass: "erstgespraech", investmentId: "inv-alt" };
    zugangAntwort = zugang({
      termine: [mitInvestment],
      investments: [{ id: "inv-a", bezeichnung: "Haus A" }, { id: "inv-b", bezeichnung: "Haus B" }],
    });
    zeichne("tok1", "?anlass=beratung");
    expect(await screen.findByLabelText("Gehört zu")).toHaveValue("");
  });
});

describe("Die Kundenkarte", () => {
  it("zeigt in Schritt 1 den Kunden mit Telefon und E-Mail zum Anklicken, ohne Foto", async () => {
    zugangAntwort = zugang({ berater: { ...BERATER, bild: "https://example.de/partnerfoto.jpg" } });
    const { container } = zeichne();
    await screen.findByText("Worum geht es?");
    expect(screen.getByText("Kunde")).toBeInTheDocument();
    expect(screen.getByText("Max Muster")).toBeInTheDocument();
    expect(screen.getByText("max@example.de").closest("a")).toHaveAttribute("href", "mailto:max@example.de");
    expect(screen.getByText("0170 1234567").closest("a")).toHaveAttribute("href", "tel:01701234567");
    expect(screen.getByRole("button", { name: "E-Mail kopieren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telefonnummer kopieren" })).toBeInTheDocument();
    expect(container.querySelector('img[src*="partnerfoto"]')).toBeNull();
    expect(screen.queryByText("Hermann Vogl")).not.toBeInTheDocument();
  });

  it("bleibt in Schritt 2 neben dem eingebetteten Kalender stehen", async () => {
    zeichne("tok1", "?anlass=beratung");
    await screen.findByTitle("Zeit aussuchen: Beratungsgespräch");
    expect(screen.getByText("Max Muster")).toBeInTheDocument();
    expect(screen.getByText("0170 1234567")).toBeInTheDocument();
  });

  it("bleibt in Schritt 2 stehen, wenn der Kalender nur als Link aufgeht", async () => {
    zugangAntwort = zugang({ anlaesse: [{ ...zugang().anlaesse[0], url: "https://fantastical.app/jemand/termin" }] });
    zeichne();
    await screen.findByText(/Kalender öffnen/);
    expect(screen.queryByTitle(/Zeit aussuchen/)).not.toBeInTheDocument();
    expect(screen.getByText("Max Muster")).toBeInTheDocument();
  });

  it("kopiert die Telefonnummer", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    zeichne();
    await screen.findByText("Max Muster");
    fireEvent.click(screen.getByRole("button", { name: "Telefonnummer kopieren" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("0170 1234567"));
  });
});

/*
  Christian am 29.09.2026: Erstgespräch „15 bis 20 Minuten“, Beratungsgespräch
  „45 Minuten“, fest. Vorher standen dort 30 Minuten (Standard) und bei einem
  Partner 15 Minuten (eigene Terminart). Objekt- und Finanzierungsgespräch
  zeigen weiter die Dauer aus der Datenbank.
*/
describe("Feste Dauer für Erstgespräch und Beratungsgespräch", () => {
  const MIT_ALTEN_DAUERN = () => zugang({
    anlaesse: [
      { ...zugang().anlaesse[0], dauerMinuten: 30 },
      { ...zugang().anlaesse[1], dauerMinuten: 15 },
      { anlass: "objektvorstellung", bezeichnung: "Objektgespraech", beschreibung: "Ein Objekt.", dauerMinuten: 60, url: "https://calendly.com/x/obj" },
    ],
  });

  it("zeigt in der Auswahl die festen Texte, gleich was die Datenbank schickt", async () => {
    zugangAntwort = MIT_ALTEN_DAUERN();
    zeichne();
    await screen.findByText("Worum geht es?");
    expect(screen.getByText("15 bis 20 Minuten")).toBeInTheDocument();
    expect(screen.getByText("45 Minuten")).toBeInTheDocument();
    expect(screen.getByText("1 Stunde")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/(^|[^\d])(30|15) Minuten/);
  });

  it.each([
    ["erstgespraech", "15 bis 20 Minuten"],
    ["beratung", "45 Minuten"],
  ])("zeigt beim %s im Kasten über dem Kalender %s", async (anlass, text) => {
    zugangAntwort = MIT_ALTEN_DAUERN();
    zeichne("tok1", `?anlass=${anlass}`);
    expect(await screen.findByText(`Zeit im Kalender aussuchen · ${text}`)).toBeInTheDocument();
  });

  it("zeigt die feste Dauer auch am eingetragenen Termin", async () => {
    bestaetigungErgebnis = {
      ok: true,
      termin: { datum: "2030-04-02", uhrzeit: "10:00", anlass: "beratung", bezeichnung: "Beratungsgespraech", dauerMinuten: 60, korrigierbar: true, investmentId: null },
    };
    zeichne("tok1", "?anlass=beratung");
    await screen.findByLabelText("Datum");
    setzeDatum("2030-04-02");
    setzeUhrzeit("10:00");
    fireEvent.click(screen.getByText(/Termin bestätigen/));
    await screen.findByText("Termin steht");
    expect(screen.getByText("45 Minuten")).toBeInTheDocument();
  });

  it("zeigt auf Englisch die englischen Texte", async () => {
    zugangAntwort = MIT_ALTEN_DAUERN();
    zeichne("tok1", "?lang=en");
    await screen.findByText("15 to 20 minutes");
    expect(screen.getByText("45 minutes")).toBeInTheDocument();
  });
});

describe("Umlaute", () => {
  const ERSATZ = /gespraech|klaeren|ausfuehrlich|naechsten|Sucht die Zeit|tragt sie/i;

  it("zeigt Anliegen und Beschreibungen mit echten Umlauten", async () => {
    zugangAntwort = zugang({
      anlaesse: [
        ...zugang().anlaesse,
        { anlass: "finanzierungsgespraech", bezeichnung: "Finanzierungsgespraech", beschreibung: "Die naechsten Schritte mit der Bank.", dauerMinuten: 60, url: "https://calendly.com/x/fin" },
      ],
    });
    const { container } = zeichne();
    await screen.findByText("Worum geht es?");
    expect(screen.getByText("Erstgespräch")).toBeInTheDocument();
    expect(screen.getByText("Finanzierungsgespräch")).toBeInTheDocument();
    expect(screen.getByText(/klären, worum es dem Kunden geht/)).toBeInTheDocument();
    expect(screen.getByText(/die nächsten Schritte mit der Bank/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(ERSATZ);
  });

  it("zeigt auch Schritt 2 und den eingetragenen Termin ohne Ersatzschreibweise", async () => {
    zeichne("tok1", "?anlass=beratung");
    const rahmen = await screen.findByTitle("Zeit aussuchen: Beratungsgespräch");
    expect(rahmen.getAttribute("title")).not.toMatch(ERSATZ);
    expect(document.body.textContent).not.toMatch(ERSATZ);
    setzeDatum("2030-04-02");
    setzeUhrzeit("10:00");
    fireEvent.click(screen.getByText(/Termin bestätigen/));
    await screen.findByText("Termin steht");
    expect(screen.getByText("Beratungsgespräch")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(ERSATZ);
  });
});

describe("Was beim Laden schiefgehen kann", () => {
  it("nennt beim toten Link den Weg über „Meeting“ und den Code", async () => {
    zugangAntwort = null;
    zeichne();
    await screen.findByText("Dieser Link ist nicht gültig");
    expect(screen.getByText(/über „Meeting“ die Terminseite neu.*Fehlercode: linkUngueltig$/)).toBeInTheDocument();
  });

  it("nennt eine Störung beim Laden samt Code", async () => {
    zugangAntwort = null;
    zugangFehlgrund = "verbindung";
    zugangTechnik = "PGRST001, HTTP 503";
    zeichne();
    await screen.findByText("Das hat gerade nicht geklappt");
    expect(screen.getByText(/Verbindung.*Fehlercode: verbindung \(PGRST001, HTTP 503\)/)).toBeInTheDocument();
  });

  it("nennt eine fehlende Datenbankfunktion mit Hinweis auf den Support", async () => {
    zugangAntwort = null;
    zugangFehlgrund = "migration";
    zugangTechnik = "PGRST202, HTTP 404";
    zeichne();
    expect(await screen.findByText(/Funktion für die Terminseite.*Support.*Fehlercode: funktionFehlt \(PGRST202, HTTP 404\)/)).toBeInTheDocument();
  });

  it("erklärt, wo der Kalender fehlt, wenn noch keiner hinterlegt ist", async () => {
    zugangAntwort = zugang({ anlaesse: [] });
    zeichne();
    await screen.findByText("Dein Terminkalender ist noch nicht eingerichtet");
    expect(screen.getByText(/Buchungskalender-Links/)).toBeInTheDocument();
  });
});

/*
  Hat der Kunde mehrere laufende Investments und legt der Link keines fest,
  muss der Partner sagen, um welches es geht. Ohne Wahl hinge der Termin an
  keinem Investment, und keine Stufe rueckte vor (29.09.2026).
*/
describe("Gehört zu", () => {
  const ZWEI = [
    { id: "inv-a", bezeichnung: "Haus A, WE 1" },
    { id: "inv-b", bezeichnung: "Haus B, WE 7" },
  ];

  async function eintragen() {
    zeichne("tok1", "?anlass=beratung");
    await screen.findByLabelText("Datum");
    setzeDatum("2030-04-02");
    setzeUhrzeit("10:00");
  }

  it("ist bei mehreren Investments sichtbar und Pflicht, die Wahl geht mit", async () => {
    zugangAntwort = zugang({ investments: ZWEI });
    await eintragen();
    const knopf = screen.getByRole("button", { name: /Termin bestätigen/ });
    expect(screen.getByLabelText("Gehört zu")).toBeInTheDocument();
    expect(knopf).toBeDisabled();
    fireEvent.click(knopf);
    expect(bestaetigungen).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Gehört zu"), { target: { value: "inv-b" } });
    expect(knopf).not.toBeDisabled();
    fireEvent.click(knopf);
    await waitFor(() => expect(bestaetigungen).toHaveLength(1));
    expect(bestaetigungen[0].investmentId).toBe("inv-b");
  });

  it("wählt bei genau einem Investment automatisch und fragt nicht", async () => {
    zugangAntwort = zugang({ investments: [ZWEI[0]] });
    await eintragen();
    expect(screen.queryByLabelText("Gehört zu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Termin bestätigen/ }));
    await waitFor(() => expect(bestaetigungen).toHaveLength(1));
    expect(bestaetigungen[0].investmentId).toBe("inv-a");
  });

  it("fragt nicht, wenn der Link das Investment schon festlegt", async () => {
    zugangAntwort = zugang({ investments: ZWEI, investmentId: "inv-a" });
    await eintragen();
    expect(screen.queryByLabelText("Gehört zu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Termin bestätigen/ })).not.toBeDisabled();
  });

  it("sperrt den Knopf, solange die Bestätigung samt Wiederholungen läuft", async () => {
    let freigeben: (wert: unknown) => void = () => {};
    vi.mocked(bestaetigePartnertermin).mockImplementationOnce(() => new Promise((r) => { freigeben = r; }) as never);
    await eintragen();
    const vorher = vi.mocked(bestaetigePartnertermin).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Termin bestätigen/ }));
    const knopf = document.querySelector('button[type="submit"]');
    await waitFor(() => expect(knopf).toBeDisabled());
    // Ein zweiter Klick währenddessen schickt nichts ein zweites Mal ab.
    fireEvent.click(knopf!);
    expect(vi.mocked(bestaetigePartnertermin).mock.calls.length).toBe(vorher + 1);
    freigeben(bestaetigungErgebnis);
    await screen.findByText("Termin steht");
  });
});
