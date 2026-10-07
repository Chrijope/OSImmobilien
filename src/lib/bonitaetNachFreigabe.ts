import { pflichtBonitaetDocs } from "@/lib/bonitaetDocs";
import { notifyUser } from "@/lib/bellNotifications";
import { cacheGet } from "@/lib/dataCache";
import { getInvestmentMeta, setInvestmentMeta } from "@/lib/investmentsStore";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hinweis, wenn eine Bonitätsunterlage nach der Freigabe wegfällt.
 *
 * ANLASS (Christian, 25.09.2026)
 *
 * Die Finanzierung ist im Kundenprofil schon ab der unterschriebenen
 * Reservierung offen, und der Merker `bonitaetFreigabeGemeldetAm` wird nie
 * zurückgesetzt. Wird danach eine Pflichtunterlage abgelehnt oder gelöscht,
 * arbeitet der Finanzierungspartner womöglich mit einem Stand, den es so nicht
 * mehr gibt. Eine neue Sperre soll daraus nicht werden, die Finanzierung bleibt
 * frei und der Merker bleibt stehen. Aber der Finanzierungspartner soll davon
 * erfahren.
 *
 * WER DIE GLOCKE BEKOMMT
 *
 * Die Finanzierungspartner des Investments, also dieselben Menschen, die die
 * Pipeline-Karte unter „Finanzierungspartner" nennt. Eine Zuordnung je
 * Investment gibt es nicht, maßgeblich ist die Rolle `finanzierungspartner`
 * (siehe `src/lib/finanzierungspartner.ts`). Nur wenn es niemanden mit dieser
 * Rolle gibt, gehen Admin und Inhaber an ihre Stelle, damit der Hinweis nicht
 * ins Leere fällt. Ermittelt wird über die Nutzerkennung, nie über den Namen.
 *
 * KEINE DOPPELTEN HINWEISE
 *
 * Je Dokument und Fassung genau ein Hinweis. Die Fassung ist der Dateiname im
 * Speicher, und der trägt den Zeitpunkt des Hochladens. Wird dieselbe Fassung
 * erst abgelehnt und dann gelöscht, bleibt es bei einem Hinweis; lädt der Kunde
 * neu hoch und fällt die neue Fassung wieder weg, gibt es einen neuen. Die
 * Merkmarke liegt am Investment unter `bonitaetNachFreigabeHinweise`, der Wert
 * ist der Zeitpunkt des Hinweises. Aus dem Kundenportal kann der Kunde das
 * Investment nicht beschreiben; dort übernimmt der eindeutige `dedupe_key` der
 * Warteschlange `scheduled_notifications` diese Aufgabe.
 */

export type BonitaetNachFreigabeAktion = "abgelehnt" | "geloescht";

/** Schlüssel der Merkmarke in `investments.meta`. */
export const HINWEIS_MERKER = "bonitaetNachFreigabeHinweise";

/** Stufen, in denen die Finanzierung bereits läuft oder hinter uns liegt. */
const STUFEN_AB_FINANZIERUNG = ["finanzierung", "notar", "faelligkeit", "abrechnung", "abgeschlossen"];

type Meta = Record<string, unknown> | null | undefined;

/** Die Beschäftigungsart aus der Selbstauskunft, wie `finanzierungIstFrei` sie liest. */
function beschaeftigungsart(meta: Meta): string | undefined {
  const m = meta || {};
  const sa = (m.saData || m.saSnapshot) as Record<string, unknown> | undefined;
  return (sa?.beschaeftigungsart as string | undefined) || undefined;
}

/**
 * War die Finanzierung zu diesem Stand schon frei?
 *
 * Frei heißt: Der Merker der Bonitätsfreigabe ist gesetzt, oder der Vorgang
 * steht schon auf Finanzierung oder dahinter. Gelesen wird der Stand VOR der
 * Ablehnung bzw. Löschung.
 */
