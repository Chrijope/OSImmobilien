import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// jsdom bringt hier keinen localStorage mit, der Fortschrittsspeicher braucht ihn.
const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  },
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ upsert: async () => ({}) }),
    rpc: async () => ({ data: null, error: null }),
  },
}));

import { AkademieAufgabenBlock } from "./AkademieAufgabenBlock";
import { vaProgress } from "@/lib/vertriebsakademieProgress";
import type { AkademieAufgabe } from "@/lib/vertriebsakademieContent";

const QUIZ: AkademieAufgabe = {
  id: "test-quiz",
  typ: "quiz",
  titel: "Quiz mit Uhr",
  aufloesungAmEnde: true,
  zeitlimitSek: 5,
  fragen: [
    {
      frage: "Welche Zahl ist gerade?",
      optionen: ["Eins", "Zwei"],
      korrekt: 1,
      aufloesung: "Zwei ist gerade.",
    },
    {
      frage: "Welche Zahl ist ungerade?",
      optionen: ["Drei", "Vier"],
      korrekt: 0,
      aufloesung: "Drei ist ungerade.",
    },
  ],
} as AkademieAufgabe;

/** Laesst die Uhr in Sekundenschritten laufen, so wie es der Effekt erwartet. */
function sekundenLaufenLassen(anzahl: number) {
  for (let i = 0; i < anzahl; i++) {
    act(() => { vi.advanceTimersByTime(1000); });
  }
}

describe("AkademieQuiz mit Zeitlimit", () => {
  beforeEach(() => {
    vaProgress.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bucht keinen Fehlversuch, solange die Aufgabe nicht begonnen wurde", () => {
    render(<AkademieAufgabenBlock slug="test" aufgaben={[QUIZ]} />);
    sekundenLaufenLassen(10);
    expect(vaProgress.get().aufgaben["test::test-quiz"]).toBeUndefined();
  });

  it("meldet den Ablauf genau einmal statt in einer Endlosschleife", () => {
    // Regression zu React-Fehler 185: Der Melde-Effekt hing an der Identitaet von
    // onFertig. Der Rueckruf ist bei jedem Rendern neu, also meldete der Effekt,
    // der Speicher aenderte sich, es wurde neu gerendert, der Effekt meldete
    // wieder. Vor der Behebung standen hier 51 Versuche und die Seite stuerzte ab.
    render(<AkademieAufgabenBlock slug="test" aufgaben={[QUIZ]} />);
    fireEvent.click(screen.getByText("Zwei"));
    sekundenLaufenLassen(10);
    const ergebnis = vaProgress.get().aufgaben["test::test-quiz"];
    expect(ergebnis?.versuche).toBe(1);
    expect(ergebnis?.geloest).toBe(false);
  });
});
