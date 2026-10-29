import type { InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import type { VergleichKunde } from "@/lib/investmentrechner/kundenObjektvergleich";
import { LEERER_KUNDE, wirksameAngaben, type AusfuehrlichAngaben } from "@/lib/investmentrechner/ausfuehrlicheBerechnung";
import { Auswahlfeld, AuswahlOderText, Textbereich, Textfeld, Zahlenfeld, type Feldbedarf } from "./Felder";

/*
 * Eingabebereich „Ausführliche Berechnung“ (29.10.2026): alles, was die
 * Rechnung im Einhauser-Aufbau über die übrigen Bereiche hinaus braucht.
 * Kaufpreis, Fläche, Miete, Hausgeld, Zins, Tilgung, AfA, Steuer und
 * Kaufnebenkosten stehen in ihren Bereichen und gelten hier mit.
 *
 * Im CRM füllen Objekt, Wohnung und Selbstauskunft die Felder vor (Hinweis
 * unter dem Feld); ein eingetragener Wert hat Vorrang, ein geleertes Feld
 * nimmt wieder die Vorgabe.
 */

interface Props {
  input: InvestmentEingabe;
  aendere: (aenderung: Partial<InvestmentEingabe>) => void;
  vorgaben: Partial<AusfuehrlichAngaben>;
  nummer: string;
}

export function EingabeAusfuehrlich({ input, aendere, vorgaben, nummer }: Props) {
  const eigen = input.ausfuehrlich ?? {};
  const a = wirksameAngaben(input, vorgaben);
  const setze = <K extends keyof AusfuehrlichAngaben>(k: K, wert: AusfuehrlichAngaben[K] | undefined) => {
    const neu = { ...eigen, [k]: wert };
    if (wert === undefined || wert === "" || wert === 0) delete neu[k];
    aendere({ ausfuehrlich: neu });
  };
  const hinweis = (k: keyof AusfuehrlichAngaben, sonst?: string) =>
    eigen[k] !== undefined ? "Selbst eingetragen; leeren nimmt wieder die Vorgabe" : vorgaben[k] !== undefined && vorgaben[k] !== "" ? "Aus der Objektanlage" : sonst;
  type Extra = Feldbedarf & { tooltip?: string; placeholder?: string; sonst?: string; faktor?: number };
  const zahl = (k: keyof AusfuehrlichAngaben, label: string, suffix: string, x: Extra = {}) => (
    <Zahlenfeld
      label={label}
      value={Math.round((a[k] as number) * (x.faktor ?? 1) * 1000) / 1000}
      suffix={suffix}
      onChange={(w) => setze(k, (w / (x.faktor ?? 1)) as never)}
      hint={hinweis(k, x.sonst)}
      tooltip={x.tooltip}
      placeholder={x.placeholder}
      empfohlen={x.empfohlen}
      optional={x.optional}
    />
  );
  const text = (k: "nr" | "lage" | "verwaltung" | "vergleichsmieteQuelle" | "wirtschaftsplan" | "version", label: string, x: Extra = {}) => (
    <Textfeld label={label} value={a[k]} placeholder={x.placeholder} onChange={(w) => setze(k, w)} hint={hinweis(k)} tooltip={x.tooltip} empfohlen={x.empfohlen} optional={x.optional} />
  );

  return (
    <div className="input-section" data-testid="eingabe-ausfuehrlich">
      <div className="section-title">
        <span>{nummer}</span>
        <div>
          <h2>Ausführliche Berechnung</h2>
          <p>Angaben für Analyse und PDF im Aufbau der Einhauser-Rechnung</p>
        </div>
      </div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Kaufpreis, Fläche, Miete, Hausgeld, Zins und Tilgung, AfA, Gebäudeanteil, Kaufnebenkosten, Wert- und Kostensteigerung und der Steuersatz kommen aus den
        übrigen Bereichen. Gerechnet wird jährlich, der Kaufpreis voll finanziert, die Kaufnebenkosten aus Eigenkapital.
      </p>

      <div className="subheading">Wohnung</div>
      <div className="field-grid">
        {text("nr", "Wohnungsnummer (WE)", { placeholder: "z. B. 12", empfohlen: true, tooltip: "Steht in Überschriften, Tabellen und im Dateinamen des PDF („Wohnung 12“). Ohne Nummer heißt die Wohnung dort „Wohnung 1“." })}
        {text("lage", "Lage im Haus", { placeholder: "z. B. 3. OG links", empfohlen: true, tooltip: "Etage und Seite der Wohnung. Steht auf der Seite „Haus und Wohnung“ und im Vergleich; gerechnet wird damit nichts." })}
        {zahl("garagen", "Anzahl Garagen/Stellplätze", "", { sonst: "Nur die erste hat einen Kaufpreis", placeholder: "z. B. 1", optional: true, tooltip: "Wie viele Garagen oder Stellplätze zur Wohnung gehören. Die Garagenmiete wird mit dieser Zahl multipliziert; einen Kaufpreis hat nur die erste (aus „Objekt & Kaufpreis“)." })}
      </div>

      <div className="subheading">Miete und Subvention</div>
      <div className="field-grid">
        {zahl("mieteSubQm", "Gerechnete Kaltmiete (subventioniert)", "€/m²", { sonst: "Leer: die heutige Kaltmiete aus „Miete & Entwicklung“", placeholder: "z. B. 13,00", optional: true, tooltip: "Die Miete je m², mit der gerechnet wird, wenn der Bauträger die Miete bis zu diesem Wert aufstockt. Die Differenz zur heutigen Miete erscheint als Mietlücke. Ohne Subvention leer lassen." })}
        {zahl("subventionMonate", "Subvention längstens", "Monate", { placeholder: "z. B. 36", optional: true, tooltip: "Wie lange der Bauträger die Mietlücke höchstens trägt. Steht im Text der Berechnung; gerechnet wird mit der subventionierten Miete." })}
        <Auswahlfeld
          label="Kappungsgrenze"
          value={String(Math.round(a.kappung * 100))}
          onChange={(w) => setze("kappung", Number(w) / 100)}
          hint={hinweis("kappung")}
          tooltip="Um wie viel die Miete in drei Jahren höchstens steigen darf (§ 558 BGB): 20 Prozent, in Gemeinden mit Kappungsgrenzenverordnung 15 Prozent. Daraus rechnet die Berechnung, ob die Mietlücke nach der Subvention bleibt."
        >
          <option value="20">20 % (Regelfall)</option>
          <option value="15">15 % (Gemeinde mit Verordnung)</option>
        </Auswahlfeld>
        {zahl("mieteZielQm", "Zielmiete", "€/m²", { sonst: "Ohne Vorgabe aus der Mietsteigerung gerechnet", placeholder: "z. B. 20", empfohlen: true, tooltip: "Die Miete je m², die im Zieljahr erreicht wird. Bis dahin steigt die Miete gleichmäßig. Sie bestimmt Mieteinnahmen, Zuzahlung und Erlös über die Jahre." })}
        {zahl("mieteZielJahr", "Zielmiete erreicht im Jahr", "", { placeholder: "z. B. 2060", empfohlen: true, tooltip: "Das Jahr, in dem die Zielmiete erreicht ist. Danach bleibt die Miete in der Rechnung gleich." })}
      </div>

      {a.garagen > 0 && <>
        <div className="subheading">Garage</div>
        <div className="field-grid">
          {zahl("garageMiete1", "Garagenmiete 1. Jahr (gerechnet, je Garage)", "€", { sonst: "Leer: die Stellplatzmiete aus „Miete & Entwicklung“", placeholder: "z. B. 80", tooltip: "Die Garagenmiete, mit der im ersten Jahr gerechnet wird, etwa wenn der Bauträger sie aufstockt. Sie zählt zu den Einnahmen." })}
          {zahl("garageMieteZiel", "Garagenmiete im Zieljahr", "€", { placeholder: "z. B. 150", tooltip: "Die Garagenmiete im Zieljahr der Miete. Bis dahin steigt sie gleichmäßig." })}
          {zahl("garageIstVon", "Heutige Garagenmiete von", "€", { placeholder: "z. B. 40", optional: true, tooltip: "Was der Mieter heute für die Garage zahlt. Nur für den Hinweis, was fehlt, wenn die Aufstockung endet." })}
          {zahl("garageIstBis", "Heutige Garagenmiete bis", "€", { placeholder: "z. B. 50", optional: true, tooltip: "Obergrenze, wenn die heutige Garagenmiete eine Spanne ist. Leer, wenn es nur einen Betrag gibt." })}
        </div>
      </>}

      <div className="subheading">Haus</div>
      <div className="field-grid">
        {text("verwaltung", "Hausverwaltung", { placeholder: "z. B. Muster Hausverwaltung GmbH", optional: true, tooltip: "Steht bei den Angaben zum Haus und als Quelle des Hausgelds. Gerechnet wird damit nichts." })}
        {zahl("vergleichsmieteQm", "Vergleichsmiete am Ort", "€/m²", { placeholder: "z. B. 15,50", optional: true, tooltip: "Ortsübliche Vergleichsmiete laut Mietspiegel. Liegt sie über der gerechneten Miete, zeigt die Berechnung den Spielraum für eine Mieterhöhung." })}
        {text("vergleichsmieteQuelle", "Quelle der Vergleichsmiete", { placeholder: "z. B. Mietspiegel 2026", optional: true, tooltip: "Woher die Vergleichsmiete stammt. Steht neben dem Wert in der Berechnung." })}
        {text("wirtschaftsplan", "Hausgeld laut", { placeholder: "z. B. Wirtschaftsplan 2027", empfohlen: true, tooltip: "Die Quelle der Hausgeld-Zahlen. Steht in der Berechnung bei jeder Hausgeld-Zeile." })}
      </div>
      <Textbereich
        label="Punkte zum Haus (eine Zeile je Punkt)"
        value={a.hausPunkte.join("\n")}
        rows={3}
        onChange={(w) => setze("hausPunkte", w.split("\n").map((z) => z.trim()).filter(Boolean))}
        hint={hinweis("hausPunkte", "Leer: Baujahr aus „Objekt & Kaufpreis“")}
        placeholder={"Baujahr 1994\nEnergieeffizienzklasse C\nAufzug im Haus"}
        tooltip="Kurze Punkte zum Haus für die Seite „Haus und Wohnung“, eine Zeile je Punkt. Gerechnet wird damit nichts."
      />

      <div className="subheading">Nebenkosten über Nachrang und Steuerablauf</div>
      <div className="field-grid">
        {zahl("nachrangZins", "Nachrangdarlehen Zins", "%", { faktor: 100, placeholder: "z. B. 7,1", tooltip: "Zins für ein Nachrangdarlehen über die Kaufnebenkosten. Daraus rechnet die letzte Seite, was es im Monat kostet, die Nebenkosten zur Hälfte oder ganz zu finanzieren." })}
        {zahl("nachrangTilgung", "Nachrangdarlehen Tilgung", "%", { faktor: 100, placeholder: "z. B. 2,0", tooltip: "Anfängliche Tilgung des Nachrangdarlehens. Bestimmt Rate und Laufzeit auf der letzten Seite." })}
        {zahl("lastenwechselMonate", "Lastenwechsel nach dem Kauf", "Monate", { sonst: "In der Regel rund 5 Monate", placeholder: "5", tooltip: "Wie viele Monate nach dem Kauf Nutzen und Lasten übergehen. Steht im Hinweis, ab wann der Steuerfreibetrag wirkt." })}
        {text("version", "Version auf dem Deckblatt", { placeholder: "1", optional: true, tooltip: "Erscheint auf dem Deckblatt. Hochzählen, wenn der Kunde eine geänderte Fassung bekommt." })}
      </div>

    </div>
  );
}

/*
 * Angaben zum Kunden für die Seite „Ihre Ausgangslage“, nur in der
 * Artefaktfassung (29.10.2026): Dort gibt es keine Selbstauskunft. Im CRM
 * kommen sie aus der Selbstauskunft des gewählten Investments. Sie stehen
 * im Bereich „Kunde & Einkommen“ direkt unter Name, Jahresbrutto und
 * Steuerklasse; Alter und Rentenalter stehen unter „Miete & Entwicklung“.
 *
 * Nettoeinkommen und zu versteuerndes Einkommen sind keine doppelte Angabe:
 * Das zu versteuernde Einkommen (Jahr) bestimmt den Steuersatz und damit die
 * Steuerersparnis, das Nettoeinkommen (Monat) nur die Haushaltsrechnung der
 * Ausgangslage („frei im Monat“, Erspartes wieder aufgefüllt).
 */
export function EingabeAusgangslage({ input, aendere, vorgaben }: Omit<Props, "nummer">) {
  const eigen = input.ausfuehrlich ?? {};
  const kunde: VergleichKunde = { ...LEERER_KUNDE, ...(vorgaben.kunde ?? {}), ...(eigen.kunde ?? {}) };
  const setzeKunde = (teil: Partial<VergleichKunde>) => aendere({ ausfuehrlich: { ...eigen, kunde: { ...(eigen.kunde ?? {}), ...teil } } });
  // Auswahl mit „Eigene Angabe“: Die Werte sind die Wörter, die die Seite „Ihre Ausgangslage“ auswertet (etwa „unbefristet“, „keine“).
  const wahl = (k: "anrede" | "familienstand" | "kinder" | "beschaeftigung" | "antrag" | "wohnsituation" | "kredite", label: string, vorschlaege: string[], tooltip: string, x: Feldbedarf = {}) => (
    <AuswahlOderText label={label} value={kunde[k]} vorschlaege={vorschlaege} onChange={(w) => setzeKunde({ [k]: w })} tooltip={tooltip} empfohlen={x.empfohlen} optional={x.optional} placeholder="Eigene Angabe" />
  );
  const kZahl = (k: "netto" | "mieteWarm" | "lebenshaltung" | "kreditRaten" | "kapital", label: string, placeholder: string, tooltip: string, x: Feldbedarf = {}) => (
    <Zahlenfeld label={label} value={kunde[k]} suffix="€" onChange={(w) => setzeKunde({ [k]: w })} placeholder={placeholder} tooltip={tooltip} empfohlen={x.empfohlen} optional={x.optional} />
  );
  return (
    <div className="field-grid" data-testid="eingabe-ausgangslage">
      {wahl("anrede", "Anrede", ["Frau", "Herr"], "Für die Anrede im PDF, etwa „Frau Muster“ in Fußzeile und Investmentsheet.", { empfohlen: true })}
      {kZahl("netto", "Nettoeinkommen im Monat", "z. B. 3.500", "Für die Seite „Ihre Ausgangslage“: was dem Kunden im Monat frei bleibt und wann sein Erspartes nach den Kaufnebenkosten wieder aufgefüllt ist. Ohne Wert entfällt die Seite. Den Steuersatz bestimmt das zu versteuernde Einkommen.", { empfohlen: true })}
      {wahl("familienstand", "Familienstand", ["ledig", "verheiratet", "eingetragene Lebenspartnerschaft", "geschieden", "verwitwet"], "Steht in den Eckdaten der Ausgangslage.", { empfohlen: true })}
      {wahl("kinder", "Kinder", ["keine", "1", "2", "3", "4"], "Steht in den Eckdaten der Ausgangslage.", { optional: true })}
      {wahl("beschaeftigung", "Beschäftigung", ["Angestellt, unbefristet", "Angestellt, befristet", "Beamtet", "Selbstständig", "Rente oder Pension"], "Steht in den Eckdaten. „unbefristet“ ändert die Überschrift der Ausgangslage („Sicheres Einkommen …“).", { optional: true })}
      {wahl("antrag", "Antrag", ["allein, ohne Mitantragsteller", "zu zweit, mit Mitantragsteller"], "Steht in den Eckdaten der Ausgangslage.", { optional: true })}
      {wahl("wohnsituation", "Wohnsituation", ["mietfrei", "zur Miete", "Eigentum"], "Steht in den Eckdaten der Ausgangslage. Die Warmmiete daneben zählt in die Haushaltsrechnung.", { empfohlen: true })}
      {kZahl("mieteWarm", "Warmmiete heute", "z. B. 950", "Zählt in die Haushaltsrechnung der Ausgangslage („frei im Monat“). Bei mietfrei oder Eigentum 0 lassen.", { empfohlen: true })}
      {kZahl("lebenshaltung", "Lebenshaltung im Monat", "z. B. 1.000", "Zählt in die Haushaltsrechnung der Ausgangslage („frei im Monat“).", { empfohlen: true })}
      {wahl("kredite", "Laufende Kredite", ["keine"], "Steht in den Eckdaten. „keine“ oder kurz beschreiben, etwa „1 Kredit, 249 € im Monat“; die Rate gehört ins Feld daneben.", { optional: true })}
      {kZahl("kreditRaten", "Kreditraten im Monat", "z. B. 0", "Zählt in die Haushaltsrechnung der Ausgangslage („frei im Monat“).", { optional: true })}
      {kZahl("kapital", "Bank- und Sparguthaben", "z. B. 40.000", "Zeigt, ob das Ersparte die Kaufnebenkosten trägt, und steht als „Ihr Kapital“ in der Ausgangslage.", { empfohlen: true })}
    </div>
  );
}
