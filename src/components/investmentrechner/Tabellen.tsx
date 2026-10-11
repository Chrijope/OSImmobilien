import type { Jahreswert } from "@/lib/investmentrechner/rechenkern";
import { formatEuro, formatProzent } from "@/lib/investmentrechner/formatierer";
import { useRechnerTexte } from "./RechnerSprache";
import { Neu } from "./Felder";

/*
 * Jahrestabellen des Investmentrechners (Original _e und ve).
 * Beschriftung und Beträge folgen der Sprache des Drucks (`RechnerSprache`).
 */

interface TabellenProps {
  years: Jahreswert[];
  compact?: boolean;
}

/**
 * Wechselt der Zins des Bankdarlehens im Verlauf, oder gibt es Sondertilgungen?
 * Dann zeigt die Tabelle je eine Spalte dafür (seit dem 11.10.2026), sonst
 * bleibt sie, wie sie war.
 */
export function verlaufsspalten(years: Jahreswert[]): { zins: boolean; sondertilgung: boolean } {
  const saetze = years.map((jahr) => jahr.darlehen?.bank?.zinssatz ?? 0).filter((satz) => satz > 0);
  return {
    zins: saetze.some((satz) => Math.abs(satz - saetze[0]) > 1e-9),
    sondertilgung: years.some((jahr) => (jahr.sondertilgung ?? 0) > 0),
  };
}

/**
 * Die Tabelle „Darlehen je Jahr“ gibt es seit dem 07.10.2026 mit KfW-Darlehen,
 * seit dem 11.10.2026 auch mit zweitem Bankdarlehen, Sondertilgung oder
 * wechselndem Zins. Sonst genügt die Cashflowtabelle.
 */
export function zeigeDarlehenstabelle(result: { kfwLoanAmount: number; secondLoanAmount?: number; years: Jahreswert[] }): boolean {
  const extra = verlaufsspalten(result.years);
  return result.kfwLoanAmount > 0 || (result.secondLoanAmount ?? 0) > 0 || extra.zins || extra.sondertilgung;
}