export function finanzierungWarFrei(metaVorher: Meta): boolean {
  const m = metaVorher || {};
  if (m.bonitaetFreigabeGemeldetAm) return true;
  return STUFEN_AB_FINANZIERUNG.includes(String(m.pipelineStufe || ""));
}

/** Gehört das Dokument zu den Pflichtunterlagen dieses Investments? */
export function istPflichtUnterlage(docName: string, metaVorher: Meta): boolean {
  // Kunde finanziert selbst: Keine Bonitätsunterlage ist Pflicht.
  if ((metaVorher?.selbstauskunftEntfaellt as { aktiv?: boolean } | undefined)?.aktiv) return false;
  return pflichtBonitaetDocs(beschaeftigungsart(metaVorher)).includes(docName);
}

/** Braucht es einen Hinweis? Reine Prüfung, ohne Speicherzugriff. */
export function hinweisNoetig(docName: string, metaVorher: Meta): boolean {
  return istPflichtUnterlage(docName, metaVorher) && finanzierungWarFrei(metaVorher);
}

/**
 * Welche Fassung des Dokuments betroffen ist.
 *
 * Der Speicherpfad endet auf einen Dateinamen mit dem Zeitpunkt des
 * Hochladens. Fehlt eine Datei, etwa bei einem nur gesetzten Status, zählt der
 * Tag: An einem Tag gibt es dann höchstens einen Hinweis je Dokument.
 */
export function fassungDerUnterlage(docName: string, metaVorher: Meta, jetzt: Date = new Date()): string {
  const urls = ((metaVorher || {}).docFileUrls || {}) as Record<string, unknown>;
  const url = String(urls[docName] || "").split("?")[0];
  const datei = url.split("/").filter(Boolean).pop();
  return datei || `ohne-datei-${jetzt.toISOString().slice(0, 10)}`;
}

/** Der Schlüssel für die Merkmarke: Dokument und Fassung. */
export function hinweisSchluessel(docName: string, fassung: string): string {
  return `${docName}|${fassung}`;
}

export function hinweisText(aktion: BonitaetNachFreigabeAktion, docName: string, kundeName: string) {
  const was = aktion === "abgelehnt" ? "abgelehnt" : "gelöscht";
  return {
    titel: `Bonitätsunterlage nach der Freigabe ${was}`,
    nachricht: `Bonitätsunterlage nach der Freigabe ${was}: ${docName} bei ${kundeName}. Die Finanzierung bleibt offen, bitte den Stand prüfen.`,
  };
}

/**
 * Die Empfänger: alle Finanzierungspartner, sonst Admin und Inhaber.
 *
 * Reine Auswahl aus einer Rollenliste, damit sie sich ohne Datenbank prüfen
 * lässt.
 */
export function empfaengerAusRollen(rollen: { user_id?: string | null; role?: string | null }[]): string[] {
  const mit = (erlaubt: string[]) => [
    ...new Set(
      rollen
        .filter((r) => r.user_id && erlaubt.includes(String(r.role || "")))
        .map((r) => String(r.user_id)),
    ),
  ];
  const partner = mit(["finanzierungspartner"]);
  return partner.length > 0 ? partner : mit(["admin", "inhaber"]);
}

/** Die Rollenliste lesen. Zuerst frisch aus der Datenbank, sonst aus dem Zwischenspeicher. */
async function ladeRollen(): Promise<{ user_id?: string | null; role?: string | null }[]> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["finanzierungspartner", "admin", "inhaber"]);
    if (!error && data && data.length > 0) return data as { user_id: string; role: string }[];
  } catch {
    // Rückfall unten.
  }
  return (cacheGet("user_roles") || []) as { user_id?: string; role?: string }[];
}

export interface BonitaetNachFreigabeEingabe {
  investmentId: string;
  kundeId: string;
  kundeName: string;
  docName: string;
  aktion: BonitaetNachFreigabeAktion;
  /** Das Investment-Meta VOR der Ablehnung bzw. Löschung. */
  metaVorher: Meta;
}

