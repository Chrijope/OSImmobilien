import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  ladeFragebogenEntwurf,
  loescheFragebogenEntwurf,
  speichereFragebogenEntwurf,
} from "./bewerberFormularEntwurf";

/** jsdom bringt hier keinen localStorage mit, deshalb ein kleiner In-Memory-Ersatz wie in metaPixel.test.ts. */
function stubLocalStorage() {
  const speicher = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (speicher.has(k) ? (speicher.get(k) as string) : null),
      setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
      removeItem: (k: string) => { speicher.delete(k); },
      clear: () => speicher.clear(),
    },
  });
}

const TOKEN = "a".repeat(64);
const ANDERES_TOKEN = "b".repeat(64);

describe("Zwischenstand des Bewerber-Fragebogens", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("speichert und lädt den Stand je Token", () => {
    speichereFragebogenEntwurf(TOKEN, {
      frageKey: "zeitProWoche",
      antworten: { region: "83022 Rosenheim", hintergrund: ["immo", "netzwerk"] },
      telefon: "+49 176 12345678",
    });

    const entwurf = ladeFragebogenEntwurf(TOKEN);
    expect(entwurf?.frageKey).toBe("zeitProWoche");
    expect(entwurf?.antworten).toEqual({ region: "83022 Rosenheim", hintergrund: ["immo", "netzwerk"] });
    expect(entwurf?.telefon).toBe("+49 176 12345678");
  });

  it("zeigt einem anderen Token den Entwurf nicht", () => {
    speichereFragebogenEntwurf(TOKEN, { frageKey: "region", antworten: { region: "Rosenheim" }, telefon: "" });
    expect(ladeFragebogenEntwurf(ANDERES_TOKEN)).toBeNull();
  });

  it("löscht den Entwurf nach dem Absenden", () => {
    speichereFragebogenEntwurf(TOKEN, { frageKey: "region", antworten: { region: "Rosenheim" }, telefon: "" });
    loescheFragebogenEntwurf(TOKEN);
    expect(ladeFragebogenEntwurf(TOKEN)).toBeNull();
  });

  it("verwirft einen Entwurf, der älter ist als die Gültigkeit des Links", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
    speichereFragebogenEntwurf(TOKEN, { frageKey: "region", antworten: { region: "Rosenheim" }, telefon: "" });

    vi.setSystemTime(new Date("2026-09-16T10:00:00Z"));
    expect(ladeFragebogenEntwurf(TOKEN)).toBeNull();
  });

  it("verwirft kaputte oder fremde Inhalte im Speicher", () => {
    window.localStorage.setItem(`mi_bewerber_fragebogen_${TOKEN}`, "kein json");
    expect(ladeFragebogenEntwurf(TOKEN)).toBeNull();

    window.localStorage.setItem(
      `mi_bewerber_fragebogen_${TOKEN}`,
      JSON.stringify({ gespeichertAm: Date.now(), antworten: { region: 42 } }),
    );
    expect(ladeFragebogenEntwurf(TOKEN)).toBeNull();
  });
});
