import { describe, it, expect, afterEach, beforeAll } from "vitest";
import {
  darfVorfuehrmodusSchalten,
  istVorfuehrmodusAktiv,
  kuerzelFuer,
  setzeVorfuehrmodus,
  tarnAdresse,
  tarnArbeitgeber,
  tarnEmail,
  tarnGeburtsdatum,
  tarnInitialen,
  tarnName,
  tarnNachname,
  tarnTelefon,
  tarnVerweis,
  tarnVorname,
  unscharfKlasse,
  vorfuehrmodusNeuLesen,
} from "./vorfuehrmodus";

// jsdom laeuft hier ohne Herkunft ("about:blank") und stellt deshalb keinen
// localStorage bereit. Fuer den Test, dass der Modus ein Neuladen ueberlebt,
// legen wir einen einfachen Ersatz auf das Fenster.
beforeAll(() => {
  if (typeof window.localStorage === "undefined") {
    const ablage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (ablage.has(k) ? ablage.get(k)! : null),
        setItem: (k: string, v: string) => void ablage.set(k, String(v)),
        removeItem: (k: string) => void ablage.delete(k),
        clear: () => ablage.clear(),
      },
    });
  }
});

afterEach(() => setzeVorfuehrmodus(false));

describe("Vorfuehrmodus, ausgeschaltet", () => {
  it("veraendert nichts", () => {
    expect(istVorfuehrmodusAktiv()).toBe(false);
    expect(tarnName("Michael Bauer")).toBe("Michael Bauer");
    expect(tarnVorname("Michael")).toBe("Michael");
    expect(tarnNachname("Bauer")).toBe("Bauer");
    expect(tarnEmail("michael.bauer@example.de")).toBe("michael.bauer@example.de");
    expect(tarnTelefon("+49 170 1234567")).toBe("+49 170 1234567");
    expect(tarnAdresse("Alexanderstr. 30, 95028 Hof")).toBe("Alexanderstr. 30, 95028 Hof");
    expect(tarnGeburtsdatum("14.03.1981")).toBe("14.03.1981");
    expect(tarnArbeitgeber("Siemens AG")).toBe("Siemens AG");
    expect(tarnInitialen("Michael", "Bauer")).toBe("MB");
    expect(tarnVerweis("mailto:michael.bauer@example.de")).toBe("mailto:michael.bauer@example.de");
    expect(unscharfKlasse()).toBe("");
    expect(unscharfKlasse("text-2xl")).toBe("text-2xl");
  });
});

