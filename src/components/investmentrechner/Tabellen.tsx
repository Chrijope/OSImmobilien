import type { Jahreswert } from "@/lib/investmentrechner/rechenkern";
import { formatEuro } from "@/lib/investmentrechner/formatierer";
import { useRechnerTexte } from "./RechnerSprache";

/*
 * Jahrestabellen des Investmentrechners (Original _e und ve).
 * Beschriftung und Beträge folgen der Sprache des Drucks (`RechnerSprache`).
 */

interface TabellenProps {
  years: Jahreswert[];
  compact?: boolean;
}

/** Cashflow, Steuer und Tilgung je Jahr. */
export function Cashflowtabelle({ years, compact = false }: TabellenProps) {
  const { sprache, texte } = useRechnerTexte();
  const t = texte.cashflowTabelle;
  const euro = (wert: number) => formatEuro(wert, sprache);
  return (
    <div className={`table-scroll ${compact ? "compact-table" : ""}`}>
      <table>
        <thead>
          <tr>
            <th>{t.jahr}</th>
            <th>{t.miete}</th>
            <th>{t.zinsen}</th>
            <th>{t.tilgung}</th>
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
              <td>{euro(jahr.interest)}</td>
              <td>{euro(jahr.principal)}</td>
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
  const arten = (["bank", "kfw", "nachrang"] as const).filter((art) =>
    years.some((jahr) => jahr.darlehen[art].payment > 0 || jahr.darlehen[art].closingBalance > 0),
  );
  const namen = { bank: t.bank, kfw: t.kfw, nachrang: t.nachrang };
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