/** Cashflow, Steuer und Tilgung je Jahr. */
export function Cashflowtabelle({ years, compact = false }: TabellenProps) {
  const { sprache, texte } = useRechnerTexte();
  const t = texte.cashflowTabelle;
  const euro = (wert: number) => formatEuro(wert, sprache);
  const extra = verlaufsspalten(years);
  return (
    <div className={`table-scroll ${compact ? "compact-table" : ""}`}>
      <table>
        <thead>
          <tr>
            <th>{t.jahr}</th>
            <th>{t.miete}</th>
            {extra.zins && (
              <th>
                {t.zinsBank}
                <Neu />
              </th>
            )}
            <th>{t.zinsen}</th>
            <th>{t.tilgung}</th>
            {extra.sondertilgung && (
              <th>
                {t.sondertilgung}
                <Neu />
              </th>
            )}
            <th>{t.kosten}</th>
            <th>{t.cfVorSteuer}</th>
            <th>{t.steuereffekt}</th>
            <th>{t.cfNachSteuer}</th>
            <th>{t.eigenkapital}</th>
          </tr>
        </thead>
        <tbody>
          {years.map((jahr) => (
            <tr key={jahr.year}>
              <td>{jahr.year}</td>
              <td>{euro(jahr.effectiveRent)}</td>
              {extra.zins && <td>{jahr.darlehen.bank.zinssatz ? formatProzent(jahr.darlehen.bank.zinssatz, sprache) : "–"}</td>}
              <td>{euro(jahr.interest)}</td>
              {/* Mit Sondertilgung, damit die Zeile aufgeht; sie steht daneben noch einmal einzeln. */}
              <td>{euro(jahr.principal)}</td>
              {extra.sondertilgung && <td>{euro(jahr.sondertilgung)}</td>}
              {/* Mit der Rücklagenzuführung, damit Miete minus Zinsen, Tilgung und Kosten den Cashflow ergibt. */}
              <td>{euro(jahr.operatingCosts + (jahr.reserveContribution ?? 0))}</td>
              <td className={jahr.cashflowBeforeTax < 0 ? "negative" : "positive"}>
                {euro(jahr.cashflowBeforeTax)}
              </td>
              <td className={jahr.taxEffect < 0 ? "negative" : "positive"}>{euro(jahr.taxEffect)}</td>
              <td className={jahr.cashflowAfterTax < 0 ? "negative" : "positive"}>
                {euro(jahr.cashflowAfterTax)}
              </td>
              <td>{euro(jahr.propertyEquity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Zu versteuerndes Einkommen und Steuer vor und nach Erwerb je Jahr. */
export function Steuertabelle({ years, compact = false }: TabellenProps) {
  const { sprache, texte } = useRechnerTexte();
  const t = texte.steuerTabelle;
  const euro = (wert: number) => formatEuro(wert, sprache);
  return (
    <div className={`table-scroll ${compact ? "compact-table" : ""}`}>
      <table>
        <thead>
          <tr>
            <th>{t.jahr}</th>
            <th>{t.zveVorher}</th>
            <th>{t.ergebnisVuV}</th>
            <th>{t.zveNachher}</th>
            <th>{t.steuerVorher}</th>
            <th>{t.steuerNachher}</th>
            <th>{t.steuereffekt}</th>
          </tr>
        </thead>
        <tbody>
          {years.map((jahr) => (
            <tr key={jahr.year}>
              <td>{jahr.year}</td>
              <td>{euro(jahr.taxableIncomeBefore)}</td>
              <td className={jahr.allocatedTaxableResult < 0 ? "negative" : "positive"}>
                {euro(jahr.allocatedTaxableResult)}
              </td>
              <td>{euro(jahr.taxableIncomeAfter)}</td>
              <td>{euro(jahr.taxBefore.totalTax)}</td>
              <td>{euro(jahr.taxAfter.totalTax)}</td>
              <td className={jahr.taxEffect < 0 ? "negative" : "positive"}>
                {jahr.taxEffect >= 0 ? "+" : ""}
                {euro(jahr.taxEffect)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Die Darlehen einzeln je Jahr: Rate, Zinsen, Tilgung und Restschuld für
 * jedes Darlehen mit Betrag und zusammen. Seit dem 07.10.2026, gezeigt nur
 * mit KfW-Darlehen; ohne bleibt die Cashflowtabelle allein.
 */
export function Darlehenstabelle({ years, compact = false }: TabellenProps) {
  const { sprache, texte } = useRechnerTexte();
  const t = texte.darlehenTabelle;
  const euro = (wert: number) => formatEuro(wert, sprache);
  const arten = (["bank", "bank2", "kfw", "nachrang"] as const).filter((art) =>
    years.some((jahr) => (jahr.darlehen[art]?.payment ?? 0) > 0 || (jahr.darlehen[art]?.closingBalance ?? 0) > 0),
  );
  const namen = { bank: t.bank, bank2: t.bank2, kfw: t.kfw, nachrang: t.nachrang };
  const zuschuss = years.find((jahr) => jahr.darlehen.kfw.tilgungszuschuss > 0);
  const zellen = (schluessel: string, rate: number, zinsen: number, tilgung: number, rest: number, fett = false) =>
    [rate, zinsen, tilgung, rest].map((wert, index) => (
      <td key={`${schluessel}-${index}`} className={fett ? "darlehen-summe" : undefined}>
        {euro(wert)}
      </td>
    ));
  return (
    <>
      <div className={`table-scroll ${compact ? "compact-table" : ""}`}>
        <table className="darlehen-tabelle">
          <thead>
            <tr>
              <th rowSpan={2}>{t.jahr}</th>
              {[...arten.map((art) => namen[art]), t.gesamt].map((name) => (
                <th key={name} colSpan={4}>
                  {name}
                </th>
              ))}
            </tr>
            <tr>
              {[...arten, "gesamt"].flatMap((art) =>
                [t.rate, t.zinsen, t.tilgung, t.restschuld].map((titel) => <th key={`${art}-${titel}`}>{titel}</th>),
              )}
            </tr>
          </thead>
          <tbody>
            {years.map((jahr) => (
              <tr key={jahr.year}>
                <td>{jahr.year}</td>
                {arten.flatMap((art) => {
                  const d = jahr.darlehen[art];
                  return zellen(art, d.payment, d.interest, d.principal, d.closingBalance);
                })}
                {zellen("gesamt", jahr.debtService, jahr.interest, jahr.principal, jahr.remainingDebt, true)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {zuschuss && (
        <p className="expose-fineprint">{t.zuschussHinweis(euro(zuschuss.darlehen.kfw.tilgungszuschuss), zuschuss.year)}</p>
      )}
    </>
  );
}
