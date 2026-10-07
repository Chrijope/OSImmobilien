import { markiereProfilAbschnitt } from "./markiereProfilAbschnitt";

it("markiert jede Kartenart gleich und startet die Dauer bei erneutem Klick neu", () => {
  vi.useFakeTimers();
  try {
    const element = document.createElement("div");
    element.className = "shadow-none overflow-hidden";
    markiereProfilAbschnitt(element);
    expect(element.getAttribute("data-profil-sprungziel")).toBe("aktiv");
    vi.advanceTimersByTime(2000);
    markiereProfilAbschnitt(element);
    vi.advanceTimersByTime(1000);
    expect(element.hasAttribute("data-profil-sprungziel")).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(element.hasAttribute("data-profil-sprungziel")).toBe(false);
    expect(element.className).toBe("shadow-none overflow-hidden");
  } finally { vi.useRealTimers(); }
});

it("markiert bei einer Hülle die Karte darin, sonst verdeckt deren Glas die Kontur", () => {
  vi.useFakeTimers();
  try {
    // So ist die Objektauswahl gebaut: Hülle mit Kennung, darin die Karte.
    const huelle = document.createElement("div");
    const karte = document.createElement("div");
    karte.setAttribute("data-ui", "card");
    huelle.append(document.createElement("span"), karte);
    markiereProfilAbschnitt(huelle);
    expect(karte.getAttribute("data-profil-sprungziel")).toBe("aktiv");
    expect(huelle.hasAttribute("data-profil-sprungziel")).toBe(false);
    vi.advanceTimersByTime(2500);
    expect(karte.hasAttribute("data-profil-sprungziel")).toBe(false);

    // Eine Karte als Sprungziel bleibt selbst das Ziel.
    markiereProfilAbschnitt(karte);
    expect(karte.getAttribute("data-profil-sprungziel")).toBe("aktiv");
  } finally { vi.useRealTimers(); }
});

it("markiert immer nur einen Kasten, bleibend bis zum nächsten Sprung", () => {
  vi.useFakeTimers();
  try {
    const erster = document.createElement("div");
    const zweiter = document.createElement("div");
    document.body.append(erster, zweiter);
    markiereProfilAbschnitt(erster, { bleibend: true });
    vi.advanceTimersByTime(10_000);
    expect(erster.getAttribute("data-profil-sprungziel")).toBe("aktiv");
    markiereProfilAbschnitt(zweiter, { bleibend: true });
    expect(erster.hasAttribute("data-profil-sprungziel")).toBe(false);
    expect(zweiter.getAttribute("data-profil-sprungziel")).toBe("aktiv");
    // Ein kurzer Sprung von anderswo nimmt den bleibenden Rahmen ebenfalls zurück.
    markiereProfilAbschnitt(erster);
    expect(zweiter.hasAttribute("data-profil-sprungziel")).toBe(false);
    expect(document.querySelectorAll("[data-profil-sprungziel]")).toHaveLength(1);
    erster.remove(); zweiter.remove();
  } finally { vi.useRealTimers(); }
});
