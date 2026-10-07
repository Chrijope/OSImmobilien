import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

/**
 * Stift je Zeile im Steuer-Cockpit der eigenen Immobilien.
 * Die Huelle unten macht dasselbe wie EigeneInvestmentsTab: Sie baut aus den
 * Stift-Werten die Aenderung des Bearbeiten-Dialogs (einzelwerteZuAenderung)
 * und wendet sie auf das Investment an, so wie es nach dem Neuladen aussieht.
 * Alle Daten sind erfunden.
 */
vi.mock("react-i18next", () => ({
  // @/i18n (über portalSprache) meldet sich damit bei i18next an.
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (schluessel: string, standard?: unknown, werte?: Record<string, unknown>) => {
      let text = typeof standard === "string" ? standard : schluessel;
      const w = (typeof standard === "object" && standard ? standard : werte) as Record<string, unknown> | undefined;
      if (w) for (const [k, v] of Object.entries(w)) text = text.replace(`{{${k}}}`, String(v));
      return text;
    },
    i18n: { resolvedLanguage: "de" },
  }),
  Trans: () => null,
}));
// Das Radix-Popover rechnet in jsdom seine Lage fortlaufend neu und haelt
// act dabei sekundenlang fest. Fuer die Logik genuegt ein schlichtes
// Auf und Zu; das echte Popover ist in der Sichtpruefung im Browser gesehen.
vi.mock("@/components/ui/popover", async () => {
  const React = await import("react");
  type Zustand = { open: boolean; setOpen: (o: boolean) => void };
  const Ctx = React.createContext<Zustand>({ open: false, setOpen: () => {} });
  return {
    Popover: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: { open, setOpen: onOpenChange } }, children),
    PopoverTrigger: ({ children }: { children: React.ReactElement }) => {
      const c = React.useContext(Ctx);
      return React.cloneElement(children, { onClick: () => c.setOpen(!c.open) });
    },
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const c = React.useContext(Ctx);
      return c.open ? React.createElement("div", { "data-testid": "stift-popover" }, children) : null;
    },
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/anlageVPdf", () => ({ erzeugeAnlageVPdf: vi.fn() }));
vi.mock("@/components/kunde/AnlageVSendenDialog", () => ({ AnlageVSendenDialog: () => null }));

import { SteuerCockpitEigen, steuerCsvZeilen, fehlendeAngabeAnzeige } from "@/components/kunde/eigene/SteuerCockpitEigen";
import i18n from "@/i18n";
import { berechneSteuer } from "@/lib/eigeneInvestmentBerechnungen";
import type { StiftWerte } from "@/components/kunde/eigene/CockpitFeldStift";
import { einzelwerteZuAenderung, wendeAenderungAn } from "@/lib/eigeneInvestmentSpeichern";
import type { ExternesInvestment } from "@/lib/eigeneInvestmentBerechnungen";

const attrappe = (): ExternesInvestment => ({
  id: "inv-test",
  bezeichnung: "Musterwohnung Teststraße",
  kaufpreis: 300000,
  kaufdatum: "2020-01-15",
  baujahr: null,
  nebenkosten: 30000,
  darlehenssumme: 240000,
  offene_tilgung: 200000,
  zinssatz: 3,
  monatliche_rate: 1100,
  mieteinnahmen_kalt: 1000,
  hausgeld: 300,
  ruecklagen: 50,
  dokumente: [],
  meta: { erste_miete: "2020-02-01" },
});

function Huelle({ spion, onBearbeiten, onBelegeZeigen, onPersist, start }: {
  spion: (werte: StiftWerte) => void;
  onBearbeiten?: () => void;
  onBelegeZeigen?: () => void;
  onPersist?: (patch: unknown) => void;
  start?: ExternesInvestment;
}) {
  const [inv, setInv] = useState<ExternesInvestment>(start ?? attrappe());
  return (
    <SteuerCockpitEigen
      inv={inv}
      onPersist={onPersist}
      onBearbeiten={onBearbeiten}
      onBelegeZeigen={onBelegeZeigen}
      onFelderSpeichern={async (werte) => {
        spion(werte);
        setInv(i => wendeAenderungAn(i, einzelwerteZuAenderung(i, werte)));
        return true;
      }}
    />
  );
}

