import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// jsdom bringt hier weder localStorage (Draft) noch sessionStorage
// (Schrittmerker) mit.
function baueSpeicher() {
  const speicher = new Map<string, string>();
  return {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  };
}
Object.defineProperty(window, "localStorage", { writable: true, value: baueSpeicher() });
Object.defineProperty(window, "sessionStorage", { writable: true, value: baueSpeicher() });

// Der Reiter Erstgespräch als Schritt-Ansicht: Kopfkarte mit Leiste,
// einklappbare Karten, Stationskarte und Seitenleiste. Store, Supabase und
// Kontext werden gemockt, damit kein echter Netz- oder Cache-Zugriff passiert.

vi.mock("@/lib/bewerbungStore", () => ({
  updateBewerber: vi.fn(),
  changeBewerberStatus: vi.fn(),
}));

// Der Vorab-Fragebogen kommt aus der Tabelle bewerber_formular; Tests, die
// Vorwissen brauchen, setzen `formularDaten`.
let formularDaten: { antworten: Record<string, string | string[]>; eingereicht_am: string } | null = null;

// Die Abfragekette wird als Kettenbau nachgebildet: Jeder Aufruf gibt wieder
// dasselbe Objekt zurück, erst `maybeSingle` schließt ab.
vi.mock("@/integrations/supabase/client", () => {
  const kette = (tabelle: string) => {
    const k: Record<string, unknown> = {};
    for (const glied of ["select", "eq", "order", "limit"]) k[glied] = () => k;
    k.maybeSingle = () => Promise.resolve({ data: tabelle === "bewerber_formular" ? formularDaten : null, error: null });
    k.then = undefined;
    k.update = () => ({ eq: () => Promise.resolve({ data: null, error: null }) });
    return k;
  };
  return {
    supabase: {
      from: (tabelle: string) => kette(tabelle),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
});

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ authUser: null }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { ErstgespraechsTab } from "./ErstgespraechsTab";
import { supabase } from "@/integrations/supabase/client";
import type { Bewerber, ErstgespraechSkript } from "@/lib/bewerbungStore";

const LEERES_SKRIPT: ErstgespraechSkript = {
  ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
  einwand: "", budget: "", naechsterSchritt: "",
  durchgefuehrtAm: "", durchgefuehrtVon: "",
};

function baueBewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "test-bewerber-1",
    vorname: "Max",
    nachname: "Muster",
    email: "max@example.com",
    telefon: "",
    ort: "",
    quelle: "",
    beworben: "",
    stelleId: "",
    stelleTitel: "",
    status: "Erstgespraech",
    bewertung: 0,
    erstelltAm: new Date().toISOString(),
    typ: "", typLabel: "", typBeschreibung: "", typEignung: "", erfahrung: "",
    motivation: "", notizen: "", ziele: "", beschaeftigungsart: "", onboardingTerminId: "",
    lebenslaufUrl: "", dokumente: [], vertragStatus: "nicht_gesendet", vertragDatum: "",
    benachrichtigungen: [], chatVerknuepft: false,
    ausgangslage: "", zielBest: "", wieStarten: "",
    notizenLog: [], adresse: "", rechnungsAdresse: "",
    closingTerminDatum: "", closingTerminUhrzeit: "",
    erstgespraechSkript: { ...LEERES_SKRIPT },
    paketwahl: "", zahlungsweise: "",
    vertragPdfUrl: "", vertragSignedPdfUrl: "", vertragSignedAt: "", vertragHrName: "",
    vertragVersion: 0, rechnungNr: "", rechnungPdfUrl: "", rechnungErstelltAm: "",
    rechnungBezahltBestaetigungen: [], rechnungBezahltAm: "",
    userAccountId: "", userInviteSentAt: "", karriereStufe: "",
    onboardingChecklist: [], academyPflichtModule: [], aktivAm: "",
    geworbenVonUserId: "", geworbenVonName: "",
    ...teil,
  } as Bewerber;
}

const mitTeil2 = (extra: Partial<Bewerber> = {}) =>
  baueBewerber({ erstgespraechSkript: { ...LEERES_SKRIPT, closingDirekt: { aktiv: true } }, ...extra });

