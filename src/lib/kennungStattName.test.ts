import { describe, it, expect, vi, beforeEach } from "vitest";

// Zwei Nutzer mit demselben Namen, dazu einer mit eindeutigem Namen. Genau
// dieser Fall hat im Projekt schon Kontakte beim falschen Partner abgelegt.
const NUTZER = [
  { id: "max-1", name: "Max Muster" },
  { id: "max-2", name: "Max Muster" },
  { id: "erika", name: "Erika Beispiel" },
];
let nutzer = NUTZER;

vi.mock("@/lib/loadAllUsers", () => ({
  loadAllUsers: () => nutzer,
}));
vi.mock("./loadAllUsers", () => ({
  loadAllUsers: () => nutzer,
}));

import { istPerson, kennungMitNamensprobe, kennungZuName, nameMehrdeutig, nameMeintNutzer } from "./beraterNamensabgleich";
import { getKontaktDashboardBucket, istZustaendig, kontaktBelongsToUser, kontaktImTeam } from "./kontaktOwnership";
import { gehoertZurSicht } from "./datenSicht";
import type { KundeData } from "./kundenStore";

const kontakt = (felder: Partial<KundeData>) => ({ id: "k", vorname: "A", nachname: "B", ...felder }) as KundeData;

beforeEach(() => {
  nutzer = NUTZER;
});

describe("Namensrueckfall nur bei eindeutigem Namen", () => {
  it("liefert die Kennung zu einem eindeutigen Namen", () => {
    expect(kennungZuName("Erika Beispiel")).toBe("erika");
  });

  it("liefert keine Kennung, wenn der Name doppelt vorkommt", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(kennungZuName("Max Muster")).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(nameMehrdeutig("Max Muster")).toBe(true);
  });

  it("ordnet einen doppelten Namen keinem der beiden zu", () => {
    expect(nameMeintNutzer("Max Muster", { userId: "max-1", userName: "Max Muster" })).toBe(false);
    expect(nameMeintNutzer("Max Muster", { userId: "max-2", userName: "Max Muster" })).toBe(false);
  });

  it("ordnet einen eindeutigen Namen wie bisher zu", () => {
    expect(nameMeintNutzer("Erika Beispiel", { userId: "erika", userName: "Erika Beispiel" })).toBe(true);
  });

  it("bleibt beim alten Namensvergleich, wenn keine Nutzerliste da ist", () => {
    nutzer = [];
    expect(nameMeintNutzer("Max Muster", { userId: "max-1", userName: "Max Muster" })).toBe(true);
  });
});

describe("Setter: Kennung nur mit passendem Namen", () => {
  // Setterin A hat die Kennung "erika", der Name wurde auf eine andere
  // Setterin umgestellt, die Kennung zog nicht mit.
  const setterinnen = [
    { id: "erika", name: "Erika Beispiel" },
    { id: "lea", name: "Lea Muster" },
    { id: "max-1", name: "Max Muster" },
    { id: "max-2", name: "Max Muster" },
  ];

  it("Kennung A, Name B: der Lead gehoert B", () => {
    expect(istPerson("erika", "Lea Muster", { userId: "lea", userName: "Lea Muster" }, setterinnen)).toBe(true);
    expect(istPerson("erika", "Lea Muster", { userId: "erika", userName: "Erika Beispiel" }, setterinnen)).toBe(false);
    expect(kennungMitNamensprobe("erika", "Lea Muster", setterinnen)).toBe("lea");
  });

  it("Kennung A, Name A: der Lead gehoert A", () => {
    expect(istPerson("erika", "Erika Beispiel", { userId: "erika", userName: "Erika Beispiel" }, setterinnen)).toBe(true);
    expect(kennungMitNamensprobe("erika", " erika  beispiel", setterinnen)).toBe("erika");
  });

  it("Name mehrdeutig und Kennung passt nicht: keine Zuordnung", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(istPerson("erika", "Max Muster", { userId: "max-1", userName: "Max Muster" }, setterinnen)).toBe(false);
    expect(istPerson("erika", "Max Muster", { userId: "max-2", userName: "Max Muster" }, setterinnen)).toBe(false);
    expect(istPerson("erika", "Max Muster", { userId: "erika", userName: "Erika Beispiel" }, setterinnen)).toBe(false);
    expect(kennungMitNamensprobe("erika", "Max Muster", setterinnen)).toBeUndefined();
    warn.mockRestore();
  });

  it("ohne Name entscheidet die Kennung", () => {
    expect(istPerson("max-2", "", { userId: "max-2", userName: "Max Muster" }, setterinnen)).toBe(true);
  });
});

