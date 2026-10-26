// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { istEingabeZiel, kuerzelFuer } from "./tastenkuerzel";

const taste = (key: string, teile: Partial<KeyboardEvent> = {}, ziel: EventTarget | null = document.body) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: ziel, ...teile }) as KeyboardEvent;

describe("Tastenkürzel", () => {
  it("erkennt die einfachen Tasten außerhalb von Feldern", () => {
    expect(kuerzelFuer(taste("?", { shiftKey: true }), false)).toBe("uebersicht");
    expect(kuerzelFuer(taste("n"), false)).toBe("neuer-kontakt");
    expect(kuerzelFuer(taste("t"), false)).toBe("neue-aufgabe");
  });

  it("greift nie beim Tippen in ein Feld", () => {
    const feld = document.createElement("input");
    const text = document.createElement("textarea");
    expect(istEingabeZiel(feld)).toBe(true);
    expect(kuerzelFuer(taste("n", {}, feld), false)).toBeNull();
    expect(kuerzelFuer(taste("?", {}, text), false)).toBeNull();
    const kaestchen = document.createElement("input");
    kaestchen.type = "checkbox";
    expect(istEingabeZiel(kaestchen)).toBe(false);
  });

  it("kollidiert nicht mit Browserkürzeln", () => {
    expect(kuerzelFuer(taste("n", { metaKey: true }), false)).toBeNull();
    expect(kuerzelFuer(taste("t", { ctrlKey: true }), false)).toBeNull();
    expect(kuerzelFuer(taste("N", { shiftKey: true }), false)).toBeNull();
  });

  it("⌘ ↵ speichert nur im Dialog, auch aus einem Feld heraus", () => {
    const feld = document.createElement("textarea");
    expect(kuerzelFuer(taste("Enter", { metaKey: true }, feld), true)).toBe("dialog-speichern");
    expect(kuerzelFuer(taste("Enter", { ctrlKey: true }), false)).toBeNull();
    expect(kuerzelFuer(taste("n"), true)).toBeNull();
  });
});
