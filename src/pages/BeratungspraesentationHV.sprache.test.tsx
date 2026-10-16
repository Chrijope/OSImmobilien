import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import BeratungspraesentationHV from "./BeratungspraesentationHV";

/*
 * Beratungspräsentation, neue Fassung (Entwurf 15.10.2026).
 *
 * Bis zum 16.10.2026 prüfte diese Datei den Sprachwechsel Deutsch/Englisch.
 * Die neue Fassung ist bis zur Freigabe der Texte nur deutsch; die englische
 * Übersetzung kommt danach. Geprüft wird hier, was beim Umbau nicht verloren
 * gehen darf: die Übernahme aus dem Erstgespräch, die Anrede, der
 * Konzeptschalter und der Sprung in die Selbstauskunft.
 */

const zustand = vi.hoisted(() => ({
  skript: null as Record<string, unknown> | null,
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Maria Muster", role: "vertriebspartner" }, authUser: { id: "nutzer-1" } }),
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/dataCache", () => ({ onCacheChange: () => () => {}, cacheGet: () => [] }));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) =>
    id === "k-1"
      ? { anrede: "Frau", vorname: "Anna", nachname: "Muster", qualEinkommen: "3.980", qualEigenkapital: "20.000 €" }
      : undefined,
}));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMetaField: (_id: string, feld: string, rueckfall: unknown) =>
    feld === "setterSkript" ? zustand.skript ?? rueckfall : rueckfall,
}));