const renderTab = (bewerber = baueBewerber(), props: Partial<React.ComponentProps<typeof ErstgespraechsTab>> = {}) =>
  render(
    <ErstgespraechsTab
      bewerber={bewerber}
      canEdit={true}
      onRefresh={() => {}}
      beraterName="Christian"
      {...props}
    />,
  );

const station = () => screen.getByTestId("erstgespraech-station");
const leisteZustand = (id: string) => screen.getByTestId(`leiste-${id}`).getAttribute("data-zustand");
const weiter = () => fireEvent.click(screen.getByTestId("station-weiter"));
const springe = (id: string) => fireEvent.click(screen.getByTestId(`leiste-${id}`));

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  formularDaten = null;
  vi.mocked(supabase.functions.invoke).mockClear();
});

describe("ErstgespraechsTab: Kopfkarte und Start", () => {
  it("öffnet bei Punkt 1 mit Sprechtext, Leiste mit zehn Punkten und Teil-2-Hinweiszeile", () => {
    renderTab();

    expect(station().getAttribute("data-schritt")).toBe("p1");
    expect(within(station()).getByText("Einstieg und Rahmen")).toBeInTheDocument();
    expect(within(station()).getByText(/Teil 1 · Punkt 1 von 10/)).toBeInTheDocument();
    expect(screen.getByText(/Hallo Max, hier ist Christian von OS Immobilien/)).toBeInTheDocument();

    // Leiste: zehn Punkte, Punkt 1 aktuell, der Rest offen, Punkt 10 nicht durchgestrichen
    for (let n = 1; n <= 10; n++) expect(screen.getByTestId(`leiste-p${n}`)).toBeInTheDocument();
    expect(leisteZustand("p1")).toBe("aktuell");
    expect(leisteZustand("p2")).toBe("offen");
    expect(leisteZustand("p10")).toBe("offen");
    expect(screen.getByTestId("leiste-teil2-aus")).toBeInTheDocument();
    expect(screen.queryByTestId("leiste-a-einstieg")).not.toBeInTheDocument();

    // Badges und nächster Schritt
    expect(screen.getByTestId("kopf-status")).toHaveTextContent("Noch nicht begonnen");
    expect(screen.getByTestId("kopf-teil2")).toHaveTextContent("Teil 2: aus");
    expect(screen.getByTestId("kopf-stand")).toHaveTextContent("0 von 10 Punkten erledigt");
    expect(screen.getByTestId("erstgespraech-naechster-schritt")).toHaveTextContent(/Punkt 1 · Einstieg und Rahmen/);
    expect(screen.getByText(/Grundton: authentisch, freundlich, bestimmt/)).toBeInTheDocument();

    // Videocall-Knöpfe
    expect(screen.getByRole("button", { name: /Videocall: Moderation öffnen/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Präsentation \(Bildschirmfreigabe\)/ })).toBeInTheDocument();

    // Seitenleiste
    expect(screen.getByTestId("erstgespraech-zwischenstand")).toHaveTextContent("noch offen");
    expect(screen.getByTestId("erstgespraech-wo-wir-stehen")).toHaveTextContent("Punkt 10 · Termin buchen");
    expect(screen.getByRole("button", { name: /Erstgespräch abschließen/ })).toBeInTheDocument();
    // Der erste Render der Datei trägt die Aufwärmphase; in der Gesamtsuite
    // unter Last reichen die üblichen fünf Sekunden nicht immer.
  }, 20_000);

  it("zeigt nur den aktuellen Punkt: Punkt 2 bis 10 sind nicht gleichzeitig sichtbar", () => {
    renderTab();
    expect(screen.queryByText("Deine Ausgangslage", { selector: "h2" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Closing-Termin buchen/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Was du von uns bekommst")).not.toBeInTheDocument();
  });
});

describe("ErstgespraechsTab: Leiste und Navigation", () => {
  it("Weiter markiert den Punkt als erledigt und zählt in der Kopfkarte mit", () => {
    renderTab();
    weiter();
    expect(station().getAttribute("data-schritt")).toBe("p2");
    expect(leisteZustand("p1")).toBe("erledigt");
    expect(leisteZustand("p2")).toBe("aktuell");
    expect(screen.getByTestId("kopf-stand")).toHaveTextContent("1 von 10 Punkten erledigt");
    expect(screen.getByTestId("kopf-status")).toHaveTextContent(/Erstgespräch läuft seit/);
    expect(screen.getByTestId("erstgespraech-naechster-schritt")).toHaveTextContent("Punkt 2 · Deine Ausgangslage. Danach Punkt 3 · Profil-Einordnung.");
  });

  it("ein Punkt mit Inhalt, der nicht über Weiter verlassen wurde, ist angefangen", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText(/Stimme, Energie/), { target: { value: "Wach und freundlich" } });
    springe("p3");
    expect(station().getAttribute("data-schritt")).toBe("p3");
    expect(leisteZustand("p1")).toBe("angefangen");
    expect(leisteZustand("p2")).toBe("offen");
  });

  it("Klick auf die Leiste springt, auch zurück, nichts ist gesperrt", () => {
    renderTab();
    springe("p8");
    expect(within(station()).getByText(/Teil 1 · Punkt 8 von 10/)).toBeInTheDocument();
    springe("p2");
    expect(within(station()).getByText(/Teil 1 · Punkt 2 von 10/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("station-zurueck"));
    expect(station().getAttribute("data-schritt")).toBe("p1");
    expect(screen.getByTestId("station-zurueck")).toBeDisabled();
  });

  it("merkt den Schritt je Bewerber im Browser: Neuladen springt nicht auf Punkt 1", () => {
    const { unmount } = renderTab();
    weiter();
    weiter();
    unmount();
    renderTab();
    expect(station().getAttribute("data-schritt")).toBe("p3");
    expect(leisteZustand("p1")).toBe("erledigt");
    expect(leisteZustand("p2")).toBe("erledigt");
  });

  it("die Liste „Wo wir stehen“ springt ebenfalls", () => {
    renderTab();
    fireEvent.click(screen.getByTestId("liste-p6"));
    expect(station().getAttribute("data-schritt")).toBe("p6");
    expect(screen.getByTestId("liste-p6").getAttribute("data-zustand")).toBe("aktuell");
  });
});

describe("ErstgespraechsTab: Inhalte der Punkte", () => {
  it("Punkt 8 zeigt alle acht Einwände offen mit Notizfeld", () => {
    renderTab();
    springe("p8");
    for (const einwand of [
      "Was kostet mich die Zusammenarbeit mit euch?",
      "Was kosten die Leads?",
      "Ich habe keine Erfahrung in dem Bereich.",
      "Ich brauche ein sicheres Gehalt.",
      "Ich muss das erst überlegen.",
      "Was ist mit den Kunden, die ich selbst mitbringe?",
      "Bekomme ich ein festes Gebiet?",
      "Kann ich das auch nebenberuflich machen?",
    ]) {
      expect(screen.getByText(`„${einwand}"`)).toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText(/Welche Einwände kamen/)).toBeInTheDocument();
    // In Punkt 8 gibt es keine zweite, eingeklappte Liste.
    expect(screen.queryByTestId("einwand-klapp")).not.toBeInTheDocument();
  });

  it("die Einwandbehandlung hängt eingeklappt an jedem anderen Teil-1-Punkt", () => {
    renderTab();
    for (const id of ["p1", "p5", "p9"]) {
      springe(id);
      expect(screen.getByTestId("einwand-klapp")).toBeInTheDocument();
      expect(screen.queryByText("„Ich brauche ein sicheres Gehalt.\"")).not.toBeInTheDocument();
    }
    springe("p5");
    fireEvent.click(screen.getByTestId("einwand-klapp"));
    expect(screen.getByText("„Ich brauche ein sicheres Gehalt.\"")).toBeInTheDocument();
    expect(screen.getByText("„Was kosten die Leads?\"")).toBeInTheDocument();
  });

  it("Profil-Einordnung: Kachelklick blendet den Vertiefungsblock ein", () => {
    renderTab();
    springe("p3");
    expect(screen.getByText(/Wähle oben mindestens ein Profil aus/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Immobilienerfahren/ }));
    expect(screen.getByText(/du bringst also schon Immobilienerfahrung mit/)).toBeInTheDocument();
    expect(screen.getByText("Wechselgrund")).toBeInTheDocument();
    expect(screen.queryByText(/Wähle oben mindestens ein Profil aus/)).not.toBeInTheDocument();
    // Der Zwischenstand rechts zieht live mit.
    expect(screen.getByTestId("erstgespraech-zwischenstand")).toHaveTextContent("Immobilienerfahren");
  });

  it("Finanzdienstleister: Produktausblick erscheint als Regie-Hinweis", () => {
    renderTab();
    springe("p3");
    fireEvent.click(screen.getByRole("button", { name: /Finanzdienstleister/ }));
    expect(screen.getByText(/Hinweis für dich/)).toBeInTheDocument();
    expect(screen.getByText(/stornofrei, geringe Gebühr, hohe Provision/)).toBeInTheDocument();
  });

  it("Punkt 6 Leistungstabelle, Punkt 7 Blöcke Verdienst und Formales, Punkt 10 Terminbuchung", () => {
    renderTab();
    springe("p6");
    expect(screen.getByText("Was du von uns bekommst")).toBeInTheDocument();
    expect(screen.getByText("Was es dir spart")).toBeInTheDocument();
    springe("p7");
    expect(screen.getByText("Was du verdienst")).toBeInTheDocument();
    expect(screen.getByText("Formales")).toBeInTheDocument();
    expect(screen.queryByText("Systemgebühr")).not.toBeInTheDocument();
    springe("p10");
    expect(within(station()).getByText(/Teil 1 · Punkt 10 von 10/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Closing-Termin buchen/ })).toBeInTheDocument();
    expect(screen.queryByTestId("station-weiter")).not.toBeInTheDocument();
  });

  it("Punkt 9: Sterne, Empfehlung, Knöpfe B und C sowie der Teil-2-Schalter", () => {
    renderTab();
    springe("p9");
    expect(within(station()).getByText(/Teil 1 · Punkt 9 von 10/)).toBeInTheDocument();
    expect(screen.getByText(/Wie schätzt du den Bewerber nach dem Gespräch ein/)).toBeInTheDocument();
    expect(screen.getAllByText(/C · Absage/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /B · Follow-Up-Termin setzen/ })).toBeInTheDocument();
    expect(screen.getByTestId("teil2-schalter")).toHaveTextContent(/Teil 2 \(optional\) · Closing direkt anschließen/);
    // Schalter aus: Weiter führt zu Punkt 10
    expect(screen.getByTestId("station-weiter")).toHaveTextContent("Punkt 10 · Termin buchen");
    weiter();
    expect(station().getAttribute("data-schritt")).toBe("p10");
  });

  it("zeigt alte Skript-Angaben von Bestandsbewerbern weiter an", () => {
    renderTab(baueBewerber({
      erfahrung: "3–5 Jahre Vertrieb",
      ziele: "Finanzielle Freiheit",
      erstgespraechSkript: { ...LEERES_SKRIPT, ausgangslage: "Versicherungsvertrieb", budget: "Ja, machbar" },
    }));
    expect(screen.getByText(/Angaben aus dem bisherigen Skript/)).toBeInTheDocument();
  });
});

