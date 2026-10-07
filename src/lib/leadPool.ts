import { MAX_KONTAKTVERSUCHE } from "./kontaktversuchSchedule";
import { istRuecklaeufer } from "./leadRueckgabe";
import type { KundeData } from "./kundenStore";
import { istKonfiguratorQuelle } from "../../supabase/functions/_shared/handbuch-funnel.ts";

/**
 * Der offene Lead-Pool: welche Leads liegen unbearbeitet herum, und wer darf
 * sie sehen.
 *
 * Diese Datei gibt es, damit die Liste in `LeadVerwaltung` und der Zaehler in
 * der Seitenleiste nicht mehr auseinanderlaufen koennen. Vorher hatte jede
 * Stelle ihre eigene Kopie der Bedingungen, und die Kopien waren
 * unterschiedlich: der Zaehler filterte noch ueber das Freitextfeld `berater`,
 * die Liste bereits ueber `zustaendig_id`. Eine Zahl, hinter der weniger steht
 * als angekuendigt, ist schlimmer als keine Zahl.
 */

/**
 * Die Nutzer-Kennung von Christian Peetz. Oeffnet seit dem 27.09.2026 hier
 * nichts mehr: Welche Pool-Leads jemand sieht, richtet sich allein nach der
 * aktiven Rolle. Die Konstante bleibt, weil `bewerberprozessFreigabe.ts` sie
 * fuer seinen Eintrag nutzt.
 */
export const CHRISTIAN_PEETZ_ID = "27ccfbab-f949-4484-90b1-7dffca6a65c9";

/** Ab so vielen Tagen im Pool wird ein Lead gelb markiert. */
export const POOL_LEAD_WARNUNG_TAGE = 1;

/**
 * Ab so vielen Tagen im Pool wird ein Lead rot markiert.
 *
 * Die Zahl ist bewusst dieselbe wie in der Nachtpruefung
 * (`nachtpruefung_kontakt_ohne_zustaendigen`, Migration
 * `20260807130000_nachtpruefung_pool_drei_tage.sql`): Rot in der Liste und die
 * naechtliche Meldung sollen denselben Lead meinen. Aendert sich die eine
 * Seite, muss die andere mit. Ganz teilen laesst sich der Wert nicht, weil er
 * dort in SQL steht.
 *
 * Kleiner Unterschied, der bleibt: die Nachtpruefung rechnet in vollen 72
 * Stunden, die Liste in Kalendertagen. Ein Lead kann also einen halben Tag
 * frueher rot sein, als er gemeldet wird. Das ist die harmlose Richtung.
 */
export const POOL_LEAD_ALARM_TAGE = 3;

/** Aus wessen Sicht wird gefiltert. */
export interface PoolSicht {
  rolle: string;
  benutzerId: string | null;
}

/**
 * Liegt dieser Kontakt als offener Lead im Pool, und darf die angegebene
 * Person ihn sehen?
 *
 * Massgeblich fuer "unzugewiesen" ist `zustaendig_id`, nicht das Freitextfeld
 * `berater`. Nur die ID entscheidet per Row Level Security, wer den Lead
 * ueberhaupt sehen darf. Ein Lead mit Namen, aber ohne ID, gehoert faktisch
 * niemandem: der genannte Vertriebspartner sieht ihn nicht, und aus dem Pool
 * war er trotzdem ausgeblendet. Genau so konnten Leads in gar keiner
 * Arbeitsliste landen.
 */