class Beobachter {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const ablage = new Map<string, string>();
beforeEach(() => {
  ablage.clear();
  zustand.skript = null;
  vi.stubGlobal("IntersectionObserver", Beobachter);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => ablage.get(k) ?? null,
    setItem: (k: string, v: string) => void ablage.set(k, v),
    removeItem: (k: string) => void ablage.delete(k),
    clear: () => ablage.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

const UNTERLAGEN = "/beratungspraesentation-osimmobilien";
const KUNDENPROFIL = "/beratungspraesentation-osimmobilien?kunde=Anna%20Muster&kundeId=k-1&investmentId=i-1";

function Ziel() {
  const ort = useLocation();
  return <p data-testid="ziel">{`${ort.pathname}${ort.search}`}</p>;
}

function zeige(adresse: string) {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="/beratungspraesentation-osimmobilien" element={<BeratungspraesentationHV />} />
        <Route path="/selbstauskunft" element={<Ziel />} />
      </Routes>
    </MemoryRouter>,
  );
}

const ueberschriften = () => Array.from(document.querySelectorAll("h2")).map((h) => h.textContent);

describe("Aufbau nach dem Entwurf", () => {
  it("zeigt die Abschnitte in der Reihenfolge des Entwurfs", () => {
    zeige(UNTERLAGEN);
    const reihenfolge = [
      "Was machen wir heute?",
      "Das hast du uns gesagt.",
      "Deine Rentenlücke in Zahlen.",
      "Geld auf dem Konto wird jedes Jahr weniger wert.",
      "OS Real Estate in einem Satz.",
      "Alles aus einer Hand, unter einem Dach.",
      "Vier Bausteine, die zusammenarbeiten.",
      "Welches Ziel steht für dich an erster Stelle?",
      // 08: Inhalt des PDFs „Arbeitsleistung und Immobilienvermögen“ (Konzept Altersvorsorge)
      "Wir zeigen dir, wie du Sozialabgaben in Vermögen umwandelst.",
      "Deine vorzeitige Rente mit 58 Jahren.",
      // 09 Kriterien vor 10 Objekte
      "Du entscheidest, was passen muss.",
      "Drei Standorte, geprüft und vermietet.",
      "So geht es weiter.",
      "Wenn wir eine Immobilie finden, die deine Kriterien erfüllt: Möchtest du den nächsten Schritt gehen?",
      "Das bekommst du in der Objektvorstellung.",
    ];
    const ist = ueberschriften();
    const positionen = reihenfolge.map((t) => ist.indexOf(t));
    expect(positionen, `vorhanden: ${ist.join(" | ")}`).not.toContain(-1);
    expect([...positionen].sort((a, b) => a - b)).toEqual(positionen);
  });

  it("zeigt die Beispielobjekte des Ursprungsprojekts nicht mehr", () => {
    zeige(UNTERLAGEN);
    const text = document.body.textContent ?? "";
    for (const alt of ["Nürnberg", "Ansbach", "Memmingen", "Co-Living", "KfW 40"]) {
      expect(text).not.toContain(alt);
    }
    expect(screen.queryAllByTestId("partner-logo")).toHaveLength(0);
  });
});

describe("Übernahme aus dem Erstgespräch", () => {
  it("duzt auch bei gespeichertem Sie, begrüßt mit Vornamen und füllt Ziele, Rahmen und Rentenlücke", () => {
    // Hausregel „immer duzen“: Ein altes „sie“ aus dem Erstgespräch zählt nicht mehr.
    zustand.skript = {
      anrede: "sie",
      ziele: ["Altersvorsorge"],
      antworten: {
        motivWoertlich: "Ich möchte jetzt anfangen.",
        investitionMonat: "400 €",
        reserve: "15.000",
        mitentscheider: "Partner",
        wunschNetto: "3.000",
        renteErwartet: "1.800",
        schwerpunkt: "steuer",
        offeneFragen: "Was passiert bei Leerstand?",
      },
    };
    zeige(KUNDENPROFIL);

    expect(document.getElementById("hero")?.textContent).toContain("Herzlich willkommen, Anna.");
    expect(ueberschriften()).toContain("Das hast du uns gesagt.");
    expect(document.body.textContent).not.toContain("Frau Muster");
    expect(screen.getByDisplayValue("Ich möchte jetzt anfangen.")).toBeInTheDocument();
    // Das Euro-Zeichen aus dem Erstgespräch fällt weg, das Feld führt sein eigenes.
    expect(screen.getAllByDisplayValue("400").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("15.000").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Partner")).toBeInTheDocument();
    // Lücke 1.200 € im Monat, über 25 Jahre 360.000 €
    expect(document.getElementById("rentenluecke")?.textContent).toContain("1.200 €");
    expect(document.getElementById("rentenluecke")?.textContent).toContain("360.000 €");
    expect(document.body.textContent).toContain("Was passiert bei Leerstand?");
    // Der Schwerpunkt belegt den Konzeptschalter vor.
    expect(screen.getByTestId("konzept-karte-steuer")).toHaveAttribute("aria-pressed", "true");
    expect(ueberschriften()).toContain("Mehr Netto vom Brutto.");
    expect(screen.queryByTestId("konzept-inhalt-alter")).toBeNull();
  });

  it("sieht ohne Erstgespräch sauber aus und bleibt beim Du", () => {
    zeige(UNTERLAGEN);
    expect(document.body.textContent).toContain("Herzlich willkommen.");
    expect(document.body.textContent).not.toContain("undefined");
    expect(document.body.textContent).not.toContain("NaN");
    expect(screen.getByTestId("konzept-karte-zusatzrente")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Begrüßung im Hero", () => {
  const hero = () => document.getElementById("hero")?.textContent ?? "";

  it.each([
    ["A", "/beratungspraesentation-osimmobilien"],
    ["B", "/beratungspraesentation-osimmobilien-b"],
  ])("Fassung %s nennt den Vornamen aus dem Kundenprofil", (_f, pfad) => {
    render(
      <MemoryRouter initialEntries={[`${pfad}?kunde=Anna%20Muster&vorname=Anna&kundeId=k-1&investmentId=i-1`]}>
        <Routes>
          <Route path="*" element={<BeratungspraesentationHV variante={pfad.endsWith("-b") ? "b" : "a"} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(hero()).toContain("Herzlich willkommen, Anna.");
  });

  it("nimmt den Namen aus den Parametern, solange der Kontakt nicht geladen ist", () => {
    zeige("/beratungspraesentation-osimmobilien?kunde=Anna%20Maria%20Muster&vorname=Anna%20Maria&kundeId=k-unbekannt&investmentId=i-1");
    expect(hero()).toContain("Herzlich willkommen, Anna Maria.");
  });

  it("grüßt ohne Namen neutral", () => {
    zeige(UNTERLAGEN);
    expect(hero()).toContain("Herzlich willkommen.");
  });

  it("macht aus einem kaputten Namen im Parameter keinen Namen", () => {
    zeige("/beratungspraesentation-osimmobilien?kunde=undefined%20undefined&kundeId=k-unbekannt&investmentId=i-1");
    expect(hero()).not.toContain("undefined");
    expect(hero()).toContain("Herzlich willkommen.");
  });
});

describe("Hero als Glaskarte", () => {
  it.each([
    ["A", "/beratungspraesentation-osimmobilien"],
    ["B", "/beratungspraesentation-osimmobilien-b"],
  ])("Fassung %s zeigt Logo, Kicker, Überschrift, Begrüßung und zwei Knöpfe, kein Teambild", (_f, pfad) => {
    render(
      <MemoryRouter initialEntries={[`${pfad}?kunde=Anna%20Muster&vorname=Anna&kundeId=k-1&investmentId=i-1`]}>
        <Routes>
          <Route path="*" element={<BeratungspraesentationHV variante={pfad.endsWith("-b") ? "b" : "a"} />} />
        </Routes>
      </MemoryRouter>,
    );
    const hero = document.getElementById("hero")!;
    const bilder = hero.querySelectorAll("img");
    expect(bilder).toHaveLength(1);
    expect(bilder[0]).toHaveAttribute("alt", "OS Real Estate GmbH");
    expect(hero.textContent).toContain("OS Real Estate · Vermögensaufbau mit Immobilien");
    expect(hero.querySelector("h1")?.textContent).toBe("Strategischer Vermögensaufbaumit vermieteten Immobilien");
    expect(hero.textContent).toContain("Herzlich willkommen, Anna.");
    expect(hero.textContent).toContain("Steuern sparen. Zusatzrente aufbauen. Persönlich begleitet.");
    expect([...hero.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Beratung starten", "Konzepte ansehen"]);
  });

  it("springt mit den Knöpfen zum ersten Abschnitt und zum Konzeptschalter", () => {
    zeige(UNTERLAGEN);
    const gesprungen: string[] = [];
    const vorher = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      gesprungen.push(this.id);
    };
    try {
      fireEvent.click(screen.getByRole("button", { name: "Beratung starten" }));
      fireEvent.click(screen.getByRole("button", { name: "Konzepte ansehen" }));
    } finally {
      Element.prototype.scrollIntoView = vorher;
    }
    expect(gesprungen).toEqual(["heute", "konzept"]);
  });
});

describe("Konzeptschalter und Abschnitt 08", () => {
  it("zeigt nur das gewählte Konzept und schaltet um", () => {
    zeige(UNTERLAGEN);
    expect(screen.getByTestId("konzept-inhalt-alter")).toBeInTheDocument();
    expect(screen.queryByTestId("konzept-inhalt-steuer")).toBeNull();
    fireEvent.click(screen.getAllByRole("radio", { name: "Konzept 2 · Steuerersparnis" })[0]);
    expect(screen.getByTestId("konzept-inhalt-steuer").textContent).toContain("+274 €");
    expect(screen.queryByTestId("konzept-inhalt-alter")).toBeNull();
  });

  it("zeigt auf Wunsch beide Konzepte, Steuer zuerst, danach Kriterien und Objekte", () => {
    zeige(UNTERLAGEN);
    fireEvent.click(screen.getByTestId("konzept-beide"));
    const ids = Array.from(document.querySelectorAll("section[id]")).map((el) => el.id);
    const reihe = ["konzept", "steuer-titel", "steuer-4", "alter-titel", "alter-8", "kriterien", "objekte", "weg", "schritt", "termin"].map((id) =>
      ids.indexOf(id),
    );
    expect(reihe, ids.join(" | ")).not.toContain(-1);
    expect([...reihe].sort((a, b) => a - b)).toEqual(reihe);
  });

  it("startet bei Schwerpunkt „beides“ mit beiden Konzepten", () => {
    zustand.skript = { anrede: "du", antworten: { schwerpunkt: "beides" } };
    zeige(KUNDENPROFIL);
    expect(screen.getByTestId("konzept-beide")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("konzept-inhalt-steuer")).toBeInTheDocument();
    expect(screen.getByTestId("konzept-inhalt-alter")).toBeInTheDocument();
  });

  it("hat die alte Objektrechnung nicht mehr", () => {
    zeige(UNTERLAGEN);
    for (const id of ["funktion", "rechnung", "sicherheit", "plan"]) expect(document.getElementById(id), id).toBeNull();
    expect(screen.queryByTestId("regler-wertentwicklung")).toBeNull();
    expect(document.body.textContent).not.toContain("WE 03");
  });
});

describe("Kriterien und Objekte", () => {
  it("rechnet ehrlich mit „Was, wenn …?“ und zeigt die Sorge aus dem Erstgespräch", () => {
    zustand.skript = { anrede: "du", antworten: { sorgen: "Was, wenn der Mieter nicht zahlt?" } };
    zeige(KUNDENPROFIL);
    const box = screen.getByTestId("was-wenn");
    expect(box.textContent).toContain("+155 € statt +274 €");
    expect(box.textContent).toContain("bis 440 € im Monat");
    expect(box.textContent).toContain("Was, wenn der Mieter nicht zahlt?");
  });

  it("zeigt alle drei Objekte mit Bildern und markiert, was zum Konzept passt", () => {
    zeige(UNTERLAGEN);
    const objekte = screen.getAllByTestId("objekt");
    expect(objekte.map((o) => o.querySelector("h3")?.textContent)).toEqual(["Barfusstraße 9", "Hauffstraße 38", "Doppelhaushälften"]);
    for (const o of objekte) expect(o.querySelectorAll("img")).toHaveLength(7);
    expect(objekte[0].textContent).toContain("Konzept Steuerersparnis");
    expect(objekte[1].textContent).toContain("passt zu deinem Konzept");
    expect(objekte[0].textContent).not.toContain("passt zu deinem Konzept");
  });

  it("blättert in der Diashow", () => {
    zeige(UNTERLAGEN);
    const show = screen.getAllByTestId("diashow")[0];
    const sichtbar = () => Array.from(show.querySelectorAll("img")).findIndex((b) => b.getAttribute("aria-hidden") === "false");
    expect(sichtbar()).toBe(0);
    fireEvent.click(show.querySelector('button[aria-label="Nächstes Bild"]')!);
    expect(sichtbar()).toBe(1);
    fireEvent.click(show.querySelector('button[aria-label="Vorheriges Bild"]')!);
    fireEvent.click(show.querySelector('button[aria-label="Vorheriges Bild"]')!);
    expect(sichtbar()).toBe(6);
  });
});

describe("Sprung in die Selbstauskunft", () => {
  it("nimmt Kunde, Investment und das führende Ziel mit", () => {
    zustand.skript = { anrede: "sie", ziele: ["Altersvorsorge"], antworten: {} };
    zeige(KUNDENPROFIL);
    fireEvent.click(screen.getByRole("button", { name: /Selbstauskunft jetzt gemeinsam ausfüllen/ }));
    expect(screen.getByTestId("ziel")).toHaveTextContent("/selbstauskunft?kundeId=k-1&investmentId=i-1&ziel=rente");
  });
});

describe("Einbindung", () => {
  it("alle Wege führen auf dieselbe Seite", () => {
    const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");
    expect(lies("src/pages/Praesentation.tsx")).toContain('internalRoute: "/beratungspraesentation-osimmobilien"');
    expect(lies("src/lib/unterlagenSeed.ts")).toContain('interneRoute: "/beratungspraesentation-osimmobilien"');
    expect(lies("src/pages/KundenDetail.tsx")).toContain("window.open(`/beratungspraesentation-osimmobilien?${params.toString()}`");
    expect(lies("src/App.tsx")).toMatch(
      /path="\/beratungspraesentation-osimmobilien" element=\{<PraesentationGuard><BeratungspraesentationHV \/><\/PraesentationGuard>\}/,
    );
  });
});