describe("ErstgespraechsTab: Teil 2 in der Schritt-Ansicht", () => {
  it("Schalter an: 16 Abschnitte in der Leiste, Punkt 10 durchgestrichen, Punkt 9 kommt VOR Teil 2", () => {
    renderTab(mitTeil2());
    expect(screen.getByTestId("kopf-teil2")).toHaveTextContent("Teil 2: an, 0 von 16");
    expect(screen.queryByTestId("leiste-teil2-aus")).not.toBeInTheDocument();
    expect(screen.getByTestId("leiste-a-einstieg")).toBeInTheDocument();
    expect(screen.getByTestId("leiste-a-gespraechsabschluss")).toBeInTheDocument();
    expect(leisteZustand("p10")).toBe("entfaellt");
    expect(screen.getByTestId("leiste-p10")).toBeDisabled();

    springe("p9");
    expect(screen.getByTestId("erstgespraech-naechster-schritt")).toHaveTextContent(/Einschätzung festhalten, dann Teil 2 mit Abschnitt 1/);
    expect(screen.getByTestId("station-weiter")).toHaveTextContent("Abschnitt 1 · Direktvorschlag");
    weiter();
    expect(station().getAttribute("data-schritt")).toBe("a-einstieg");
    expect(within(station()).getByText(/Teil 2 · Abschnitt 1 von 16/)).toBeInTheDocument();
    expect(within(station()).getByText("Der Direktvorschlag")).toBeInTheDocument();
    expect(screen.getByTestId("station-zurueck")).toHaveTextContent("Punkt 9 · Einschätzung");
    // Punkt 10 ist kein Schritt mehr
    expect(screen.queryByRole("button", { name: /Closing-Termin buchen/ })).not.toBeInTheDocument();
  });

  it("Schalter im Reiter umlegen blendet die Teil-2-Reihe ein und aus", () => {
    renderTab();
    springe("p9");
    fireEvent.click(screen.getByRole("switch", { name: /Teil 2 jetzt direkt anschließen/ }));
    expect(screen.getByTestId("leiste-a-preis")).toBeInTheDocument();
    expect(leisteZustand("p10")).toBe("entfaellt");
    expect(screen.getByTestId("station-weiter")).toHaveTextContent("Abschnitt 1 · Direktvorschlag");
    fireEvent.click(screen.getByRole("switch", { name: /Teil 2 jetzt direkt anschließen/ }));
    expect(screen.queryByTestId("leiste-a-preis")).not.toBeInTheDocument();
    expect(leisteZustand("p10")).toBe("offen");
  });

  it("Abschnitt 12: Paketwahl und Folge-Call, Abhak-Kästchen macht die Leiste grün", () => {
    renderTab(mitTeil2());
    springe("a-preis");
    expect(within(station()).getByText(/Teil 2 · Abschnitt 12 von 16/)).toBeInTheDocument();
    expect(screen.getByText(/Paketwahl \(wird im Reiter Closing gespiegelt\)/)).toBeInTheDocument();
    expect(screen.getByText(/Folge-Call für gestellte Leads/)).toBeInTheDocument();
    expect(leisteZustand("a-preis")).toBe("aktuell");
    fireEvent.click(screen.getByRole("checkbox", { name: /als besprochen abhaken/ }));
    springe("a-erwartungen");
    expect(leisteZustand("a-preis")).toBe("erledigt");
    expect(screen.getByTestId("kopf-teil2")).toHaveTextContent("Teil 2: an, 1 von 16");
  });

  it("Schalter wird ausgeschaltet, während ein Abschnitt offen ist: zurück zu Punkt 9", () => {
    renderTab(mitTeil2());
    springe("a-preis");
    fireEvent.click(screen.getByTestId("liste-p9"));
    fireEvent.click(screen.getByRole("switch", { name: /Teil 2 jetzt direkt anschließen/ }));
    springe("p10");
    expect(station().getAttribute("data-schritt")).toBe("p10");
  });

  it("bei erledigtem Direkt-Closing zeigt Abschnitt 16 den Closing-Hinweis und die Seitenleiste den nächsten Reiter", () => {
    const zuClosing = vi.fn();
    renderTab(mitTeil2({ closingEntscheidung: "ja", paketwahl: "junior" }), { onWeiterZuClosing: zuClosing });
    springe("a-gespraechsabschluss");
    expect(within(station()).getByText(/Teil 2 · Abschnitt 16 von 16/)).toBeInTheDocument();
    expect(within(station()).getByText(/Weiter im Reiter Closing: Vertrag erzeugen und senden/)).toBeInTheDocument();
    expect(screen.getByText(/Bei Ja: Vertrag kommt per Mail/)).toBeInTheDocument();
    expect(screen.queryByText(/Bei Nein: wertschätzende Verabschiedung/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("station-weiter")).not.toBeInTheDocument();
    expect(screen.getByTestId("erstgespraech-naechster-schritt")).toHaveTextContent(/Weiter im Reiter Closing/);
    expect(screen.getByTestId("erstgespraech-zwischenstand")).toHaveTextContent("Ja, will starten");

    fireEvent.click(screen.getByRole("button", { name: /Weiter im Reiter Closing/ }));
    expect(zuClosing).toHaveBeenCalledTimes(1);
  });
});

describe("ErstgespraechsTab: Vorwissen-Karte", () => {
  const mitFormular = () => {
    formularDaten = {
      antworten: { region: "Rosenheim", zeitProWoche: "10_bis_20", erwartung: "Ein System, das mir den Papierkram abnimmt." },
      eingereicht_am: "2026-08-24T10:00:00.000Z",
    };
  };

  it("ist in Punkt 1 offen und klappt ab Punkt 2 automatisch auf die Chip-Zeile ein", async () => {
    mitFormular();
    renderTab();
    const karte = await screen.findByTestId("vorwissen-karte");
    expect(karte.getAttribute("data-offen")).toBe("ja");
    expect(screen.getByText(/Ein System, das mir den Papierkram abnimmt/)).toBeInTheDocument();
    expect(screen.getByText(/Fragebogen ausgefüllt am 24.08.2026/)).toBeInTheDocument();

    weiter();
    expect(screen.getByTestId("vorwissen-karte").getAttribute("data-offen")).toBe("nein");
    expect(screen.queryByText(/Ein System, das mir den Papierkram abnimmt/)).not.toBeInTheDocument();
    // Die Chips bleiben stehen
    expect(within(screen.getByTestId("vorwissen-karte")).getByText("Rosenheim")).toBeInTheDocument();

    // Von Hand wieder öffnen
    fireEvent.click(screen.getByRole("button", { name: /Das hat Max vorab angegeben/ }));
    expect(screen.getByTestId("vorwissen-karte").getAttribute("data-offen")).toBe("ja");

    // Zurück zu Punkt 1: wieder offen
    springe("p1");
    expect(screen.getByTestId("vorwissen-karte").getAttribute("data-offen")).toBe("ja");
  });

  it("ohne Fragebogen steht der Hinweis mit dem Sende-Knopf", () => {
    renderTab();
    expect(screen.getByText(/Kein Vorab-Fragebogen vorhanden/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Formularlink senden/ })).toBeInTheDocument();
    expect(screen.getByText("Kein Fragebogen")).toBeInTheDocument();
  });
});