const zeile = (container: HTMLElement, schluessel: string) => {
  const el = container.querySelector(`[data-posten="${schluessel}"]`);
  if (!el) throw new Error(`Zeile ${schluessel} fehlt`);
  return el as HTMLElement;
};
const stiftIn = (el: HTMLElement) => el.querySelector('button[aria-label$=" bearbeiten"]');
// Speichern laeuft ueber ein Versprechen; act wartet, bis es erfuellt ist.
const speichernKlicken = async (knopf?: HTMLElement) => {
  await act(async () => {
    fireEvent.click(knopf ?? screen.getByRole("button", { name: "Speichern" }));
  });
};
const werbungskosten = () => screen.getByText("portal.cards.steuer_eigen.werbungskosten").parentElement!.textContent;

describe("SteuerCockpitEigen, Stift je Angabe", () => {
  it("zeigt den Stift an pflegbaren Zeilen und nicht an summierten oder abgeleiteten", () => {
    const { container } = render(<Huelle spion={vi.fn()} />);
    for (const s of ["umlagen", "afa", "hausgeld_nicht_umlage", "grundsteuer", "versicherung", "verwaltung"]) {
      expect(stiftIn(zeile(container, s)), s).not.toBeNull();
    }
    for (const s of ["miete", "schuldzinsen", "erhaltung"]) {
      expect(stiftIn(zeile(container, s)), s).toBeNull();
    }
  });

  it("zeigt den Stift auch bei vorhandener Angabe, vorbelegt mit dem gespeicherten Wert", async () => {
    const { container } = render(<Huelle spion={vi.fn()} />);
    fireEvent.click(stiftIn(zeile(container, "grundsteuer"))!);
    fireEvent.change(screen.getByLabelText("Grundsteuer p. a. (€)"), { target: { value: "412,50" } });
    await speichernKlicken();
    expect(within(zeile(container, "grundsteuer")).getByText(/413\s€/)).toBeInTheDocument();
    // erneut oeffnen: der gespeicherte Wert steht im Feld
    fireEvent.click(stiftIn(zeile(container, "grundsteuer"))!);
    expect(screen.getByLabelText("Grundsteuer p. a. (€)")).toHaveValue("412,5");
  });

  it("Speichern gibt das Dialogfeld weiter und das Cockpit rechnet sofort neu", async () => {
    const spion = vi.fn();
    const { container } = render(<Huelle spion={spion} />);
    expect(within(zeile(container, "grundsteuer")).getByText("Angabe fehlt, nicht gerechnet")).toBeInTheDocument();
    const vorher = werbungskosten();

    fireEvent.click(stiftIn(zeile(container, "grundsteuer"))!);
    fireEvent.change(screen.getByLabelText("Grundsteuer p. a. (€)"), { target: { value: "480" } });
    await speichernKlicken();

    expect(spion).toHaveBeenCalledWith({ grundsteuer_jahr: "480" });
    expect(within(zeile(container, "grundsteuer")).getByText(/480\s€/)).toBeInTheDocument();
    expect(werbungskosten()).not.toBe(vorher);
  });

  it("AfA zeigt genau Gebäudeanteil, Baujahr und AfA-Satz und rechnet danach die AfA", async () => {
    const spion = vi.fn();
    const { container } = render(<Huelle spion={spion} />);
    fireEvent.click(stiftIn(zeile(container, "afa"))!);
    const form = screen.getByRole("form", { name: "AfA Gebäude" });
    expect(within(form).getAllByRole("textbox")).toHaveLength(3);
    fireEvent.change(within(form).getByLabelText("Gebäudeanteil (%)"), { target: { value: "80" } });
    fireEvent.change(within(form).getByLabelText("Baujahr"), { target: { value: "1995" } });
    fireEvent.click(within(form).getByRole("button", { name: /Vorschlag übernehmen: 2 %/ }));
    await speichernKlicken(within(form).getByRole("button", { name: "Speichern" }));
    expect(spion).toHaveBeenCalledWith({ gebaeude_anteil_prozent: "80", baujahr: "1995", afa_satz_prozent: "2" });
    // 330.000 € Anschaffungskosten x 80 % x 2 % = 5.280 €
    expect(within(zeile(container, "afa")).getByText(/5\.280\s€/)).toBeInTheDocument();
  });

  it("Abbrechen ändert nichts", async () => {
    const spion = vi.fn();
    const { container } = render(<Huelle spion={spion} />);
    const vorher = werbungskosten();
    fireEvent.click(stiftIn(zeile(container, "versicherung"))!);
    fireEvent.change(screen.getByLabelText("Versicherung p. a. (€)"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Versicherung p. a. (€)")).toBeNull();
    expect(spion).not.toHaveBeenCalled();
    expect(within(zeile(container, "versicherung")).getByText("Angabe fehlt, nicht gerechnet")).toBeInTheDocument();
    expect(werbungskosten()).toBe(vorher);
  });

  it("prüft wie der Dialog: negative Beträge werden nicht gespeichert", async () => {
    const spion = vi.fn();
    const { container } = render(<Huelle spion={spion} />);
    fireEvent.click(stiftIn(zeile(container, "verwaltung"))!);
    fireEvent.change(screen.getByLabelText("Verwaltungskosten p. a. (€)"), { target: { value: "-5" } });
    await speichernKlicken();
    expect(screen.getByText("Verwaltungskosten pro Jahr darf nicht negativ sein.")).toBeInTheDocument();
    expect(spion).not.toHaveBeenCalled();
  });

  it("Zeilen ohne Stift verweisen auf die Stelle, an der die Angabe gepflegt wird", () => {
    const onBearbeiten = vi.fn();
    const onBelegeZeigen = vi.fn();
    render(<Huelle spion={vi.fn()} onBearbeiten={onBearbeiten} onBelegeZeigen={onBelegeZeigen} />);
    fireEvent.click(screen.getByRole("button", { name: "Aus der Kaltmiete, zu pflegen unter Bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Aus Darlehen und Zinssatz, zu pflegen unter Bearbeiten" }));
    expect(onBearbeiten).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Summe der Belege, Beleg unter Dokumente erfassen" }));
    expect(onBelegeZeigen).toHaveBeenCalledTimes(1);
  });

  it("zeigt eine Schätzung als Badge, nicht als Mini-Chip", () => {
    render(<Huelle spion={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("portal.cards.steuer_eigen.grenzsteuersatz"), { target: { value: "42" } });
    const badge = screen.getByText("Schätzwert");
    expect(badge).toHaveAttribute("data-ui", "badge");
    expect(badge.className).not.toMatch(/text-\[9px\]/);
  });

  it("der Schalter Sonder-AfA speichert den neuen Stand, nicht den alten", () => {
    const onPersist = vi.fn();
    render(<Huelle spion={vi.fn()} onPersist={onPersist} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onPersist).toHaveBeenCalledWith({ steuerCockpit: expect.objectContaining({ sonderAfA7b: true }) });
  });
});

describe("SteuerCockpitEigen, Bodenwert und Verwaltungsanteil als ein Wert", () => {
  const boden = () => screen.getByLabelText("portal.cards.steuer_eigen.boden_anteil") as HTMLInputElement;
  const hausgeld = () => screen.getByLabelText("portal.cards.steuer_eigen.hausgeld_nicht_umlage") as HTMLInputElement;
  const eintragen = async (feld: HTMLInputElement, wert: string) => {
    fireEvent.change(feld, { target: { value: wert } });
    await act(async () => { fireEvent.blur(feld); });
  };

  it("der Bodenwert schreibt Gebäudeanteil = 100 minus Bodenwert in das Dialogfeld", async () => {
    const spion = vi.fn();
    const { container } = render(<Huelle spion={spion} />);
    await eintragen(boden(), "20");
    expect(spion).toHaveBeenCalledWith({ gebaeude_anteil_prozent: "80" });
    // Der Stift an der AfA-Zeile zeigt danach denselben Wert.
    fireEvent.click(stiftIn(zeile(container, "afa"))!);
    expect(screen.getByLabelText("Gebäudeanteil (%)")).toHaveValue("80");
    expect(boden()).toHaveValue(20);
  });

  it("ein Gebäudeanteil aus dem Dialog erscheint oben als Bodenwert", () => {
    render(<Huelle spion={vi.fn()} start={{ ...attrappe(), gebaeude_anteil_prozent: 75 }} />);
    expect(boden()).toHaveValue(25);
    expect(boden()).not.toBeDisabled();
  });

  it("der Verwaltungsanteil wird mit dem Hausgeld in Euro je Monat umgerechnet", async () => {
    const spion = vi.fn();
    const { container } = render(<Huelle spion={spion} />);
    await eintragen(hausgeld(), "30");
    // 300 € Hausgeld je Monat x 30 % = 90 € je Monat
    expect(spion).toHaveBeenCalledWith({ hausgeld_nicht_umlage_monat: "90" });
    fireEvent.click(stiftIn(zeile(container, "hausgeld_nicht_umlage"))!);
    expect(screen.getByLabelText("Hausgeld nicht umlagefähig (€/Monat)")).toHaveValue("90");
  });

  it("ohne Hausgeld je Monat bleibt der Verwaltungsanteil gesperrt und rechnet nichts", async () => {
    const spion = vi.fn();
    render(<Huelle spion={spion} start={{ ...attrappe(), hausgeld: 0 }} />);
    expect(hausgeld()).toBeDisabled();
    expect(screen.getByText(/Ohne Hausgeld je Monat lässt sich der Anteil nicht in Euro umrechnen/)).toBeInTheDocument();
    expect(spion).not.toHaveBeenCalled();
  });

  it("unzulässige Prozente werden nicht gespeichert", async () => {
    const spion = vi.fn();
    render(<Huelle spion={spion} />);
    await eintragen(boden(), "120");
    expect(spion).not.toHaveBeenCalled();
    expect(screen.getByText("Bitte einen Wert zwischen 0 und 100 eintragen.")).toBeInTheDocument();
  });

  it("zeigt Altwerte aus meta.steuerCockpit als denselben Wert, bis sie übernommen sind", () => {
    const { container } = render(
      <Huelle spion={vi.fn()} start={{ ...attrappe(), meta: { ...attrappe().meta, steuerCockpit: { bodenwertAnteil: 25, hausgeldNichtUmlagefaehig: 30 } } }} />,
    );
    expect(boden()).toHaveValue(25);
    expect(hausgeld()).toHaveValue(30);
    fireEvent.click(stiftIn(zeile(container, "afa"))!);
    expect(screen.getByLabelText("Gebäudeanteil (%)")).toHaveValue("75");
  });

  it("der Grenzsteuersatz speichert weiter in meta.steuerCockpit und lässt einen offenen Altwert stehen", () => {
    const onPersist = vi.fn();
    render(
      <Huelle spion={vi.fn()} onPersist={onPersist} start={{ ...attrappe(), hausgeld: 0, meta: { steuerCockpit: { hausgeldNichtUmlagefaehig: 30 } } }} />,
    );
    const satz = screen.getByLabelText("portal.cards.steuer_eigen.grenzsteuersatz");
    fireEvent.change(satz, { target: { value: "35" } });
    fireEvent.blur(satz);
    expect(onPersist).toHaveBeenCalledWith({ steuerCockpit: { hausgeldNichtUmlagefaehig: 30, sonderAfA7b: false, grenzsteuersatz: 35 } });
  });
});

describe("SteuerCockpitEigen, Sprache im CSV-Export und in den Hinweisen", () => {
  // Die echte Übersetzung, unabhängig von der Attrappe für useTranslation oben.
  const tDe = i18n.getFixedT("de");
  const tEn = i18n.getFixedT("en");
  const rechne = (inv: ExternesInvestment) =>
    berechneSteuer(inv, {
      bodenwertAnteil: null,
      hausgeldNichtUmlagefaehig: null,
      sonderAfA7b: false,
      erhaltungsaufwandJahr: 0,
      grenzsteuersatz: 42,
      betrachtungsjahr: 2024,
    });

  it("Deutsch bleibt Zeichen für Zeichen wie bisher (Semikolon, Dezimalkomma)", () => {
    const ergebnis = rechne(attrappe());
    const zeilen = steuerCsvZeilen({ bezeichnung: "Musterwohnung", steuerjahr: 2024, ergebnis, sprache: "de", t: tDe });
    const komma = (v: number) => v.toFixed(2).replace(".", ",");
    const satz = ergebnis.effektiverSatzP.toFixed(1).replace(".", ",");
    expect(zeilen).toEqual([
      "Steuer-Cockpit Schätzung;Musterwohnung",
      "Steuerjahr;2024",
      "Posten;Betrag (€);Typ",
      ...ergebnis.posten.map((p) => `${p.label};${komma(p.betrag)};${p.typ}`),
      `Werbungskosten gesamt;${komma(ergebnis.werbungskostenSumme)};summe`,
      `Überschuss / Verlust;${komma(ergebnis.ueberschussVerlust)};ergebnis`,
      `Geschätzter Steuereffekt (${satz} % effektiv);${komma(ergebnis.steuerEffekt)};steuer`,
    ]);
  });

  it("Englisch hat englische Kopfzeilen, Bezeichnungen und den Dezimalpunkt", () => {
    const ergebnis = rechne(attrappe());
    const zeilen = steuerCsvZeilen({ bezeichnung: "Musterwohnung", steuerjahr: 2024, ergebnis, sprache: "en", t: tEn });
    expect(zeilen[0]).toBe("Tax cockpit estimate;Musterwohnung");
    expect(zeilen[1]).toBe("Tax year;2024");
    expect(zeilen[2]).toBe("Item;Amount (EUR);Type");
    expect(zeilen[3]).toBe(
      `Rental income (net cold rent × ${ergebnis.vermieteteMonate} months) · Section 21 EStG;${ergebnis.posten[0].betrag.toFixed(2)};income`,
    );
    for (const zeile of zeilen.slice(3)) {
      expect(zeile).toMatch(/;-?\d+\.\d{2};[a-z]+$/);
      expect(zeile).not.toMatch(/Mieteinnahmen|Angabe fehlt|Werbungskosten|einnahme|ausgabe/);
    }
  });

  it("jede fehlende Angabe aus der Rechnung hat eine englische Fassung", () => {
    const leer: ExternesInvestment = { ...attrappe(), nebenkosten: null as unknown as number, meta: {} };
    const ergebnis = berechneSteuer(leer, {
      bodenwertAnteil: null,
      hausgeldNichtUmlagefaehig: null,
      sonderAfA7b: true,
      erhaltungsaufwandJahr: 0,
      grenzsteuersatz: null,
      betrachtungsjahr: 2024,
    });
    expect(ergebnis.fehlendeAngaben.length).toBeGreaterThan(3);
    for (const text of ergebnis.fehlendeAngaben) {
      expect(fehlendeAngabeAnzeige(text, "de", tDe)).toBe(text);
      expect(fehlendeAngabeAnzeige(text, "en", tEn), text).not.toBe(text);
    }
    if (ergebnis.sonderAfaHinweis) {
      expect(fehlendeAngabeAnzeige(ergebnis.sonderAfaHinweis, "en", tEn)).not.toBe(ergebnis.sonderAfaHinweis);
    }
  });
});

describe("SteuerCockpitEigen, zvE aus der Selbstauskunft", () => {
  it("rechnet mit dem angegebenen zvE und nennt die Quelle", () => {
    render(<SteuerCockpitEigen inv={attrappe()} saData={{ familienstand: "Ledig", bruttoJahr: "90.000", zvEJahr: "71.500" }} />);
    expect(screen.getByText(/Dein zu versteuerndes Einkommen stammt aus deiner Selbstauskunft/)).toBeTruthy();
  });

  it("ohne Angabe bleibt es bei der Schätzung aus dem Brutto", () => {
    render(<SteuerCockpitEigen inv={attrappe()} saData={{ familienstand: "Ledig", bruttoJahr: "90.000" }} />);
    expect(screen.getByText(/aus der Selbstauskunft abgeleitet \(Brutto mal 0,7\)/)).toBeTruthy();
  });
});
