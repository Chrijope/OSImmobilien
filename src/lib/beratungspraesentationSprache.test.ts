import {
  euroText,
  leseSprache,
  merkeSprache,
  prozentText,
  spracheSchluessel,
  zuZahl,
} from "@/lib/beratungspraesentationSprache";

describe("Zahlen im Format der Sprache", () => {
  it("Euro: Deutsch wie bisher auf den Folien, Englisch mit vorangestelltem Zeichen", () => {
    expect(euroText(350000, "de")).toBe("350.000 €");
    expect(euroText(350000, "en")).toBe("€350,000");
    expect(euroText(-354, "de")).toBe("−354 €");
    expect(euroText(-354, "en")).toBe("−€354");
  });

  it("Prozent mit Komma auf Deutsch, mit Punkt auf Englisch", () => {
    expect(prozentText(1.5, "de")).toBe("1,5 %");
    expect(prozentText(1.5, "en")).toBe("1.5%");
    expect(prozentText(78, "de", 0)).toBe("78 %");
  });
});

describe("Eingaben lesen, egal in welcher Schreibweise", () => {
  it.each([
    ["4.000", 4000],
    ["4000 €", 4000],
    ["4.000,50", 4000.5],
    ["4,000.50", 4000.5],
    ["4,000", 4000],
    ["€4,000", 4000],
    ["1.234.567", 1234567],
    ["4,5", 4.5],
    ["4.5", 4.5],
    ["", 0],
    ["-200", 0],
    ["abc", 0],
  ])("%s ergibt %s", (eingabe, erwartet) => {
    expect(zuZahl(eingabe)).toBe(erwartet);
  });
});

// In dieser Testumgebung gibt es keinen `localStorage`, wie in
// GlobaleSuche.test.tsx ein Ablagefach im Arbeitsspeicher.
const ablage = new Map<string, string>();
const speicher = {
  getItem: (k: string) => ablage.get(k) ?? null,
  setItem: (k: string, v: string) => void ablage.set(k, v),
  removeItem: (k: string) => void ablage.delete(k),
  clear: () => ablage.clear(),
};

describe("Sprache je Nutzer merken", () => {
  beforeEach(() => {
    ablage.clear();
    vi.stubGlobal("localStorage", speicher);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("merkt die Wahl je Nutzer getrennt", () => {
    merkeSprache(spracheSchluessel("nutzer-a"), "en");
    expect(leseSprache(spracheSchluessel("nutzer-a"))).toBe("en");
    expect(leseSprache(spracheSchluessel("nutzer-b"))).toBeNull();
  });

  it("ignoriert fremde Werte im Speicher", () => {
    speicher.setItem(spracheSchluessel("nutzer-a"), "fr");
    expect(leseSprache(spracheSchluessel("nutzer-a"))).toBeNull();
  });

  it("stürzt nicht ab, wenn der Speicher gesperrt ist", () => {
    const gesperrt = () => {
      throw new Error("gesperrt");
    };
    vi.stubGlobal("localStorage", { getItem: gesperrt, setItem: gesperrt });
    expect(() => merkeSprache(spracheSchluessel("x"), "en")).not.toThrow();
    expect(leseSprache(spracheSchluessel("x"))).toBeNull();
  });

  it("stürzt nicht ab, wenn es gar keinen Speicher gibt", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => merkeSprache(spracheSchluessel("x"), "en")).not.toThrow();
    expect(leseSprache(spracheSchluessel("x"))).toBeNull();
  });
});