describe("ErstgespraechsTab: Gespräch beenden", () => {
  it("Kein Interesse und Abgelehnt öffnen den Absage-Dialog, B öffnet den Follow-Up-Dialog", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Kein Interesse/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Kein Interesse");
    fireEvent.click(screen.getByRole("button", { name: /Abbrechen/ }));

    fireEvent.click(screen.getByRole("button", { name: /^Abgelehnt$/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Abgelehnt");
    fireEvent.click(screen.getByRole("button", { name: /Abbrechen/ }));

    springe("p9");
    fireEvent.click(screen.getByRole("button", { name: /B · Follow-Up-Termin setzen/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Follow-Up-Termin setzen");
  });

  it("Abschließen ruft dieselbe Logik: KI-Zusammenfassung ohne Closing-Felder, wenn Teil 2 aus ist", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Erstgespräch abschließen/ }));

    const invoke = vi.mocked(supabase.functions.invoke);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("erstgespraech-zusammenfassung", expect.anything()),
    );
    const aufruf = invoke.mock.calls.find(([name]) => name === "erstgespraech-zusammenfassung");
    const body = (aufruf?.[1] as { body: Record<string, unknown> }).body;
    expect(body.vorname).toBe("Max");
    expect(body.antwortenJson).toBeDefined();
    expect(body).not.toHaveProperty("closingDirekt");
    expect(body).not.toHaveProperty("closingJson");
  });

  it("mit aktivem Teil 2 gehen die Closing-Daten mit in den KI-Body", async () => {
    renderTab(baueBewerber({
      closingEntscheidung: "ja",
      paketwahl: "junior",
      zahlungsweise: "einmal",
      andereVertriebe: "XY Vertrieb GmbH",
      erstgespraechSkript: {
        ...LEERES_SKRIPT,
        closingDirekt: {
          aktiv: true,
          abgehakt: ["einstieg", "rechner"],
          startWeiche: "direkt",
          notizen: { einstiegReaktion: "Hat sofort zugesagt", rechnerAbschluesse: "1 bis 2" },
        },
      },
    }));

    fireEvent.click(screen.getByRole("button", { name: /Erstgespräch abschließen/ }));

    const invoke = vi.mocked(supabase.functions.invoke);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("erstgespraech-zusammenfassung", expect.anything()),
    );
    const aufruf = invoke.mock.calls.find(([name]) => name === "erstgespraech-zusammenfassung");
    const body = (aufruf?.[1] as { body: Record<string, unknown> }).body;
    expect(body.closingDirekt).toBe(true);
    const closing = JSON.parse(body.closingJson as string) as Record<string, unknown>;
    const abschnitte = closing.abschnitte as { titel: string; notizen?: Record<string, string> }[];
    expect(abschnitte.map((a) => a.titel)).toEqual(["Der Direktvorschlag", "Seine Zahlen und der Preis des Wartens"]);
    expect(abschnitte[0].notizen).toEqual({ "Reaktion auf den Direktvorschlag": "Hat sofort zugesagt" });
    expect(closing.startfahrplanWeiche).toBe("Will direkt starten");
    expect(closing.entscheidung).toBe("Ja, will starten");
    expect(closing.paketwahl).toBe("Vertriebspartner");
    expect(closing.zahlungsweise).toBe("Einmalzahlung");
    expect(closing.andereVertriebe).toBe("XY Vertrieb GmbH");
  });

  it("nach dem Abschließen: grünes Kopf-Badge, Teil 1 komplett erledigt, letzter Schritt offen", () => {
    renderTab(baueBewerber({
      erstgespraechSkript: { ...LEERES_SKRIPT, durchgefuehrtAm: "2026-09-02T13:41:00.000Z", durchgefuehrtVon: "Sarah" },
    }));
    expect(screen.getByTestId("kopf-status")).toHaveTextContent(/Geführt am 02.09.2026/);
    expect(screen.getByTestId("kopf-status")).toHaveTextContent("Sarah");
    expect(station().getAttribute("data-schritt")).toBe("p10");
    for (let n = 1; n <= 9; n++) expect(leisteZustand(`p${n}`)).toBe("erledigt");
    expect(screen.getByRole("button", { name: /Abgeschlossen · 02.09.2026/ })).toBeInTheDocument();
  });
});

