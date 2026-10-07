import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";

/**
 * Die Moderation der Präsentationen: läuft ohne jeden Bewerber, kennt die
 * drei Abläufe, lässt den Weg wechseln, springt Folien aus der Leiste an,
 * merkt sich Favoriten, zeigt zur Folie das Skript, koppelt das
 * Präsentationsfenster über den Kanal und legt Notizen am Bewerber ab.
 * Netz, Cache und PDF bleiben außen vor.
 */

const speicher = new Map<string, string>();
const sitzungsSpeicher = new Map<string, string>();
const speicherAttrappe = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => { m.set(k, String(v)); },
  removeItem: (k: string) => { m.delete(k); },
  clear: () => m.clear(),
});
Object.defineProperty(window, "localStorage", { writable: true, value: speicherAttrappe(speicher) });
Object.defineProperty(window, "sessionStorage", { writable: true, value: speicherAttrappe(sitzungsSpeicher) });

// Der Bewerber kommt nur für die Notizen aus dem Cache, nie für die Folien.
let bewerberImCache: Bewerber | undefined;
const addNotizEntry = vi.fn();
vi.mock("@/lib/bewerbungStore", () => ({
  getBewerberById: () => bewerberImCache,
  updateBewerber: vi.fn(),
  changeBewerberStatus: vi.fn(),
  addNotizEntry: (...a: unknown[]) => addNotizEntry(...a),
}));
vi.mock("@/lib/dataCache", () => ({
  isTableLoaded: () => true,
  onCacheChange: () => () => {},
}));
let rolle = "hr";
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Sarah", role: rolle, moreId: "u-sarah" }, authUser: null }),
}));
let einstellungen: Record<string, unknown> = {};
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (key: string, fallback: unknown) => (einstellungen[key] !== undefined ? einstellungen[key] : fallback),
  setUserSetting: (key: string, wert: unknown) => { einstellungen = { ...einstellungen, [key]: wert }; },
}));
const exportPraesentationAsPdf = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/praesentationPdfExport", () => ({
  exportPraesentationAsPdf: (...a: unknown[]) => exportPraesentationAsPdf(...a),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
/**
 * Die Zeilen aus `bewerber_formular`, die der Kennenlernbogen-Hook findet.
 * Steht in `vi.hoisted`, weil die Attrappe unten vor den Modulvariablen läuft.
 */
const datenbank = vi.hoisted(() => ({ formularZeilen: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => {
  const kette: Record<string, unknown> = {};
  for (const glied of ["select", "eq", "order", "limit"]) kette[glied] = () => kette;
  kette.maybeSingle = () => Promise.resolve({ data: null, error: null });
  // Die Kette ist selbst wartbar, wie der echte Postgrest-Erbauer: Ein `await`
  // auf ihr liefert die Zeilen, ohne dass ein Glied die Kette abschneidet.
  kette.then = (auf: (w: unknown) => unknown, ab?: (f: unknown) => unknown) =>
    Promise.resolve({ data: datenbank.formularZeilen, error: null }).then(auf, ab);
  return { supabase: { from: () => ({ ...kette }), functions: { invoke: vi.fn() } } };
});
vi.mock("@/lib/startfahrplanVersand", () => ({ sendeStartfahrplan: vi.fn() }));

import PraesentationsUebung from "./PraesentationsUebung";
import type { Bewerber } from "@/lib/bewerbungStore";
import { kanalName, type KopplungsNachricht } from "@/lib/praesentationsKopplung";

/**
 * Ein BroadcastChannel-Ersatz: alle Instanzen mit demselben Namen teilen
 * sich einen Bus, eine Instanz hört ihre eigenen Nachrichten nicht.
 */
class KanalAttrappe {
  static instanzen: KanalAttrappe[] = [];
  private hoerer: Array<(e: MessageEvent) => void> = [];
  constructor(public name: string) { KanalAttrappe.instanzen.push(this); }
  addEventListener(_typ: string, h: (e: MessageEvent) => void) { this.hoerer.push(h); }
  removeEventListener(_typ: string, h: (e: MessageEvent) => void) { this.hoerer = this.hoerer.filter((x) => x !== h); }
  postMessage(daten: unknown) {
    for (const k of KanalAttrappe.instanzen) {
      if (k !== this && k.name === this.name) k.hoerer.forEach((h) => h({ data: daten } as MessageEvent));
    }
  }
  close() { KanalAttrappe.instanzen = KanalAttrappe.instanzen.filter((k) => k !== this); }
}

/** Das andere Ende des Übungskanals der Sitzung „test", wie ein zweites Fenster. */
function anderesEnde() {
  const kanal = new KanalAttrappe(kanalName("uebung-test"));
  const empfangen: KopplungsNachricht[] = [];
  kanal.addEventListener("message", (e) => empfangen.push(e.data as KopplungsNachricht));
  return {
    empfangen,
    senden: (n: KopplungsNachricht) => act(() => { kanal.postMessage(n); }),
    letzterStand: () => [...empfangen].reverse().find((n) => n.typ === "stand") as Extract<KopplungsNachricht, { typ: "stand" }> | undefined,
  };
}

function baueBewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "mod-1", vorname: "Max", nachname: "Muster", email: "max@example.com",
    telefon: "", ort: "", quelle: "", beworben: "", stelleId: "", stelleTitel: "",
    status: "Erstgespraech", bewertung: 0, erstelltAm: new Date().toISOString(),
    typ: "", typLabel: "", typBeschreibung: "", typEignung: "", erfahrung: "",
    motivation: "", notizen: "", ziele: "", beschaeftigungsart: "", onboardingTerminId: "",
    lebenslaufUrl: "", dokumente: [], vertragStatus: "nicht_gesendet", vertragDatum: "",
    benachrichtigungen: [], chatVerknuepft: false,
    ausgangslage: "", zielBest: "", wieStarten: "",
    notizenLog: [{ id: "n1", text: "Telefonat: ruft Dienstag zurück.", datum: "2026-09-10T09:00:00.000Z", autor: "Sarah", autorId: "u-sarah" }],
    adresse: "",
    ...teil,
  } as Bewerber;
}

