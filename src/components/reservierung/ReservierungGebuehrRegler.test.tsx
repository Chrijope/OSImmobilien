import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Der Schieberegler „Kunde zahlt keine Reservierungsgebühr" im Formular.
 *
 * Geprüft wird das, was der Bearbeiter sieht: Standard ist „zahlt", und erst
 * das Umlegen blendet den Gebührenabschnitt, die IBAN und die ganze
 * Widerrufsthematik aus. Dazu die Nummerierung: Sie darf keine Lücke
 * bekommen, wenn Abschnitte wegfallen.
 *
 * Der Regler steht bewusst in diesem Formular. Es füllt die interne
 * Vorbereitung aus (Route `/reservierung`, nicht für die Rolle `kunde`
 * freigegeben); der Kunde sieht die Vereinbarung nur auf der Signaturseite
 * und als PDF. Über die eigene Gebühr entscheidet niemand selbst.
 */

const kontakt = {
  id: "k-1",
  vorname: "Anna", nachname: "Beispiel",
  email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München",
  geburtstag: "1980-01-01", steuerId: "123/456/78901",
};

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: () => undefined,
  getInvestmentMetaField: (_id: string, _k: string, fallback: unknown) => fallback,
  setInvestmentMetaFields: () => {},
  updateInvestment: () => {},
  getInvestmentsByKontakt: () => [],
}));
vi.mock("@/lib/objekteStore", () => ({ getObjektById: () => undefined, reserveWohnung: async () => {} }));
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (_k: string, fallback: unknown) => fallback,
  setUserSetting: () => {},
}));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (id === kontakt.id ? kontakt : null),
  updateKontakt: () => {},
}));
vi.mock("@/lib/notificationStore", () => ({ addDocNotification: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: async () => ({ data: null, error: null }) } },
}));

const { ReservierungsForm } = await import("@/components/reservierung/ReservierungsForm");

/** Das Formular bis zum dritten Schritt aufblättern. */
const bisAbschluss = () => {
  render(
    <MemoryRouter>
      <ReservierungsForm kundeId="k-1" />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText("Reservierung & Abschluss"));
};

const regler = () => screen.getByLabelText("Kunde zahlt keine Reservierungsgebühr");
const text = () => document.body.textContent || "";

/*
 * Der Entwurf liegt in den Nutzereinstellungen, die hier eine Attrappe sind
 * und immer den Ausgangswert liefern. Jeder Test beginnt deshalb von selbst
 * mit einem leeren Formular, es genügt, die Anzeige abzuräumen.
 */
beforeEach(() => {
  cleanup();
});

describe("Der Regler steht im internen Formular und ist standardmäßig aus", () => {
  it("steht im Abschlussschritt, neben dem Abschnitt, den er ausblendet", () => {
    bisAbschluss();
    expect(regler()).toBeTruthy();
    expect(regler().getAttribute("data-state")).toBe("unchecked");
  });

  it("zeigt ohne Zutun alles wie bisher", () => {
    bisAbschluss();
    expect(text()).toContain("4. Reservierungsgebühr und Kontoverbindung");
    expect(text()).toContain("5. Reservierungsvereinbarung");
    expect(text()).toContain("6. Datenschutzerklärung");
    expect(text()).toContain("7. Widerrufsbelehrung");
    expect(text()).toContain("Beginn der Reservierung");
    expect(text()).toContain("Kontoinhaber");
  });
});

describe("Mit umgelegtem Regler", () => {
  const umlegen = () => {
    bisAbschluss();
    fireEvent.click(regler());
  };

  it("blendet den Gebührenabschnitt und die Widerrufsthematik aus", () => {
    umlegen();
    expect(text()).not.toContain("Reservierungsgebühr und Kontoverbindung");
    expect(text()).not.toContain("Kontoinhaber");
    expect(text()).not.toContain("Verwendungszweck");
    // Die gesetzliche Belehrung selbst, ihre Überschrift und die Wahl.
    expect(text()).not.toContain("binnen vierzehn Tagen ohne Angabe von Gründen");
    expect(text()).not.toContain("Widerrufsrecht");
    expect(text()).not.toContain("Folgen des Widerrufs");
    expect(text()).not.toContain("auflösende Bedingung");
    expect(screen.queryByText("Ich wünsche, dass MOREImmo mit der Reservierung erst nach Ablauf der Widerrufsfrist beginnt.")).toBeNull();
    /*
     * „Widerrufsbelehrung" steht weiterhin einmal auf der Seite: im
     * Erklärtext des Reglers, der aufzählt, was er ausblendet. Das ist
     * gewollt, deshalb wird hier auf den Abschnitt selbst geprüft und nicht
     * auf das Wort.
     */
    expect(text()).not.toContain("6. Widerrufsbelehrung");
    expect(text()).not.toContain("7. Widerrufsbelehrung");
  });

  it("zählt die verbleibenden Abschnitte lückenlos durch", () => {
    umlegen();
    expect(text()).toContain("3. Notar und Abwicklung");
    expect(text()).toContain("4. Reservierungsvereinbarung");
    expect(text()).toContain("5. Datenschutzerklärung");
    // Keine Lücke: eine „7." oder „8." darf es im Formular nicht mehr geben.
    expect(text()).not.toContain("7. ");
    expect(text()).not.toContain("8. ");
  });

  it("sagt im Vertragstext ausdrücklich, dass keine Gebühr erhoben wird", () => {
    umlegen();
    expect(text()).toContain("Für diese Reservierung wird keine Reservierungsgebühr erhoben.");
  });

  it("nimmt die IBAN aus dem Käuferschritt, sie hätte keinen Zweck mehr", () => {
    umlegen();
    fireEvent.click(screen.getByText("Käuferdaten"));
    expect(screen.queryByText(/IBAN für die Rückzahlung/)).toBeNull();
  });

  it("gibt sie zurück, sobald der Regler wieder aus ist", () => {
    umlegen();
    fireEvent.click(regler());
    expect(text()).toContain("4. Reservierungsgebühr und Kontoverbindung");
    fireEvent.click(screen.getByText("Käuferdaten"));
    expect(screen.queryByText(/IBAN für die Rückzahlung/)).toBeTruthy();
  });
});

describe("Die IBAN ist auch mit Gebühr nur noch freiwillig", () => {
  it("trägt kein Pflichtsternchen mehr und ist als freiwillig ausgewiesen", () => {
    render(
      <MemoryRouter>
        <ReservierungsForm kundeId="k-1" />
      </MemoryRouter>,
    );
    const label = screen.getByText(/IBAN für die Rückzahlung/);
    expect(label.textContent).toContain("freiwillig");
    // Das Sternchen der Pflichtfelder sitzt als eigenes Element im Label.
    expect(label.querySelector(".text-destructive")).toBeNull();
  });
});
