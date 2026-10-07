import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Die Reservierungsvereinbarung ist aus dem Investment vorausgefüllt.
 *
 * Vorher holte sie ihre Objektdaten ausschließlich aus dem eigenen Bestand.
 * Ein von Hand eingetragenes Objekt kannte sie nicht: Wohneinheit, Straße,
 * PLZ, Ort und Gesamtpreis wurden ein zweites Mal getippt, die vier
 * Verkäuferfelder sogar zum ersten Mal, obwohl der Notarbogen sie danach ein
 * drittes Mal verlangt.
 *
 * Geprüft wird hier das gerenderte Formular, Feld für Feld, und nicht nur die
 * Ablage darunter. Sonst hieße „vorausgefüllt“ nur, dass die Daten irgendwo
 * liegen.
 */

const metaFelder: Record<string, any> = {};
const investment: Record<string, any> = { id: "inv-1", kontaktId: "k-1", pipelineStufe: "objektauswahl" };

const kontakt = {
  id: "k-1",
  vorname: "Anna", nachname: "Beispiel",
  email: "anna@beispiel.test", telefon: "0170 1234567",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München",
  geburtstag: "01.01.1980", steuerId: "123/456/78901",
};

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (_k: string, fallback: any) => fallback,
  setUserSetting: () => {},
}));

vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));

/**
 * Ob der Zwischenspeicher steht. Die Seite wartet seit dem 16.09.2026 auf
 * ihn, weil sie Kunde und Investment selbst nachschlägt, statt die Daten aus
 * der Adresszeile zu nehmen.
 */
let cacheBereit = true;
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => cacheBereit }));

vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (id === kontakt.id ? kontakt : null),
  updateKontakt: () => {},
}));

vi.mock("@/lib/objekteStore", () => ({
  reserveWohnung: async () => {},
  getObjektById: () => undefined,
  // Kein eigener Bestand: Genau der Fall, den die Reservierung bisher nicht kannte.
  getWohnungKurz: () => null,
}));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentById: (id: string) => (id === investment.id ? investment : undefined),
  getInvestmentMetaField: (_id: string, key: string, fallback: any) => metaFelder[key] ?? fallback,
  setInvestmentMetaFields: (_id: string, felder: Record<string, any>) => { Object.assign(metaFelder, felder); },
  updateInvestment: () => {},
  getInvestmentsByKontakt: () => [{ ...investment, meta: metaFelder }],
}));

vi.mock("@/lib/notificationStore", () => ({ addDocNotification: () => {} }));

// Die Seite bringt sonst die ganze Anwendungshülle samt Anmeldung mit.
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: async () => ({ data: null, error: null }) } },
}));

const { ReservierungsForm } = await import("@/components/reservierung/ReservierungsForm");
const { speichereObjektDaten } = await import("@/lib/objektDatenPflicht");
const { default: ReservierungSeite } = await import("@/pages/Reservierung");

const OBJEKT = {
  strasse: "Roonstraße 3",
  plz: "95028",
  ort: "Hof",
  weNr: "6",
  kaufpreis: 189000,
  wohnflaeche: 62,
  zimmer: 2,
  miete: 620,
  verkaeufer: {
    name: "Musterbau Projektentwicklung GmbH",
    strasse: "Beispielallee 12",
    plz: "83022",
    ort: "Rosenheim",
    email: "kontakt@beispiel.test",
    telefon: "08031 000000",
    handelsregister: "HRB 12345",
  },
};

function zeigeFormular() {
  return render(
    <MemoryRouter>
      <ReservierungsForm kundeId="k-1" investmentId="inv-1" />
    </MemoryRouter>,
  );
}

/**
 * Vom ersten Schritt weiterklicken. Die Käuferdaten stehen aus dem Kontakt,
 * nur die IBAN (Pflicht seit dem 15.09.2026) kennt der Kontakt nicht; sie
 * wird eingetragen, solange das Feld sichtbar und leer ist.
 */