describe("ErstgespraechsTab: Karte der KI-Zusammenfassung", () => {
  const mitZusammenfassung = (closingDirektAktiv = false) =>
    baueBewerber({
      erstgespraechSkript: {
        ...LEERES_SKRIPT,
        durchgefuehrtAm: "2026-09-02T13:41:00.000Z",
        zusammenfassung: "**Profil & Werdegang**\nMax bringt Vertriebserfahrung mit.",
        zusammenfassungAm: new Date().toISOString(),
        ...(closingDirektAktiv ? { closingDirekt: { aktiv: true } } : {}),
      },
    });

  it("ist nach dem Abschließen eingeklappt und lässt sich über die Kopfzeile öffnen", () => {
    renderTab(mitZusammenfassung());
    expect(screen.queryByText(/Max bringt Vertriebserfahrung mit/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /KI-Zusammenfassung Erstgespräch/ }));
    expect(screen.getByText(/Max bringt Vertriebserfahrung mit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /KI-Zusammenfassung Erstgespräch/ }));
    expect(screen.queryByText(/Max bringt Vertriebserfahrung mit/)).not.toBeInTheDocument();
  });

  it("heißt bei durchgeführtem Teil 2 „KI-Zusammenfassung Erstgespräch und Closing“", () => {
    renderTab(mitZusammenfassung(true));
    expect(screen.getByText("KI-Zusammenfassung Erstgespräch und Closing")).toBeInTheDocument();
  });

  it("heißt ohne Teil 2 wie bisher „KI-Zusammenfassung Erstgespräch“", () => {
    renderTab(mitZusammenfassung());
    expect(screen.getByText("KI-Zusammenfassung Erstgespräch")).toBeInTheDocument();
    expect(screen.queryByText("KI-Zusammenfassung Erstgespräch und Closing")).not.toBeInTheDocument();
  });

  it("ohne Zusammenfassung erscheint keine Karte", () => {
    renderTab();
    expect(screen.queryByRole("button", { name: /KI-Zusammenfassung Erstgespräch/ })).not.toBeInTheDocument();
  });
});
