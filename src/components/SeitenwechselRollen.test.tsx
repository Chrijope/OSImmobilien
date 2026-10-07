import { useLayoutEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { SeitenwechselRollen } from "./SeitenwechselRollen";

/**
 * Waechter fuer die Rollposition beim Seitenwechsel.
 *
 * Christian am 23.09.2026: Ein Klick in der Objektliste oeffnete die
 * Objektseite mitten zwischen Kennzahlen und Einheiten, und von dort die
 * Einheitenseite genauso. Im CRM rollt der Inhaltskasten `<main>` und nicht
 * das Fenster, und dieser Kasten blieb beim Routenwechsel einfach stehen.
 *
 * Abgesichert wird hier nicht nur „neue Seite beginnt oben", sondern auch,
 * was dabei nicht kaputtgehen darf: der Zurueck-Knopf, Reiter und Filter ueber
 * Suchparameter, Anker in derselben Seite und der eigene Sprung einer Seite
 * zu einem Abschnitt.
 */

let roller: HTMLElement;

/**
 * jsdom rechnet kein Layout aus. Deshalb wird der rollende Inhaltskasten von
 * Hand nachgestellt, wie in `lib/rollen.test.ts`: Masse festlegen,
 * `overflow-y` setzen und `scrollTo` so nachbauen, dass es die Position setzt.
 */
function baueRoller({ rollt }: { rollt: boolean }) {
  const el = document.createElement("main");
  el.style.overflowY = "auto";
  Object.defineProperty(el, "scrollHeight", { value: rollt ? 3000 : 500, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 500, configurable: true });
  el.scrollTo = vi.fn((optionen: ScrollToOptions) => {
    el.scrollTop = optionen.top ?? 0;
  }) as unknown as typeof el.scrollTo;
  document.body.appendChild(el);
  return el;
}

/**
 * Was der Browser tut, wenn die lange Liste aus dem Kasten verschwindet: Die
 * neue Seite ist kuerzer, also wird die Rollposition auf das gestutzt, was
 * noch passt. jsdom tut das nicht von selbst.
 *
 * Genau daran haengt der Zurueck-Knopf. Die Stelle der Liste muss gemerkt
 * sein, BEVOR die Liste ausgebaut wird, sonst merkt man sich die gestutzte
 * Zahl. Der Ausbau loest diese Ref mit `null` aus, und zwar im selben Moment,
 * in dem React die alte Seite aus dem Dokument nimmt.
 *
 * Bewusst ausserhalb der Komponente, damit die Ref bei jedem Neuzeichnen
 * dieselbe bleibt und nur beim echten Ausbau feuert.
 */
function listeVerlaesstDenKasten(el: HTMLDivElement | null) {
  if (el === null) roller.scrollTop = Math.min(roller.scrollTop, 400);
}

function Liste() {
  const navigate = useNavigate();
  return (
    <div ref={listeVerlaesstDenKasten}>
      <h1>Objektliste</h1>
      <button onClick={() => navigate("/objekte/1")}>Objekt öffnen</button>
      <button onClick={() => navigate("/objekte?reiter=karte")}>Reiter Karte</button>
      <button onClick={() => navigate("/objekte#einheiten")}>Zu den Einheiten</button>
      <button onClick={() => navigate("/objekte/2", { replace: true })}>Weiterleiten</button>
      <button onClick={() => navigate("/kunden/5#objektauswahl")}>Kunde mit Anker</button>
      <button onClick={() => navigate(1)}>Vor</button>
    </div>
  );
}

function Objektseite() {
  const navigate = useNavigate();
  return (
    <div>
      <h1>Objektseite</h1>
      <button onClick={() => navigate("/objekte/1/einheiten/7")}>Einheit öffnen</button>
      <button onClick={() => navigate(-1)}>Zurück</button>
    </div>
  );
}

function Einheitenseite() {
  return <h1>Einheitenseite</h1>;
}

/**
 * Eine Seite, die selbst zu einem Abschnitt springt, wie das Kundenprofil mit
 * `#objektauswahl`. Die echten Seiten springen spaeter (Zeitgeber oder
 * naechstes Bild). Hier springt sie so frueh wie irgend moeglich, im
 * Layout-Effekt. Wenn selbst das nicht vom Zuruecksetzen ueberschrieben wird,
 * dann erst recht kein spaeterer Sprung.
 */
function KundeMitAnker() {
  const { hash } = useLocation();
  useLayoutEffect(() => {
    if (hash === "#objektauswahl") roller.scrollTop = 640;
  }, [hash]);
  return <h1>Kundenprofil</h1>;
}

/** Aufbau wie in `App.tsx`: die Komponente steht VOR `<Routes>`. */
function zeige(start: string) {
  const ort = roller.appendChild(document.createElement("div"));
  return render(
    <MemoryRouter initialEntries={[start]}>
      <SeitenwechselRollen />
      <Routes>
        <Route path="/objekte" element={<Liste />} />
        <Route path="/objekte/:id" element={<Objektseite />} />
        <Route path="/objekte/:id/einheiten/:weId" element={<Einheitenseite />} />
        <Route path="/kunden/:id" element={<KundeMitAnker />} />
      </Routes>
    </MemoryRouter>,
    { container: ort },
  );
}

let fensterRollen: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  document.body.innerHTML = "";
  roller = baueRoller({ rollt: true });
  fensterRollen = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Neue Seite beginnt oben", () => {
  it("Klick in der Objektliste oeffnet die Objektseite ganz oben", () => {
    zeige("/objekte");
    roller.scrollTop = 1200;

    fireEvent.click(screen.getByText("Objekt öffnen"));

    expect(screen.getByText("Objektseite")).toBeInTheDocument();
    expect(roller.scrollTop).toBe(0);
    // Ohne Gleiten: Die Seite soll oben stehen, nicht dorthin fahren.
    expect(roller.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("von der Objektseite geoeffnet beginnt auch die Einheitenseite oben", () => {
    zeige("/objekte/1");
    roller.scrollTop = 900;

    fireEvent.click(screen.getByText("Einheit öffnen"));

    expect(screen.getByText("Einheitenseite")).toBeInTheDocument();
    expect(roller.scrollTop).toBe(0);
  });

  it("eine Weiterleitung auf einen neuen Pfad beginnt ebenfalls oben", () => {
    zeige("/objekte");
    roller.scrollTop = 1200;

    fireEvent.click(screen.getByText("Weiterleiten"));

    expect(screen.getByText("Objektseite")).toBeInTheDocument();
    expect(roller.scrollTop).toBe(0);
  });

  it("rollt das Fenster, wo kein Inhaltskasten rollt, etwa auf oeffentlichen Seiten", () => {
    document.body.innerHTML = "";
    roller = baueRoller({ rollt: false });
    zeige("/objekte");

    fireEvent.click(screen.getByText("Objekt öffnen"));

    expect(fensterRollen).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });
});

describe("Was stehen bleiben muss", () => {
  it("Zurueck fuehrt an die Stelle in der Liste, Vor an die Stelle auf der Objektseite", () => {
    zeige("/objekte");
    roller.scrollTop = 1200;
    fireEvent.click(screen.getByText("Objekt öffnen"));
    expect(roller.scrollTop).toBe(0);
    roller.scrollTop = 300;

    fireEvent.click(screen.getByText("Zurück"));

    expect(screen.getByText("Objektliste")).toBeInTheDocument();
    expect(roller.scrollTop).toBe(1200);

    fireEvent.click(screen.getByText("Vor"));

    expect(screen.getByText("Objektseite")).toBeInTheDocument();
    expect(roller.scrollTop).toBe(300);
  });

  it("ein Reiter- oder Filterwechsel ueber Suchparameter rollt nicht", () => {
    zeige("/objekte");
    roller.scrollTop = 1200;

    fireEvent.click(screen.getByText("Reiter Karte"));

    expect(roller.scrollTop).toBe(1200);
    expect(roller.scrollTo).not.toHaveBeenCalled();
    expect(fensterRollen).not.toHaveBeenCalled();
  });

  it("ein Anker in derselben Seite wird nicht nach oben gerissen", () => {
    zeige("/objekte");
    roller.scrollTop = 1200;

    fireEvent.click(screen.getByText("Zu den Einheiten"));

    expect(roller.scrollTop).toBe(1200);
    expect(roller.scrollTo).not.toHaveBeenCalled();
  });

  it("der eigene Abschnittssprung einer neuen Seite gewinnt gegen das Zuruecksetzen", () => {
    zeige("/objekte");
    roller.scrollTop = 1200;

    fireEvent.click(screen.getByText("Kunde mit Anker"));

    expect(screen.getByText("Kundenprofil")).toBeInTheDocument();
    expect(roller.scrollTop).toBe(640);
  });
});