export function istOffenerPoolLead(k: Partial<KundeData> | null | undefined, sicht: PoolSicht): boolean {
  if (!k) return false;
  if (k.archiviert || k.geloescht) return false;

  // Nur echte Leads, keine gewoehnlichen Kontakte. Ein Rueckläufer zaehlt
  // immer dazu, auch ein selbst angelegter Kontakt ohne leadTyp: Sonst waere
  // er nach der Rueckgabe an die Zentrale nirgends mehr zu sehen.
  if (!(k.leadTyp || k.setter || istRuecklaeufer(k))) return false;

  /*
   * Leads ohne E-Mail und ohne Telefon werden NICHT mehr ausgeblendet.
   *
   * Der Filter sollte Geister-Datensaetze fernhalten, traf aber vor allem die
   * Foto-Leads: Erkennt die Auswertung eines hochgeladenen Fotos nur einen
   * Namen, wird der Lead angelegt und war danach in keiner Arbeitsliste zu
   * sehen. Niemand konnte die fehlende Nummer nachtragen, weil niemand von dem
   * Lead wusste.
   *
   * Jetzt erscheint er und wird in der Liste als unvollstaendig gekennzeichnet,
   * siehe `fehlenKontaktdaten`. Ein sichtbarer Lead, dem etwas fehlt, ist
   * besser als ein unsichtbarer, dem niemand helfen kann.
   */

  // Verlorene Leads grundsaetzlich ausblenden, auch die, die ueber die
  // Kontaktversuche verloren gegangen sind. Die Grenze kommt aus der Konstante.
  if (k.status === "verloren" || k.pipelineStufe === "verloren") return false;
  /*
   * Ein Rueckläufer bleibt sichtbar, auch wenn die Kontaktversuche
   * ausgeschoepft sind.
   *
   * Christian hat das am 21.09.2026 ausdruecklich so entschieden. Der Grund
   * liegt auf der Hand: Der haeufigste Rueckgabegrund ist "Kein Kontakt
   * zustande gekommen". Ohne diese Ausnahme kaeme genau so ein Lead zurueck
   * und waere im selben Moment wieder unsichtbar, und der ganze neue Ablauf
   * liefe ins Leere.
   *
   * Die Zaehlung bleibt stehen und wird in der Lead-Verwaltung angezeigt: Wer
   * neu verteilt, soll sehen, dass schon mehrfach angerufen wurde.
   */
  if ((k.nichtErreichtCount || 0) >= MAX_KONTAKTVERSUCHE && !istRuecklaeufer(k)) return false;

  // Sobald jemand zustaendig ist, gehoert der Lead in dessen persoenliche Liste.
  if (k.zustaendig_id && String(k.zustaendig_id).trim() !== "") return false;

  const rolle = (sicht.rolle || "").toLowerCase();
  const istInhaberAdmin = rolle === "inhaber" || rolle === "admin";
  const istSetterin = rolle === "setterin";
  /*
   * Die Vertriebsleitung sieht seit dem 26.09.2026 die Leads der
   * Handbuch-Seite (Quelle „Konfigurator“), um sie zuzuweisen. Die Datenbank
   * liefert ihr diese Kontakte ohnehin (`darf_alle_kunden_sehen`, Migration
   * 20260916190000), und `handbuch_lead_staende` rechnet sie mit. Die übrigen
   * herrenlosen Pool-Leads bleiben wie bisher bei Admin, Inhaber und
   * Setterin.
   */
  const istLeitungMitHandbuchLead = rolle === "vertriebsleiter" && istKonfiguratorQuelle(k.quelle);

  // Eigentuemer-Logik:
  // - Lead mit Ersteller → nur dieser Nutzer (bzw. Admin/Inhaber/Setterin).
  // - Lead ohne Ersteller und ohne Setter → Pool ohne Zuordnung, exklusiv fuer
  //   Admin/Inhaber/Setterin. Bis zum 27.09.2026 sah ihn zusaetzlich Christian
  //   Peetz in jeder Rolle, also auch als Vertriebspartner. Seitdem zaehlt nur
  //   die aktive Rolle; als Admin sieht er ihn weiterhin.
  // - Lead mit Setter, ohne Ersteller → fuer alle internen Rollen sichtbar.
  const ersteller = k.erstelltVonId;
  if (ersteller) {
    if (istInhaberAdmin || istSetterin || istLeitungMitHandbuchLead) return true;
    return ersteller === sicht.benutzerId;
  }
  const hatSetter = !!(k.setter && String(k.setter).trim());
  if (!hatSetter) {
    return istInhaberAdmin || istSetterin || istLeitungMitHandbuchLead;
  }
  return true;
}

/** Anzahl der offenen Pool-Leads aus Sicht der angegebenen Person. */
export function zaehleOffenePoolLeads(alle: Partial<KundeData>[], sicht: PoolSicht): number {
  return (alle || []).reduce((n, k) => (istOffenerPoolLead(k, sicht) ? n + 1 : n), 0);
}

/**
 * Fehlen diesem Lead beide Kontaktwege?
 *
 * Solche Leads stehen seit der Aufhebung des Geister-Filters in der Liste,
 * lassen sich aber nicht anrufen und nicht anschreiben. Sie brauchen deshalb
 * einen sichtbaren Hinweis, sonst versucht jemand vergeblich, sie zu
 * kontaktieren, und haelt das Fehlen der Nummer fuer einen Anzeigefehler.
 */
export function fehlenKontaktdaten(k: Partial<KundeData> | null | undefined): boolean {
  if (!k) return false;
  const hatEmail = !!(k.email && String(k.email).trim());
  const hatTelefon = !!(k.telefon && String(k.telefon).trim());
  return !hatEmail && !hatTelefon;
}