describe("Zustaendigkeit: Kennung vor Name", () => {
  it("gibt den Kontakt mit Kennung nur dem richtigen von zwei Gleichnamigen", () => {
    const k = kontakt({ berater: "Max Muster", zustaendig_id: "max-2" });
    expect(istZustaendig(k, { userId: "max-1", userName: "Max Muster" })).toBe(false);
    expect(istZustaendig(k, { userId: "max-2", userName: "Max Muster" })).toBe(true);
    expect(kontaktBelongsToUser(k, { userId: "max-1", userName: "Max Muster" })).toBe(false);
    expect(kontaktBelongsToUser(k, { userId: "max-2", userName: "Max Muster" })).toBe(true);
  });

  it("gibt einen alten Kontakt ohne Kennung mit doppeltem Namen niemandem", () => {
    const k = kontakt({ berater: "Max Muster", zustaendig_id: "" });
    expect(kontaktBelongsToUser(k, { userId: "max-1", userName: "Max Muster" })).toBe(false);
    expect(kontaktBelongsToUser(k, { userId: "max-2", userName: "Max Muster" })).toBe(false);
  });

  it("gibt einen alten Kontakt ohne Kennung mit eindeutigem Namen wie bisher", () => {
    const k = kontakt({ berater: "Erika Beispiel", zustaendig_id: "" });
    expect(kontaktBelongsToUser(k, { userId: "erika", userName: "Erika Beispiel" })).toBe(true);
  });

  it("laesst den Namen nicht gegen eine abweichende Kennung gewinnen", () => {
    const k = kontakt({ berater: "Erika Beispiel", zustaendig_id: "max-1" });
    expect(istZustaendig(k, { userId: "erika", userName: "Erika Beispiel" })).toBe(false);
  });
});

describe("Teamsicht und Datensicht", () => {
  const teamIds = new Set(["max-2"]);
  const teamNames = new Set(["Max Muster"]);

  it("zaehlt einen Kontakt nur ueber die Kennung zum Team", () => {
    expect(kontaktImTeam({ zustaendig_id: "max-2", berater: "Max Muster" }, teamIds, teamNames)).toBe(true);
    expect(kontaktImTeam({ zustaendig_id: "max-1", berater: "Max Muster" }, teamIds, teamNames)).toBe(false);
  });

  it("zaehlt einen doppelten Namen ohne Kennung nicht zum Team", () => {
    expect(kontaktImTeam({ zustaendig_id: "", berater: "Max Muster" }, teamIds, teamNames)).toBe(false);
  });

  it("ordnet im Dashboard den Kontakt des Namensvetters nicht dem eigenen Team zu", () => {
    const k = kontakt({ berater: "Max Muster", zustaendig_id: "max-1" });
    expect(getKontaktDashboardBucket(k, {
      userId: "erika", userName: "Erika Beispiel", isTeamWide: false, teamIds, teamNames, users: [],
    })).toBeNull();
  });

  it("zeigt in der eigenen Sicht nur die Kontakte der eigenen Kennung", () => {
    const k = kontakt({ berater: "Max Muster", zustaendig_id: "max-1" });
    expect(gehoertZurSicht(k, "eigene", "Max Muster", "max-1")).toBe(true);
    expect(gehoertZurSicht(k, "eigene", "Max Muster", "max-2")).toBe(false);
  });
});