describe("Vorfuehrmodus, eingeschaltet", () => {
  it("ersetzt Namen durch ein Kuerzel", () => {
    setzeVorfuehrmodus(true);
    expect(tarnName("Michael Bauer")).toBe("Kunde M. B.");
    expect(tarnName("Michael Bauer", "partner")).toBe("Partner M. B.");
  });

  it("gibt demselben Kontakt in jeder Ansicht dasselbe Kuerzel", () => {
    setzeVorfuehrmodus(true);
    const inDerListe = tarnName("Michael Bauer");
    const inDerPipeline = tarnName("  Michael Bauer  ");
    const imProfil = tarnName("Michael Bauer");
    expect(inDerListe).toBe(imProfil);
    expect(inDerPipeline).toBe(imProfil);
  });

  it("vergibt Bewerbern eine gleichbleibende Nummer", () => {
    setzeVorfuehrmodus(true);
    const ersteAnsicht = tarnName("Sarah Klein", "bewerber");
    const zweiteAnsicht = tarnName("sarah klein", "bewerber");
    expect(ersteAnsicht).toMatch(/^Bewerber \d{2}$/);
    expect(zweiteAnsicht).toBe(ersteAnsicht);
    expect(tarnName("Jonas Vogl", "bewerber")).not.toBe(ersteAnsicht);
  });

  it("laesst Titel bei den Initialen weg", () => {
    setzeVorfuehrmodus(true);
    expect(tarnName("Dr. Hermann Vogl")).toBe("Kunde H. V.");
  });

  it("kommt mit einem einzelnen Namensteil und mit leeren Werten zurecht", () => {
    setzeVorfuehrmodus(true);
    expect(tarnName("Hermann")).toBe("Kunde H.");
    expect(tarnName("")).toBe("");
    expect(tarnName(null)).toBe("");
    expect(tarnName("-")).toBe("-");
  });

  it("maskiert Vorname und Nachname einzeln", () => {
    setzeVorfuehrmodus(true);
    expect(tarnVorname("Michael")).toBe("M.");
    expect(tarnNachname("Bauer")).toBe("B.");
    expect(tarnVorname("")).toBe("");
  });

  it("maskiert die Mailadresse und laesst die Domain nicht stehen", () => {
    setzeVorfuehrmodus(true);
    const getarnt = tarnEmail("michael.bauer@moreimmo.de");
    expect(getarnt).toBe("m•••@•••");
    expect(getarnt).not.toContain("bauer");
    expect(getarnt).not.toContain("moreimmo");
  });

  it("maskiert jede Ziffer der Telefonnummer", () => {
    setzeVorfuehrmodus(true);
    const getarnt = tarnTelefon("+49 170 1234567");
    expect(getarnt).toBe("+•• ••• •••••••");
    expect(getarnt).not.toMatch(/\d/);
  });

  it("verbirgt Anschrift, Geburtsdatum und Arbeitgeber", () => {
    setzeVorfuehrmodus(true);
    expect(tarnAdresse("Alexanderstr. 30, 95028 Hof")).toBe("Anschrift verborgen");
    expect(tarnGeburtsdatum("14.03.1981")).toBe("••.••.••••");
    expect(tarnArbeitgeber("Siemens AG")).toBe("Arbeitgeber verborgen");
  });

  it("laesst von Avatar-Initialen nichts uebrig", () => {
    setzeVorfuehrmodus(true);
    expect(tarnInitialen("Michael", "Bauer")).toBe("??");
  });

  it("nimmt Mail-, Telefon- und WhatsApp-Verweisen das Ziel", () => {
    setzeVorfuehrmodus(true);
    expect(tarnVerweis("mailto:michael.bauer@moreimmo.de")).toBeUndefined();
    expect(tarnVerweis("tel:+491701234567")).toBeUndefined();
  });

  it("haengt die Klasse fuers Weichzeichnen an", () => {
    setzeVorfuehrmodus(true);
    expect(unscharfKlasse()).toBe("vorfuehr-unscharf");
    expect(unscharfKlasse("text-2xl")).toBe("vorfuehr-unscharf text-2xl");
  });

  it("ueberlebt ein Neuladen, der Zustand liegt im Speicher", () => {
    setzeVorfuehrmodus(true);
    expect(window.localStorage.getItem("mi_vorfuehrmodus")).toBe("1");
    // So sieht es aus, wenn die Seite neu geladen wird: Der Zustand kommt
    // allein aus dem Speicher zurueck.
    expect(vorfuehrmodusNeuLesen()).toBe(true);
    setzeVorfuehrmodus(false);
    expect(window.localStorage.getItem("mi_vorfuehrmodus")).toBeNull();
    expect(vorfuehrmodusNeuLesen()).toBe(false);
  });
});

describe("Kuerzel unabhaengig vom Modus", () => {
  it("leitet das Kuerzel allein aus dem Namen ab", () => {
    expect(kuerzelFuer("Michael Bauer")).toBe("Kunde M. B.");
    expect(kuerzelFuer("Michael Bauer")).toBe(kuerzelFuer("Michael Bauer"));
  });
});

describe("Wer darf schalten", () => {
  it("nur Inhaber und Admin", () => {
    expect(darfVorfuehrmodusSchalten("inhaber")).toBe(true);
    expect(darfVorfuehrmodusSchalten("admin")).toBe(true);
    expect(darfVorfuehrmodusSchalten("vertriebsleiter")).toBe(false);
    expect(darfVorfuehrmodusSchalten("vertriebspartner")).toBe(false);
    expect(darfVorfuehrmodusSchalten("kunde")).toBe(false);
    expect(darfVorfuehrmodusSchalten(undefined)).toBe(false);
  });
});
