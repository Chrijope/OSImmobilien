import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * Die fest verankerte Knopfleiste der Selbstauskunft.
 *
 * Sie ist der einzige Teil, den alle drei Varianten gemeinsam haben: Der
 * Berater füllt allein aus, Berater und Kunde füllen gemeinsam aus, der Kunde
 * füllt über den Link aus. Vorher stand die Leiste am Ende der Karte und war
 * bei einem langen Abschnitt nur nach viel Scrollen erreichbar. Geprüft wird
 * deshalb zweierlei: dass die Leiste in jeder Variante überhaupt da ist, und
 * dass sie genau die Knöpfe trägt, die zu der Variante gehören.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette = {
    select: () => kette,
    eq: () => kette,
    order: () => kette,
    maybeSingle: async () => ({ data: null, error: null }),
    limit: async () => ({ data: [], error: null }),
  };
  return {
    supabase: {
      from: () => kette,
      rpc: async () => ({ data: null, error: null }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      functions: { invoke: async () => ({ data: null, error: null }) },
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  };
});

vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: () => null,
}));

vi.mock("@/lib/investmentsStore", () => ({
  getSaData: () => null,
  setSaData: async () => {},
  getSaDataZurVorbelegung: () => null,
  getInvestmentsByKontakt: () => [],
  setInvestmentMetaFields: async () => {},
  getSaKundeStandAm: () => null,
}));

vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => true,
}));

import { SelbstauskunftForm } from "./SelbstauskunftForm";

const kontakt = {
  id: "k1",
  vorname: "Max",
  nachname: "Muster",
  email: "max@example.test",
  telefon: "",
  strasse: "",
  hausnummer: "",
  plz: "",
  ort: "",
  anrede: "Herr",
  geburtstag: "",
  person2: null,
} as never;

/** Die Leiste selbst, über ihre eigene Kennung. */
const leiste = () => document.querySelector(".sa-knopfleiste") as HTMLElement | null;

/** Knopfbeschriftungen innerhalb der Leiste, ohne den Rest des Formulars. */
const knoepfeInLeiste = () =>
  Array.from(leiste()?.querySelectorAll("button") ?? []).map((b) =>
    (b.textContent || "").replace(/\s+/g, " ").trim(),
  );

/*
 * Ein einfacher Ersatz fuer den Browser-Speicher. Node stellt unter dieser
 * Testumgebung kein `localStorage` bereit, das Formular legt dort aber seinen
 * Zwischenstand ab.
 */
function speicherErsatz() {
  const inhalt = new Map<string, string>();
  return {
    getItem: (k: string) => (inhalt.has(k) ? inhalt.get(k)! : null),
    setItem: (k: string, v: string) => { inhalt.set(k, String(v)); },
    removeItem: (k: string) => { inhalt.delete(k); },
    clear: () => { inhalt.clear(); },
    key: (i: number) => Array.from(inhalt.keys())[i] ?? null,
    get length() { return inhalt.size; },
  } as unknown as Storage;
}

