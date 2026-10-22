import { useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { FileText, ImagePlus, LoaderCircle, Sparkles, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import type {
  AfaMethode,
  Anschlussfinanzierung,
  Bankunterlagenposten,
  Erhaltungsaufwandmodus,
  InvestmentEingabe,
  InvestmentErgebnis,
  Sondertilgung,
  Steuerberechnungsmodus,
  Sanierungsfall,
  Steuerklasse,
  TextFeld,
  Tilgungsart,
  ZahlenFeld,
} from "@/lib/investmentrechner/rechenkern";
import type { UnterlagenDaten, UnterlagenDokument } from "@/lib/investmentrechner/unterlagenAuslesen";
import {
  BUNDESLAND_AUSWAHL,
  kaufnebenkostenposten,
  type Kaufnebenkostenauswahl,
} from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { ENERGIEKLASSEN, formatEuro, formatEuroCent, formatProzent } from "@/lib/investmentrechner/formatierer";
import { unterlagenAuslesbar, type AuslesbaresFeld } from "@/lib/investmentrechner/unterlagenKiFelder";
import { eigenkapitalNachRegel, feldmarkierung, herkunftText, type Herkunft } from "@/lib/investmentrechner/herkunft";
import { OBJEKTTYP_VORSCHLAEGE } from "@/lib/investmentrechner/objekttypVorschlaege";
import { linearerAfaSatz } from "@/lib/afaSaetze";
import { hausgeldAufstellung, mitStellplatz } from "@/lib/investmentrechner/rechenkern";
import { Auswahlfeld, AuswahlOderText, FeldInfo, Feldetikett, Neu, Schalterfeld, Textbereich, Textfeld, Zahlenfeld } from "./Felder";
import { haushaltMitVorlage, haushaltsrechnung, vermoegenMitVorlage, vermoegensaufstellung } from "@/lib/investmentrechner/bankunterlagen";
import { Energieskala, hausgeldHinweis, kaufpreisHinweis, Steuerprofil } from "./Auswertungen";
import { UnterlagenUebernahme, type KiAuslesung } from "./UnterlagenUebernahme";

/*
 * Die sieben Eingabebereiche des linken Panels, eins zu eins aus der
 * Hauptkomponente der Web-App (Original Ee). Der Zustand liegt in der Seite,
 * die Bereiche bekommen nur Werte und Setter.
 */

export interface EingabeProps {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  setzeZahl: (feld: ZahlenFeld, wert: number) => void;
  setzeText: (feld: TextFeld, wert: string) => void;
  aendere: (aenderung: Partial<InvestmentEingabe>) => void;
  /**
   * Woher die Werte kommen. Daraus wird die kleine graue Zeile unter dem Feld.
   * Sobald jemand das Feld selbst ändert, verschwindet sie wieder, dafür
   * sorgen die Setter in der Seite.
   */
  herkunft?: Herkunft;
}

/** Der Satz unter einem Feld, oder nichts. In jedem Bereich derselbe Aufruf. */
function quelleFuer(herkunft: Herkunft | undefined) {
  return (feld: keyof InvestmentEingabe) => herkunftText(herkunft, feld);
}

function Bereichstitel({ nummer, titel, untertitel }: { nummer: string; titel: string; untertitel: string }) {
  return (
    <div className="section-title">
      <span>{nummer}</span>
      <div>
        <h2>{titel}</h2>
        <p>{untertitel}</p>
      </div>
    </div>
  );
}

export interface EingabeKundeProps extends EingabeProps {
  /**
   * Kundenwahl, Investmentwahl und die Rückfrage nach der Selbstauskunft.
   *
   * Die baut die Seite, weil sie den gewählten Kunden ohnehin führt: Er
   * entscheidet, wohin gespeichert wird, und das gehört nicht in einen
   * Eingabebereich.
   */
  kundenbereich?: ReactNode;
}

export function EingabeKunde({ input, result, setzeZahl, setzeText, aendere, herkunft, kundenbereich }: EingabeKundeProps) {
  const quelle = quelleFuer(herkunft);
  return (
    <div className="input-section">
      <Bereichstitel nummer="01" titel="Kunde & Einkommen" untertitel="Persönliche Steuerbasis vor dem Immobilienerwerb" />
      {kundenbereich}
      <Textfeld
        label="Kundenname"
        value={input.clientName}
        onChange={(wert) => setzeText("clientName", wert)}
        placeholder="Vor- und Nachname"
      />
      <div className="field-grid">
        <Zahlenfeld
          label="Jahresbrutto Kunde"
          value={input.annualGrossIncome}
          suffix="€"
          onChange={(wert) => setzeZahl("annualGrossIncome", wert)}
          tooltip="Das Bruttojahresgehalt aus Gehaltsabrechnung oder Arbeitsvertrag. Der Wert dient nur der Einordnung im Gespräch und geht in keine Berechnung ein. Gerechnet wird mit dem zu versteuernden Einkommen weiter unten."
          hint={quelle("annualGrossIncome")} markierung={feldmarkierung(herkunft, "annualGrossIncome")}
        />
        <Auswahlfeld
          label="Steuerklasse"
          value={input.taxClass}
          onChange={(wert) => aendere({ taxClass: wert as Steuerklasse })}
          tooltip="Steht auf der Gehaltsabrechnung. Die Steuerklasse steuert nur den monatlichen Lohnsteuerabzug, nicht die Jahressteuer. Das Modell rechnet mit dem zu versteuernden Einkommen, dieses Feld ändert das Ergebnis deshalb nicht."
          hint={quelle("taxClass")} markierung={feldmarkierung(herkunft, "taxClass")}
        >
          <option value="I">I</option>
          <option value="II">II</option>
          <option value="III">III</option>
          <option value="IV">IV</option>
          <option value="V">V</option>
          <option value="VI">VI</option>
        </Auswahlfeld>
      </div>
      <Auswahlfeld
        label="Veranlagung / Einkommensteuertarif"
        value={input.jointAssessment ? "splitting" : "basic"}
        onChange={(wert) => aendere({ jointAssessment: wert === "splitting" })}
        tooltip="Grundtabelle gilt für Alleinstehende, Splittingtabelle für zusammen veranlagte Ehe- oder Lebenspartner. Bei Splitting werden beide zu versteuernden Einkommen addiert und nach dem Splittingverfahren besteuert, das senkt die Steuerlast meist spürbar."
        hint={quelle("jointAssessment")} markierung={feldmarkierung(herkunft, "jointAssessment")}
      >
        <option value="basic">Grundtabelle · Einzelveranlagung</option>
        <option value="splitting">Splittingtabelle · Zusammenveranlagung</option>
      </Auswahlfeld>
      <div className="field-grid">
        <Zahlenfeld
          label="zvE Kunde"
          value={input.taxableIncomeCustomer}
          suffix="€"
          onChange={(wert) => setzeZahl("taxableIncomeCustomer", wert)}
          tooltip="Das zu versteuernde Einkommen aus dem letzten Steuerbescheid, also nach Werbungskosten, Sonderausgaben und Freibeträgen. Es ist die wichtigste Zahl dieses Bereichs, denn daraus berechnet das Modell die Steuer vor und nach dem Kauf."
          hint={quelle("taxableIncomeCustomer")} markierung={feldmarkierung(herkunft, "taxableIncomeCustomer")}
        />
        {input.jointAssessment && (
          <Zahlenfeld
            label="zvE Ehe-/Lebenspartner"
            value={input.taxableIncomeSpouse}
            suffix="€"
            onChange={(wert) => setzeZahl("taxableIncomeSpouse", wert)}
            tooltip="Das zu versteuernde Einkommen des Partners aus dem gemeinsamen Steuerbescheid. Bei Zusammenveranlagung wird es zum zvE des Kunden addiert."
            hint={quelle("taxableIncomeSpouse")} markierung={feldmarkierung(herkunft, "taxableIncomeSpouse")}
          />
        )}
        <Zahlenfeld
          label="zvE-Entwicklung p. a."
          value={input.annualTaxableIncomeGrowth}
          suffix="%"
          onChange={(wert) => setzeZahl("annualTaxableIncomeGrowth", wert)}
          tooltip="Modellannahme, um wie viel Prozent das zu versteuernde Einkommen jedes Jahr wächst. Ein höherer Wert schiebt den Kunden im Steuertarif nach oben und verändert damit die jährliche Steuerwirkung der Immobilie."
        />
        {/*
          Seit dem 22.10.2026 auch bei Zusammenveranlagung frei. Vorher war das
          Feld dann gesperrt und der Rechenkern rechnete mit 100 Prozent, auch
          wenn den Ehepartnern zusammen nur ein Teil gehört. Wem wie viel
          gehört, ist eine Frage des Eigentums, nicht der Veranlagung.
        */}
        <Zahlenfeld
          label="Anteil am Investment"
          value={input.investmentShare}
          suffix="%"
          onChange={(wert) => setzeZahl("investmentShare", Math.min(100, wert))}
          hint={
            input.jointAssessment && input.investmentShare < 100
              ? "Zusammenveranlagung: Hier steht der gemeinsame Anteil beider Ehepartner. Gehört ihnen die Wohnung zusammen ganz, sind es 100 %."
              : undefined
          }
          tooltip="Anteil des Kunden am Objekt, zum Beispiel 50 Prozent beim Kauf zu zweit. Alle Beträge werden dann anteilig gerechnet, also Miete, Kosten, Rate, Vermögen und Steuer. Prozentsätze wie die Bruttorendite bleiben gleich, denn der Anteil kürzt sich heraus. Bei Zusammenveranlagung gilt der gemeinsame Anteil beider Ehepartner, meist 100 Prozent. Das eingesetzte Eigenkapital wird NICHT geteilt, dort steht der Betrag dieses Kunden."
        />
      </div>
      <div className="field-grid">
        <Auswahlfeld
          label="Kirchensteuersatz"
          value={input.churchTaxRate}
          onChange={(wert) => setzeZahl("churchTaxRate", Number(wert))}
          tooltip="Kirchensteuer wird auf die Einkommensteuer aufgeschlagen, 8 Prozent in Bayern und Baden-Württemberg, sonst 9 Prozent. Ohne Kirchenmitgliedschaft bleibt es bei null. Der Satz erhöht die Steuerlast vor und nach dem Kauf und damit auch die Ersparnis."
        >
          <option value={0}>Keine Kirchensteuer</option>
          <option value={8}>8 %</option>
          <option value={9}>9 %</option>
        </Auswahlfeld>
        <Auswahlfeld
          label="Berechnungsmodus"
          value={input.taxCalculationMode}
          onChange={(wert) =>
            aendere({
              taxCalculationMode: wert as Steuerberechnungsmodus,
              /*
                Vertriebspaket, 16.10.2026: Der feste Satz startet beim
                Grenzsteuersatz aus dem zvE statt pauschal bei 42 Prozent. Ohne
                zvE bleibt der eingetragene Satz.
              */
              ...(wert === "manual" && result.combinedTaxableIncome > 0
                ? { marginalTaxRate: Math.round(result.marginalTotalTaxRate * 1000) / 10 }
                : {}),
            })
          }
          tooltip="Aus dem zvE nach § 32a EStG (Tarif 2026): rechnet die Steuer vor und nach dem Kauf nach dem gesetzlichen Tarif, mit Solidaritätszuschlag und Kirchensteuer; der Normalfall. Persönlicher Steuersatz: Du trägst den Grenzsteuersatz selbst ein, etwa 35, 37 oder 42 Prozent, und die Steuerwirkung ist Einkünfte aus Vermietung mal diesem Satz."
        >
          <option value="tariff">Aus dem zvE (Tarif 2026, § 32a EStG)</option>
          <option value="manual">Persönlicher Steuersatz (manuell)</option>
        </Auswahlfeld>
      </div>
      <Schalterfeld
        label="Solidaritätszuschlag berücksichtigen"
        checked={input.includeSolidaritySurcharge}
        onChange={(wert) => aendere({ includeSolidaritySurcharge: wert })}
        tooltip="5,5 Prozent auf die Einkommensteuer, im Modell mit Freigrenze und Milderungszone. Bei mittleren Einkommen fällt er dadurch oft gar nicht an. Eingeschaltet lassen ist der Normalfall."
      />
      {input.taxCalculationMode === "manual" && (
        <Zahlenfeld
          label="Persönlicher Grenzsteuersatz, gesamt"
          value={input.marginalTaxRate}
          suffix="%"
          onChange={(wert) => setzeZahl("marginalTaxRate", Math.min(60, wert))}
          tooltip="Prozentsatz, mit dem das anteilige Ergebnis der Immobilie besteuert wird. Beim Umschalten steht hier der Grenzsteuersatz aus dem zvE, etwa 35 Prozent bei 60.000 Euro brutto ledig; 42 Prozent gelten erst ab rund 70.000 Euro zvE. Die Steuerwirkung ist Ergebnis mal Satz, höchstens aber die Steuer, die ohne die Immobilie anfiele: Ohne Steuerlast gibt es keine Erstattung."
          hint={
            result.erstattungBegrenzt
              ? "Ohne Steuerlast vor dem Kauf keine Erstattung: Der Verlust wird hier nicht vollständig mit dem Satz verrechnet. Bitte das zu versteuernde Einkommen eintragen."
              : `Der Satz gilt als Gesamtsatz, Solidaritätszuschlag und Kirchensteuer also schon eingerechnet; die Schalter dazu wirken hier nicht. ${
                  result.combinedTaxableIncome > 0
                    ? `Aus dem zvE nach § 32a EStG ergäben sich ${formatProzent(result.marginalIncomeTaxRate)} Einkommensteuer, mit Soli und Kirchensteuer ${formatProzent(result.marginalTotalTaxRate)}.`
                    : "Ohne zvE wird der Grenzsteuersatz sonst nicht berechnet."
                }`
          }
        />
      )}
      <Steuerprofil input={input} result={result} compact />
      <div className="info-card">
        <strong>Brutto, Steuerklasse und zvE sind nicht dasselbe.</strong>
        <p>
          Der Jahres-Einkommensteuertarif knüpft an das zu versteuernde Einkommen an. Die Steuerklasse steuert
          primär den laufenden Lohnsteuerabzug.
        </p>
      </div>
    </div>
  );
}

export interface EingabeObjektProps extends EingabeProps {
  /** Welcher Weg zu den Kaufnebenkosten gilt und welches Bundesland gewählt ist. */
  knk: Kaufnebenkostenauswahl;
  setzeKnk: (auswahl: Kaufnebenkostenauswahl) => void;
}

/** Erklärungen zu den drei Sätzen, in beiden Wegen dieselben. */
const KNK_ERKLAERUNG: Record<string, string> = {
  transferTaxRate:
    "Der Satz richtet sich nach dem Bundesland des Objekts und liegt je nach Land zwischen 3,5 und 6,5 Prozent. Er wird auf den Kaufpreis der Immobilie gerechnet, also auf den Gesamtkaufpreis ohne Erhaltungsaufwand und ohne Möbel. Er erhöht die Gesamtkosten und fließt anteilig in die Abschreibung des Gebäudes.",
  notaryRate:
    "Notarkosten für Beurkundung und Abwicklung. Der Rechner setzt als Richtwert 1,5 Prozent des Gesamtkaufpreises ohne Erhaltungsaufwand und Möbel an, weil bei voller Finanzierung die Grundschuld dazukommt. Die genaue Rechnung kommt erst nach dem Notartermin.",
  landRegisterRate:
    "Gebühren des Grundbuchamts für Eigentumsumschreibung und Eintragung der Grundschuld. Der Rechner setzt als Richtwert 0,5 Prozent des Gesamtkaufpreises ohne Erhaltungsaufwand und Möbel an.",
};

export function EingabeObjekt({ input, result, setzeZahl, setzeText, aendere, knk, setzeKnk, herkunft }: EingabeObjektProps) {
  const quelle = quelleFuer(herkunft);
  const posten = kaufnebenkostenposten(
    {
      transferTaxRate: input.transferTaxRate,
      notaryRate: input.notaryRate,
      landRegisterRate: input.landRegisterRate,
    },
    // Aus dem Ergebnis, also mit dem Anteil am Investment und ohne
    // Erhaltungsaufwand und Möbel gerechnet. So ergeben die drei Posten
    // zusammen mit „Sonstige“ die Summe darunter.
    result.nebenkostenBasis,
  );
  return (
    <div className="input-section">
      <Bereichstitel nummer="02" titel="Objekt & Kaufpreis" untertitel="Grunddaten und Erwerbsnebenkosten" />
      <Textfeld label="Objektbezeichnung" value={input.propertyTitle} onChange={(wert) => setzeText("propertyTitle", wert)}
        placeholder="z. B. 3-Zimmerwohnung"
        tooltip="Wie die Wohnung im Exposé heißen soll, zum Beispiel „3-Zimmerwohnung“ oder „2-Zimmerwohnung mit Balkon“. Kommt der Rechner von einer Einheit, steht hier schon der Objektname mit der Wohnungsnummer. Die Bezeichnung geht nicht in die Rechnung ein, sie erscheint nur im Exposé."
        hint={quelle("propertyTitle")} markierung={feldmarkierung(herkunft, "propertyTitle")}
      />
      <Textfeld label="Adresse" value={input.address} onChange={(wert) => setzeText("address", wert)}
        hint={quelle("address")} markierung={feldmarkierung(herkunft, "address")}
      />
      <AuswahlOderText
        label="Objekttyp"
        value={input.propertyType}
        onChange={(wert) => setzeText("propertyType", wert)}
        vorschlaege={OBJEKTTYP_VORSCHLAEGE}
        placeholder="z. B. Denkmalobjekt"
        tooltip={
          "Um welche Art von Objekt es sich handelt. Zur Wahl stehen die drei gängigen Arten: " +
          OBJEKTTYP_VORSCHLAEGE.join(", ") +
          ". Passt keine davon, wähle „Eigene Angabe“ und schreib es selbst hinein. Der Objekttyp erscheint im Exposé und wird nicht mitgerechnet, die Abschreibung stellst du in Bereich 06 ein."
        }
        hint={quelle("propertyType")} markierung={feldmarkierung(herkunft, "propertyType")}
      />
      <div className="field-grid three">
        <Zahlenfeld
          label="Wohnfläche"
          value={input.area}
          suffix="m²"
          onChange={(wert) => setzeZahl("area", wert)}
          tooltip="Wohnfläche laut Kaufvertrag, Teilungserklärung oder Exposé des Verkäufers. Sie geht nicht in die Rechnung ein, erscheint aber im Exposé und dient dem Kunden als Vergleichsmaßstab."
          hint={quelle("area")} markierung={feldmarkierung(herkunft, "area")}
        />
        <Zahlenfeld
          label="Zimmer"
          value={input.rooms}
          step="1"
          onChange={(wert) => setzeZahl("rooms", wert)}
          hint={quelle("rooms")} markierung={feldmarkierung(herkunft, "rooms")}
        />
        <Zahlenfeld
          label="Baujahr"
          value={input.constructionYear}
          step="1"
          onChange={(wert) => {
            /*
              Seit dem 22.10.2026 folgt der lineare AfA-Satz dem Baujahr (2,5 %
              vor 1925, 2 % bis 2022, 3 % ab 2023), solange er noch dem
              Regelsatz des bisherigen Baujahrs entspricht. Ein bewusst anderer
              Satz, etwa aus einem Restnutzungsdauer-Gutachten, bleibt stehen.
            */
            const regelBisher = linearerAfaSatz(input.constructionYear > 0 ? input.constructionYear : null).satz;
            const regelNeu = linearerAfaSatz(wert > 0 ? wert : null).satz;
            const folgt = input.depreciationMethod === "linear" && Math.abs(input.buildingDepreciationRate - regelBisher) < 1e-9;
            if (folgt && regelNeu !== regelBisher) aendere({ constructionYear: wert, buildingDepreciationRate: regelNeu });
            else setzeZahl("constructionYear", wert);
          }}
          tooltip="Fertigstellungsjahr des Gebäudes. Es erscheint im Exposé und bestimmt den gesetzlichen linearen AfA-Satz: 2,5 Prozent vor 1925, 2 Prozent bis 2022, 3 Prozent ab 2023. Steht in Bereich 06 noch der Regelsatz, passt er sich beim Ändern des Baujahrs an; ein bewusst anderer Satz bleibt stehen."
          hint={quelle("constructionYear")} markierung={feldmarkierung(herkunft, "constructionYear")}
        />
      </div>
      {/*
        Ein Kaufpreis seit dem 25.09.2026. Möbel und Erhaltungsaufwand sind
        Anteile, die im Kaufpreis stecken, und stehen deshalb darunter statt
        daneben. Vorher kamen die Möbel obendrauf, obwohl der Preis aus der
        Objektanlage sie schon enthielt.
      */}
      <Zahlenfeld
        label="Kaufpreis"
        value={input.purchasePrice}
        suffix="€"
        onChange={(wert) => setzeZahl("purchasePrice", wert)}
        tooltip="Der Gesamtkaufpreis laut Kaufvertrag, also einschließlich Möbel, Inventar und eines mitgekauften Stellplatzes, aber ohne Kaufnebenkosten. Ohne einen Erhaltungsaufwand ist er die Basis für die Kaufnebenkosten; er ist außerdem die Basis für die Abschreibung und für das benötigte Darlehen und wirkt damit auf fast jede Zahl im Ergebnis."
        hint={quelle("purchasePrice")} markierung={feldmarkierung(herkunft, "purchasePrice")}
      />
      <div className="field-grid">
        <Zahlenfeld
          label="davon Möbel/Inventar"
          value={input.furniturePrice}
          suffix="€"
          onChange={(wert) => setzeZahl("furniturePrice", wert)}
          tooltip="Der Teil des Kaufpreises, der im Kaufvertrag auf Möbel oder Inventar entfällt. Er ist im Kaufpreis oben schon enthalten und erhöht die Gesamtkosten nicht. Weil er im Notarvertrag als gesonderte Leistung ausgewiesen ist, fallen auf ihn keine Kaufnebenkosten an. Abgeschrieben wird er über die kürzere Möbel-Nutzungsdauer in Bereich 06."
          hint={quelle("furniturePrice")} markierung={feldmarkierung(herkunft, "furniturePrice")}
        />
        <Zahlenfeld
          label="davon Stellplatz/Garage"
          value={input.garagePrice}
          suffix="€"
          neu
          onChange={(wert) => setzeZahl("garagePrice", wert)}
          tooltip="Der Teil des Kaufpreises, der auf einen mitgekauften Stellplatz oder eine Garage entfällt. Er ist im Kaufpreis oben schon enthalten und wird wie die Wohnung gerechnet, auch bei Kaufnebenkosten und Abschreibung. Er trennt nur den Ausweis: Rendite und Kaufpreisfaktor stehen dann für die Wohnung allein und für Wohnung und Stellplatz zusammen."
          hint={
            input.garagePrice > 0
              ? `Wohnung ${formatEuro(Math.max(0, input.purchasePrice - input.garagePrice))}, Stellplatz/Garage ${formatEuro(input.garagePrice)}`
              : quelle("garagePrice")
          }
          markierung={feldmarkierung(herkunft, "garagePrice")}
        />
        <Zahlenfeld
          label="davon Erhaltungsaufwand"
          value={input.rehabExpense}
          suffix="€"
          onChange={(wert) => setzeZahl("rehabExpense", wert)}
          tooltip="Der Teil des Kaufpreises, der auf Renovierung oder Instandsetzung entfällt, etwa der Sanierungsanteil. Er ist im Kaufpreis oben schon enthalten und erhöht die Gesamtkosten nicht. Ob er Kaufnebenkosten trägt und wie er steuerlich wirkt, hängt vom Sanierungsfall in Bereich 06 ab: Wird nach dem Kauf für dich saniert, laufen Grunderwerbsteuer, Notar und Grundbuch ohne ihn, und er ist Erhaltungsaufwand mit der 15-Prozent-Prüfung. Hat der Verkäufer vor dem Verkauf saniert, ist er Kaufpreis wie jeder andere, trägt Kaufnebenkosten und wird über die Gebäude-AfA abgeschrieben."
          hint={quelle("rehabExpense")} markierung={feldmarkierung(herkunft, "rehabExpense")}
        />
        <Zahlenfeld
          label="davon Anteil Instandhaltungsrücklage"
          value={input.maintenanceReserve}
          suffix="€"
          onChange={(wert) => setzeZahl("maintenanceReserve", wert)}
          tooltip="Der Teil des Kaufpreises, der laut Kaufvertrag auf den übernommenen Anteil an der Instandhaltungsrücklage entfällt. Er ist im Kaufpreis oben schon enthalten. Er wird weder abgeschrieben noch als Werbungskosten angesetzt, die Grunderwerbsteuer fällt aber auch auf ihn an. Im Vermögen zählt er als Guthaben mit seinem Betrag."
          hint={quelle("maintenanceReserve")} markierung={feldmarkierung(herkunft, "maintenanceReserve")}
        />
      </div>
      {/*
        Kaufnebenkosten auf zwei Wegen. Das frühere Feld „Makler" ist bewusst
        verschwunden: Eine Maklercourtage fällt in unserem Geschäft nicht beim
        Käufer an. Das Feld `brokerRate` bleibt im Rechenkern erhalten, weil die
        Golden-Tests und die gespeicherten Vergleichswerte daran hängen. Es
        steht dauerhaft auf null und wird nirgends mehr bedienbar gemacht.
      */}
      <div className="subheading">Kaufnebenkosten</div>
      {/*
        All-inclusive-Modell, seit dem 09.10.2026. Die Sätze darunter bleiben
        sichtbar und änderbar, aus ihnen entsteht der Aufschlag. Stammt das
        Eigenkapital noch aus der Vorbelegung nach der Regel „in Höhe der
        Kaufnebenkosten“, geht es beim Einschalten mit auf 0, denn die
        Nebenkosten werden jetzt mitfinanziert. Erkannt wird das an der
        Herkunft, nicht am Betrag: Ein von Hand eingetragener oder vom Kunden
        übernommener Wert bleibt immer stehen, auch wenn er zufällig gleich
        hoch ist. Beim Ausschalten wird nichts zurückgeschrieben.
      */}
      <Schalterfeld
        label="All-inclusive (Kaufnebenkosten im Kaufpreis enthalten)"
        checked={input.allInclusive}
        onChange={(an) =>
          aendere(
            an && eigenkapitalNachRegel(herkunft)
              ? { allInclusive: true, equity: 0 }
              : { allInclusive: an },
          )
        }
        hint={
          input.allInclusive
            ? "Kaufpreis um die Kaufnebenkosten erhöht, keine gesonderten Kaufnebenkosten"
            : "Kaufnebenkosten werden gesondert ausgewiesen"
        }
        tooltip="Beim All-inclusive-Modell wird der Kaufpreis um die Kaufnebenkosten erhöht, dafür fallen keine gesonderten Kaufnebenkosten an. Der Aufschlag wird aus den Sätzen unten auf dieselbe Basis gerechnet wie sonst die Kaufnebenkosten. Darlehen, Gesamtkosten und Steuer bleiben dadurch gleich; der Immobilienwert für die Wertentwicklung bleibt der Kaufpreis ohne Aufschlag. Im Exposé steht der Kaufpreis als „Kaufpreis all-inclusive“ und die Kaufnebenkosten als „im Kaufpreis enthalten“."
      />
      {/* Der Schalter „Möbel im Notarvertrag gesondert ausgewiesen“ ist seit dem 30.09.2026 weg: Möbel tragen nie Kaufnebenkosten. */}
      <div className="knk-weg" role="group" aria-label="Weg zu den Kaufnebenkosten">
        <button
          type="button"
          className={knk.weg === "bundesland" ? "active" : ""}
          aria-pressed={knk.weg === "bundesland"}
          onClick={() => setzeKnk({ ...knk, weg: "bundesland" })}
        >
          Bundesland wählen
        </button>
        <button
          type="button"
          className={knk.weg === "manuell" ? "active" : ""}
          aria-pressed={knk.weg === "manuell"}
          onClick={() => setzeKnk({ ...knk, weg: "manuell" })}
        >
          Sätze selbst eintragen
        </button>
      </div>
      <p className="knk-hinweis">
        {knk.weg === "bundesland"
          ? "Aktiv: Bundesland wählen. Grunderwerbsteuer, Notar und Grundbuch kommen aus der Auswahl und sind nicht von Hand änderbar."
          : "Aktiv: Sätze selbst eintragen. Alle Sätze werden von Hand gepflegt, zuletzt gesetzte Werte bleiben als Startwert stehen."}
      </p>
      {knk.weg === "bundesland" ? (
        <>
          <Auswahlfeld
            label="Bundesland des Objekts"
            value={knk.bundesland}
            onChange={(wert) => setzeKnk({ ...knk, bundesland: wert })}
            tooltip="Die Grunderwerbsteuer ist Ländersache und liegt zwischen 3,5 und 6,5 Prozent. Aus der Auswahl werden Grunderwerbsteuer, Notar mit 1,5 Prozent und Grundbuch mit 0,5 Prozent gesetzt. Passt ein Satz im Einzelfall nicht, hilft der Weg mit eigener Eingabe."
          >
            <option value="">Bitte Bundesland wählen</option>
            {BUNDESLAND_AUSWAHL.map((land) => (
              <option key={land.value} value={land.value}>
                {land.label}
              </option>
            ))}
          </Auswahlfeld>
          {!knk.bundesland && (
            <p className="knk-hinweis knk-hinweis-warnung">
              Noch kein Bundesland gewählt. Bis dahin rechnet der Rechner mit den unten stehenden Startwerten.
            </p>
          )}
          <div className="knk-saetze">
            {posten.map((eintrag) => (
              <div key={eintrag.schluessel}>
                <span>
                  {eintrag.label}
                  <FeldInfo text={KNK_ERKLAERUNG[eintrag.schluessel]} />
                </span>
                <b>{formatProzent(eintrag.prozent / 100)}</b>
                <em>{formatEuro(eintrag.betrag)}</em>
              </div>
            ))}
          </div>
          <Zahlenfeld
            label="Sonstige KNK"
            value={input.otherPurchaseCostRate}
            suffix="%"
            onChange={(wert) => setzeZahl("otherPurchaseCostRate", wert)}
            tooltip="Sammelposten für weitere Erwerbsnebenkosten, etwa Bereitstellungszinsen, Gutachten oder Erstausstattung. Angabe in Prozent des Gesamtkaufpreises ohne Erhaltungsaufwand und Möbel. Dieses Feld bleibt auch bei gewähltem Bundesland von Hand einstellbar."
            hint={quelle("otherPurchaseCostRate")} markierung={feldmarkierung(herkunft, "otherPurchaseCostRate")}
          />
        </>
      ) : (
        <div className="field-grid">
          <Zahlenfeld
            label="Grunderwerbsteuer"
            value={input.transferTaxRate}
            suffix="%"
            onChange={(wert) => setzeZahl("transferTaxRate", wert)}
            tooltip={KNK_ERKLAERUNG.transferTaxRate}
            hint={quelle("transferTaxRate")} markierung={feldmarkierung(herkunft, "transferTaxRate")}
          />
          <Zahlenfeld
            label="Notar"
            value={input.notaryRate}
            suffix="%"
            onChange={(wert) => setzeZahl("notaryRate", wert)}
            tooltip={KNK_ERKLAERUNG.notaryRate}
            hint={quelle("notaryRate")} markierung={feldmarkierung(herkunft, "notaryRate")}
          />
          <Zahlenfeld
            label="Grundbuch"
            value={input.landRegisterRate}
            suffix="%"
            onChange={(wert) => setzeZahl("landRegisterRate", wert)}
            tooltip={KNK_ERKLAERUNG.landRegisterRate}
            hint={quelle("landRegisterRate")} markierung={feldmarkierung(herkunft, "landRegisterRate")}
          />
          <Zahlenfeld
            label="Sonstige KNK"
            value={input.otherPurchaseCostRate}
            suffix="%"
            onChange={(wert) => setzeZahl("otherPurchaseCostRate", wert)}
            tooltip="Sammelposten für weitere Erwerbsnebenkosten, etwa Bereitstellungszinsen, Gutachten oder Erstausstattung. Angabe in Prozent des Gesamtkaufpreises ohne Erhaltungsaufwand und Möbel."
            hint={quelle("otherPurchaseCostRate")} markierung={feldmarkierung(herkunft, "otherPurchaseCostRate")}
          />
        </div>
      )}
      <div className="calculated-line">
        <span>Kaufnebenkosten gesamt</span>
        <strong>
          {result.allInclusive ? "im Kaufpreis enthalten" : formatEuro(result.purchaseCosts)} · {formatProzent(result.purchaseCostRate)}
          {(result.erhaltungsaufwand > 0 || result.moebelAnteil > 0) && <> auf {formatEuro(result.nebenkostenBasis)}</>}
        </strong>
      </div>
      {result.allInclusive && (
        <p className="knk-hinweis" data-testid="hinweis-all-inclusive">
          Kaufpreis all-inclusive: {formatEuro(result.kaufpreisGesamt)} (Kaufpreis{" "}
          {formatEuro(result.kaufpreisGesamt - result.allInclusiveAufschlag)} plus Kaufnebenkosten{" "}
          {formatEuro(result.allInclusiveAufschlag)})
        </p>
      )}
      {kaufpreisHinweis(result) && <p className="knk-hinweis">{kaufpreisHinweis(result)}</p>}
    </div>
  );
}

export interface EingabeUnterlagenProps {
  documents: UnterlagenDokument[];
  isReading: boolean;
  documentData: UnterlagenDaten;
  setDocumentData: (aktualisierer: (bisher: UnterlagenDaten) => UnterlagenDaten) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
  /** KI-Auslesung der Rechnerfelder, null solange nichts angestoßen wurde. */
  kiAuslesung: KiAuslesung | null;
  onFelderAuslesen: () => void;
  onFelderUebernehmen: (felder: Set<AuslesbaresFeld>) => void;
  onKiSchliessen: () => void;
  /** Einen automatisch übernommenen Wert zurücknehmen. */
  onZuruecknehmen?: (feld: AuslesbaresFeld) => void;
}

export function EingabeUnterlagen({
  documents,
  isReading,
  documentData,
  setDocumentData,
  onUpload,
  onRemove,
  kiAuslesung,
  onFelderAuslesen,
  onFelderUebernehmen,
  onKiSchliessen,
  onZuruecknehmen,
}: EingabeUnterlagenProps) {
  const auslesbar = unterlagenAuslesbar(documents);
  const liestAus = kiAuslesung?.status === "laedt";
  return (
    <div className="input-section documents-section">
      <Bereichstitel nummer="03" titel="Objektunterlagen" untertitel="Energie, Rücklagen und Sanierungshistorie auslesen" />
      <label className={`document-upload ${isReading ? "is-reading" : ""}`}>
        <input
          type="file"
          accept="application/pdf,.pdf,text/plain,.txt"
          multiple
          disabled={isReading || documents.length >= 12}
          onChange={onUpload}
        />
        {isReading ? <LoaderCircle className="spin" size={26} /> : <Upload size={26} />}
        <strong>
          {isReading ? "Unterlagen werden ausgewertet …" : "Objektunterlagen auswählen"}
          <FeldInfo text="Geeignet sind Exposé, Preisliste, Teilungserklärung, Mietvertrag, Energieausweis und Wirtschaftsplan. Hinterlegte Objekt- und Einheitsdokumente werden automatisch geladen und zur Auslesung verarbeitet. Texte und bei Scans die PDF werden an die Auslesefunktion übermittelt. Gepflegte Angaben haben Vorrang. Zusätzlich ausgewählte Dateien werden zunächst lokal gelesen; über ‚Felder aus den Unterlagen auslesen‘ können weitere Angaben übernommen werden." />
        </strong>
        <span>PDF oder TXT · bis zu 12 Dateien · Text wird lokal im Browser gelesen</span>
      </label>
      {documents.length > 0 && (
        <div className="document-list">
          {documents.map((dokument) => (
            <div key={dokument.id} className={`document-row status-${dokument.status}`}>
              <span className="document-icon">
                {dokument.status === "reading" ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />}
              </span>
              <span className="document-name">
                <strong>{dokument.name}</strong>
                <small>
                  {dokument.category} · {dokument.detail}
                </small>
              </span>
              <button
                type="button"
                aria-label={`${dokument.name} entfernen`}
                onClick={() => onRemove(dokument.id)}
                disabled={dokument.status === "reading"}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {/*
        KI-Auslesung der Rechnerfelder. Der Knopf ist nur aktiv, wenn eine
        lesbare Unterlage da ist, und schreibt nichts von selbst: Die Werte
        landen erst in der Übernahmeliste darunter.
      */}
      <button
        type="button"
        className="button ki-auslesen full-width"
        disabled={!auslesbar || isReading || liestAus}
        onClick={onFelderAuslesen}
      >
        {liestAus ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
        {liestAus ? "Felder werden ausgelesen …" : "Felder aus den Unterlagen auslesen"}
      </button>
      {kiAuslesung && (
        <UnterlagenUebernahme
          auslesung={kiAuslesung}
          onUebernehmen={onFelderUebernehmen}
          onSchliessen={onKiSchliessen}
          onZuruecknehmen={onZuruecknehmen}
        />
      )}
      <div className="subheading">Energieausweis · automatisch erkannt oder manuell korrigiert</div>
      <Energieskala energyClass={documentData.energyClass} energyValue={documentData.energyValue} compact />
      <div className="field-grid">
        <Auswahlfeld
          label="Energieeffizienzklasse"
          value={documentData.energyClass}
          onChange={(wert) => setDocumentData((bisher) => ({ ...bisher, energyClass: wert }))}
          tooltip="Steht auf Seite 1 des Energieausweises, A+ ist am sparsamsten, H am schlechtesten. Sie erscheint im Exposé und ist bei Vermietung und Verkauf angabepflichtig, in die Rechnung geht sie nicht ein."
        >
          <option value="">Keine Angabe</option>
          {ENERGIEKLASSEN.map((klasse) => (
            <option key={klasse} value={klasse}>
              {klasse}
            </option>
          ))}
        </Auswahlfeld>
        <Zahlenfeld
          label="Endenergiekennwert"
          value={documentData.energyValue}
          suffix="kWh/(m²·a)"
          onChange={(wert) => setDocumentData((bisher) => ({ ...bisher, energyValue: wert }))}
          tooltip="Endenergiebedarf oder Endenergieverbrauch je Quadratmeter und Jahr aus dem Energieausweis. Je kleiner der Wert, desto sparsamer das Gebäude. Er bestimmt die Einordnung auf der Farbskala darüber."
        />
        <Textfeld
          label="Art des Energieausweises"
          value={documentData.certificateType}
          onChange={(wert) => setDocumentData((bisher) => ({ ...bisher, certificateType: wert }))}
          placeholder="Bedarfs- oder Verbrauchsausweis"
          tooltip="Der Bedarfsausweis rechnet den Bedarf aus der Bausubstanz, der Verbrauchsausweis nimmt den tatsächlichen Verbrauch der Vorjahre. Verbrauchswerte hängen stark vom Nutzerverhalten ab und sind deshalb weniger belastbar."
        />
        <Textfeld
          label="Wesentlicher Energieträger"
          value={documentData.energyCarrier}
          onChange={(wert) => setDocumentData((bisher) => ({ ...bisher, energyCarrier: wert }))}
          placeholder="z. B. Gas, Fernwärme"
          tooltip="Womit geheizt wird, etwa Erdgas, Fernwärme oder Wärmepumpe. Die Angabe gehört ins Exposé und ist ein Hinweis darauf, ob in den nächsten Jahren ein Heizungstausch ansteht."
        />
        <Textfeld
          label="Energieausweis gültig bis"
          value={documentData.certificateValidUntil}
          onChange={(wert) => setDocumentData((bisher) => ({ ...bisher, certificateValidUntil: wert }))}
          placeholder="TT.MM.JJJJ"
          tooltip="Ein Energieausweis gilt zehn Jahre ab Ausstellung. Ist er abgelaufen, muss vor der nächsten Vermietung oder dem Verkauf ein neuer erstellt werden."
        />
      </div>
      <div className="subheading">Erhaltungsrücklage</div>
      <div className="field-grid">
        <Zahlenfeld
          label="Rücklagenbestand gesamt"
          value={documentData.reserveAmount}
          suffix="€"
          onChange={(wert) => setDocumentData((bisher) => ({ ...bisher, reserveAmount: wert }))}
          tooltip="Angespartes Geld der gesamten Eigentümergemeinschaft für künftige Instandhaltung, zu finden im Wirtschaftsplan oder in der Jahresabrechnung. Eine hohe Rücklage senkt das Risiko einer Sonderumlage."
        />
        <Zahlenfeld
          label="Anteil der Einheit"
          value={documentData.reserveUnitShare}
          suffix="€"
          onChange={(wert) => setDocumentData((bisher) => ({ ...bisher, reserveUnitShare: wert }))}
          tooltip="Der auf diese Wohnung entfallende Teil der Rücklage, meist nach Miteigentumsanteilen. Er geht mit dem Kauf auf den Erwerber über und erscheint im Exposé."
        />
      </div>
      <Textfeld
        label="Stand der Rücklage"
        value={documentData.reserveAsOf}
        onChange={(wert) => setDocumentData((bisher) => ({ ...bisher, reserveAsOf: wert }))}
        placeholder="z. B. 31.12.2025"
        tooltip="Stichtag, auf den sich der Rücklagenbetrag bezieht. Ohne Stichtag ist die Zahl wenig wert, weil zwischenzeitlich Maßnahmen beschlossen worden sein können."
      />
      {documentData.reserveExcerpt && (
        <details className="source-excerpt">
          <summary>Erkannte Fundstelle anzeigen</summary>
          <p>{documentData.reserveExcerpt}</p>
        </details>
      )}
      <div className="subheading">Sanierungshistorie</div>
      {/*
        Die Zeilen werden genau so gespeichert, wie sie getippt werden. Würde
        hier beim Tippen getrimmt und gefiltert, ließen sich weder Leerzeichen
        noch neue Zeilen eingeben, weil beide sofort wieder verschwinden.
        Aufgeräumt wird erst beim Lesen, siehe sanierungenBereinigt.
      */}
      <Textbereich
        label="Letzte Sanierungen"
        rows={8}
        value={documentData.renovations.join("\n")}
        onChange={(wert) =>
          setDocumentData((bisher) => ({ ...bisher, renovations: wert.split("\n") }))
        }
        tooltip="Bereits durchgeführte Modernisierungen, meist in den Protokollen der Eigentümerversammlung dokumentiert, etwa Dach, Fassade, Fenster oder Heizung. Sie zeigen dem Kunden, was schon bezahlt ist und in den nächsten Jahren voraussichtlich nicht mehr ansteht."
        placeholder={"2024 · Heizungsanlage erneuert\n2021 · Dach und Fassade saniert\n2018 · Fenster erneuert"}
        hint="Eine Maßnahme pro Zeile. Mit der Eingabetaste eine neue Zeile beginnen. Automatisch erkannte Angaben bitte vor dem Exposé prüfen."
      />
      <div className="info-card">
        <strong>Automatische Auslesung mit Kontrollschritt</strong>
        <p>
          Textbasierte PDFs werden direkt im Browser analysiert. Bei eingescannten Unterlagen ohne Textschicht
          müssen die Werte manuell ergänzt werden.
        </p>
      </div>
    </div>
  );
}

/** Vorschläge für das KfW-Programm. Nur Beschriftung, die Konditionen trägt der Berater ein. */
const KFW_PROGRAMME = [
  "KfW 297/298 Klimafreundlicher Neubau",
  "KfW 296 Klimafreundlicher Neubau im Niedrigpreissegment",
  "KfW 261 Sanierung",
];

export function EingabeFinanzierung({ input, result, setzeZahl, setzeText, aendere, herkunft }: EingabeProps) {
  const quelle = quelleFuer(herkunft);
  const kfw = input.kfwEnabled;
  const kfwAnlauf = result.kfwAnlaufJahre;
  const anlaufBegrenzt = kfw && kfwAnlauf !== input.kfwGracePeriodYears;
  return (
    <div className="input-section">
      <Bereichstitel nummer="04" titel="Finanzierung" untertitel="Bank, Eigenkapital und optionaler Nachrang" />
      <div className="field-grid">
        <Zahlenfeld
          label="Eigenkapital"
          value={input.equity}
          suffix="€"
          onChange={(wert) => setzeZahl("equity", wert)}
          tooltip="Der Betrag, den der Kunde aus eigenem Vermögen einbringt. Er senkt das Bankdarlehen und damit Zins und Rate. Zugleich ist er die Bezugsgröße der Rendite: ohne Eigenkapital lässt sich kein interner Zinsfuß ausweisen."
          hint={quelle("equity")} markierung={feldmarkierung(herkunft, "equity")}
        />
        <Zahlenfeld
          label="Nachrangdarlehen"
          value={input.juniorLoanAmount}
          suffix="€"
          onChange={(wert) => setzeZahl("juniorLoanAmount", wert)}
          tooltip="Zusätzliches Darlehen, das im Rang hinter der Bank steht, etwa von Familie oder aus einem Förderprogramm. Es ersetzt Eigenkapital, ist aber meist teurer. Sobald hier ein Betrag steht, erscheinen eigene Felder für Zins und Tilgung."
        />
        <Zahlenfeld
          label="Finanzierungsnebenkosten"
          value={input.financingCostRate}
          suffix="%"
          onChange={(wert) => setzeZahl("financingCostRate", wert)}
          tooltip="Kosten der Finanzierung in Prozent der Darlehenssumme, vor allem die Eintragung der Grundschuld. Üblich sind etwa 0,2 Prozent. Sie werden nicht mitfinanziert, sondern kommen zum Eigenkapitalbedarf dazu, und sie sind im ersten Jahr als Werbungskosten abziehbar."
          hint={
            result.finanzierungsnebenkosten > 0
              ? `${formatEuro(result.finanzierungsnebenkosten)} auf ${formatEuro(result.totalDebt)} Darlehen`
              : quelle("financingCostRate")
          }
          markierung={feldmarkierung(herkunft, "financingCostRate")}
        />
      </div>
      <div className="derived-loan">
        <span>
          Bankdarlehen automatisch
          <FeldInfo text="Das Bankdarlehen wird nicht eingetragen, sondern ergibt sich als Rest: Kaufpreis und Kaufnebenkosten minus Eigenkapital minus Nachrangdarlehen. Wer mehr Eigenkapital einträgt, senkt diesen Betrag Euro für Euro. Die Finanzierungsnebenkosten werden nicht mitfinanziert." />
        </span>
        <strong>{formatEuro(result.seniorLoanAmount)}</strong>
        <small>
          {kfw && input.secondLoanAmount > 0
            ? "Kaufpreis und Nebenkosten minus Eigenkapital, Nachrang, KfW-Darlehen und zweites Bankdarlehen"
            : kfw
              ? "Kaufpreis und Nebenkosten minus Eigenkapital, Nachrang und KfW-Darlehen"
              : input.secondLoanAmount > 0
                ? "Kaufpreis und Nebenkosten minus Eigenkapital, Nachrang und zweites Bankdarlehen"
                : "Kaufpreis und Nebenkosten minus Eigenkapital und Nachrang"}
        </small>
      </div>
      <div className="subheading">Bankdarlehen</div>
      <div className="field-grid">
        <Zahlenfeld
          label="Sollzins p. a."
          value={input.seniorInterestRate}
          suffix="%"
          onChange={(wert) => setzeZahl("seniorInterestRate", wert)}
          tooltip="Der mit der Bank vereinbarte Zinssatz für das erstrangige Darlehen, aus dem Finanzierungsangebot. Er gilt bis zum Ende der Zinsbindung. Ohne Anschlusszins rechnet das Modell ihn danach unverändert weiter."
          hint={quelle("seniorInterestRate")} markierung={feldmarkierung(herkunft, "seniorInterestRate")}
        />
        <Zahlenfeld
          label="Anfängliche Tilgung"
          value={input.seniorRepaymentRate}
          suffix="%"
          onChange={(wert) => setzeZahl("seniorRepaymentRate", wert)}
          tooltip="Tilgung in Prozent der Darlehenssumme im ersten Jahr. Zins und Tilgung zusammen, geteilt durch 12, ergeben die gleichbleibende Monatsrate. Gerechnet wird wie bei der Bank Monat für Monat: Weil der Zinsanteil mit sinkender Restschuld fällt, steigt der Tilgungsanteil mit jeder Rate."
          hint={quelle("seniorRepaymentRate")} markierung={feldmarkierung(herkunft, "seniorRepaymentRate")}
        />
        <Zahlenfeld
          label="Zinsbindung"
          value={input.seniorFixedRateYears}
          suffix="Jahre"
          neu
          onChange={(wert) => setzeZahl("seniorFixedRateYears", wert)}
          tooltip="Wie lange der Sollzins fest vereinbart ist. Danach gilt der Anschlusszins, ohne ihn rechnet das Modell mit Zins und Rate von heute weiter."
          hint={
            result.seniorLoanAmount > 0 && input.seniorFixedRateYears >= 1
              ? `Restschuld danach ${formatEuro(result.bankRestschuldZinsbindung)}`
              : undefined
          }
        />
        <Zahlenfeld
          label="Anschlusszins p. a."
          value={input.seniorFollowUpRate}
          suffix="%"
          neu
          onChange={(wert) => setzeZahl("seniorFollowUpRate", wert)}
          tooltip="Angenommener Zins für die Anschlussfinanzierung nach der Zinsbindung. Leer heißt: derselbe Zins wie heute. Die neue Rate ist Restschuld mal (Anschlusszins plus Tilgung), so rechnen Banken ein Anschlussangebot."
          hint={input.seniorFollowUpRate > 0 ? undefined : "Leer: Zins von heute"}
        />
        <Zahlenfeld
          label="Neue Tilgung ab Anschluss"
          value={input.seniorFollowUpRepaymentRate}
          suffix="%"
          neu
          onChange={(wert) => setzeZahl("seniorFollowUpRepaymentRate", wert)}
          tooltip="Tilgung in Prozent der Restschuld ab der Anschlussfinanzierung. Leer heißt: dieselbe Tilgung wie heute. Ohne Anschlusszins und neue Tilgung bleibt die Rate unverändert."
          hint={input.seniorFollowUpRepaymentRate > 0 ? undefined : "Leer: anfängliche Tilgung"}
        />
        <Zahlenfeld
          label="Umschuldungskosten"
          value={input.seniorFollowUpCosts}
          suffix="€"
          neu
          onChange={(wert) => setzeZahl("seniorFollowUpCosts", wert)}
          tooltip="Kosten beim Wechsel in die Anschlussfinanzierung, etwa Bearbeitung, Abtretung der Grundschuld oder eine Vorfälligkeitsentschädigung. Sie werden im Monat des Wechsels gezahlt, mindern den Cashflow und sind im selben Jahr als Werbungskosten abziehbar."
        />
        <Auswahlfeld
          label="Tilgungsart"
          value={input.seniorRepaymentType}
          onChange={(wert) => aendere({ seniorRepaymentType: wert as Tilgungsart })}
          tooltip="Annuität: Die Rate ergibt sich aus Zins plus anfänglicher Tilgung, wie bei den meisten Bankangeboten. Volltilgung: Du gibst die Laufzeit vor, die Rate tilgt das Darlehen genau in dieser Zeit. Endfällig: Während der Laufzeit nur Zinsen, am Ende die Schlusszahlung in voller Höhe."
        >
          <option value="annuitaet">Annuität aus Tilgungssatz</option>
          <option value="volltilgung">Volltilgung in fester Laufzeit</option>
          <option value="endfaellig">Endfällig (nur Zinsen)</option>
        </Auswahlfeld>
        {input.seniorRepaymentType !== "annuitaet" && (
          <Zahlenfeld
            label="Laufzeit"
            value={input.seniorTermYears}
            suffix="Jahre"
            step="1"
            neu
            onChange={(wert) => setzeZahl("seniorTermYears", Math.max(0, Math.round(wert)))}
            tooltip="Gesamtlaufzeit ab Auszahlung. Bei Volltilgung ist das Darlehen danach getilgt, beim endfälligen Darlehen wird dann die Schlusszahlung fällig."
            hint={
              input.seniorTermYears > 0
                ? undefined
                : input.seniorRepaymentType === "volltilgung"
                  ? "Ohne Laufzeit rechnet der Rechner mit der Annuität aus dem Tilgungssatz."
                  : "Ohne Laufzeit läuft das Darlehen ohne Schlusszahlung weiter."
            }
          />
        )}
        <Zahlenfeld
          label="Tilgungsfreie Anlaufjahre"
          value={input.seniorGracePeriodYears}
          suffix="Jahre"
          step="1"
          neu
          onChange={(wert) => setzeZahl("seniorGracePeriodYears", Math.max(0, Math.round(wert)))}
          tooltip="In diesen ersten Jahren zahlst du nur Zinsen. Danach beginnt die Tilgung mit der vollen Rate."
        />
      </div>
      <div className="subheading">
        Weitere Anschlussfinanzierungen <Neu />
      </div>
      <Anschlussliste liste={input.seniorFurtherFollowUps ?? []} onChange={(liste) => aendere({ seniorFurtherFollowUps: liste })} />
      <div className="subheading">
        Sondertilgungen <Neu />
      </div>
      <Sondertilgungen
        liste={input.specialRepayments ?? []}
        startjahr={input.startYear}
        jahre={input.forecastYears}
        onChange={(liste) => aendere({ specialRepayments: liste })}
      />
      <div className="subheading">
        Zweites Bankdarlehen <Neu />
      </div>
      <div className="field-grid">
        <Zahlenfeld
          label="Betrag"
          value={input.secondLoanAmount}
          suffix="€"
          neu
          onChange={(wert) => setzeZahl("secondLoanAmount", wert)}
          tooltip="Ein zweites Darlehen derselben oder einer anderen Bank, etwa mit anderer Zinsbindung. Es ersetzt einen Teil des Bankdarlehens, so wie das KfW-Darlehen. Sobald hier ein Betrag steht, erscheinen eigene Felder."
          hint={input.secondLoanAmount > 0 && result.secondLoanAmount < input.secondLoanAmount * result.anteil - 0.5 ? `Gedeckelt auf ${formatEuro(result.secondLoanAmount)}` : undefined}
        />
        {input.secondLoanAmount > 0 && (
          <>
            <Zahlenfeld
              label="Sollzins p. a."
              value={input.secondInterestRate}
              suffix="%"
              neu
              onChange={(wert) => setzeZahl("secondInterestRate", wert)}
              tooltip="Zins des zweiten Bankdarlehens bis zum Ende seiner Zinsbindung."
            />
            <Zahlenfeld
              label="Anfängliche Tilgung"
              value={input.secondRepaymentRate}
              suffix="%"
              neu
              onChange={(wert) => setzeZahl("secondRepaymentRate", wert)}
              tooltip="Tilgung in Prozent des Darlehens im ersten Jahr. Zins und Tilgung, geteilt durch 12, ergeben die gleichbleibende Monatsrate."
            />
            <Zahlenfeld
              label="Zinsbindung"
              value={input.secondFixedRateYears}
              suffix="Jahre"
              neu
              onChange={(wert) => setzeZahl("secondFixedRateYears", wert)}
              tooltip="Wie lange der Zins des zweiten Darlehens fest ist."
            />
            <Zahlenfeld
              label="Anschlusszins p. a."
              value={input.secondFollowUpRate}
              suffix="%"
              neu
              onChange={(wert) => setzeZahl("secondFollowUpRate", wert)}
              tooltip="Zins nach der Zinsbindung. Leer heißt: derselbe Zins. Die Rate wird auf die Restschuld mit der neuen Tilgung neu bestimmt."
              hint={input.secondFollowUpRate > 0 ? undefined : "Leer: Zins von heute"}
            />
            <Zahlenfeld
              label="Neue Tilgung ab Anschluss"
              value={input.secondFollowUpRepaymentRate}
              suffix="%"
              neu
              onChange={(wert) => setzeZahl("secondFollowUpRepaymentRate", wert)}
              tooltip="Tilgung des zweiten Darlehens in Prozent der Restschuld ab dem Anschluss. Leer heißt: dieselbe Tilgung wie heute."
              hint={input.secondFollowUpRepaymentRate > 0 ? undefined : "Leer: anfängliche Tilgung"}
            />
            <Auswahlfeld
              label="Tilgungsart"
              value={input.secondRepaymentType}
              onChange={(wert) => aendere({ secondRepaymentType: wert as Tilgungsart })}
              tooltip="Wie beim Bankdarlehen: Annuität aus dem Tilgungssatz, Volltilgung in fester Laufzeit oder endfällig mit Schlusszahlung."
            >
              <option value="annuitaet">Annuität aus Tilgungssatz</option>
              <option value="volltilgung">Volltilgung in fester Laufzeit</option>
              <option value="endfaellig">Endfällig (nur Zinsen)</option>
            </Auswahlfeld>
            {input.secondRepaymentType !== "annuitaet" && (
              <Zahlenfeld
                label="Laufzeit"
                value={input.secondTermYears}
                suffix="Jahre"
                step="1"
                neu
                onChange={(wert) => setzeZahl("secondTermYears", Math.max(0, Math.round(wert)))}
                tooltip="Gesamtlaufzeit des zweiten Darlehens ab Auszahlung."
              />
            )}
            <Zahlenfeld
              label="Tilgungsfreie Anlaufjahre"
              value={input.secondGracePeriodYears}
              suffix="Jahre"
              step="1"
              neu
              onChange={(wert) => setzeZahl("secondGracePeriodYears", Math.max(0, Math.round(wert)))}
              tooltip="In diesen ersten Jahren nur Zinsen, danach die volle Rate."
            />
          </>
        )}
      </div>
      {input.juniorLoanAmount > 0 && (
        <>
          <div className="subheading">Nachrangdarlehen</div>
          <div className="field-grid">
            <Zahlenfeld
              label="Sollzins p. a."
              value={input.juniorInterestRate}
              suffix="%"
              onChange={(wert) => setzeZahl("juniorInterestRate", wert)}
              tooltip="Zinssatz des Nachrangdarlehens. Wegen des schlechteren Rangs im Grundbuch liegt er in der Regel über dem Zins der Bank. Er bleibt im Modell über den gesamten Zeitraum gleich."
            />
            <Zahlenfeld
              label="Anfängliche Tilgung"
              value={input.juniorRepaymentRate}
              suffix="%"
              onChange={(wert) => setzeZahl("juniorRepaymentRate", wert)}
              tooltip="Anteil des Nachrangdarlehens, der im ersten Jahr getilgt wird. Auch hier rechnet das Modell mit einer gleichbleibenden Monatsrate aus Zins und Tilgung."
            />
          </div>
        </>
      )}
      <div className="subheading">KfW-Darlehen</div>
      <Schalterfeld
        label="KfW-Darlehen"
        checked={kfw}
        onChange={(wert) => aendere({ kfwEnabled: wert })}
        hint={kfw ? "Ersetzt einen Teil des Bankdarlehens" : "Förderdarlehen neben dem Bankdarlehen, etwa bei Neubau"}
        tooltip="Ein Förderdarlehen der KfW, das über die Hausbank neben dem Bankdarlehen läuft. Es ersetzt einen Teil des Bankdarlehens, so wie das Nachrangdarlehen. In den tilgungsfreien Jahren fallen nur Zinsen an, danach eine gleichbleibende Rate bis zum Ende der Laufzeit. Die Zinsen sind wie die Bankzinsen Werbungskosten."
      />
      {kfw && (
        <>
          <AuswahlOderText
            label="Programm"
            value={input.kfwProgram}
            onChange={(wert) => setzeText("kfwProgram", wert)}
            vorschlaege={KFW_PROGRAMME}
            leerText="Ohne Angabe"
            placeholder="z. B. KfW 297 Klimafreundlicher Neubau"
            tooltip="Nur die Beschriftung in Analyse und PDF. Zins, Laufzeit und Zuschuss kommen aus der Zusage der Bank und werden unten eingetragen, hinterlegt ist dafür nichts."
            hint={quelle("kfwProgram")} markierung={feldmarkierung(herkunft, "kfwProgram")}
          />
          <div className="field-grid">
            <Zahlenfeld
              label="Betrag"
              value={input.kfwLoanAmount}
              suffix="€"
              onChange={(wert) => setzeZahl("kfwLoanAmount", wert)}
              tooltip="Der zugesagte Kreditbetrag der KfW. Um ihn sinkt das Bankdarlehen. Mehr als der Finanzierungsbedarf aus Kaufpreis und Nebenkosten minus Eigenkapital und Nachrang wird nicht gerechnet."
              hint={`Finanzierungsbedarf ${formatEuro(result.finanzierungsbedarf)}`}
            />
            <Zahlenfeld
              label="Sollzins p. a."
              value={input.kfwInterestRate}
              suffix="%"
              onChange={(wert) => setzeZahl("kfwInterestRate", wert)}
              tooltip="Der Zins aus der KfW-Zusage. Gerechnet wird monatlich, wie bei der KfW."
            />
            <Zahlenfeld
              label="Zinsbindung"
              value={input.kfwFixedRateYears}
              suffix="Jahre"
              onChange={(wert) => setzeZahl("kfwFixedRateYears", wert)}
              tooltip="Wie lange der Zins fest ist. Danach gilt der Anschlusszins, ohne ihn derselbe Zins; die Restschuld zu diesem Zeitpunkt steht in der Berechnung."
              hint={
                result.kfwLoanAmount > 0 && input.kfwFixedRateYears > 0
                  ? `Restschuld danach ${formatEuro(result.kfwRestschuldZinsbindung)}`
                  : undefined
              }
            />
            <Zahlenfeld
              label="Anschlusszins p. a."
              value={input.kfwFollowUpRate}
              suffix="%"
              neu
              onChange={(wert) => setzeZahl("kfwFollowUpRate", wert)}
              tooltip="Zins nach der KfW-Zinsbindung. Leer heißt: derselbe Zins. Die Rate wird auf die Restschuld über die Restlaufzeit neu bestimmt."
              hint={input.kfwFollowUpRate > 0 ? undefined : "Leer: Zins von heute"}
            />
            <Zahlenfeld
              label="Gesamtlaufzeit"
              value={input.kfwTermYears}
              suffix="Jahre"
              onChange={(wert) => setzeZahl("kfwTermYears", wert)}
              tooltip="Nach dieser Zeit ist das KfW-Darlehen voll getilgt. Die Rate nach den tilgungsfreien Jahren ist darauf ausgelegt."
            />
            <Zahlenfeld
              label="Tilgungsfreie Jahre"
              value={input.kfwGracePeriodYears}
              suffix="Jahre"
              onChange={(wert) => setzeZahl("kfwGracePeriodYears", wert)}
              tooltip="Anlaufjahre, in denen nur Zinsen gezahlt werden, 0 bis 5. Danach steigt die Rate, weil die Tilgung beginnt."
              hint={
                result.kfwAnnuitaetMonat > 0 && kfwAnlauf > 0
                  ? `Danach ${formatEuroCent(result.kfwAnnuitaetMonat)} im Monat`
                  : undefined
              }
            />
          </div>
          <div className="field-grid">
            <Auswahlfeld
              label="Tilgungszuschuss in"
              value={input.kfwGrantMode}
              onChange={(wert) => aendere({ kfwGrantMode: wert === "euro" ? "euro" : "percent" })}
              tooltip="Manche Programme, etwa die Sanierung, schreiben einen Teil des Darlehens als Zuschuss gut. Er mindert die Restschuld, er ist keine Zahlung des Kunden."
            >
              <option value="percent">Prozent des Darlehens</option>
              <option value="euro">Euro</option>
            </Auswahlfeld>
            <Zahlenfeld
              label="Tilgungszuschuss"
              value={input.kfwGrantValue}
              suffix={input.kfwGrantMode === "euro" ? "€" : "%"}
              onChange={(wert) => setzeZahl("kfwGrantValue", wert)}
              tooltip="0 heißt ohne Zuschuss. Steuerlich mindert er ab dem Jahr der Gutschrift die Abschreibungsbasis des Gebäudes."
              hint={result.kfwTilgungszuschussNominal > 0 ? formatEuro(result.kfwTilgungszuschussNominal) : undefined}
            />
            {input.kfwGrantValue > 0 && (
              <Zahlenfeld
                label="Gutschrift am Ende von Jahr (Pflicht)"
                value={input.kfwGrantYear}
                onChange={(wert) => setzeZahl("kfwGrantYear", wert)}
                tooltip="Das Jahr aus der Zusage, an dessen Ende die KfW den Zuschuss gutschreibt, gezählt ab dem ersten Jahr der Rechnung. Er mindert nur die Restschuld: Die Rate bleibt gleich, die Laufzeit wird kürzer. Ohne Jahr rechnet der Rechner keinen Zuschuss."
                hint={result.kfwTilgungszuschuss > 0 ? `Angerechnet ${formatEuro(result.kfwTilgungszuschuss)}` : undefined}
              />
            )}
          </div>
          {result.kfwZuschussOhneJahr && (
            <p className="knk-hinweis knk-hinweis-warnung">
              Der Tilgungszuschuss wird erst gerechnet, wenn das Gutschriftjahr aus der Zusage eingetragen ist.
            </p>
          )}
          {!result.kfwZuschussOhneJahr && result.kfwTilgungszuschuss < result.kfwTilgungszuschussNominal - 0.5 && (
            <p className="knk-hinweis knk-hinweis-warnung">
              Angerechnet werden nur {formatEuro(result.kfwTilgungszuschuss)} von {formatEuro(result.kfwTilgungszuschussNominal)}:
              Mehr ist am Ende von Jahr {Math.round(input.kfwGrantYear)} vom KfW-Darlehen nicht mehr offen.
            </p>
          )}
          {result.kfwGekuerzt && (
            <p className="knk-hinweis knk-hinweis-warnung">
              Der Betrag ist höher als der Finanzierungsbedarf von {formatEuro(result.finanzierungsbedarf)}. Gerechnet wird
              mit {formatEuro(result.kfwLoanAmount)}, das Bankdarlehen fällt auf null.
            </p>
          )}
          {anlaufBegrenzt && (
            <p className="knk-hinweis knk-hinweis-warnung">
              Die tilgungsfreien Jahre müssen kürzer sein als die Laufzeit und dürfen höchstens 5 betragen. Gerechnet wird
              mit {kfwAnlauf}.
            </p>
          )}
        </>
      )}
      <div className="summary-strip">
        <span>
          <small>Gesamtkosten</small>
          <strong>{formatEuro(result.totalInvestment)}</strong>
        </span>
        <span>
          <small>Gesamtdarlehen</small>
          <strong>{formatEuro(result.totalDebt)}</strong>
        </span>
        <span>
          <small>Rate p. M.</small>
          <strong>{formatEuroCent(result.monthlyDebtService)}</strong>
        </span>
      </div>
      {result.kfwLoanAmount > 0 && (
        <p className="knk-hinweis">
          Mischzins {formatProzent(result.mischzins)}.
          {result.rateSprung &&
            ` Ab Jahr ${result.rateSprung.jahr} (${result.rateSprung.kalenderjahr}) steigt die Rate auf ${formatEuroCent(result.rateSprung.rateNachher)} im Monat.`}
        </p>
      )}
    </div>
  );
}

/**
 * Sondertilgungen als Liste: Kalenderjahr und Betrag, seit dem 11.10.2026.
 * Gezahlt am Jahresende auf das Bankdarlehen, höchstens die Restschuld.
 */
function Sondertilgungen({
  liste,
  startjahr,
  jahre,
  onChange,
}: {
  liste: Sondertilgung[];
  startjahr: number;
  jahre: number;
  onChange: (liste: Sondertilgung[]) => void;
}) {
  const setze = (index: number, aenderung: Partial<Sondertilgung>) =>
    onChange(liste.map((eintrag, i) => (i === index ? { ...eintrag, ...aenderung } : eintrag)));
  const ende = Math.round(startjahr) + Math.max(1, Math.round(jahre)) - 1;
  return (
    <div className="zeilenliste" data-testid="sondertilgungen">
      {liste.map((eintrag, index) => (
        <div className="zeilenliste-zeile" key={index}>
          <input
            type="number"
            aria-label="Jahr der Sondertilgung"
            value={eintrag.jahr || ""}
            onChange={(e) => setze(index, { jahr: Number(e.target.value) })}
          />
          <input
            type="number"
            aria-label="Betrag der Sondertilgung in Euro"
            value={eintrag.betrag || ""}
            onChange={(e) => setze(index, { betrag: Number(e.target.value) })}
          />
          <button type="button" className="text-button" aria-label="Sondertilgung entfernen" onClick={() => onChange(liste.filter((_, i) => i !== index))}>
            <Trash2 size={14} />
          </button>
          {(eintrag.jahr < startjahr || eintrag.jahr > ende) && eintrag.jahr > 0 && (
            <span className="zeilen-herkunft">Liegt außerhalb der Prognose ({Math.round(startjahr)} bis {ende}) und zählt nicht.</span>
          )}
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() => onChange([...liste, { jahr: Math.min(ende, Math.round(startjahr) + 1), betrag: 0 }])}
      >
        + Sondertilgung (Jahr, Betrag)
      </button>
      <span className="field-hint">Am Jahresende auf das Bankdarlehen. Die Rate bleibt, die Laufzeit wird kürzer.</span>
    </div>
  );
}

/**
 * Weitere Anschlussfinanzierungen des Bankdarlehens, seit dem 22.10.2026. Jede
 * Zeile: nach wie vielen Jahren ab Auszahlung, neuer Zins, neue Tilgung,
 * Umschuldungskosten. Die erste Anschlussfinanzierung steht in den Feldern
 * darüber (Zinsbindung, Anschlusszins, neue Tilgung).
 */
function Anschlussliste({ liste, onChange }: { liste: Anschlussfinanzierung[]; onChange: (liste: Anschlussfinanzierung[]) => void }) {
  const setze = (index: number, aenderung: Partial<Anschlussfinanzierung>) =>
    onChange(liste.map((eintrag, i) => (i === index ? { ...eintrag, ...aenderung } : eintrag)));
  return (
    <div className="zeilenliste" data-testid="anschlussfinanzierungen">
      {liste.map((eintrag, index) => (
        <div className="zeilenliste-zeile" key={index}>
          <input type="number" aria-label="Nach Jahren ab Auszahlung" placeholder="nach Jahren" value={eintrag.nachJahren || ""}
            onChange={(e) => setze(index, { nachJahren: Number(e.target.value) })} />
          <input type="number" aria-label="Neuer Sollzins in Prozent" placeholder="Zins %" value={eintrag.zinsProzent || ""}
            onChange={(e) => setze(index, { zinsProzent: Number(e.target.value) })} />
          <input type="number" aria-label="Neue Tilgung in Prozent" placeholder="Tilgung %" value={eintrag.tilgungProzent || ""}
            onChange={(e) => setze(index, { tilgungProzent: Number(e.target.value) })} />
          <input type="number" aria-label="Umschuldungskosten in Euro" placeholder="Kosten €" value={eintrag.kosten || ""}
            onChange={(e) => setze(index, { kosten: Number(e.target.value) })} />
          <button type="button" className="text-button" aria-label="Anschlussfinanzierung entfernen" onClick={() => onChange(liste.filter((_, i) => i !== index))}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() => onChange([...liste, { nachJahren: 0, zinsProzent: 0, tilgungProzent: 0, kosten: 0 }])}
      >
        + Anschlussfinanzierung (nach Jahren, Zins, Tilgung, Kosten)
      </button>
      <span className="field-hint">
        Nach der ersten Anschlussfinanzierung oben. Ab dem Monat danach gelten der neue Zins und die neue Tilgung, die Rate wird auf die Restschuld neu bestimmt. Leerer Zins oder leere Tilgung: wie bisher.
      </span>
    </div>
  );
}

/** Eine Liste von Posten mit Bezeichnung und Betrag, für Haushalt und Vermögen. */
function Postenliste({
  liste,
  onChange,
  mitPfand = false,
  neuText,
  betragLabel,
}: {
  liste: Bankunterlagenposten[];
  onChange: (liste: Bankunterlagenposten[]) => void;
  mitPfand?: boolean;
  neuText: string;
  betragLabel: string;
}) {
  const setze = (index: number, aenderung: Partial<Bankunterlagenposten>) =>
    onChange(liste.map((p, i) => (i === index ? { ...p, ...aenderung } : p)));
  return (
    <div className="zeilenliste">
      {liste.map((p, index) => (
        <div className={`zeilenliste-zeile${mitPfand ? " mit-pfand" : ""}`} key={index}>
          <input type="text" aria-label="Bezeichnung" value={p.bezeichnung} onChange={(e) => setze(index, { bezeichnung: e.target.value })} />
          <input
            type="number"
            aria-label={`${p.bezeichnung || "Posten"}, ${betragLabel}`}
            value={p.betrag || ""}
            // Wer den Betrag ändert, hat ihn selbst entschieden: Der Herkunftssatz geht weg.
            onChange={(e) => setze(index, { betrag: Number(e.target.value), herkunft: undefined })}
          />
          {mitPfand && (
            <label className="pfand">
              <input type="checkbox" checked={!!p.verpfaendet} onChange={(e) => setze(index, { verpfaendet: e.target.checked })} />
              verpfändet
            </label>
          )}
          <button type="button" className="text-button" aria-label={`${p.bezeichnung || "Posten"} entfernen`} onClick={() => onChange(liste.filter((_, i) => i !== index))}>
            <Trash2 size={14} />
          </button>
          {p.herkunft && (
            <span className="zeilen-herkunft">
              {p.herkunft} <Feldetikett art="selbstauskunft" />
            </span>
          )}
        </div>
      ))}
      <button type="button" className="text-button" onClick={() => onChange([...liste, { bezeichnung: "", betrag: 0 }])}>
        + {neuText}
      </button>
    </div>
  );
}

function Summenzeile({ label, monat, leise = false }: { label: string; monat: number; leise?: boolean }) {
  return (
    <div className={`summenzeile${leise ? " leise" : ""}`}>
      <span>{label}</span>
      <span>
        {formatEuroCent(monat)} <small>· {formatEuro(monat * 12)} im Jahr</small>
      </span>
    </div>
  );
}

export interface EingabeBankunterlagenProps extends EingabeProps {
  /** Lädt Haushalt und Vermögen (neu) aus der Selbstauskunft. Ohne: der Knopf fehlt. */
  onAusSelbstauskunft?: () => void;
  /**
   * `verbunden`: ein Kunde mit Selbstauskunft zum Investment ist gewählt.
   * `neuerStand`: Kunde, Investment oder Stand der Selbstauskunft sind
   * andere als bei der letzten Übernahme.
   */
  saStatus?: { verbunden: boolean; neuerStand: boolean; vorschau?: boolean };
}

/**
 * Haushaltsrechnung und Vermögensaufstellung fürs Bankgespräch, seit dem
 * 11.10.2026, nur in der Investmentkalkulation Plus. Gespeichert in der
 * Eingabe, gerechnet in bankunterlagen.ts.
 */
export function EingabeBankunterlagen({ input, result, aendere, onAusSelbstauskunft, saStatus }: EingabeBankunterlagenProps) {
  const haushalt = haushaltMitVorlage(input.haushalt);
  const vermoegen = vermoegenMitVorlage(input.vermoegen);
  const h = haushaltsrechnung(haushalt, result);
  const v = vermoegensaufstellung(vermoegen, result);
  return (
    <div className="input-section" data-testid="eingabe-bankunterlagen">
      <Bereichstitel nummer="07" titel="Bankunterlagen" untertitel="Haushaltsrechnung und Vermögensaufstellung des Kunden" />
      <label className="bank-haken" data-testid="haken-bankunterlagen">
        <input
          type="checkbox"
          checked={input.bankunterlagenInBerechnung === true}
          onChange={(e) => aendere({ bankunterlagenInBerechnung: e.target.checked })}
        />
        <span>
          <strong>
            In der Berechnung anzeigen <Neu />
          </strong>
          <small>
            {input.bankunterlagenInBerechnung
              ? "Haushaltsrechnung und Vermögensaufstellung stehen als eigene Seite in der Berechnung und im PDF, bei allen drei Deckblättern."
              : "Aus: Beides steht nur in der Analyse und im Bankgespräch-PDF, nicht in der Berechnung für den Kunden."}
          </small>
        </span>
      </label>
      <div className={`sa-status${saStatus?.neuerStand ? " sa-status-neu" : ""}`} data-testid="sa-status">
        {!saStatus?.verbunden ? (
          <p>Kein Kunde mit Selbstauskunft verbunden. Die Felder sind frei auszufüllen; mit Kunde und Investment im Bereich „Kunde &amp; Einkommen“ füllt der Rechner sie selbst.</p>
        ) : saStatus.neuerStand ? (
          <p>
            <strong>Neue Selbstauskunft verfügbar</strong> (anderer Kunde, anderes Investment oder neuerer Stand). Von Hand
            geänderte Werte bleiben, bis du neu lädst.
          </p>
        ) : (
          <p>
            Vorbefüllt aus der Selbstauskunft{saStatus.vorschau ? " des Beispielkunden" : " des verbundenen Kunden"}. Alles bleibt
            änderbar; geänderte Beträge gelten als Handwert und werden nicht ungefragt überschrieben.
          </p>
        )}
        {onAusSelbstauskunft && saStatus?.verbunden && (
          <button type="button" className={saStatus.neuerStand ? "button button-primary" : "text-button"} onClick={onAusSelbstauskunft}>
            Neu aus Selbstauskunft laden <Neu />
          </button>
        )}
      </div>
      <div className="subheading">
        Haushaltsrechnung je Monat <Neu />
      </div>
      <p className="field-hint">Einkünfte</p>
      <Postenliste liste={haushalt.einkuenfte} onChange={(einkuenfte) => aendere({ haushalt: { ...haushalt, einkuenfte } })} neuText="Einkunft" betragLabel="Euro je Monat" />
      <p className="field-hint">Ausgaben</p>
      <Postenliste liste={haushalt.ausgaben} onChange={(ausgaben) => aendere({ haushalt: { ...haushalt, ausgaben } })} neuText="Ausgabe" betragLabel="Euro je Monat" />
      <Summenzeile label="Überschuss vor dem Investment" monat={h.ueberschussVorMonat} />
      <Summenzeile label="+ Kaltmiete der Wohnung (automatisch)" monat={h.mieteMonat} leise />
      <Summenzeile label="− Kreditrate (automatisch)" monat={-h.rateMonat} leise />
      <Summenzeile label="− Bewirtschaftung und Rücklage (automatisch)" monat={-h.bewirtschaftungMonat} leise />
      <Summenzeile label="Überschuss nach dem Investment" monat={h.ueberschussNachMonat} />
      <Summenzeile label="… mit Steuerwirkung im ersten Jahr" monat={h.ueberschussNachMitSteuerMonat} leise />

      <div className="subheading">
        Vermögensaufstellung <Neu />
      </div>
      <p className="field-hint">Vermögenswerte</p>
      <Postenliste liste={vermoegen.werte} onChange={(werte) => aendere({ vermoegen: { ...vermoegen, werte } })} mitPfand neuText="Vermögenswert" betragLabel="Euro" />
      <p className="field-hint">Verbindlichkeiten</p>
      <Postenliste
        liste={vermoegen.verbindlichkeiten}
        onChange={(verbindlichkeiten) => aendere({ vermoegen: { ...vermoegen, verbindlichkeiten } })}
        neuText="Verbindlichkeit"
        betragLabel="Euro"
      />
      <div className="summenzeile"><span>Vermögenswerte (davon verpfändet)</span><span>{formatEuro(v.werte)} ({formatEuro(v.davonVerpfaendet)})</span></div>
      <div className="summenzeile leise"><span>Verbindlichkeiten</span><span>{formatEuro(v.verbindlichkeiten)}</span></div>
      <div className="summenzeile"><span>Differenz</span><span>{formatEuro(v.differenz)}</span></div>
      <div className="summenzeile leise"><span>mit Wohnung und neuen Darlehen</span><span>{formatEuro(v.differenzNachKauf)}</span></div>
      <p className="field-hint">Beides steht im Bankgespräch-PDF, Knopf in der Karte „Bankgespräch“ der Analyse.</p>
    </div>
  );
}

export function EingabeErtrag({ input, result, setzeZahl, herkunft }: EingabeProps) {
  const quelle = quelleFuer(herkunft);
  return (
    <div className="input-section">
      <Bereichstitel nummer="05" titel="Miete & Entwicklung" untertitel="Ertrag, Kosten und Szenarioannahmen" />
      <div className="field-grid">
        <Zahlenfeld
          label="Kaltmiete Wohnung p. M."
          value={input.monthlyColdRent}
          suffix="€"
          onChange={(wert) => setzeZahl("monthlyColdRent", wert)}
          tooltip="Monatliche Nettokaltmiete der Wohnung ohne Nebenkosten und ohne Stellplatz, aus dem Mietvertrag oder bei Leerstand aus einer nüchternen Markteinschätzung. Sie ist die Ertragsgrundlage der gesamten Rechnung und bestimmt Cashflow und Rendite unmittelbar."
          hint={quelle("monthlyColdRent")} markierung={feldmarkierung(herkunft, "monthlyColdRent")}
        />
        <Zahlenfeld
          label="Stellplatz-/Garagenmiete p. M."
          value={input.monthlyGarageRent}
          suffix="€"
          onChange={(wert) => setzeZahl("monthlyGarageRent", wert)}
          tooltip="Miete für einen mitgekauften Stellplatz oder eine Garage. Sie zählt in Mieteinnahmen, Cashflow und Steuer zur Miete der Wohnung dazu. Für die Rendite steht sie getrennt: Bruttorendite und Kaufpreisfaktor gibt es für die Wohnung allein und für Wohnung und Stellplatz zusammen. 0 heißt kein Stellplatz."
          hint={quelle("monthlyGarageRent")} markierung={feldmarkierung(herkunft, "monthlyGarageRent")}
        />
        <Zahlenfeld
          label="Weitere nicht umlagefähige Kosten p. M."
          value={input.monthlyOperatingCosts}
          suffix="€"
          onChange={(wert) => setzeZahl("monthlyOperatingCosts", wert)}
          tooltip="Kosten des Eigentümers außerhalb des Hausgelds, die er nicht auf den Mieter umlegen kann, etwa die Sondereigentumsverwaltung. Der nicht umlagefähige Teil des Hausgelds steht unten im Abschnitt Hausgeld, die Rücklage im eigenen Feld. Beide Kostenfelder zusammen mindern Cashflow und steuerliches Ergebnis."
          hint={
            quelle("monthlyOperatingCosts") ??
            `Zusammen mit dem nicht umlagefähigen Hausgeld: ${formatEuroCent(input.monthlyOperatingCosts + (input.housingFeeNonRecoverable || 0))} im Monat in der Rechnung`
          }
          markierung={feldmarkierung(herkunft, "monthlyOperatingCosts")}
        />
        <Zahlenfeld
          label="Zuführung Instandhaltungsrücklage p. M."
          value={input.monthlyReserveContribution}
          suffix="€"
          onChange={(wert) => setzeZahl("monthlyReserveContribution", wert)}
          tooltip="Der Teil des Hausgelds, der in die Instandhaltungsrücklage der Gemeinschaft fließt. Er mindert den Cashflow jeden Monat. Steuerlich wird er hier nicht abgezogen: Nach dem Bundesfinanzhof ist er erst abziehbar, wenn die Gemeinschaft das Geld für Erhaltung ausgibt, nicht schon bei der Einzahlung."
          hint={quelle("monthlyReserveContribution")} markierung={feldmarkierung(herkunft, "monthlyReserveContribution")}
        />
      </div>
      {/*
        Hausgeld in ganzer Höhe, seit dem 22.10.2026 (Christian). Gesamt und
        umlagefähig dienen der Aufstellung und Prüfung der Summe; der nicht
        umlagefähige Teil rechnet mit, zusammen mit den weiteren Kosten oben.
      */}
      <div className="subheading">Hausgeld</div>
      <div className="field-grid three">
        <Zahlenfeld
          label="Hausgeld gesamt p. M."
          value={input.housingFeeTotal}
          suffix="€"
          neu
          onChange={(wert) => setzeZahl("housingFeeTotal", wert)}
          tooltip="Das ganze Hausgeld laut Wirtschaftsplan: umlagefähiger Teil, nicht umlagefähiger Teil und Zuführung zur Erhaltungsrücklage. Es dient der Aufstellung und der Prüfung, ob die Teile zur Summe passen. Gerechnet wird mit den Feldern darüber."
          hint={quelle("housingFeeTotal")} markierung={feldmarkierung(herkunft, "housingFeeTotal")}
        />
        <Zahlenfeld
          label="davon umlagefähig p. M."
          value={input.housingFeeRecoverable}
          suffix="€"
          neu
          onChange={(wert) => setzeZahl("housingFeeRecoverable", wert)}
          tooltip="Der Teil, den der Mieter mit den Nebenkosten zahlt. Er belastet den Cashflow nicht und steht deshalb in keiner Rechnung."
        />
        <Zahlenfeld
          label="davon nicht umlagefähig p. M."
          value={input.housingFeeNonRecoverable}
          suffix="€"
          neu
          onChange={(wert) => setzeZahl("housingFeeNonRecoverable", wert)}
          tooltip="Der Teil des Hausgelds, den der Eigentümer trägt, etwa die Verwaltung der WEG. Er belastet den Cashflow und ist steuerlich abziehbar. Die Rechnung nimmt ihn zusammen mit den weiteren nicht umlagefähigen Kosten oben."
          hint={quelle("housingFeeNonRecoverable")}
          markierung={feldmarkierung(herkunft, "housingFeeNonRecoverable")}
        />
      </div>
      {hausgeldAufstellung(input).vorhanden && (
        <div className={hausgeldHinweis(input) ? "warning-card" : "calculated-line"} data-testid="hausgeld-pruefung">
          {hausgeldHinweis(input) ? (
            <>
              <TriangleAlert size={19} />
              <div>
                <strong>Hausgeld prüfen</strong>
                <p>{hausgeldHinweis(input)}</p>
              </div>
            </>
          ) : (
            <>
              <span>Umlagefähig + nicht umlagefähig + Rücklage</span>
              <strong>{formatEuroCent(hausgeldAufstellung(input).summeTeile)}</strong>
            </>
          )}
        </div>
      )}
      <div className="field-grid">
        <Zahlenfeld
          label="Leerstand / Mietausfall"
          value={input.vacancyRate}
          suffix="%"
          onChange={(wert) => setzeZahl("vacancyRate", wert)}
          tooltip="Anteil der Jahresmiete, der als Ausfall einkalkuliert wird, etwa für Mieterwechsel oder nicht gezahlte Miete. Der Wert ist eine Modellannahme, üblich sind zwei bis fünf Prozent. Er kürzt die Miete in jedem Jahr der Prognose."
        />
        <Zahlenfeld
          label="Mietsteigerung p. a."
          value={input.annualRentGrowth}
          suffix="%"
          min={-20}
          onChange={(wert) => setzeZahl("annualRentGrowth", wert)}
          tooltip="Modellannahme, um wie viel Prozent die Miete jedes Jahr steigt. Sie wirkt ab dem zweiten Jahr und wächst mit Zinseszinseffekt. Ein negativer Wert rechnet einen Mietrückgang. Was tatsächlich durchsetzbar ist, hängt von Mietspiegel, Kappungsgrenze und Vertrag ab."
        />
        <Zahlenfeld
          label="Kostensteigerung p. a."
          value={input.annualCostGrowth}
          suffix="%"
          min={-20}
          onChange={(wert) => setzeZahl("annualCostGrowth", wert)}
          tooltip="Modellannahme für die jährliche Steigerung der nicht umlagefähigen Kosten. Liegt sie über der Mietsteigerung, verschlechtert sich der Cashflow im Zeitverlauf, liegt sie darunter, verbessert er sich."
        />
        <Zahlenfeld
          label="Wertsteigerung p. a."
          value={input.annualValueGrowth}
          suffix="%"
          min={-20}
          onChange={(wert) => setzeZahl("annualValueGrowth", wert)}
          tooltip="Modellannahme für die jährliche Wertentwicklung der Wohnung, also von Grund und Boden und Gebäude. Ein negativer Wert rechnet einen Wertrückgang. Möbel und Rücklagenanteil sind davon ausgenommen: Die Möbel gehen mit ihrem Restbuchwert in den Objektwert ein, die Rücklage mit ihrem Betrag. Die Entwicklung wirkt nicht auf Miete oder Cashflow, sondern nur auf den rechnerischen Objektwert und damit auf Vermögensaufbau und Rendite am Ende des Zeitraums."
        />
        <Zahlenfeld
          label="Verkaufskosten am Ende"
          value={input.saleCostRate}
          suffix="%"
          neu
          onChange={(wert) => setzeZahl("saleCostRate", Math.min(20, wert))}
          tooltip="Kosten eines Verkaufs am Ende des Betrachtungszeitraums in Prozent des Verkaufspreises, etwa Makler und Notar. Sie mindern den Erlös im Modellverkauf und damit den internen Zinsfuß. Leer heißt: ohne Verkaufskosten."
          hint={result.verkaufskosten > 0 ? `${formatEuro(result.verkaufskosten)} im letzten Jahr` : undefined}
        />
      </div>
      <div className="field-grid">
        <Zahlenfeld
          label="Startjahr"
          value={input.startYear}
          step="1"
          onChange={(wert) => setzeZahl("startYear", wert)}
          tooltip="Erstes Jahr der Prognose, das Jahr, in dem Nutzen und Lasten übergehen. Es beschriftet die Jahre in Tabelle und Diagrammen."
        />
        <Auswahlfeld
          label="Übergang Nutzen und Lasten"
          value={input.acquisitionMonth}
          onChange={(wert) => setzeZahl("acquisitionMonth", Number(wert))}
          tooltip="Monat im Startjahr, ab dem die Wohnung dir gehört und vermietet ist. Das erste Jahr zählt nur ab diesem Monat: Miete, Kosten, Zinsen sowie Gebäude- und Möbel-AfA zeitanteilig. Die Sonder-AfA nach § 7b gibt es im ersten Jahr trotzdem voll."
        >
          {["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"].map((name, index) => (
            <option key={name} value={index + 1}>{name}</option>
          ))}
        </Auswahlfeld>
        <Zahlenfeld
          label="Betrachtungszeitraum"
          value={input.forecastYears}
          suffix="Jahre"
          step="1"
          min={1}
          onChange={(wert) => setzeZahl("forecastYears", Math.min(30, wert))}
          tooltip="Anzahl der gerechneten Jahre, höchstens dreißig. Im letzten Jahr unterstellt das Modell einen Verkauf zum prognostizierten Wert, deshalb hängt die ausgewiesene Rendite spürbar von dieser Länge ab."
        />
      </div>
      {/* Seit dem 09.10.2026, nur für das Deckblatt „Vermögensaufbau & Altersvorsorge“. */}
      <div className="field-grid">
        <Zahlenfeld
          label="Alter des Kunden heute"
          value={input.clientAge}
          suffix="Jahre"
          step="1"
          min={0}
          onChange={(wert) => setzeZahl("clientAge", wert)}
          tooltip="Nur für das Deckblatt „Vermögensaufbau & Altersvorsorge“. Daraus und aus dem Rentenbeginn ergibt sich, wie viele Jahre bis zum Ruhestand gerechnet werden. Leer gelassen zeigt das Deckblatt einen Hinweis statt Zahlen."
        />
        <Zahlenfeld
          label="Geplanter Rentenbeginn mit"
          value={input.retirementAge}
          suffix="Jahren"
          step="1"
          min={0}
          onChange={(wert) => setzeZahl("retirementAge", wert)}
          tooltip="Alter, ab dem die Miete als Zusatzeinkommen im Ruhestand dienen soll. Die Rechnung läuft dafür bei Bedarf über die dreißig Jahre des Betrachtungszeitraums hinaus, mit denselben Annahmen."
        />
        <Zahlenfeld
          label="Inflation p. a."
          value={input.inflationRate}
          suffix="%"
          onChange={(wert) => setzeZahl("inflationRate", wert)}
          tooltip="Modellannahme für die jährliche Geldentwertung. Mit ihr rechnet das Deckblatt „Vermögensaufbau & Altersvorsorge“ das Zusatzeinkommen im Ruhestand in heutige Kaufkraft um. Sonst wirkt sie nirgends."
        />
      </div>
      <div className="summary-strip">
        <span>
          <small>Effektive Jahresmiete</small>
          <strong>{formatEuro(result.effectiveAnnualRent)}</strong>
        </span>
        {mitStellplatz(result) && (
          <span>
            <small>Bruttorendite Wohnung</small>
            <strong>{formatProzent(result.grossYieldWohnung)}</strong>
          </span>
        )}
        <span>
          <small>{mitStellplatz(result) ? "Bruttorendite gesamt" : "Bruttorendite"}</small>
          <strong>{formatProzent(result.grossYield)}</strong>
        </span>
        <span>
          <small>{mitStellplatz(result) ? "Nettorendite gesamt" : "Nettorendite"}</small>
          <strong>{formatProzent(result.netYield)}</strong>
        </span>
      </div>
    </div>
  );
}

export function EingabeSteuer({ input, result, setzeZahl, aendere, herkunft }: EingabeProps) {
  const quelle = quelleFuer(herkunft);
  return (
    <div className="input-section">
      <Bereichstitel nummer="06" titel="Steuer & AfA" untertitel="Abschreibung und Werbungskosten der Vermietung" />
      <div className="field-grid">
        <Zahlenfeld
          label="Gebäudeanteil"
          value={input.buildingShare}
          suffix="%"
          onChange={(wert) => setzeZahl("buildingShare", Math.min(100, wert))}
          tooltip="Anteil des Kaufpreises ohne Möbel, der auf das Gebäude entfällt. Der Rest ist Grund und Boden und wird nicht abgeschrieben. Maßgeblich sind die Aufteilung im Kaufvertrag oder eine Berechnung nach der Arbeitshilfe des Bundesfinanzministeriums, üblich sind 70 bis 85 Prozent. Die Möbel haben ihre eigene Abschreibung."
          hint={quelle("buildingShare")} markierung={feldmarkierung(herkunft, "buildingShare")}
        />
        <Auswahlfeld
          label="AfA-Methode Gebäude"
          value={input.depreciationMethod}
          onChange={(wert) => aendere({ depreciationMethod: wert as AfaMethode })}
          tooltip="Linear zieht jedes Jahr denselben Prozentsatz der Bemessungsgrundlage ab. Degressiv rechnet den Satz auf den jeweiligen Restbuchwert, die Beträge sind am Anfang deutlich höher und werden danach kleiner. Welche Methode zulässig ist, hängt vom Objekt und vom Jahr der Anschaffung ab."
        >
          <option value="linear">Linear</option>
          <option value="declining">Degressiv</option>
        </Auswahlfeld>
        <Zahlenfeld
          label={input.depreciationMethod === "declining" ? "Degressive AfA p. a." : "Lineare AfA p. a."}
          value={input.buildingDepreciationRate}
          suffix="%"
          onChange={(wert) => setzeZahl("buildingDepreciationRate", wert)}
          tooltip="Abschreibungssatz für das Gebäude, üblich sind 2 Prozent ab Baujahr 1925, 2,5 Prozent davor und 3 Prozent bei Neubauten. Bei degressiver Methode gilt der Satz auf den Restbuchwert. Die Abschreibung mindert das steuerliche Ergebnis, kostet aber kein Geld und verändert den Cashflow vor Steuern nicht."
          hint={quelle("buildingDepreciationRate")} markierung={feldmarkierung(herkunft, "buildingDepreciationRate")}
        />
        <Zahlenfeld
          label="Möbel-Nutzungsdauer"
          value={input.furnitureDepreciationYears}
          suffix="Jahre"
          step="1"
          onChange={(wert) => setzeZahl("furnitureDepreciationYears", wert)}
          min={0}
          tooltip="Über wie viele Jahre der Möbelanteil aus Bereich 02 abgeschrieben wird. Er trägt keine Kaufnebenkosten. Bei Einbauküchen sind zehn Jahre üblich, bei loser Ausstattung weniger. Der Betrag wird gleichmäßig verteilt, im ersten Jahr ab dem Übergang zeitanteilig, und nie mehr als der Restbuchwert."
          hint={
            input.furniturePrice > 0 && !(input.furnitureDepreciationYears > 0)
              ? "Ohne Nutzungsdauer werden die Möbel nicht abgeschrieben."
              : undefined
          }
        />
        <Zahlenfeld
          label="Sonder-AfA § 7b p. a."
          value={input.specialDepreciationRate}
          suffix="%"
          onChange={(wert) => setzeZahl("specialDepreciationRate", wert)}
          tooltip="Sonderabschreibung für neuen Mietwohnraum nach § 7b EStG: höchstens 5 Prozent im Jahr der Anschaffung und in den drei folgenden Jahren, zusätzlich zur regulären AfA und nicht zeitanteilig. Liegen die Anschaffungskosten des Gebäudes über 5.200 Euro je m² Wohnfläche, entfällt sie ganz; ihre Bemessungsgrundlage ist höchstens 4.000 Euro je m². Danach wird der Restwert linear über die Restnutzungsdauer abgeschrieben."
          hint={
            quelle("specialDepreciationRate") ??
            (result.sonderAfa.beantragt
              ? result.sonderAfa.hinweis
              : "Nur eintragen, wenn die Voraussetzungen geprüft sind.")
          }
          markierung={feldmarkierung(herkunft, "specialDepreciationRate")}
        />
        {input.specialDepreciationRate > 0 && (
          <Zahlenfeld
            label="Dauer Sonder-AfA"
            value={input.specialDepreciationYears}
            suffix="Jahre"
            step="1"
            onChange={(wert) => setzeZahl("specialDepreciationYears", wert)}
            tooltip="Anzahl der ersten Jahre mit Sonderabschreibung, nach § 7b höchstens vier. Danach verteilt die reguläre AfA den Restwert über die Restnutzungsdauer, die Steuerwirkung fällt entsprechend ab."
          />
        )}
      </div>
      {result.sonderAfa.beantragt && (
        <div className={result.sonderAfa.zulaessig ? "info-card" : "warning-card"} data-testid="hinweis-7b">
          {!result.sonderAfa.zulaessig && <TriangleAlert size={19} />}
          <div>
            <strong>{result.sonderAfa.zulaessig ? "Sonder-AfA nach § 7b EStG" : "Keine Sonder-AfA nach § 7b EStG"}</strong>
            <p>
              {result.sonderAfa.baukostenJeQm > 0 ? `Baukosten ${formatEuro(result.sonderAfa.baukostenJeQm)} je m². ` : ""}
              {result.sonderAfa.zulaessig
                ? `Bemessungsgrundlage ${formatEuro(result.sonderAfa.bemessungsgrundlage)}, ${formatProzent(result.sonderAfa.satz / 100)} in ${result.sonderAfa.jahre} Jahren. ${result.sonderAfa.hinweis}`
                : result.sonderAfa.hinweis}
            </p>
            <p>
              Weitere Voraussetzungen, die der Rechner nicht prüft: Bauantrag oder Bauanzeige im begünstigten Zeitraum,
              Effizienzhaus 40 mit QNG-Siegel, Anschaffung bis zum Ende des Jahres der Fertigstellung, entgeltliche
              Vermietung zu Wohnzwecken im Jahr der Anschaffung und in den neun folgenden Jahren. Bitte mit der
              Steuerberatung abstimmen.
            </p>
          </div>
        </div>
      )}
      {/* Der Betrag selbst steht seit dem 25.09.2026 unter dem Kaufpreis in Bereich 02. */}
      <div className="calculated-line">
        <span>Sanierungsanteil aus Bereich 02</span>
        <strong>{formatEuro(input.rehabExpense)}</strong>
      </div>
      {/* Beide Sanierungsfälle seit dem 22.10.2026, Christians Entscheidung. Standard: nach dem Kauf. */}
      <Auswahlfeld
        label="Sanierungsfall"
        value={input.rehabScenario}
        onChange={(wert) => aendere({ rehabScenario: wert as Sanierungsfall })}
        tooltip="Nach dem Kauf: Die Sanierung wird erst nach dem Erwerb für dich umgesetzt. Dann ist sie Erhaltungsaufwand, mit der 15-Prozent-Prüfung. Durch den Verkäufer: Er hat vor dem Verkauf saniert, du kaufst eine sanierte Wohnung. Dann ist der Anteil Anschaffungskosten, wird über die Gebäude-AfA abgeschrieben und trägt Grunderwerbsteuer und Kaufnebenkosten."
      >
        <option value="nachKauf">Sanierung nach dem Kauf (für den Käufer)</option>
        <option value="durchVerkaeufer">Sanierung durch den Verkäufer vor dem Verkauf</option>
      </Auswahlfeld>
      {input.rehabScenario !== "durchVerkaeufer" && input.rehabExpense > 0 && (
        <Zahlenfeld
          label="Umsatzsteuer im Sanierungsanteil"
          value={input.rehabVatRate}
          suffix="%"
          neu
          onChange={(wert) => setzeZahl("rehabVatRate", Math.min(100, Math.max(0, wert)))}
          tooltip="Der Sanierungsanteil in Bereich 02 ist der gezahlte Betrag mit Umsatzsteuer, so steckt er im Kaufpreis und in der Finanzierung. Die 15-Prozent-Prüfung nach § 6 Abs. 1 Nr. 1a EStG rechnet aber ohne Umsatzsteuer. Üblich sind 19 Prozent; 0, wenn der Betrag keine Umsatzsteuer enthält."
          hint={`Netto ${formatEuro(result.erhaltungsaufwandNetto)} für die 15-Prozent-Prüfung`}
        />
      )}
      {input.rehabScenario !== "durchVerkaeufer" && (
        <Auswahlfeld
          label="Steuerliche Behandlung"
          value={input.rehabMode}
          onChange={(wert) => aendere({ rehabMode: wert as Erhaltungsaufwandmodus })}
          tooltip="Der Aufwand steckt im Kaufpreis und damit im Gebäudeanteil. Abziehen nimmt ihn aus der Bemessungsgrundlage der Gebäude-AfA heraus und setzt ihn als Werbungskosten an, sofort oder verteilt über die eingestellten Jahre; die Steuerwirkung kommt also früh und stark. Aktivieren lässt ihn in der Bemessungsgrundlage, dann wirkt er nur über den AfA-Satz und damit über Jahrzehnte. Liegt er über 15 Prozent der Anschaffungskosten des Gebäudes, aktiviert der Rechner ihn von selbst."
        >
          <option value="expense">Als Erhaltungsaufwand abziehen</option>
          <option value="capitalize">Aktivieren und über Gebäude-AfA abschreiben</option>
        </Auswahlfeld>
      )}
      {input.rehabExpense > 0 && (
        <div className={result.anschaffungsnah ? "warning-card" : "info-card"} data-testid="sanierung-pruefung">
          {result.anschaffungsnah && <TriangleAlert size={19} />}
          <div>
            {input.rehabScenario === "durchVerkaeufer" ? (
              <>
                <strong>Sanierung durch den Verkäufer: Anschaffungskosten</strong>
                <p>
                  Hat der Verkäufer vor dem Verkauf saniert, sind die Kosten beim Käufer in der Regel Anschaffungskosten.
                  Sie werden über die Gebäude-AfA abgeschrieben, ein Sofortabzug ist nicht möglich. Grunderwerbsteuer und
                  Kaufnebenkosten laufen auf den ganzen Kaufpreis.
                </p>
              </>
            ) : (
              <>
                <strong>15-Prozent-Prüfung nach § 6 Abs. 1 Nr. 1a EStG</strong>
                <p>
                  Grenze {formatEuro(result.fuenfzehnProzentGrenze)} (15 % der Gebäude-Anschaffungskosten ohne den Aufwand,
                  netto). Der Aufwand netto {formatEuro(result.erhaltungsaufwandNetto)}
                  {input.rehabVatRate > 0 ? ` (brutto ${formatEuro(input.rehabExpense)} mit ${formatProzent(input.rehabVatRate / 100)} USt)` : ""} entspricht{" "}
                  {formatProzent(result.immediateDeductionRatio)}.{" "}
                  {result.anschaffungsnah
                    ? "Damit ist er anschaffungsnaher Herstellungsaufwand: Der Rechner schreibt ihn über die Gebäude-AfA ab, statt ihn sofort abzuziehen."
                    : "Er liegt darunter und bleibt Erhaltungsaufwand, solange Instandsetzung und Modernisierung in den drei Jahren nach dem Kauf zusammen die Grenze nicht überschreiten."}
                </p>
                <p>
                  Grunderwerbsteuer und Kaufnebenkosten laufen hier ohne den Sanierungsanteil. Das gilt nur bei einem
                  eigenständigen, nicht mit dem Kaufvertrag verknüpften Sanierungsvertrag.
                </p>
              </>
            )}
            <p>Die steuerliche Behandlung bitte mit der Steuerberatung abstimmen.</p>
          </div>
        </div>
      )}
      {input.rehabScenario !== "durchVerkaeufer" && !result.sanierungAktiviert && (
        <Zahlenfeld
          label="Verteilung des Aufwands"
          value={input.rehabDistributionYears}
          suffix="Jahre"
          step="1"
          min={1}
          onChange={(wert) => setzeZahl("rehabDistributionYears", Math.max(1, wert))}
          tooltip="Über wie viele Jahre der Aufwand gleichmäßig abgezogen wird. Ein Jahr bedeutet vollen Abzug sofort. Eine Verteilung streckt die Steuerwirkung und ist sinnvoll, wenn der Abzug in einem Jahr das Einkommen unter den Bereich hoher Steuersätze drücken würde."
        />
      )}
      <div className="calculated-line">
        <span>AfA-Bemessungsgrundlage Gebäude</span>
        <strong>{formatEuro(result.depreciationBasis)}</strong>
      </div>
      {result.moebelAfaBasis > 0 && (
        <div className="calculated-line">
          <span>AfA-Bemessungsgrundlage Möbel</span>
          <strong>{formatEuro(result.moebelAfaBasis)}</strong>
        </div>
      )}
      <div className="info-card" data-testid="steuermodell-grenzen">
        <strong>Grenzen des Steuermodells</strong>
        <p>
          Gerechnet wird mit dem Einkommensteuertarif 2026 für jedes Jahr der Prognose, mit Solidaritätszuschlag und
          Kirchensteuer. Nicht abgebildet sind Verlustvorträge und Verlustrückträge, der Progressionsvorbehalt, eine
          Steuer auf den Veräußerungsgewinn bei Verkauf innerhalb von zehn Jahren (§ 23 EStG), Änderungen des Tarifs und
          individuelle Abzüge. Die Rechnung ersetzt keine Steuerberatung.
        </p>
      </div>
    </div>
  );
}

export interface EingabeExposeProps {
  photos: string[];
  onPhotoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Bilder, die in das Feld gezogen wurden. Der Dateidialog geht denselben Weg. */
  onPhotoDateien: (dateien: File[]) => void;
  /** Verschiebt ein Bild an eine andere Stelle, für die Wahl des Titelbilds. */
  onSortPhotos: (von: number, nach: number) => void;
  onRemovePhoto: (index: number) => void;
  onOpenPreview: () => void;
  /** Ein Satz über den Bildern, etwa dass sie aus der Objektanlage stammen. */
  hinweis?: string;
  /** Nummer im Titel. Bilder stehen immer zuletzt, in Plus nach den Bankunterlagen. */
  nummer?: string;
}

export function EingabeExpose({
  photos,
  onPhotoUpload,
  onPhotoDateien,
  onSortPhotos,
  onRemovePhoto,
  onOpenPreview,
  hinweis,
  nummer = "07",
}: EingabeExposeProps) {
  const [zieht, setZieht] = useState(false);
  /** Das Bild, das gerade an eine andere Stelle gezogen wird. */
  const [geschoben, setGeschoben] = useState<number | null>(null);
  /** Die Stelle, an der es landen würde. */
  const [ziel, setZiel] = useState<number | null>(null);

  /*
    `dragleave` feuert auch, wenn der Zeiger vom Feld auf eines seiner
    Kindelemente wandert, etwa auf das Symbol oder die Beschriftung. Ohne diese
    Prüfung flackerte die Einfärbung beim Darüberziehen. `relatedTarget` ist
    das Element, auf das der Zeiger wechselt: Liegt es noch im Feld, bleibt die
    Einfärbung stehen.
  */
  const verlassen = (event: DragEvent<HTMLLabelElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setZieht(false);
  };

  const ablegen = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setZieht(false);
    onPhotoDateien(Array.from(event.dataTransfer.files));
  };

  /*
    Über dem Feld können zwei verschiedene Dinge schweben: eine Datei vom
    Schreibtisch oder ein Bild, das hier schon liegt und nur umsortiert wird.
    `types` sagt, was davon zutrifft. Ohne diese Frage färbte sich das
    Hochladefeld auch beim Umsortieren ein und versprach etwas, das dort nicht
    passiert.
  */
  const traegtDateien = (event: DragEvent<HTMLElement>) => event.dataTransfer.types.includes("Files");

  const bildAbsetzen = (index: number) => {
    if (geschoben !== null && geschoben !== index) onSortPhotos(geschoben, index);
    setGeschoben(null);
    setZiel(null);
  };

  return (
    <div className="input-section">
      <Bereichstitel nummer={nummer} titel="Bilder" untertitel="Objektbilder und druckfertige Vorschau" />
      {/*
        Ohne `preventDefault` am Überfahren nimmt der Browser die Datei selbst
        an und öffnet sie in einem neuen Tab, statt sie hier abzulegen.
      */}
      <label
        className={`photo-upload${zieht ? " photo-upload-zieht" : ""}`}
        onDragOver={(event) => {
          if (!traegtDateien(event)) return;
          event.preventDefault();
          setZieht(true);
        }}
        onDragLeave={verlassen}
        onDrop={ablegen}
      >
        <input type="file" accept="image/*" multiple onChange={onPhotoUpload} />
        <ImagePlus size={24} />
        <strong>{zieht ? "Jetzt loslassen" : "Objektfotos hinzufügen"}</strong>
        <span>Bilder hierher ziehen oder klicken · bis zu 6 · das erste wird zum Titelbild</span>
      </label>
      {hinweis && (
        <p className="photo-hint" data-testid="foto-vorbelegung">
          {hinweis}
        </p>
      )}
      {photos.length > 0 && (
        <>
          {/*
            Die Bilder lassen sich untereinander tauschen, indem man eines auf
            ein anderes zieht. Das ist der Weg zum Titelbild, ohne alle anderen
            löschen und neu hochladen zu müssen.
          */}
          <div className="photo-grid-input">
            {photos.map((foto, index) => (
              <div
                key={`${foto.slice(-20)}-${index}`}
                className={`${geschoben === index ? "foto-geschoben" : ""}${ziel === index && geschoben !== index ? " foto-ziel" : ""}`}
                draggable
                onDragStart={(event) => {
                  setGeschoben(index);
                  // Ohne Nutzlast bricht Firefox das Ziehen sofort wieder ab.
                  event.dataTransfer.setData("text/plain", String(index));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (traegtDateien(event)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setZiel(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  bildAbsetzen(index);
                }}
                onDragEnd={() => {
                  setGeschoben(null);
                  setZiel(null);
                }}
              >
                <img src={foto} alt={`Objektfoto ${index + 1}`} draggable={false} />
                <button aria-label={`Objektfoto ${index + 1} entfernen`} onClick={() => onRemovePhoto(index)}>
                  <Trash2 size={14} />
                </button>
                {index === 0 && <span>Titelbild</span>}
              </div>
            ))}
          </div>
          {photos.length > 1 && (
            <p className="photo-hint">Ein Bild auf ein anderes ziehen, um die Reihenfolge zu ändern.</p>
          )}
        </>
      )}
      <button className="button button-primary full-width" onClick={onOpenPreview}>
        <Sparkles size={16} /> Berechnung als Vorschau öffnen
      </button>
    </div>
  );
}
