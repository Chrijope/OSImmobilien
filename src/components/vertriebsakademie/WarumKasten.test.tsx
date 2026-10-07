import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// jsdom bringt hier keinen localStorage mit, die Pfadwahl braucht ihn.
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
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    rpc: async () => ({ data: null, error: null }),
  },
}));

import { WarumKasten } from "./WarumKasten";

describe("WarumKasten", () => {
  beforeEach(() => speicher.clear());

  it("ist im Quereinsteiger-Pfad zugeklappt, die Überschrift bleibt sichtbar", () => {
    speicher.set("va_zielgruppe", "quereinsteiger");
    render(<WarumKasten titel="Warum diese Frage so aufgebaut ist" text="Weil sie öffnet." />);
    expect(screen.getByText("Warum diese Frage so aufgebaut ist")).toBeInTheDocument();
    expect(screen.queryByText("Weil sie öffnet.")).toBeNull();
  });

  it("öffnet auf Klick", () => {
    speicher.set("va_zielgruppe", "quereinsteiger");
    render(<WarumKasten titel="Warum diese Frage so aufgebaut ist" text="Weil sie öffnet." />);
    fireEvent.click(screen.getByRole("button", { name: /Warum diese Frage so aufgebaut ist/ }));
    expect(screen.getByText("Weil sie öffnet.")).toBeInTheDocument();
  });

  /*
   * Der Kasten startete anfangs im Profipfad offen. Das war richtig, solange
   * es 79 Kästen mit rund 21.000 Zeichen gab. Nach der Überarbeitung der
   * Kapitel sind es 209 Kästen mit 105.330 Zeichen, und damit sah der Profi
   * 693.504 Zeichen Lehrtext gegen 495.892 beim Quereinsteiger. Wer schnell
   * durch wollte, bekam vierzig Prozent mehr zu lesen als wer verstehen
   * wollte. Seitdem startet er in jedem Pfad zu.
   */
  it("ist auch im Profi-Pfad zunächst zu", () => {
    speicher.set("va_zielgruppe", "profi");
    render(<WarumKasten titel="Warum dieser Abschluss so funktioniert" text="Weil er bindet." />);
    expect(screen.queryByText("Weil er bindet.")).not.toBeInTheDocument();
  });

  it("öffnet im Profi-Pfad auf Klick", () => {
    speicher.set("va_zielgruppe", "profi");
    render(<WarumKasten titel="Warum dieser Abschluss so funktioniert" text="Weil er bindet." />);
    fireEvent.click(screen.getByRole("button", { name: /Warum dieser Abschluss so funktioniert/ }));
    expect(screen.getByText("Weil er bindet.")).toBeInTheDocument();
  });
});
