import { useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { FileText, ImagePlus, LoaderCircle, Sparkles, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import type {
  AfaMethode,
  Erhaltungsaufwandmodus,
  InvestmentEingabe,
  InvestmentErgebnis,
  Steuerberechnungsmodus,
  Steuerklasse,
  TextFeld,
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
import { Auswahlfeld, AuswahlOderText, FeldInfo, Schalterfeld, Textbereich, Textfeld, Zahlenfeld } from "./Felder";
import { Energieskala, kaufpreisHinweis, Steuerprofil } from "./Auswertungen";
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
          Bei Zusammenveranlagung gesperrt.

          Landen beide Haelften in derselben Steuererklaerung, ist der Anteil
          steuerlich folgenlos. Wer dort 50 eintraegt, halbiert sein ganzes
          Investment, ohne dass sich an der Steuer etwas aendert: Er sieht die
          halbe Miete, die halbe Rate und den halben Steuervorteil, obwohl ihm
          als Ehepaar das ganze Objekt gehoert.

          Gesperrt statt ausgeblendet: Ein verschwundenes Feld sieht aus wie ein
          Fehler, ein graues erklaert sich mit seinem Hinweis.
        */}
        <Zahlenfeld
          label="Anteil am Investment"
          value={input.jointAssessment ? 100 : input.investmentShare}
          suffix="%"
          gesperrt={input.jointAssessment}
          onChange={(wert) => setzeZahl("investmentShare", Math.min(100, wert))}
          hint={
            input.jointAssessment
              ? "Bei Zusammenveranlagung ohne Wirkung: Beide Hälften stehen in derselben Steuererklärung."
              : undefined
          }
          tooltip="Anteil des Kunden am Objekt, zum Beispiel 50 Prozent beim Kauf zu zweit. Alle Beträge werden dann anteilig gerechnet, also Miete, Kosten, Rate, Vermögen und Steuer. Prozentsätze wie die Bruttorendite bleiben gleich, denn der Anteil kürzt sich heraus. Das eingesetzte Eigenkapital wird NICHT geteilt, dort steht der Betrag dieses Kunden."
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
          onChange={(wert) => aendere({ taxCalculationMode: wert as Steuerberechnungsmodus })}
          tooltip="ESt-Tarif 2026 rechnet die Steuer vor und nach dem Kauf nach dem gesetzlichen Tarif und ist der Normalfall. Manueller Grenzsteuersatz nimmt stattdessen einen festen Prozentsatz auf das Ergebnis der Immobilie, gröber, aber gut für schnelle Vergleichsrechnungen."
        >
          <option value="tariff">ESt-Tarif 2026</option>
          <option value="manual">Manueller Grenzsteuersatz</option>
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
          label="Manueller Grenzsteuersatz"
          value={input.marginalTaxRate}
          suffix="%"
          onChange={(wert) => setzeZahl("marginalTaxRate", wert)}
          tooltip="Prozentsatz, mit dem das anteilige Ergebnis der Immobilie besteuert wird, üblich sind 42 Prozent im Spitzensatz. Die Steuerwirkung ist genau Ergebnis mal Satz, auch ohne eingetragenes Einkommen. Ein Verlust bringt also immer eine Ersparnis in dieser Höhe."
          hint="Vereinfachte Rechnung mit festem Satz, wie in Investagon. Genauer ist die Rechnung mit dem zu versteuernden Einkommen."
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
    "Notarkosten für Beurkundung und Abwicklung. Der Rechner setzt als Richtwert 1,0 Prozent des Gesamtkaufpreises ohne Erhaltungsaufwand und Möbel an, die genaue Rechnung kommt erst nach dem Notartermin.",
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
          onChange={(wert) => setzeZahl("constructionYear", wert)}
          tooltip="Fertigstellungsjahr des Gebäudes. Es erscheint im Exposé und wird nicht automatisch verrechnet. Der passende AfA-Satz für Altbau oder Neubau wird von Hand in Bereich 06 eingetragen."
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
          label="davon Erhaltungsaufwand"
          value={input.rehabExpense}
          suffix="€"
          onChange={(wert) => setzeZahl("rehabExpense", wert)}
          tooltip="Der Teil des Kaufpreises, der auf Renovierung oder Instandsetzung entfällt und steuerlich als Erhaltungsaufwand geltend gemacht wird, etwa der Sanierungsanteil. Er ist im Kaufpreis oben schon enthalten und erhöht die Gesamtkosten nicht. Weil er im Notarvertrag als gesonderte Leistung ausgewiesen ist, fallen auf ihn keine Kaufnebenkosten an: Grunderwerbsteuer, Notar und Grundbuch laufen nur auf den Kaufpreis der Immobilie ohne ihn und ohne Möbel. Wie er steuerlich wirkt, stellst du in Bereich 06 ein."
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
            tooltip="Die Grunderwerbsteuer ist Ländersache und liegt zwischen 3,5 und 6,5 Prozent. Aus der Auswahl werden Grunderwerbsteuer, Notar mit 1,0 Prozent und Grundbuch mit 0,5 Prozent gesetzt. Passt ein Satz im Einzelfall nicht, hilft der Weg mit eigener Eingabe."
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
          {kfw
            ? "Kaufpreis und Nebenkosten minus Eigenkapital, Nachrang und KfW-Darlehen"
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
          tooltip="Der mit der Bank vereinbarte Zinssatz für das erstrangige Darlehen, aus dem Finanzierungsangebot. Das Modell rechnet ihn über den ganzen Betrachtungszeitraum unverändert weiter und bildet keine Anschlussfinanzierung nach Ablauf der Zinsbindung ab."
          hint={quelle("seniorInterestRate")} markierung={feldmarkierung(herkunft, "seniorInterestRate")}
        />
        <Zahlenfeld
          label="Anfängliche Tilgung"
          value={input.seniorRepaymentRate}
          suffix="%"
          onChange={(wert) => setzeZahl("seniorRepaymentRate", wert)}
          tooltip="Anteil der Darlehenssumme, der im ersten Jahr getilgt wird. Zins und Tilgung zusammen ergeben die gleichbleibende Jahresrate. Weil der Zinsanteil mit sinkender Restschuld fällt, steigt der Tilgungsanteil von Jahr zu Jahr."
          hint={quelle("seniorRepaymentRate")} markierung={feldmarkierung(herkunft, "seniorRepaymentRate")}
        />
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
              tooltip="Zinssatz des Nachrangdarlehens. Wegen des schlechteren Rangs im Grundbuch liegt er in der Regel über dem Zins der Bank. Auch er bleibt im Modell über den gesamten Zeitraum gleich."
            />
            <Zahlenfeld
              label="Anfängliche Tilgung"
              value={input.juniorRepaymentRate}
              suffix="%"
              onChange={(wert) => setzeZahl("juniorRepaymentRate", wert)}
              tooltip="Anteil des Nachrangdarlehens, der im ersten Jahr getilgt wird. Auch hier rechnet das Modell mit einer gleichbleibenden Jahresrate aus Zins und Tilgung."
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
              tooltip="Wie lange der Zins fest ist. Danach rechnet das Modell mit demselben Zins weiter, wie beim Bankdarlehen; die Restschuld zu diesem Zeitpunkt steht in der Berechnung."
              hint={
                result.kfwLoanAmount > 0 && input.kfwFixedRateYears > 0
                  ? `Restschuld danach ${formatEuro(result.kfwRestschuldZinsbindung)}`
                  : undefined
              }
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

export function EingabeErtrag({ input, result, setzeZahl, herkunft }: EingabeProps) {
  const quelle = quelleFuer(herkunft);
  return (
    <div className="input-section">
      <Bereichstitel nummer="05" titel="Miete & Entwicklung" untertitel="Ertrag, Kosten und Szenarioannahmen" />
      <div className="field-grid">
        <Zahlenfeld
          label="Kaltmiete p. M."
          value={input.monthlyColdRent}
          suffix="€"
          onChange={(wert) => setzeZahl("monthlyColdRent", wert)}
          tooltip="Monatliche Nettokaltmiete ohne Nebenkosten, aus dem Mietvertrag oder bei Leerstand aus einer nüchternen Markteinschätzung. Sie ist die Ertragsgrundlage der gesamten Rechnung und bestimmt Cashflow und Rendite unmittelbar."
          hint={quelle("monthlyColdRent")} markierung={feldmarkierung(herkunft, "monthlyColdRent")}
        />
        <Zahlenfeld
          label="Nicht umlagefähige Kosten p. M."
          value={input.monthlyOperatingCosts}
          suffix="€"
          onChange={(wert) => setzeZahl("monthlyOperatingCosts", wert)}
          tooltip="Kosten, die der Eigentümer selbst trägt und nicht auf den Mieter umlegen kann, vor allem der nicht umlagefähige Teil des Hausgelds und die Sondereigentumsverwaltung. Die Zuführung zur Instandhaltungsrücklage steht im eigenen Feld daneben. Sie stehen im Wirtschaftsplan der Verwaltung und mindern Cashflow und steuerliches Ergebnis."
          hint={quelle("monthlyOperatingCosts")} markierung={feldmarkierung(herkunft, "monthlyOperatingCosts")}
        />
        <Zahlenfeld
          label="Zuführung Instandhaltungsrücklage p. M."
          value={input.monthlyReserveContribution}
          suffix="€"
          onChange={(wert) => setzeZahl("monthlyReserveContribution", wert)}
          tooltip="Der Teil des Hausgelds, der in die Instandhaltungsrücklage der Gemeinschaft fließt. Er mindert den Cashflow jeden Monat. Steuerlich wird er hier nicht abgezogen: Nach dem Bundesfinanzhof ist er erst abziehbar, wenn die Gemeinschaft das Geld für Erhaltung ausgibt, nicht schon bei der Einzahlung."
          hint={quelle("monthlyReserveContribution")} markierung={feldmarkierung(herkunft, "monthlyReserveContribution")}
        />
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
          onChange={(wert) => setzeZahl("annualRentGrowth", wert)}
          tooltip="Modellannahme, um wie viel Prozent die Miete jedes Jahr steigt. Sie wirkt ab dem zweiten Jahr und wächst mit Zinseszinseffekt. Was tatsächlich durchsetzbar ist, hängt von Mietspiegel, Kappungsgrenze und Vertrag ab."
        />
        <Zahlenfeld
          label="Kostensteigerung p. a."
          value={input.annualCostGrowth}
          suffix="%"
          onChange={(wert) => setzeZahl("annualCostGrowth", wert)}
          tooltip="Modellannahme für die jährliche Steigerung der nicht umlagefähigen Kosten. Liegt sie über der Mietsteigerung, verschlechtert sich der Cashflow im Zeitverlauf, liegt sie darunter, verbessert er sich."
        />
        <Zahlenfeld
          label="Wertsteigerung p. a."
          value={input.annualValueGrowth}
          suffix="%"
          onChange={(wert) => setzeZahl("annualValueGrowth", wert)}
          tooltip="Modellannahme für die jährliche Wertentwicklung der Wohnung, also von Grund und Boden und Gebäude. Möbel und Rücklagenanteil sind davon ausgenommen: Die Möbel gehen mit ihrem Restbuchwert in den Objektwert ein, die Rücklage mit ihrem Betrag. Die Steigerung wirkt nicht auf Miete oder Cashflow, sondern nur auf den rechnerischen Objektwert und damit auf Vermögensaufbau und Rendite am Ende des Zeitraums."
        />
      </div>
      <div className="field-grid">
        <Zahlenfeld
          label="Startjahr"
          value={input.startYear}
          step="1"
          onChange={(wert) => setzeZahl("startYear", wert)}
          tooltip="Erstes Jahr der Prognose, üblicherweise das Jahr des Kaufs. Es beschriftet nur die Jahre in Tabelle und Diagrammen, gerechnet wird unabhängig davon immer ab dem ersten Prognosejahr."
        />
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
        <span>
          <small>Bruttorendite</small>
          <strong>{formatProzent(result.grossYield)}</strong>
        </span>
        <span>
          <small>Nettorendite</small>
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
          tooltip="Über wie viele Jahre der Möbelanteil aus Bereich 02 samt seinem Anteil an den Kaufnebenkosten abgeschrieben wird, bei Einbauküchen sind zehn Jahre üblich, bei loser Ausstattung weniger. Der Betrag wird gleichmäßig verteilt und mindert in diesen Jahren das steuerliche Ergebnis."
        />
        <Zahlenfeld
          label="Sonder-AfA p. a."
          value={input.specialDepreciationRate}
          suffix="%"
          onChange={(wert) => setzeZahl("specialDepreciationRate", wert)}
          tooltip="Zusätzliche Abschreibung in den ersten Jahren neben der regulären AfA, etwa nach § 7b EStG für neuen Mietwohnraum. Das Modell rechnet den Satz auf dieselbe Bemessungsgrundlage wie die Gebäude-AfA und begrenzt beide zusammen auf das noch nicht abgeschriebene Volumen."
          hint={quelle("specialDepreciationRate") ?? "Nur eintragen, wenn die persönlichen und objektbezogenen Voraussetzungen geprüft sind."} markierung={feldmarkierung(herkunft, "specialDepreciationRate")}
        />
        {input.specialDepreciationRate > 0 && (
          <Zahlenfeld
            label="Dauer Sonder-AfA"
            value={input.specialDepreciationYears}
            suffix="Jahre"
            step="1"
            onChange={(wert) => setzeZahl("specialDepreciationYears", wert)}
            tooltip="Anzahl der ersten Jahre, in denen die Sonderabschreibung angesetzt wird. Danach läuft nur noch die reguläre Gebäude-AfA weiter, und die Steuerwirkung fällt entsprechend ab."
          />
        )}
      </div>
      {/* Der Betrag selbst steht seit dem 25.09.2026 unter dem Kaufpreis in Bereich 02. */}
      <div className="calculated-line">
        <span>Erhaltungsaufwand aus Bereich 02</span>
        <strong>{formatEuro(input.rehabExpense)}</strong>
      </div>
      <Auswahlfeld
        label="Steuerliche Behandlung"
        value={input.rehabMode}
        onChange={(wert) => aendere({ rehabMode: wert as Erhaltungsaufwandmodus })}
        tooltip="Der Erhaltungsaufwand steckt im Kaufpreis und damit im Gebäudeanteil. Abziehen nimmt ihn aus der Bemessungsgrundlage der Gebäude-AfA heraus und setzt ihn als Werbungskosten an, sofort oder verteilt über die eingestellten Jahre, die Steuerwirkung kommt also früh und stark. Aktivieren lässt ihn in der Bemessungsgrundlage, dann wirkt er nur über den AfA-Satz und damit über Jahrzehnte. Übersteigt er 15 Prozent der Anschaffungskosten des Gebäudes, erscheint unten ein Hinweis."
      >
        <option value="expense">Als Erhaltungsaufwand abziehen</option>
        <option value="capitalize">Aktivieren und über Gebäude-AfA abschreiben</option>
      </Auswahlfeld>
      {input.rehabMode === "expense" && (
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
      {result.simpleThresholdExceeded && (
        <div className="warning-card">
          <TriangleAlert size={19} />
          <div>
            <strong>15%-Prüfung erforderlich</strong>
            <p>
              Der eingetragene Aufwand entspricht im vereinfachten Check {formatProzent(result.immediateDeductionRatio)}{" "}
              der Anschaffungskosten des Gebäudes. Ein Sofortabzug kann wegen anschaffungsnaher Herstellungskosten ausgeschlossen sein.
            </p>
          </div>
        </div>
      )}
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
}

export function EingabeExpose({
  photos,
  onPhotoUpload,
  onPhotoDateien,
  onSortPhotos,
  onRemovePhoto,
  onOpenPreview,
  hinweis,
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
      <Bereichstitel nummer="07" titel="Bilder" untertitel="Objektbilder und druckfertige Vorschau" />
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