/**
 * Hinweis aus dem CRM.
 *
 * Gibt zurück, ob ein Hinweis hinausging. Fehler werden protokolliert und
 * nie nach oben gereicht: Die eigentliche Aktion, also Ablehnen oder Löschen,
 * darf daran nicht scheitern.
 */
export async function meldeBonitaetNachFreigabe(e: BonitaetNachFreigabeEingabe): Promise<boolean> {
  try {
    if (!hinweisNoetig(e.docName, e.metaVorher)) return false;

    const schluessel = hinweisSchluessel(e.docName, fassungDerUnterlage(e.docName, e.metaVorher));
    // Die Merkmarke aus dem Zwischenspeicher lesen, nicht aus `metaVorher`:
    // Ein zweiter Aufruf im selben Augenblick sieht so schon die erste Marke.
    const bisher = (getInvestmentMeta<Record<string, string>>(e.investmentId, HINWEIS_MERKER, {}) || {}) as Record<string, string>;
    if (bisher[schluessel]) return false;
    // Marke VOR dem Versand setzen. Ein ausgebliebener Hinweis ist der
    // harmlosere Fehler, verglichen mit einem, der mehrfach hinausgeht.
    setInvestmentMeta(e.investmentId, HINWEIS_MERKER, { ...bisher, [schluessel]: new Date().toISOString() });

    const empfaenger = empfaengerAusRollen(await ladeRollen());
    if (empfaenger.length === 0) return false;

    const { titel, nachricht } = hinweisText(e.aktion, e.docName, e.kundeName);
    const link = `/kunden/${e.kundeId}?tab=investments&investment=${e.investmentId}`;
    for (const userId of empfaenger) notifyUser(userId, { titel, nachricht, link });
    return true;
  } catch (fehler) {
    console.error("[bonitaetNachFreigabe] Hinweis nicht gesendet:", fehler);
    return false;
  }
}

/**
 * Hinweis aus dem Kundenportal.
 *
 * Der Kunde darf weder die Rollenliste lesen noch fremden Nutzern eine Glocke
 * schreiben, noch das Investment ändern. Er legt deshalb einen Eintrag in die
 * Warteschlange `scheduled_notifications`, die jede Minute abgearbeitet wird
 * und an alle Nutzer der Rolle `finanzierungspartner` verteilt. Der eindeutige
 * `dedupe_key` verhindert den zweiten Eintrag für dieselbe Fassung.
 *
 * Grenze: Den Rückfall auf Admin und Inhaber, falls niemand die Rolle trägt,
 * kann das Portal nicht leisten. Die Warteschlange vermerkt einen solchen
 * Eintrag dann als übersprungen.
 */
export async function meldeBonitaetNachFreigabeAusPortal(e: BonitaetNachFreigabeEingabe): Promise<boolean> {
  try {
    if (!hinweisNoetig(e.docName, e.metaVorher)) return false;
    const schluessel = hinweisSchluessel(e.docName, fassungDerUnterlage(e.docName, e.metaVorher));
    const { titel, nachricht } = hinweisText(e.aktion, e.docName, e.kundeName);
    const { error } = await supabase.from("scheduled_notifications").insert({
      target_user_id: "00000000-0000-0000-0000-000000000000",
      target_role: "finanzierungspartner",
      titel,
      nachricht,
      link: `/kunden/${e.kundeId}?tab=investments&investment=${e.investmentId}`,
      trigger_at: new Date().toISOString(),
      kontakt_id: e.kundeId,
      investment_id: e.investmentId,
      dedupe_key: `bonitaet_nach_freigabe:${e.investmentId}:${schluessel}`,
    });
    // 23505: Diese Fassung wurde schon gemeldet. Das ist kein Fehler.
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[bonitaetNachFreigabe] Portalhinweis nicht eingereiht:", error);
      return false;
    }
    return !error;
  } catch (fehler) {
    console.error("[bonitaetNachFreigabe] Portalhinweis nicht eingereiht:", fehler);
    return false;
  }
}
