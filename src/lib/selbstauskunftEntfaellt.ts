/**
 * Vermerk „Kunde finanziert selbst, keine Selbstauskunft nötig".
 *
 * ANLASS
 *
 * Ein Kunde war selbst Banker und hat komplett aus eigenen Mitteln
 * finanziert. Eine Selbstauskunft hat er nie eingereicht, und er musste auch
 * keine. Im System blieb der Vorgang damit stehen: Die Objektauswahl war
 * gesperrt, die Reservierung ebenso. Der einzige Ausweg wäre eine leere
 * Selbstauskunft mit erfundenen Zahlen gewesen, also dauerhaft falsche
 * Angaben im Kundenprofil.
 *
 * Deshalb dieser Vermerk. Er sagt ausdrücklich: Die Selbstauskunft entfällt
 * bewusst. Von da an läuft der Vorgang normal weiter über Objektauswahl,
 * Reservierung und alle folgenden Schritte, und die Bonitätsunterlagen sind
 * nicht mehr erforderlich. Das Finanzierungsangebot lädt der Partner wie
 * gewohnt unter „Finanzierung" hoch.
 *
 * WO ER LIEGT
 *
 * In `investments.meta.selbstauskunftEntfaellt`, nach dem Muster von
 * `eigenfinanzierungStore.ts`. `meta` ist ein jsonb-Feld, es braucht also
 * keine neue Spalte und keine Migration für die Ablage selbst.
 *
 * WARUM ER NICHT STILL VERSCHWINDET
 *
 * Geschrieben wird über `setInvestmentMeta`, und das geht über den
 * Datenbankaufruf `merge_investment_meta`. Der mischt serverseitig nur die
 * übergebenen Schlüssel in das vorhandene `meta` (`meta || _updates`), er
 * baut es nicht neu. Der zweite Schreibweg, `updateInvestment`, setzt zwar
 * das ganze `meta` neu zusammen, übernimmt dabei aber in
 * `buildInvestmentMeta` zuerst das vorhandene `meta` und schreibt nur die
 * bekannten Investment-Felder darüber. Beide Wege lassen fremde Schlüssel
 * also stehen. Der in `bewerbungStore.ts` bekannte Fallstrick, dass `meta`
 * beim Speichern komplett neu gebaut wird, besteht bei den Investments
 * nicht.
 */
import {
  getInvestmentMeta,
  setInvestmentMeta,
} from "./investmentsStore";

/** Schlüssel in `investments.meta`. Auch die Datenbank kennt ihn namentlich. */
export const SA_ENTFAELLT_SCHLUESSEL = "selbstauskunftEntfaellt";

/**
 * Wer den Vermerk setzen und zurücknehmen darf: Vertriebspartner und alles
 * darüber. Die Setterin ausdrücklich nicht, sie arbeitet nur zuliefernd und
 * sieht Investments ohnehin nur zur Ansicht.
 *
 * Die Liste allein ist keine Zugriffskontrolle, ein ausgeblendeter Schalter
 * ist keine. Maßgeblich ist zusätzlich die Prüfung in der Datenbank, siehe
 * `supabase/migrations/20260916230000_sa_entfaellt_nur_ab_vertriebspartner.sql`.
 */
export const SA_ENTFAELLT_ROLLEN = [
  "admin",
  "inhaber",
  "vertriebsleiter",
  "vertriebspartner",
  "backoffice",
] as const;

export interface SaEntfaelltVermerk {
  aktiv: boolean;
  gesetztVonName?: string;
  gesetztVonId?: string;
  gesetztVonRolle?: string;
  gesetztAm?: string;
  zurueckgenommenAm?: string;
  zurueckgenommenVonName?: string;
}

const LEER: SaEntfaelltVermerk = { aktiv: false };

export function darfSelbstauskunftEntfallen(rolle?: string | null): boolean {
  return (SA_ENTFAELLT_ROLLEN as readonly string[]).includes(String(rolle || ""));
}

export function getSelbstauskunftEntfaellt(investmentId?: string | null): SaEntfaelltVermerk {
  if (!investmentId) return LEER;
  return getInvestmentMeta<SaEntfaelltVermerk>(investmentId, SA_ENTFAELLT_SCHLUESSEL, LEER) || LEER;
}

/** Kurzfrage für die Oberfläche: Entfällt die Selbstauskunft bei diesem Vorgang? */
export function selbstauskunftEntfaellt(investmentId?: string | null): boolean {
  return !!getSelbstauskunftEntfaellt(investmentId).aktiv;
}

/**
 * Vermerk setzen.
 *
 * Gibt `null` zurück, wenn die Rolle ihn nicht setzen darf. Die Prüfung steht
 * bewusst hier und nicht nur an der Oberfläche, damit sie nicht an einer
 * zweiten Aufrufstelle vergessen wird.
 */
export function setzeSelbstauskunftEntfaellt(
  investmentId: string,
  von: { name: string; id?: string; rolle: string },
): SaEntfaelltVermerk | null {
  if (!darfSelbstauskunftEntfallen(von.rolle)) return null;
  const vermerk: SaEntfaelltVermerk = {
    aktiv: true,
    gesetztVonName: von.name,
    gesetztVonId: von.id,
    gesetztVonRolle: von.rolle,
    gesetztAm: new Date().toISOString(),
  };
  setInvestmentMeta(investmentId, SA_ENTFAELLT_SCHLUESSEL, vermerk);
  return vermerk;
}

/**
 * Vermerk zurücknehmen.
 *
 * Bereits erreichte Pipelinestufen bleiben, wo sie sind. Eine Rücknahme darf
 * niemanden zurückwerfen, sonst verliert ein Vorgang durch einen Klick seinen
 * Stand. Wer bisher gesetzt hat, bleibt im Vermerk stehen, damit später
 * nachvollziehbar ist, was passiert ist.
 */
export function nimmSelbstauskunftEntfaelltZurueck(
  investmentId: string,
  von: { name: string; rolle: string },
): SaEntfaelltVermerk | null {
  if (!darfSelbstauskunftEntfallen(von.rolle)) return null;
  const bisher = getSelbstauskunftEntfaellt(investmentId);
  const vermerk: SaEntfaelltVermerk = {
    ...bisher,
    aktiv: false,
    zurueckgenommenAm: new Date().toISOString(),
    zurueckgenommenVonName: von.name,
  };
  setInvestmentMeta(investmentId, SA_ENTFAELLT_SCHLUESSEL, vermerk);
  return vermerk;
}

/**
 * Werden Bonitätsunterlagen gebraucht?
 *
 * Nein, wenn der Kunde selbst finanziert. Der Bereich wird dann nicht
 * ausgeblendet, sondern gekennzeichnet: Ein verschwundener Abschnitt sieht
 * aus wie ein Fehler.
 */
export function bonitaetsunterlagenErforderlich(investmentId?: string | null): boolean {
  return !selbstauskunftEntfaellt(investmentId);
}

/** Datum und Person für den sichtbaren Vermerk an der Selbstauskunft-Karte. */
export function saEntfaelltText(vermerk: SaEntfaelltVermerk): string {
  if (!vermerk.aktiv) return "";
  const datum = vermerk.gesetztAm
    ? new Date(vermerk.gesetztAm).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";
  const wer = vermerk.gesetztVonName || "";
  if (datum && wer) return `Vermerkt am ${datum} von ${wer}.`;
  if (datum) return `Vermerkt am ${datum}.`;
  if (wer) return `Vermerkt von ${wer}.`;
  return "";
}
