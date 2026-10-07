import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VERBINDUNG_TIMEOUT_MS,
  findeFolienIndex,
  istVerbunden,
  kanalName,
  leseNachricht,
  moderationsUrl,
  oeffneKanal,
  praesentationsUrl,
  type KopplungsNachricht,
} from "./praesentationsKopplung";

describe("praesentationsKopplung: Adressen und Kanalname", () => {
  it("der Kanal heißt nach dem Bewerber, ohne Bewerber gibt es einen Übungskanal", () => {
    expect(kanalName("abc-123")).toBe("closing-praesentation-abc-123");
    expect(kanalName("  abc-123  ")).toBe("closing-praesentation-abc-123");
    expect(kanalName("")).toBe("closing-praesentation-ohne-bewerber");
    expect(kanalName(null)).toBe("closing-praesentation-ohne-bewerber");
  });

  it("Moderation und Präsentation bekommen bewerberId und teil in die Adresse", () => {
    expect(moderationsUrl("b 1", 1)).toBe("/closing-moderation?bewerberId=b%201&teil=1");
    expect(moderationsUrl("b1", 2)).toBe("/closing-moderation?bewerberId=b1&teil=2");
    expect(praesentationsUrl("b1", 2, "Max Muster")).toBe(
      "/closing-praesentation-entwurf?bewerberId=b1&name=Max%20Muster&teil=2",
    );
    expect(praesentationsUrl("b1", 1)).toBe("/closing-praesentation-entwurf?bewerberId=b1&teil=1");
  });

  /*
   * Seit dem 23.09.2026 steht hinter beiden Adressen immer der Videocall mit
   * den fünf Wegen. Eine Weiche über `ablauf` gibt es nicht mehr, also darf
   * sie auch nicht mehr in die Adresse geschrieben werden.
   */
  it("schreibt keinen ablauf-Parameter mehr in die Adresse", () => {
    expect(moderationsUrl("b1", 1)).not.toContain("ablauf");
    expect(praesentationsUrl("b1", 1, "Max Muster")).not.toContain("ablauf");
    expect(praesentationsUrl("b1", 2)).not.toContain("ablauf");
  });
});

describe("praesentationsKopplung: Nachrichtenformat", () => {
  it("gültige Nachrichten werden erkannt", () => {
    expect(leseNachricht({ typ: "gehe-zu", folieId: "cover" })).toEqual({ typ: "gehe-zu", folieId: "cover" });
    expect(leseNachricht({ typ: "zustand", folieId: "einwaende" })).toEqual({ typ: "zustand", folieId: "einwaende" });
    expect(leseNachricht({ typ: "folie", folieId: "rechner" })).toEqual({ typ: "folie", folieId: "rechner" });
    expect(leseNachricht({ typ: "regler", abschluesse: 2, kaufpreis: 300000 }))
      .toEqual({ typ: "regler", abschluesse: 2, kaufpreis: 300000 });
    expect(leseNachricht({ typ: "umschalter", id: "chaos", an: true }))
      .toEqual({ typ: "umschalter", id: "chaos", an: true });
    expect(leseNachricht({ typ: "anfrage" })).toEqual({ typ: "anfrage" });
    expect(leseNachricht({ typ: "ping" })).toEqual({ typ: "ping" });
    expect(leseNachricht({ typ: "pong" })).toEqual({ typ: "pong" });
  });

  /*
   * Die Übungsansicht schickt den ganzen Stand, weil dort nicht nur die
   * Folie wechselt, sondern auch Ablauf und Weg. Weg und Module bleiben
   * Zeichenketten; ob sie gültig sind, prüft die Übungsseite.
   */
  it("ein Stand der Übungsansicht wird erkannt, Zusatzfelder und Fremdes fallen weg", () => {
    expect(leseNachricht({ typ: "stand", art: "kennenlernbogen", teil: 2, weg: "weg2", module: ["m3", 7], folieId: "", extra: 1 }))
      .toEqual({ typ: "stand", art: "kennenlernbogen", teil: 2, weg: "weg2", module: ["m3"], folieId: "" });
    expect(leseNachricht({ typ: "stand", art: "quatsch", teil: 1, weg: "weg1", module: [], folieId: "" })).toBeNull();
    expect(leseNachricht({ typ: "stand", art: "vorabbogen", teil: 3, weg: "weg1", module: [], folieId: "" })).toBeNull();
    expect(leseNachricht({ typ: "stand", art: "vorabbogen", teil: 1, weg: "", module: [], folieId: "" })).toBeNull();
    expect(leseNachricht({ typ: "stand", art: "vorabbogen", teil: 1, weg: "weg1", module: "m3", folieId: "" })).toBeNull();
    expect(leseNachricht({ typ: "stand", art: "vorabbogen", teil: 1, weg: "weg1", module: [] })).toBeNull();
  });

  it("ein Umschalter ohne Id oder ohne Wahrheitswert wird verworfen", () => {
    expect(leseNachricht({ typ: "umschalter", id: "", an: true })).toBeNull();
    expect(leseNachricht({ typ: "umschalter", id: "chaos", an: "ja" })).toBeNull();
  });

  it("alles andere wird verworfen, statt die Präsentation zu zerlegen", () => {
    expect(leseNachricht(null)).toBeNull();
    expect(leseNachricht("gehe-zu")).toBeNull();
    expect(leseNachricht({ typ: "unbekannt" })).toBeNull();
    expect(leseNachricht({ typ: "gehe-zu" })).toBeNull();
    expect(leseNachricht({ typ: "gehe-zu", folieId: "" })).toBeNull();
    expect(leseNachricht({ typ: "gehe-zu", folieId: 7 })).toBeNull();
    expect(leseNachricht({ typ: "regler", abschluesse: "2", kaufpreis: 300000 })).toBeNull();
    expect(leseNachricht({ typ: "regler", abschluesse: NaN, kaufpreis: 300000 })).toBeNull();
  });

  it("übertragene Zusatzfelder fallen weg", () => {
    expect(leseNachricht({ typ: "folie", folieId: "cover", index: 7 })).toEqual({ typ: "folie", folieId: "cover" });
  });
});