describe("Knopfleiste der Selbstauskunft", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: speicherErsatz(),
      configurable: true,
      writable: true,
    });
    cleanup();
  });

  it("Berater allein: Zwischenspeichern und Weiter, kein An Kunde senden ohne Investment", () => {
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} />);

    expect(leiste()).not.toBeNull();
    const knoepfe = knoepfeInLeiste();
    expect(knoepfe.join("|")).toContain("Zwischenspeichern");
    expect(knoepfe).toContain("Weiter");
    expect(knoepfe.join("|")).not.toContain("An Kunde senden");
  });

  it("Berater mit Kunde: zusätzlich An Kunde senden", () => {
    render(
      <SelbstauskunftForm
        kundeId="k1"
        investmentId="i1"
        prefillKontakt={kontakt}
        onAnKundenSenden={() => {}}
      />,
    );

    const knoepfe = knoepfeInLeiste().join("|");
    expect(knoepfe).toContain("Zwischenspeichern");
    expect(knoepfe).toContain("An Kunde senden");
    expect(knoepfe).toContain("Weiter");
  });

  it("Kunde über den Link: Zwischenspeichern und Weiter, niemals An Kunde senden", () => {
    render(
      <SelbstauskunftForm
        kundeId="k1"
        investmentId="i1"
        prefillKontakt={kontakt}
        customerMode
        saToken="abc"
      />,
    );

    const knoepfe = knoepfeInLeiste().join("|");
    expect(knoepfe).toContain("Zwischenspeichern");
    expect(knoepfe).toContain("Weiter");
    expect(knoepfe).not.toContain("An Kunde senden");
  });

  it("Kunde korrigiert vor der Unterschrift: nur Weiter, kein Zwischenspeichern", () => {
    render(
      <SelbstauskunftForm
        kundeId="k1"
        investmentId="i1"
        prefillKontakt={kontakt}
        korrekturMode
        onKorrekturSave={() => {}}
      />,
    );

    const knoepfe = knoepfeInLeiste().join("|");
    expect(knoepfe).toContain("Weiter");
    expect(knoepfe).not.toContain("Zwischenspeichern");
    expect(knoepfe).not.toContain("An Kunde senden");
  });

  it("steht außerhalb des Scrollbereichs und schrumpft nicht", () => {
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} />);

    const bar = leiste();
    expect(bar).not.toBeNull();
    /*
     * Seit dem 15.09.2026 klebt die Leiste nicht mehr per `sticky` am Ende
     * des Inhalts, sondern steht ausserhalb des Scrollbereichs: Gescrollt
     * wird nur der Karteninhalt. Vorher rutschte die Leiste bei kurzen
     * Abschnitten (Ausgaben, Vermoegenswerte) mit dem Inhaltsende nach oben.
     */
    expect(bar!.className).toContain("shrink-0");
    // Nicht im scrollenden Karteninhalt, sonst wanderte sie wieder mit.
    expect(bar!.closest(".overflow-y-auto")).toBeNull();
    // Der Rahmen gibt die Hoehe vor, die Karte darin darf schrumpfen.
    const rahmen = bar!.parentElement;
    expect(rahmen?.className).toContain("h-full");
    expect(rahmen?.className).toContain("flex-col");
  });

  it("Kundenansicht: Leiste liegt außerhalb des Scrollbereichs, Hinweise wandern nach außen", () => {
    const gemeldeteSchritte: number[] = [];
    render(
      <SelbstauskunftForm
        kundeId="k1"
        investmentId="i1"
        prefillKontakt={kontakt}
        customerMode
        saToken="abc"
        onHinweisSchritt={(s) => gemeldeteSchritte.push(s)}
      />,
    );

    const bar = leiste();
    expect(bar).not.toBeNull();
    /*
     * Die dreispaltige Kundenansicht bindet die Hoehe ans Fenster und laesst
     * nur den Karteninhalt scrollen. Steht die Leiste im Scrollbereich,
     * wandert sie beim Scrollen mit und ist bei langen Abschnitten erst nach
     * viel Scrollen erreichbar.
     */
    expect(bar!.closest(".overflow-y-auto")).toBeNull();
    expect(bar!.className).toContain("shrink-0");
    const rahmen = bar!.parentElement;
    expect(rahmen?.className).toContain("h-full");
    expect(rahmen?.className).toContain("flex-col");

    // Die Hinweise zeichnet in dieser Variante die Seite als dritte Spalte,
    // das Formular meldet nur noch, in welchem Abschnitt der Kunde steht.
    expect(gemeldeteSchritte[0]).toBe(0);
    expect(screen.queryByText("💡 Hinweis")).toBeNull();
  });

  it("Kundenansicht ohne ausgelagerte Hinweise: Hinweiskasten bleibt im Formular", () => {
    render(
      <SelbstauskunftForm
        kundeId="k1"
        investmentId="i1"
        prefillKontakt={kontakt}
        customerMode
        saToken="abc"
      />,
    );

    expect(screen.getByText("💡 Hinweis")).toBeTruthy();
  });

  it("Zurück erscheint erst ab dem zweiten Abschnitt", () => {
    render(<SelbstauskunftForm kundeId="k1" prefillKontakt={kontakt} />);

    // Schritt 0: kein Zurück, das Formular beginnt hier.
    expect(knoepfeInLeiste()).not.toContain("Zurück");
    expect(screen.getAllByText("Weiter").length).toBeGreaterThan(0);
  });
});
