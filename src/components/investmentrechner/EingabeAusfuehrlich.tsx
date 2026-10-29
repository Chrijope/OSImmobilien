import type { InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import type { VergleichKunde } from "@/lib/investmentrechner/kundenObjektvergleich";
import { LEERER_KUNDE, wirksameAngaben, type AusfuehrlichAngaben } from "@/lib/investmentrechner/ausfuehrlicheBerechnung";
import { Textbereich, Textfeld, Zahlenfeld } from "./Felder";

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
  const zahl = (k: keyof AusfuehrlichAngaben, label: string, suffix: string, sonst?: string, faktor = 1) => (
    <Zahlenfeld
      label={label}
      value={Math.round((a[k] as number) * faktor * 1000) / 1000}
      suffix={suffix}
      onChange={(w) => setze(k, (w / faktor) as never)}
      hint={hinweis(k, sonst)}
    />
  );
  const text = (k: "nr" | "lage" | "verwaltung" | "vergleichsmieteQuelle" | "wirtschaftsplan" | "version", label: string, platzhalter?: string) => (
    <Textfeld label={label} value={a[k]} placeholder={platzhalter} onChange={(w) => setze(k, w)} hint={hinweis(k)} />
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
        {text("nr", "Wohnungsnummer (WE)", "12")}
        {text("lage", "Lage im Haus", "3. OG links")}
        {zahl("kpListe", "Listenpreis vor Anpassung", "€", "Nur wenn der Kaufpreis angepasst wurde („statt …“)")}
        {zahl("garagen", "Anzahl Garagen/Stellplätze", "", "Nur die erste hat einen Kaufpreis")}
      </div>

      <div className="subheading">Miete und Subvention</div>
      <div className="field-grid">
        {zahl("mieteSubQm", "Gerechnete Kaltmiete (subventioniert)", "€/m²", "Leer: die heutige Kaltmiete aus „Miete & Entwicklung“")}
        {zahl("subventionMonate", "Subvention längstens", "Monate")}
        {zahl("kappung", "Kappungsgrenze", "%", "20 %, in Gemeinden mit Verordnung 15 %", 100)}
        {zahl("mieteZielQm", "Zielmiete", "€/m²", "Ohne Vorgabe aus der Mietsteigerung gerechnet")}
        {zahl("mieteZielJahr", "Zielmiete erreicht im Jahr", "")}
      </div>

      {a.garagen > 0 && <>
        <div className="subheading">Garage</div>
        <div className="field-grid">
          {zahl("garageMiete1", "Garagenmiete 1. Jahr (gerechnet, je Garage)", "€", "Leer: die Stellplatzmiete aus „Miete & Entwicklung“")}
          {zahl("garageMieteZiel", "Garagenmiete im Zieljahr", "€")}
          {zahl("garageIstVon", "Heutige Garagenmiete von", "€")}
          {zahl("garageIstBis", "Heutige Garagenmiete bis", "€")}
        </div>
      </>}

      <div className="subheading">Haus</div>
      <div className="field-grid">
        {text("verwaltung", "Hausverwaltung")}
        {zahl("vergleichsmieteQm", "Vergleichsmiete am Ort", "€/m²")}
        {text("vergleichsmieteQuelle", "Quelle der Vergleichsmiete", "Mietspiegel 2026")}
        {text("wirtschaftsplan", "Hausgeld laut", "Wirtschaftsplan 2027")}
      </div>
      <Textbereich
        label="Punkte zum Haus (eine Zeile je Punkt)"
        value={a.hausPunkte.join("\n")}
        rows={3}
        onChange={(w) => setze("hausPunkte", w.split("\n").map((z) => z.trim()).filter(Boolean))}
        hint={hinweis("hausPunkte", "Leer: Baujahr aus „Objekt & Kaufpreis“")}
      />

      <div className="subheading">Nebenkosten über Nachrang und Steuerablauf</div>
      <div className="field-grid">
        {zahl("nachrangZins", "Nachrangdarlehen Zins", "%", undefined, 100)}
        {zahl("nachrangTilgung", "Nachrangdarlehen Tilgung", "%", undefined, 100)}
        {zahl("lastenwechselMonate", "Lastenwechsel nach dem Kauf", "Monate", "In der Regel rund 5 Monate")}
        {text("version", "Version auf dem Deckblatt", "1")}
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
  const kText = (k: "anrede" | "familienstand" | "kinder" | "beschaeftigung" | "antrag" | "wohnsituation" | "kredite", label: string, platzhalter?: string) => (
    <Textfeld label={label} value={kunde[k]} placeholder={platzhalter} onChange={(w) => setzeKunde({ [k]: w })} />
  );
  const kZahl = (k: "netto" | "mieteWarm" | "lebenshaltung" | "kreditRaten" | "kapital", label: string, hint?: string) => (
    <Zahlenfeld label={label} value={kunde[k]} suffix="€" onChange={(w) => setzeKunde({ [k]: w })} hint={hint} />
  );
  return (
    <div className="field-grid" data-testid="eingabe-ausgangslage">
      {kText("anrede", "Anrede", "Frau")}
      {kZahl("netto", "Nettoeinkommen im Monat", "Für „Ihre Ausgangslage“ im PDF; ohne Wert entfällt die Seite")}
      {kText("familienstand", "Familienstand", "ledig")}
      {kText("kinder", "Kinder", "keine")}
      {kText("beschaeftigung", "Beschäftigung", "Angestellt, unbefristet, seit 2015")}
      {kText("antrag", "Antrag", "allein, ohne Mitantragsteller")}
      {kText("wohnsituation", "Wohnsituation", "zur Miete, 950 € warm")}
      {kZahl("mieteWarm", "Warmmiete heute")}
      {kZahl("lebenshaltung", "Lebenshaltung im Monat")}
      {kText("kredite", "Laufende Kredite", "keine")}
      {kZahl("kreditRaten", "Kreditraten im Monat")}
      {kZahl("kapital", "Bank- und Sparguthaben")}
    </div>
  );
}