describe("praesentationsKopplung: Zielsuche über die Id", () => {
  const teil2 = [{ id: "cover" }, { id: "chaos" }, { id: "vision" }];

  it("findet die Position einer Id in der eigenen Folienliste", () => {
    expect(findeFolienIndex(teil2, "chaos")).toBe(1);
    expect(findeFolienIndex(teil2, "cover")).toBe(0);
  });

  it("liefert -1, wenn die Folie im eigenen Deck nicht vorkommt (teil=2 kennt keine Teil-1-Folien)", () => {
    expect(findeFolienIndex(teil2, "einstieg")).toBe(-1);
    expect(findeFolienIndex([], "cover")).toBe(-1);
  });
});

describe("praesentationsKopplung: Verbindungsstatus", () => {
  it("gilt als verbunden, solange das letzte Lebenszeichen frisch ist", () => {
    expect(istVerbunden(null, 10_000)).toBe(false);
    expect(istVerbunden(10_000, 10_000)).toBe(true);
    expect(istVerbunden(10_000, 10_000 + VERBINDUNG_TIMEOUT_MS)).toBe(true);
    expect(istVerbunden(10_000, 10_000 + VERBINDUNG_TIMEOUT_MS + 1)).toBe(false);
  });
});

/**
 * Ein BroadcastChannel-Ersatz für die Testumgebung: alle Instanzen mit
 * demselben Namen teilen sich einen Bus, eine Instanz hört ihre eigenen
 * Nachrichten nicht (wie im Browser).
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

describe("praesentationsKopplung: Kanal", () => {
  const original = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  beforeEach(() => {
    KanalAttrappe.instanzen = [];
    vi.stubGlobal("BroadcastChannel", KanalAttrappe);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = original;
  });

  it("Moderation und Präsentation desselben Bewerbers hören einander, nur gültige Nachrichten kommen an", () => {
    const moderation = oeffneKanal("b1");
    const praesentation = oeffneKanal("b1");
    expect(moderation).not.toBeNull();
    expect(praesentation).not.toBeNull();

    const empfangen: KopplungsNachricht[] = [];
    const abmelden = praesentation!.empfangen((n) => empfangen.push(n));

    moderation!.senden({ typ: "gehe-zu", folieId: "cover" });
    // Ein fremdes Fenster schickt Unsinn auf denselben Kanal.
    new KanalAttrappe(kanalName("b1")).postMessage({ typ: "gehe-zu" });
    moderation!.senden({ typ: "ping" });

    expect(empfangen).toEqual([{ typ: "gehe-zu", folieId: "cover" }, { typ: "ping" }]);

    abmelden();
    moderation!.senden({ typ: "gehe-zu", folieId: "chaos" });
    expect(empfangen).toHaveLength(2);
  });

  it("Fenster verschiedener Bewerber sind getrennt", () => {
    const a = oeffneKanal("b1");
    const b = oeffneKanal("b2");
    const empfangen: KopplungsNachricht[] = [];
    b!.empfangen((n) => empfangen.push(n));
    a!.senden({ typ: "gehe-zu", folieId: "cover" });
    expect(empfangen).toEqual([]);
  });

  it("ohne BroadcastChannel gibt es keinen Kanal und keinen Fehler", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    expect(oeffneKanal("b1")).toBeNull();
  });
});