function weiter() {
  for (const feld of screen.queryAllByPlaceholderText("DE00 0000 0000 0000 0000 00")) {
    if (!(feld as HTMLInputElement).value) fireEvent.change(feld, { target: { value: "DE02120300000000202051" } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
}

beforeEach(() => {
  for (const k of Object.keys(metaFelder)) delete metaFelder[k];
});

describe("Schritt 2, Objektdaten", () => {
  beforeEach(() => {
    speichereObjektDaten("inv-1", OBJEKT as never);
    zeigeFormular();
    weiter();
  });

  it("steht auf dem Schritt Objektdaten", () => {
    expect(screen.getByRole("heading", { name: "Objektdaten" })).toBeTruthy();
  });

  it("füllt die Wohneinheit vor", () => {
    expect(screen.getByDisplayValue("6")).toBeTruthy();
  });

  /**
   * Dasselbe Feld gibt es im Objektfenster, und dort nimmt es seit 09/2026 nur
   * Ziffern. Beide schreiben in dieselbe Ablage: Bliebe es hier freier Text,
   * käme von hier wieder "WE 6" herein, und die Karte zeigte "WE WE 6".
   */
  it("nimmt in der Wohneinheit nur Ziffern an", () => {
    const feld = screen.getByDisplayValue("6") as HTMLInputElement;
    fireEvent.change(feld, { target: { value: "WE 14" } });
    expect(feld.value).toBe("14");
  });

  it("füllt Straße, PLZ und Ort vor", () => {
    expect(screen.getByDisplayValue("Roonstraße 3")).toBeTruthy();
    expect(screen.getByDisplayValue("95028")).toBeTruthy();
    expect(screen.getByDisplayValue("Hof")).toBeTruthy();
  });

  it("füllt den Gesamtpreis mit Tausenderpunkten vor", () => {
    expect(screen.getByDisplayValue("189.000")).toBeTruthy();
  });
});

/*
 * Der dritte Schritt hieß bis zum 14.09.2026 „Verkäuferdaten" und zeigte die
 * vier Felder vorbefüllt an. Christian hat ihn gestrichen. Geprüft wird jetzt,
 * dass er wirklich weg ist: Nach den Objektdaten kommt unmittelbar die
 * Erklärung, und nirgends steht mehr ein Verkäufername.
 */
describe("Der Verkäuferschritt ist entfallen", () => {
  beforeEach(() => {
    speichereObjektDaten("inv-1", OBJEKT as never);
    zeigeFormular();
    weiter();
    weiter();
  });

  it("führt von den Objektdaten direkt zum Reservierungstext", () => {
    expect(screen.getByRole("heading", { name: "Reservierung" })).toBeTruthy();
  });

  it("zeigt die Verkäuferfelder nirgends mehr an", () => {
    expect(screen.queryByRole("heading", { name: "Verkäuferdaten" })).toBeNull();
    expect(screen.queryByDisplayValue("Musterbau Projektentwicklung GmbH")).toBeNull();
    expect(screen.queryByDisplayValue("Beispielallee 12")).toBeNull();
  });
});

describe("Ohne eingetragenes Objekt bleibt es wie bisher", () => {
  it("zeigt leere Objektfelder, statt etwas zu erfinden", () => {
    zeigeFormular();
    weiter();
    expect(screen.getByRole("heading", { name: "Objektdaten" })).toBeTruthy();
    expect(screen.queryByDisplayValue("Roonstraße 3")).toBeNull();
    expect(screen.queryByDisplayValue("189.000")).toBeNull();
  });
});

/*
 * Die Reservierungsseite lädt selbst, statt die Daten aus der Adresszeile zu
 * nehmen.
 *
 * Bis zum 16.09.2026 trug die Adresse Name, Mailadresse, Telefonnummer,
 * Anschrift und Geburtsdatum des Kunden im Klartext, dazu Objekt, Kaufpreis
 * und Miete. Aufgefallen ist das an einem echten Fehlerticket an diesem Tag,
 * in dem die volle Adresse stand. Jetzt stehen dort nur noch Kennungen, und
 * die Seite schlägt Kunde und Investment im Datenbestand nach.
 */
describe("Die Seite lädt aus dem Datenbestand", () => {
  const adresszeile = (felder: Record<string, string> = {}) =>
    "/reservierung?" + new URLSearchParams({ kunde: "k-1", investmentId: "inv-1", ...felder }).toString();

  function zeigeSeite(pfad: string) {
    return render(
      <MemoryRouter initialEntries={[pfad]}>
        <Routes>
          <Route path="/reservierung" element={<ReservierungSeite />} />
          <Route path="/kunden/:id" element={<div>Kundenprofil</div>} />
          <Route path="/kontakte" element={<div>Kontaktliste</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("füllt die Käuferdaten aus dem Kontakt, ohne sie in der Adresse zu tragen", () => {
    zeigeSeite(adresszeile());
    expect(screen.getByDisplayValue("Anna")).toBeTruthy();
    expect(screen.getByDisplayValue("anna@beispiel.test")).toBeTruthy();
    expect(screen.getByDisplayValue("Kundenweg")).toBeTruthy();
  });

  it("füllt die Objektdaten aus dem Investment", () => {
    speichereObjektDaten("inv-1", OBJEKT as never);
    zeigeSeite(adresszeile());
    weiter();
    expect(screen.getByDisplayValue("6")).toBeTruthy();
    expect(screen.getByDisplayValue("Roonstraße 3")).toBeTruthy();
    expect(screen.getByDisplayValue("95028")).toBeTruthy();
    expect(screen.getByDisplayValue("Hof")).toBeTruthy();
    expect(screen.getByDisplayValue("189.000")).toBeTruthy();
  });

  /*
   * Solange der Zwischenspeicher lädt, darf das Formular nicht erscheinen:
   * Es baut seine Vorbefüllung genau einmal auf und bliebe sonst dauerhaft
   * leer.
   */
  it("wartet auf den Zwischenspeicher, statt leer aufzugehen", () => {
    cacheBereit = false;
    try {
      zeigeSeite(adresszeile());
      expect(screen.getByText("Daten werden geladen")).toBeTruthy();
      expect(screen.queryByDisplayValue("Anna")).toBeNull();
    } finally {
      cacheBereit = true;
    }
  });

  it("sagt es, wenn es den Kunden nicht gibt", () => {
    zeigeSeite("/reservierung?kunde=k-weg");
    expect(screen.getByText("Dieser Kunde ist nicht auffindbar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
  });

  it("sagt es, wenn es das Investment nicht gibt, und lässt weiterarbeiten", () => {
    zeigeSeite("/reservierung?kunde=k-1&investmentId=inv-weg");
    expect(screen.getByText("Die Objektdaten konnten nicht geladen werden")).toBeTruthy();
    expect(screen.getByDisplayValue("Anna")).toBeTruthy();
  });
});

/*
 * Der Übergang für alte Links.
 *
 * Eine Adresse von vor dem 16.09.2026 kann in einem Lesezeichen oder in einer
 * offenen Mail stehen. Sie soll weiter funktionieren. Die Parameter sind aber
 * nur der Rückfall: Was sich laden lässt, gewinnt.
 */
describe("Alte Links mit Daten in der Adresse", () => {
  function zeigeSeite(pfad: string) {
    return render(
      <MemoryRouter initialEntries={[pfad]}>
        <Routes>
          <Route path="/reservierung" element={<ReservierungSeite />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  const alterLink = (felder: Record<string, string>) =>
    "/reservierung?" + new URLSearchParams(felder).toString();

  it("nimmt die Käuferdaten aus der Adresse, wenn es den Kontakt nicht mehr gibt", () => {
    zeigeSeite(alterLink({
      kunde: "k-weg", kVorname: "Jonas", kNachname: "Beispiel",
      kEmail: "jonas@beispiel.test", kStrasse: "Altweg", kPlz: "90473", kOrt: "Nürnberg",
    }));
    expect(screen.getByDisplayValue("Jonas")).toBeTruthy();
    expect(screen.getByDisplayValue("jonas@beispiel.test")).toBeTruthy();
    expect(screen.getByDisplayValue("Altweg")).toBeTruthy();
  });

  it("nimmt die Objektdaten aus der Adresse, wenn es das Investment nicht mehr gibt", () => {
    zeigeSeite(alterLink({
      kunde: "k-1", investmentId: "inv-weg",
      weNr: "6", objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof",
      kaufpreis: "189000",
    }));
    weiter();
    expect(screen.getByDisplayValue("6")).toBeTruthy();
    expect(screen.getByDisplayValue("Roonstraße 3")).toBeTruthy();
    expect(screen.getByDisplayValue("189.000")).toBeTruthy();
  });

  /*
   * Das war ein echtes Loch: Ohne Wohneinheit verwarf die Seite das ganze
   * Bündel und damit auch Adresse und Preis, obwohl beide mitgereist waren.
   */
  it("verwirft Adresse und Preis nicht, wenn die Wohneinheit fehlt", () => {
    zeigeSeite(alterLink({
      kunde: "k-1", investmentId: "inv-weg",
      objAdresse: "Roonstraße 3", objPlz: "95028", objOrt: "Hof", kaufpreis: "189000",
    }));
    weiter();
    expect(screen.getByDisplayValue("Roonstraße 3")).toBeTruthy();
    expect(screen.getByDisplayValue("189.000")).toBeTruthy();
  });

  it("lässt den geladenen Kontakt gegen die Adresszeile gewinnen", () => {
    zeigeSeite(alterLink({ kunde: "k-1", kVorname: "Veraltet", kNachname: "Veraltet" }));
    expect(screen.getByDisplayValue("Anna")).toBeTruthy();
    expect(screen.queryByDisplayValue("Veraltet")).toBeNull();
  });

  it("lässt das geladene Investment gegen die Adresszeile gewinnen", () => {
    speichereObjektDaten("inv-1", OBJEKT as never);
    zeigeSeite(alterLink({
      kunde: "k-1", investmentId: "inv-1",
      weNr: "99", objAdresse: "Veraltete Straße 1", objPlz: "11111", objOrt: "Veraltet",
      kaufpreis: "111000",
    }));
    weiter();
    expect(screen.getByDisplayValue("Roonstraße 3")).toBeTruthy();
    expect(screen.queryByDisplayValue("Veraltete Straße 1")).toBeNull();
    expect(screen.getByDisplayValue("189.000")).toBeTruthy();
  });
});

describe("Der eigene Bestand behält seinen Vorrang", () => {
  it("nimmt die Wohnung aus dem Bestand und nicht die Abschrift am Investment", () => {
    speichereObjektDaten("inv-1", OBJEKT as never);
    render(
      <MemoryRouter>
        <ReservierungsForm
          kundeId="k-1"
          investmentId="inv-1"
          wohnungData={{
            weNr: "12", groesse: 74, kaufpreis: 210000, etage: "1. OG", lage: "Süd",
            objAdresse: "Bestandsstraße 7", objPlz: "54321", objOrt: "Beispielort",
          }}
        />
      </MemoryRouter>,
    );
    weiter();
    expect(screen.getByDisplayValue("Bestandsstraße 7")).toBeTruthy();
    expect(screen.getByDisplayValue("54321")).toBeTruthy();
    expect(screen.getByDisplayValue("Beispielort")).toBeTruthy();
    expect(screen.getByDisplayValue("210.000")).toBeTruthy();
    expect(screen.queryByDisplayValue("Roonstraße 3")).toBeNull();
  });
});