beforeAll(() => {
  class ResizeObserverAttrappe {
    observe() { /* nichts */ }
    unobserve() { /* nichts */ }
    disconnect() { /* nichts */ }
  }
  if (!("ResizeObserver" in window)) {
    Object.defineProperty(window, "ResizeObserver", { writable: true, value: ResizeObserverAttrappe });
  }
});

beforeEach(() => {
  speicher.clear();
  sitzungsSpeicher.clear();
  sitzungsSpeicher.set("praesentationsUebungSitzung", "test");
  einstellungen = {};
  rolle = "hr";
  bewerberImCache = undefined;
  datenbank.formularZeilen = [];
  exportPraesentationAsPdf.mockClear();
  addNotizEntry.mockClear();
  KanalAttrappe.instanzen = [];
  vi.stubGlobal("BroadcastChannel", KanalAttrappe);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderMit(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/praesentation-uebung${query}`]}>
      <Routes>
        <Route path="/praesentation-uebung" element={<PraesentationsUebung />} />
        <Route path="/" element={<div>Startseite</div>} />
        <Route
          path="/bewerberprozess"
          element={<BewerberprozessAttrappe />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** Zeigt, mit welchen Angaben der Zurueck-Knopf hier angekommen ist. */
function BewerberprozessAttrappe() {
  const [params] = useSearchParams();
  return (
    <div data-testid="bewerberprozess">
      {params.get("openBewerber")} · {params.get("detailTab")}
    </div>
  );
}

const kopf = () => screen.getByTestId("uebungs-kopf");

describe("PraesentationsUebung: Abläufe und Leiste", () => {
  it("zeigt den Vorabbogen ab Teil 1 mit 22 Folien, ohne Bewerber und ohne Absturz", () => {
    renderMit("?art=vorabbogen");
    expect(kopf()).toHaveTextContent("Vorabbogen · Ab Teil 1");
    expect(kopf()).toHaveTextContent("Folie 1 / 22");
    // Die Leiste listet beide Teile und den Rechner als eigenen Eintrag.
    const leiste = screen.getByTestId("uebungs-leiste");
    expect(within(leiste).getByTestId("leiste-gruppe-vorabbogen-teil1")).toBeInTheDocument();
    expect(within(leiste).getByTestId("leiste-gruppe-vorabbogen-teil2")).toBeInTheDocument();
    expect(within(leiste).getByTestId("leiste-vorabbogen||rechner")).toHaveTextContent("Rechner");
    expect(within(leiste).getByTestId("leiste-rechner||rechner")).toHaveTextContent("Rechner, eigenständig");
    // Keine Anrede, weil kein Bewerber da ist.
    expect(screen.queryByText(/Max/)).not.toBeInTheDocument();
  });

  it("nennt die Leiste ohne Bewerber eine Übungsansicht", () => {
    renderMit("?art=vorabbogen");
    const leistenKopf = screen.getByTestId("leiste-kopf");
    expect(leistenKopf).toHaveTextContent("Übungsansicht");
    expect(leistenKopf).toHaveTextContent("Blank, ohne Bewerberdaten");
  });

  it("nennt die Leiste mit Bewerber eine Moderation und zeigt seinen Namen", async () => {
    bewerberImCache = baueBewerber();
    renderMit("?art=vorabbogen&bewerber=mod-1");
    const leistenKopf = screen.getByTestId("leiste-kopf");
    expect(leistenKopf).toHaveTextContent("Moderation");
    expect(leistenKopf).toHaveTextContent("Max Muster");
    expect(leistenKopf).not.toHaveTextContent("Übungsansicht");
    expect(leistenKopf).not.toHaveTextContent("Blank, ohne Bewerberdaten");
    // Der Kennenlernbogen unter den Notizen laedt nach.
    await act(async () => {});
  });

  it("wechselt den Einstieg auf nur Teil 2 und zurück", () => {
    renderMit("?art=vorabbogen");
    fireEvent.click(screen.getByTestId("leiste-teil-2"));
    expect(kopf()).toHaveTextContent("Nur Teil 2");
    expect(kopf()).toHaveTextContent("Folie 1 / 15");
    // Ein Klick auf eine Teil-1-Folie führt zurück in den Einstieg ab Teil 1.
    fireEvent.click(screen.getByTestId("leiste-vorabbogen||einwaende"));
    expect(kopf()).toHaveTextContent("Ab Teil 1");
    expect(kopf()).toHaveTextContent("Folie 7 / 22");
  });

  it("springt eine Folie aus der Leiste direkt an und zeigt sie in der Vorschau", () => {
    renderMit("?art=vorabbogen");
    fireEvent.click(screen.getByTestId("leiste-vorabbogen||rechner"));
    expect(kopf()).toHaveTextContent("Deine Zahlen");
    expect(within(screen.getByTestId("uebungs-vorschau")).getByText("Dein Rechner")).toBeInTheDocument();
    expect(screen.getByTestId("leiste-vorabbogen||rechner")).toHaveAttribute("aria-current", "true");
  });

  it("zeigt den Kennenlernbogen je Weg und lässt den Weg wechseln", () => {
    renderMit("?art=kennenlernbogen&weg=weg2");
    expect(kopf()).toHaveTextContent("Kennenlernbogen · Weg 2");
    expect(kopf()).toHaveTextContent("Folie 1 / 8");
    // Weg 3 hat ein gesetztes Modul, also 7 Folien. Klick auf seine Servicefolie.
    fireEvent.click(screen.getByTestId("leiste-gruppe-kennenlernbogen-weg3"));
    fireEvent.click(screen.getByTestId("leiste-kennenlernbogen|weg3|kern-service"));
    expect(kopf()).toHaveTextContent("Weg 3");
    expect(kopf()).toHaveTextContent("Folie 5 / 7");
  });

  it("schaltet ein Modul bei Bedarf zu", () => {
    renderMit("?art=kennenlernbogen&weg=weg2");
    fireEvent.click(screen.getByTestId("leiste-modul-weg2-m3"));
    expect(kopf()).toHaveTextContent("Folie 1 / 9");
    expect(screen.getByTestId("leiste-kennenlernbogen|weg2|modul-m3")).toBeInTheDocument();
  });

  it("zeigt nur den Rechner, eigenständig", () => {
    renderMit("?art=rechner");
    expect(kopf()).toHaveTextContent("Rechner, eigenständig");
    expect(kopf()).toHaveTextContent("Folie 1 / 1");
    expect(within(screen.getByTestId("uebungs-vorschau")).getByText("Dein Rechner")).toBeInTheDocument();
    expect(screen.getByLabelText("Abschlüsse pro Monat")).toBeInTheDocument();
  });

  /*
   * Die drei Knöpfe standen nebeneinander in einer zu schmalen Zeile,
   * „Kennenlernbogen" ragte über seinen Kasten hinaus. Jetzt stehen sie
   * untereinander in voller Breite, jeder Text ist auf seine Zeile begrenzt
   * und trägt den vollen Wortlaut als Tooltip.
   */
  it("der Ablauf-Umschalter stapelt drei volle Knöpfe, die ihren Text nie sprengen", () => {
    renderMit("?art=kennenlernbogen");
    const tabs = within(screen.getByRole("tablist", { name: "Ablauf" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "VorabbogenClosing-Präsentation",
      "KennenlernbogenKennenlern-Präsentation",
      "RechnerNur die Rechner-Folie",
    ]);
    for (const tab of tabs) {
      expect(tab.className).toContain("w-full");
      expect(tab.className).toContain("min-w-0");
      expect(tab).toHaveAttribute("title", expect.stringContaining(":"));
      const zeilen = Array.from(tab.querySelectorAll("span"));
      expect(zeilen).toHaveLength(2);
      for (const z of zeilen) expect(z.className).toContain("truncate");
    }
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1].className).toContain("bg-primary ");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
  });

  it("merkt sich Favoriten je Nutzer und zeigt sie oben in der Leiste", () => {
    renderMit("?art=vorabbogen");
    expect(screen.queryByTestId("leiste-favoriten")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stern-vorabbogen||rechner"));
    const favoriten = screen.getByTestId("leiste-favoriten");
    expect(within(favoriten).getByText("Deine Zahlen (Rechner)")).toBeInTheDocument();
    expect(einstellungen.praesentationsFavoriten).toEqual(["vorabbogen||rechner"]);

    // Ein Favorit öffnet seine Folie, auch aus einem anderen Ablauf.
    fireEvent.click(screen.getByTestId("leiste-art-rechner"));
    expect(kopf()).toHaveTextContent("Rechner, eigenständig");
    fireEvent.click(within(screen.getByTestId("leiste-favoriten")).getByText("Deine Zahlen (Rechner)"));
    expect(kopf()).toHaveTextContent("Vorabbogen · Ab Teil 1");
    expect(kopf()).toHaveTextContent("Deine Zahlen");

    // Und wieder weg.
    fireEvent.click(screen.getByTestId("stern-vorabbogen||rechner"));
    expect(screen.queryByTestId("leiste-favoriten")).not.toBeInTheDocument();
    expect(einstellungen.praesentationsFavoriten).toEqual([]);
  });

  it("lädt gespeicherte Favoriten beim Öffnen wieder", () => {
    einstellungen = { praesentationsFavoriten: ["kennenlernbogen|weg2|modul-m3"] };
    renderMit("?art=vorabbogen");
    const favoriten = screen.getByTestId("leiste-favoriten");
    expect(within(favoriten).getByText(/Modul 3/)).toBeInTheDocument();
    // Der Favorit bringt sein Modul bei Bedarf mit.
    fireEvent.click(within(favoriten).getByText(/Modul 3/));
    expect(kopf()).toHaveTextContent("Weg 2");
    expect(kopf()).toHaveTextContent("Folie 6 / 9");
  });

  it("blendet die Leiste aus, dann bleibt nur die Folie groß, und wieder ein", () => {
    renderMit("?art=vorabbogen");
    fireEvent.click(screen.getByLabelText("Leiste ausblenden"));
    expect(screen.queryByTestId("uebungs-leiste")).not.toBeInTheDocument();
    expect(screen.queryByTestId("uebungs-kopf")).not.toBeInTheDocument();
    expect(screen.queryByTestId("uebungs-moderation")).not.toBeInTheDocument();
    expect(screen.getByTestId("uebungs-buehne")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Leiste einblenden"));
    expect(screen.getByTestId("uebungs-leiste")).toBeInTheDocument();
    expect(screen.getByTestId("uebungs-moderation")).toBeInTheDocument();
  });

  it("lässt nur Inhaber, Admin und HR hinein", () => {
    rolle = "vp";
    renderMit("?art=vorabbogen");
    expect(screen.getByText("Startseite")).toBeInTheDocument();
  });
});

describe("PraesentationsUebung: das Skript zur Folie, blank", () => {
  it("Vorabbogen, Teil 1: Station, Sprechtext mit leerem Platzhalter, Felder nur zur Ansicht", () => {
    renderMit("?art=vorabbogen");
    const skript = screen.getByTestId("uebungs-skript");
    expect(within(skript).getByText(/Punkt 1 · Einstieg und Rahmen/)).toBeInTheDocument();
    // Kein Vorname, der Platzhalter bleibt neutral stehen.
    expect(within(skript).getAllByText(/\[Vorname\]/).length).toBeGreaterThan(0);
    expect(within(skript).getByText("Notiz Ersteindruck")).toBeInTheDocument();
    for (const feld of within(skript).getAllByRole("textbox")) expect(feld).toBeDisabled();
  });

  it("Vorabbogen, Teil 2: der Skriptabschnitt der Folie samt Ergänzung aus Teil 1", () => {
    renderMit("?art=vorabbogen&folie=zwei-wege");
    const skript = screen.getByTestId("uebungs-skript");
    expect(within(skript).getByText(/Folie: Zwei Wege, ein Satz/)).toBeInTheDocument();
    expect(within(skript).getByText(/Aus dem Erstgesprächsskript, im Deck erst hier gesprochen/)).toBeInTheDocument();
  });

  it("Kennenlernbogen: Impuls je Folie und die Regeln der Strecke", () => {
    renderMit("?art=kennenlernbogen&weg=weg2");
    const skript = screen.getByTestId("uebungs-skript");
    expect(within(skript).getByText("Impuls, kein Sprechtext")).toBeInTheDocument();
    expect(within(skript).getByText("Was auf dieser Strecke erfasst wird, und was nicht")).toBeInTheDocument();
  });

  it("Rechner: der Abschnitt zur Folie Deine Zahlen", () => {
    renderMit("?art=rechner");
    expect(within(screen.getByTestId("uebungs-skript")).getByText(/Folie: Deine Zahlen/)).toBeInTheDocument();
  });
});

describe("PraesentationsUebung: Kopplung mit dem Präsentationsfenster", () => {
  it("schickt bei Folien-, Weg- und Ablaufwechsel den ganzen Stand über den Übungskanal der Sitzung", () => {
    const fenster = anderesEnde();
    renderMit("?art=vorabbogen");
    expect(fenster.letzterStand()).toMatchObject({ typ: "stand", art: "vorabbogen", teil: 1 });
    expect(fenster.letzterStand()?.folieId).not.toBe("");

    fireEvent.click(screen.getByTestId("leiste-vorabbogen||rechner"));
    expect(fenster.letzterStand()).toMatchObject({ art: "vorabbogen", folieId: "rechner" });

    fireEvent.click(screen.getByTestId("leiste-art-kennenlernbogen"));
    expect(fenster.letzterStand()).toMatchObject({ art: "kennenlernbogen", weg: "weg1" });

    fireEvent.click(screen.getByTestId("leiste-gruppe-kennenlernbogen-weg3"));
    expect(fenster.letzterStand()).toMatchObject({ art: "kennenlernbogen", weg: "weg3", folieId: "kern-begruessung" });

    fireEvent.click(screen.getByTestId("leiste-modul-weg3-m6"));
    expect(fenster.letzterStand()).toMatchObject({ weg: "weg3", module: ["m6"] });

    fireEvent.click(screen.getByTestId("leiste-art-rechner"));
    expect(fenster.letzterStand()).toMatchObject({ art: "rechner", folieId: "rechner" });
  });

  it("folgt dem Fenster, wenn dort geblättert wird, antwortet auf die Anfrage und zeigt die Verbindung", () => {
    const fenster = anderesEnde();
    renderMit("?art=vorabbogen");
    expect(screen.getByTestId("uebungs-verbindung")).toHaveTextContent("Präsentation nicht verbunden");

    fenster.senden({ typ: "folie", folieId: "rechner" });
    expect(kopf()).toHaveTextContent("Deine Zahlen");
    expect(screen.getByTestId("uebungs-verbindung")).toHaveTextContent("Präsentation verbunden");

    // Eine Folie, die es im eigenen Ablauf nicht gibt, ändert nichts.
    fenster.senden({ typ: "folie", folieId: "kern-service" });
    expect(kopf()).toHaveTextContent("Deine Zahlen");

    const vorher = fenster.empfangen.length;
    fenster.senden({ typ: "anfrage" });
    expect(fenster.empfangen.slice(vorher)).toContainEqual(expect.objectContaining({ typ: "stand", folieId: "rechner" }));

    // Die Reglerwerte aus dem Fenster erscheinen in der Moderation.
    fenster.senden({ typ: "regler", abschluesse: 3, kaufpreis: 250000 });
    expect(screen.getByTestId("uebungs-regler")).toHaveTextContent("3 Abschlüsse pro Monat");
  });

  it("öffnet das Präsentationsfenster mit Sitzung und Stand, ohne Bewerber", async () => {
    bewerberImCache = baueBewerber();
    const oeffnen = vi.spyOn(window, "open").mockImplementation(() => null);
    renderMit("?art=vorabbogen&folie=rechner&bewerber=mod-1");
    fireEvent.click(screen.getByTestId("fenster-oeffnen"));
    expect(oeffnen).toHaveBeenCalledTimes(1);
    const url = String(oeffnen.mock.calls[0][0]);
    expect(url).toBe("/praesentation-uebung?fenster=1&kanal=test&art=vorabbogen&folie=rechner");
    expect(url).not.toContain("bewerber");
    oeffnen.mockRestore();
    // Der Kennenlernbogen unter den Notizen laedt nach. Einmal abwarten,
    // sonst meldet React eine Aktualisierung ausserhalb von act.
    await act(async () => {});
  });

  it("das Fenster zeigt nur die Folie, springt mit dem Stand der Moderation mit und meldet eigene Wechsel", async () => {
    bewerberImCache = baueBewerber();
    const moderation = anderesEnde();
    renderMit("?fenster=1&kanal=test&art=vorabbogen&bewerber=mod-1");
    expect(screen.getByTestId("uebungs-fenster")).toBeInTheDocument();
    expect(screen.queryByTestId("uebungs-leiste")).not.toBeInTheDocument();
    expect(screen.queryByTestId("uebungs-kopf")).not.toBeInTheDocument();
    expect(screen.queryByTestId("uebungs-notizen")).not.toBeInTheDocument();
    expect(screen.getByText("Folie 1 / 22")).toBeInTheDocument();
    // Handschlag beim Öffnen.
    expect(moderation.empfangen).toContainEqual({ typ: "anfrage" });

    moderation.senden({ typ: "stand", art: "kennenlernbogen", teil: 1, weg: "weg2", module: [], folieId: "kern-begruessung" });
    expect(screen.getByText("Folie 1 / 8")).toBeInTheDocument();
    expect(moderation.empfangen).toContainEqual({ typ: "folie", folieId: "kern-begruessung" });

    moderation.senden({ typ: "stand", art: "rechner", teil: 1, weg: "weg1", module: [], folieId: "rechner" });
    expect(screen.getByText("Folie 1 / 1")).toBeInTheDocument();
    expect(screen.getByText("Dein Rechner")).toBeInTheDocument();

    // Ein Ping bekommt sein Pong.
    moderation.senden({ typ: "ping" });
    expect(moderation.empfangen).toContainEqual({ typ: "pong" });

    // Der Bewerbername steht nirgends, das Fenster wird geteilt.
    expect(screen.queryByText(/Max/)).not.toBeInTheDocument();

    // Das Fenster fragt seine Antworten nach. Einmal abwarten, sonst meldet
    // React eine Aktualisierung ausserhalb von act.
    await act(async () => {});
  });
});

describe("PraesentationsUebung: Notizen am Bewerber", () => {
  it("speichert eine Notiz mit Folienbezug im Notizenprotokoll und zeigt die vorhandenen", async () => {
    bewerberImCache = baueBewerber();
    renderMit("?art=vorabbogen&bewerber=mod-1");
    // Der Name steht in der Kopfzeile und in der Leiste, sonst nirgends:
    // Folien und Skript bleiben blank.
    expect(kopf()).toHaveTextContent("Max Muster");
    expect(screen.getByTestId("leiste-kopf")).toHaveTextContent("Max Muster");
    expect(screen.getAllByText(/Max/)).toHaveLength(2);

    const notizen = screen.getByTestId("uebungs-notizen");
    expect(within(notizen).getByText("Telefonat: ruft Dienstag zurück.")).toBeInTheDocument();
    const feld = within(notizen).getByLabelText("Notiz zur Folie");
    expect(feld).toBeEnabled();
    expect(screen.getByTestId("notiz-speichern")).toBeDisabled();

    fireEvent.change(feld, { target: { value: "  Läuft gut  " } });
    fireEvent.click(screen.getByTestId("notiz-speichern"));
    expect(addNotizEntry).toHaveBeenCalledTimes(1);
    expect(addNotizEntry).toHaveBeenCalledWith(
      "mod-1",
      expect.stringMatching(/^\[Closing, Folie 1 .+\] Läuft gut$/),
      "Sarah",
      "u-sarah",
    );
    expect(feld).toHaveValue("");

    // Auf einer anderen Folie und in einem anderen Ablauf trägt die Notiz den passenden Bezug.
    fireEvent.click(screen.getByTestId("leiste-art-kennenlernbogen"));
    fireEvent.click(screen.getByTestId("leiste-gruppe-kennenlernbogen-weg3"));
    fireEvent.click(screen.getByTestId("leiste-kennenlernbogen|weg3|kern-service"));
    fireEvent.change(feld, { target: { value: "Fragt nach dem Service." } });
    fireEvent.keyDown(feld, { key: "Enter", ctrlKey: true });
    expect(addNotizEntry).toHaveBeenLastCalledWith(
      "mod-1",
      expect.stringMatching(/^\[Kennenlern, Weg 3, Folie 5 .+\] Fragt nach dem Service\.$/),
      "Sarah",
      "u-sarah",
    );
    // Der Kennenlernbogen unter den Notizen laedt nach. Einmal abwarten,
    // sonst meldet React eine Aktualisierung ausserhalb von act.
    await act(async () => {});
  });

  it("ohne Bewerber bleibt das Feld aus und der Hinweis sagt warum", () => {
    renderMit("?art=vorabbogen");
    const notizen = screen.getByTestId("uebungs-notizen");
    expect(within(notizen).getByText(/Notizen brauchen einen Bewerber/)).toBeInTheDocument();
    expect(within(notizen).getByLabelText("Notiz zur Folie")).toBeDisabled();
    expect(screen.getByTestId("notiz-speichern")).toBeDisabled();
    expect(screen.queryByTestId("uebungs-notizliste")).not.toBeInTheDocument();
    expect(addNotizEntry).not.toHaveBeenCalled();
  });

  it("mit unbekannter Kennung bleibt das Feld ebenfalls aus", async () => {
    renderMit("?art=vorabbogen&bewerber=gibt-es-nicht");
    const notizen = screen.getByTestId("uebungs-notizen");
    expect(within(notizen).getByText(/Bewerber nicht gefunden/)).toBeInTheDocument();
    expect(within(notizen).getByLabelText("Notiz zur Folie")).toBeDisabled();
    // Der Kennenlernbogen unter den Notizen laedt nach. Einmal abwarten,
    // sonst meldet React eine Aktualisierung ausserhalb von act.
    await act(async () => {});
  });
});

describe("PraesentationsUebung: PDF", () => {
  it("bietet ein PDF je Präsentation und je Weg an und ruft den Hausexport ohne Hinweisseiten", async () => {
    renderMit("?art=kennenlernbogen&weg=weg1");
    // Radix öffnet das Menü auf pointerdown und Enter, nicht auf click.
    const ausloeser = screen.getByTestId("pdf-menue");
    fireEvent.pointerDown(ausloeser, { button: 0, ctrlKey: false });
    fireEvent.keyDown(ausloeser, { key: "Enter" });
    const menue = await screen.findByRole("menu");
    expect(within(menue).getByText("Ab Teil 1, 22 Folien")).toBeInTheDocument();
    expect(within(menue).getByText("Nur Teil 2, 15 Folien")).toBeInTheDocument();
    for (const n of [1, 2, 3, 4, 5]) {
      expect(within(menue).getByText(new RegExp(`^Weg ${n}, \\d+ Folien`))).toBeInTheDocument();
    }
    expect(within(menue).getByText("Nur der Rechner, 1 Folie")).toBeInTheDocument();

    fireEvent.click(within(menue).getByText(/^Weg 3, /));
    await waitFor(() => expect(exportPraesentationAsPdf).toHaveBeenCalledTimes(1), { timeout: 20000 });
    const optionen = exportPraesentationAsPdf.mock.calls[0][0] as Record<string, unknown>;
    expect(optionen.title).toBe("Kennenlernbogen, Weg 3");
    expect(optionen.filename).toBe("MOREImmo_Kennenlernbogen_Weg3.pdf");
    expect(optionen.hinweisSeiten).toBe(false);
    expect((optionen.root as HTMLElement).querySelectorAll("section[data-druckseite]").length).toBe(7);
    // Der Stapel zeichnet alle Folien des Wegs auf einmal und wartet auf die
    // Hochlauf-Zahlen; in jsdom dauert das länger als die üblichen 5 Sekunden.
  }, 30000);
});

describe("PraesentationsUebung: der Weg zurueck ins Bewerberprofil", () => {
  it("zeigt ohne Bewerber keinen Zurueck-Knopf", () => {
    renderMit("?art=vorabbogen");
    expect(screen.queryByTestId("uebung-zurueck")).toBeNull();
  });

  it("fuehrt mit Bewerber zurueck in dessen Profil, in den Reiter Videocall", () => {
    renderMit("?art=kennenlernbogen&bewerber=b-42");
    fireEvent.click(screen.getByTestId("uebung-zurueck"));
    expect(screen.getByTestId("bewerberprozess")).toHaveTextContent("b-42");
    expect(screen.getByTestId("bewerberprozess")).toHaveTextContent("erstgespraech");
  });
});

describe("PraesentationsUebung: der Kennenlernbogen unter den Notizen", () => {
  /** Ein eingereichter Bogen auf Weg 1, wie ihn `bewerber_formular` liefert. */
  const BOGEN_ZEILE = {
    status: "eingereicht",
    created_at: "2026-09-18T10:00:00.000Z",
    expires_at: "",
    token: "tok-1",
    antworten: {
      weg: "weg1",
      hintergrund: ["beratung"],
      wegAntwort1: "4_bis_10",
      passung: ["selbststaendig"],
      verstaendnisFixum: "nein",
      verstaendnisProvision: "nein",
      zeitProWoche: "10_bis_20",
      perspektive: "spaeter_haupt",
      startzeitpunkt: "vier_wochen",
      erreichbarkeit: ["abends"],
      gewerbe: "ja",
      erlaubnis34c: "nein",
      themen: ["verdienst"],
      eigeneFrage: "Wie schnell bekomme ich ein Objekt?",
    },
  };

  const karte = () => screen.getByTestId("uebungs-kennenlernbogen");

  it("zeigt die Zusammenfassung mit Bewerber, zugeklappt bis zum Klick", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [BOGEN_ZEILE];
    renderMit("?art=kennenlernbogen&bewerber=mod-1");

    await screen.findByTestId("uebungs-kennenlernbogen");
    // Der Kopf steht sofort da, mit Dauer und Ausfuelldatum als Marken.
    expect(within(karte()).getByText("Aus dem Kennenlernbogen")).toBeInTheDocument();
    expect(within(karte()).getByText(/Minuten$/)).toBeInTheDocument();
    expect(within(karte()).getByText(/ausgefüllt am/)).toBeInTheDocument();

    // Zugeklappt: keine einzige Antwort, nur der Knopf.
    expect(within(karte()).queryByText("So möchte er starten")).toBeNull();
    fireEvent.click(within(karte()).getByRole("button", { name: /Alle Antworten/ }));
    expect(within(karte()).getByText("So möchte er starten")).toBeInTheDocument();
    // Zweimal: einmal in der Gruppe, einmal als seine eigene Frage darunter.
    expect(within(karte()).getAllByText(/Wie schnell bekomme ich ein Objekt\?/).length).toBeGreaterThan(0);
  });

  it("bleibt beim Folienwechsel offen", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [BOGEN_ZEILE];
    renderMit("?art=kennenlernbogen&bewerber=mod-1");

    await screen.findByTestId("uebungs-kennenlernbogen");
    fireEvent.click(within(karte()).getByRole("button", { name: /Alle Antworten/ }));
    expect(within(karte()).getByText("So möchte er starten")).toBeInTheDocument();

    fireEvent.click(within(kopf()).getByLabelText("Weiter"));
    expect(kopf()).toHaveTextContent("Folie 2 /");
    expect(within(karte()).getByText("So möchte er starten")).toBeInTheDocument();
  });

  it("faellt ohne Bewerber ganz weg", async () => {
    datenbank.formularZeilen = [BOGEN_ZEILE];
    renderMit("?art=kennenlernbogen");
    await screen.findByTestId("uebungs-notizen");
    expect(screen.queryByTestId("uebungs-kennenlernbogen")).toBeNull();
  });

  it("sagt ruhig Bescheid, wenn kein Bogen ausgefuellt ist", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [];
    renderMit("?art=kennenlernbogen&bewerber=mod-1");

    await screen.findByTestId("uebungs-kennenlernbogen");
    expect(within(karte()).getByTestId("kennenlernbogen-fehlt")).toBeInTheDocument();
    expect(within(karte()).getByText(/kein eingereichter Bogen/)).toBeInTheDocument();
  });
});

/*
 * Der Kern, den fuenf Tage lang niemand geprueft hat: Die Moderation soll die
 * Antworten des Bewerbers auf den Folien zeigen und nicht eine blanke Strecke.
 * Geprueft wird an zwei Stellen, die ohne Bogen gar nicht erst entstehen: der
 * dritten Zeile der Ausgangslage (Abschluesse im letzten Jahr) und dem Kasten
 * mit dem Startzeitpunkt auf der Schlussfolie.
 */
describe("PraesentationsUebung: die Antworten des Bewerbers auf den Folien", () => {
  /** Ein eingereichter Bogen, hier auf Weg 1. */
  const bogen = (antworten: Record<string, unknown>) => ({
    status: "eingereicht",
    created_at: "2026-09-18T10:00:00.000Z",
    expires_at: "",
    token: "tok-1",
    antworten: {
      hintergrund: ["beratung"],
      passung: ["selbststaendig"],
      verstaendnisFixum: "nein",
      verstaendnisProvision: "nein",
      zeitProWoche: "10_bis_20",
      perspektive: "spaeter_haupt",
      erreichbarkeit: ["abends"],
      gewerbe: "ja",
      erlaubnis34c: "nein",
      themen: ["verdienst"],
      eigeneFrage: "Wie schnell bekomme ich ein Objekt?",
      ...antworten,
    },
  });

  const WEG1 = bogen({ weg: "weg1", wegAntwort1: "4_bis_10", startzeitpunkt: "vier_wochen" });

  const vorschau = () => screen.getByTestId("uebungs-vorschau");

  it("traegt seine Antwort auf der Ausgangslage und auf der Schlussfolie", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [WEG1];
    renderMit("?art=kennenlernbogen&bewerber=mod-1");
    await screen.findByTestId("uebungs-antwortstand");
    expect(screen.getByTestId("uebungs-antwortstand")).toHaveTextContent(
      "Auf den Folien stehen seine Antworten aus dem Kennenlernbogen.",
    );

    fireEvent.click(screen.getByTestId("leiste-kennenlernbogen|weg1|kern-ausgangslage"));
    expect(within(vorschau()).getByText(/Abschlüsse im letzten Jahr: 4 bis 10/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("leiste-kennenlernbogen|weg1|kern-weitergehen"));
    expect(within(vorschau()).getByText("Und wann, hast du selbst schon gesagt")).toBeInTheDocument();
    expect(within(vorschau()).getByText(/angegeben: In den nächsten vier Wochen/)).toBeInTheDocument();
  });

  it("ohne Bewerber bleiben dieselben Folien blank", () => {
    renderMit("?art=kennenlernbogen&weg=weg1");
    fireEvent.click(screen.getByTestId("leiste-kennenlernbogen|weg1|kern-ausgangslage"));
    expect(within(vorschau()).queryByText(/Abschlüsse im letzten Jahr/)).toBeNull();

    fireEvent.click(screen.getByTestId("leiste-kennenlernbogen|weg1|kern-weitergehen"));
    expect(within(vorschau()).queryByText("Und wann, hast du selbst schon gesagt")).toBeNull();
    // Und es steht auch keine Zeile da, die etwas ueber seine Antworten sagt.
    expect(screen.queryByTestId("uebungs-antwortstand")).toBeNull();
  });

  it("springt ohne Weg in der Adresse auf seinen Weg", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [bogen({ weg: "weg3", startzeitpunkt: "vier_wochen" })];
    renderMit("?art=kennenlernbogen&bewerber=mod-1");
    await waitFor(() => expect(kopf()).toHaveTextContent("Kennenlernbogen · Weg 3"));
    expect(screen.getByTestId("leiste-sein-weg")).toBeInTheDocument();
    expect(screen.getByTestId("uebungs-antwortstand")).toHaveTextContent(
      "Auf den Folien stehen seine Antworten",
    );
  });

  it("bleibt auf dem Weg, den die Adresse nennt, und sagt dass er nicht seiner ist", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [bogen({ weg: "weg3", startzeitpunkt: "vier_wochen" })];
    renderMit("?art=kennenlernbogen&weg=weg1&bewerber=mod-1");
    await screen.findByTestId("uebungs-antwortstand");
    expect(kopf()).toHaveTextContent("Kennenlernbogen · Weg 1");
    expect(screen.getByTestId("uebungs-antwortstand")).toHaveTextContent(
      "Weg 1 ist nicht sein Weg. Sein Bogen steht auf Weg 3",
    );
    fireEvent.click(screen.getByTestId("leiste-kennenlernbogen|weg1|kern-weitergehen"));
    expect(within(vorschau()).queryByText("Und wann, hast du selbst schon gesagt")).toBeNull();
  });

  it("sagt es, wenn kein Bogen vorliegt, und bleibt stehen", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [];
    renderMit("?art=kennenlernbogen&bewerber=mod-1");
    await screen.findByTestId("uebungs-antwortstand");
    expect(screen.getByTestId("uebungs-antwortstand")).toHaveTextContent(
      "Kein eingereichter Kennenlernbogen",
    );
    // Die Folien stehen trotzdem, nur eben blank.
    expect(kopf()).toHaveTextContent("Folie 1 /");
    expect(screen.queryByTestId("leiste-sein-weg")).toBeNull();
  });

  it("nimmt die Kennung beim Kennenlernbogen mit ins geteilte Fenster, beim Vorabbogen nicht", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [WEG1];
    const oeffnen = vi.spyOn(window, "open").mockImplementation(() => null);
    renderMit("?art=kennenlernbogen&weg=weg1&bewerber=mod-1");
    await screen.findByTestId("uebungs-antwortstand");

    fireEvent.click(screen.getByTestId("fenster-oeffnen"));
    expect(String(oeffnen.mock.calls[0][0])).toContain("bewerber=mod-1");

    fireEvent.click(screen.getByTestId("leiste-art-vorabbogen"));
    fireEvent.click(screen.getByTestId("fenster-oeffnen"));
    expect(String(oeffnen.mock.calls[1][0])).not.toContain("bewerber");
    oeffnen.mockRestore();
  });

  it("das geteilte Fenster zeigt dieselben gefuellten Folien, aber nie seinen Namen", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [WEG1];
    renderMit("?fenster=1&kanal=test&art=kennenlernbogen&weg=weg1&folie=kern-weitergehen&bewerber=mod-1");
    await screen.findByText("Und wann, hast du selbst schon gesagt");
    expect(screen.getByText(/angegeben: In den nächsten vier Wochen/)).toBeInTheDocument();
    expect(screen.queryByText(/Max/)).not.toBeInTheDocument();
  });
});

/*
 * Der Weg aus dem alten Erstgespraech heraus: Dort startet die Moderation beim
 * Vorabbogen. Schaltet die Kollegin danach auf den Kennenlernbogen um, muss
 * sie trotzdem auf seinem Weg landen und nicht auf Weg 1.
 */
describe("PraesentationsUebung: der Wegsprung nach dem Umschalten", () => {
  it("kommt auch dann auf seinen Weg, wenn die Moderation beim Vorabbogen begann", async () => {
    bewerberImCache = baueBewerber();
    datenbank.formularZeilen = [{
      status: "eingereicht",
      created_at: "2026-09-18T10:00:00.000Z",
      expires_at: "",
      token: "tok-1",
      antworten: { weg: "weg4", themen: ["verdienst"], startzeitpunkt: "vier_wochen" },
    }];
    renderMit("?art=vorabbogen&bewerber=mod-1");
    await screen.findByTestId("uebungs-kennenlernbogen");
    expect(kopf()).toHaveTextContent("Vorabbogen");

    fireEvent.click(screen.getByTestId("leiste-art-kennenlernbogen"));
    await waitFor(() => expect(kopf()).toHaveTextContent("Kennenlernbogen · Weg 4"));
    expect(screen.getByTestId("uebungs-antwortstand")).toHaveTextContent(
      "Auf den Folien stehen seine Antworten",
    );
  });
});
