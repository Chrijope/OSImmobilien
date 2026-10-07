import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * Der Knopf „Texte“ in der Objektübersicht, für Admin und Inhaber.
 *
 * Geprüft wird, was Christian sieht: der Stand am Knopf, der Knopf zum
 * Durcharbeiten mit der richtigen Zahl, der Hinweis, den Tab offen zu lassen,
 * und dass das Fenster sich auch mitten im Lauf schließen lässt, ohne den
 * Lauf zu beenden. Entwürfe zählen nicht mit.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) } },
}));
vi.mock("@/lib/objekteStore", () => ({
  updateObjektFieldFast: vi.fn(async () => undefined),
  getObjektById: vi.fn(() => undefined),
}));
vi.mock("@/lib/dataCache", () => ({ cacheGet: vi.fn(() => []), cacheReload: vi.fn(async () => undefined) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const { ObjektTexteGesamtlauf } = await import("@/components/objekte/ObjektTexteGesamtlauf");
const store = await import("@/lib/objektTexteGesamtlaufStore");
const { OBJEKT_TEXTE_META_SCHLUESSEL, OBJEKT_TEXTE_SCHEMA } = await import("@/lib/objektTexteKi");

const FUENF = ["Eins.", "Zwei.", "Drei.", "Vier.", "Fünf."];
const fertigerStand = {
  schema: OBJEKT_TEXTE_SCHEMA,
  kurzbeschreibung: "Ein Haus.",
  standortargumente: FUENF.map((argument) => ({ argument, beleg: "B" })),
  sanierungen: [],
  erzeugtAm: "2026-09-23T10:00:00.000Z",
  modell: "m",
  quellenStand: "q",
  quellen: [],
  beanstandungen: [],
};

function objekt(id: string, fertig: boolean, sichtbar = true) {
  const meta: Record<string, unknown> = fertig ? { [OBJEKT_TEXTE_META_SCHLUESSEL]: fertigerStand } : {};
  // Nur die Felder, die Knopf und Auswahl lesen.
  return { id, titel: `Haus ${id}`, sichtbar, meta, dokumente: [], beschreibung: "" } as unknown as import("@/lib/objekteStore").ObjektData;
}

beforeEach(() => store.vergissGesamtlauf());

describe("Der Knopf „Texte“", () => {
  const liste = [objekt("a", true), objekt("b", false), objekt("c", false), objekt("entwurf", false, false)];

  it("zeigt den Stand der sichtbaren Objekte, ohne Entwürfe", () => {
    render(<ObjektTexteGesamtlauf objekte={liste} />);
    expect(screen.getByRole("button", { name: "Texte: 1 von 3 Objekten fertig" })).toBeTruthy();
  });

  it("öffnet das Fenster mit dem Knopf für alle und dem Hinweis zum Tab", () => {
    render(<ObjektTexteGesamtlauf objekte={liste} />);
    fireEvent.click(screen.getByRole("button", { name: "Texte: 1 von 3 Objekten fertig" }));
    expect(screen.getByRole("button", { name: "Alle Objekte jetzt durcharbeiten (2)" })).toBeTruthy();
    expect(screen.getByText("Tab offen lassen")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Nur Fehlgeschlagene/ })).toBeNull();
  });

  it("zeigt während des Laufs den Fortschritt am Knopf und lässt das Fenster schließen", async () => {
    let freigeben: () => void = () => undefined;
    render(<ObjektTexteGesamtlauf objekte={liste} />);

    let lauf: Promise<unknown> = Promise.resolve();
    await act(async () => {
      lauf = store.starteGesamtlauf(liste.filter((o) => o.sichtbar), "alle", {
        erzeuge: async () => {
          await new Promise<void>((fertig) => { freigeben = fertig; });
          return { texte: fertigerStand, neu: true, gespeichert: true, fehler: "" };
        },
        warte: async () => undefined,
      });
    });

    const knopf = screen.getByRole("button", { name: "Texte werden erzeugt, Objekt 1 von 2" });
    fireEvent.click(knopf);
    fireEvent.click(screen.getByRole("button", { name: "Fenster schließen, weiterlaufen lassen" }));
    expect(store.gesamtlaufZustand().laeuft).toBe(true);

    // Aufräumen: anhalten und den laufenden Aufruf zu Ende bringen.
    await act(async () => {
      store.halteGesamtlaufAn();
      freigeben();
      await lauf;
    });
    expect(store.gesamtlaufZustand().laeuft).toBe(false);
  });

  it("bietet nach Fehlschlägen an, nur diese erneut zu versuchen", async () => {
    await store.starteGesamtlauf(liste.filter((o) => o.sichtbar), "alle", {
      erzeuge: async (id) => (id === "b"
        ? { neu: false, gespeichert: false, fehler: "Kaputt." }
        : { texte: fertigerStand, neu: true, gespeichert: true, fehler: "" }),
      warte: async () => undefined,
    });
    render(<ObjektTexteGesamtlauf objekte={liste} />);
    fireEvent.click(screen.getByRole("button", { name: /^Texte:/ }));
    expect(screen.getByRole("button", { name: "Nur Fehlgeschlagene erneut versuchen (1)" })).toBeTruthy();
    expect(screen.getByText("Haus b")).toBeTruthy();
  });
});

describe("Die Zusammenfassung nach dem Durchgang", () => {
  const liste = [objekt("a", false), objekt("b", false)];

  it("nennt je fehlgeschlagenem Objekt Titel und Grund", async () => {
    const grund = "Die KI-Schnittstelle hat die Anfrage abgelehnt (Status 400: Request too large).";
    await store.starteGesamtlauf(liste, "alle", {
      erzeuge: async (id) => (id === "b"
        ? { neu: false, gespeichert: false, fehler: grund, status: 502 }
        : { texte: fertigerStand, neu: true, gespeichert: true, fehler: "" }),
      warte: async () => undefined,
    });
    render(<ObjektTexteGesamtlauf objekte={liste} />);
    fireEvent.click(screen.getByRole("button", { name: /^Texte:/ }));
    expect(screen.getByText("Fehlgeschlagen")).toBeTruthy();
    expect(screen.getByText("Haus b")).toBeTruthy();
    expect(screen.getByText(`: ${grund}`)).toBeTruthy();
  });

  it("sagt klar, dass die Function nicht ausgerollt ist, statt Objekte als fehlgeschlagen zu zählen", async () => {
    const satz = "Die Function objekt-texte-ki ist noch nicht ausgerollt, auf dem Server läuft noch eine ältere Fassung.";
    await store.starteGesamtlauf(liste, "alle", {
      erzeuge: async () => ({ neu: false, gespeichert: false, fehler: satz, funktion: "veraltet" }),
      warte: async () => undefined,
    });
    render(<ObjektTexteGesamtlauf objekte={liste} />);
    fireEvent.click(screen.getByRole("button", { name: /^Texte:/ }));
    expect(screen.getByText("Die Function ist noch nicht bereit")).toBeTruthy();
    expect(screen.getByText(satz)).toBeTruthy();
    expect(screen.queryByText("Fehlgeschlagen")).toBeNull();
    expect(screen.queryByRole("button", { name: /Nur Fehlgeschlagene/ })).toBeNull();
  });
});

