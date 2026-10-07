/**
 * Die Kästchen über dem Arbeitsbereich des Bewerberprofils.
 *
 * Drei Fragen, die man beim Öffnen einer Akte zuerst stellt: Was ist als
 * Nächstes zu tun, wann ist der nächste Termin, und wann ist zuletzt etwas
 * passiert. Alles drei wird aus vorhandenen Daten abgeleitet und nichts davon
 * geschätzt.
 *
 * Reine Rechnung, keine Anzeige, deshalb prüfbar ohne Oberfläche.
 */
import type { BewerberEreignis } from "./bewerberEreignisse";
import { istImNeuenProzess } from "./bewerberprozessZuordnung";
import type { Bewerber, BewerberStatus } from "./bewerbungStore";

/** Die Kennung, unter der der Kennenlerntermin in den Ereignissen steht. */
export const KENNENLERNTERMIN_ID = "termin:erstgespraech";

/**
 * Was als Nächstes ansteht, je Pipelinestufe.
 *
 * Das ist keine Automatik und löst nichts aus, es ist der Satz, der sonst im
 * Kopf der HR-Managerin steht. Die Stufen sind dieselben wie in
 * `pipelineStufen.ts`; eine unbekannte bekommt den allgemeinen Satz, damit
 * eine neue Stufe hier nicht als Lücke erscheint.
 */
const NAECHSTE_AKTION: Partial<Record<BewerberStatus, string>> = {
  Eingang: "Kennenlernbogen versenden oder anrufen",
  Erstgespraech: "Erstgespräch führen und Ergebnis festhalten",
  FollowUp: "Zum vereinbarten Zeitpunkt nachfassen",
  Closing: "Videocall führen und Paket besprechen",
  Bedenkzeit: "Zum vereinbarten Rückruf melden",
  Paketwahl: "Paket bestätigen lassen",
  Vertrag: "Vertrag versenden und Unterschrift nachhalten",
  Rechnung: "Rechnung stellen und Zahlung prüfen",
  Nutzer_anlegen: "Zugang anlegen und Zugangsdaten versenden",
  Aktiv: "Onboarding begleiten",
  Abgelehnt: "Nichts offen, abgelehnt",
  KeinInteresse: "Nichts offen, kein Interesse",
};

/**
 * Der Satz im Kästchen „Nächste Aktion".
 *
 * Normalerweise entscheidet allein die Pipelinestufe. Eine Ausnahme gibt es
 * seit dem 21.09.2026: Steht ein Kennenlerngespräch im Kalender und ist es noch
 * nicht vorbei, dann ist genau das die nächste Aktion, unabhängig von der
 * Stufe. Christian hat das so verlangt, weil der Termin über Calendly
 * vereinbart und danach von Hand eingetragen wird; ohne diesen Fall stünde dort
 * weiter ein allgemeiner Satz, obwohl der Termin schon feststeht.
 *
 * Nur im neuen Bewerberprozess. Im alten sind dieselben beiden Felder ein
 * Telefonat und kein Kennenlerngespräch, dort wäre der Satz schlicht falsch.
 *
 * `jetzt` kommt von außen herein, damit diese Datei reine Rechnung bleibt und
 * ohne Uhr prüfbar ist. Dasselbe tut `naechsterTermin` weiter unten.
 */
export function naechsteAktionText(
  b: Partial<Bewerber>,
  ereignisse: readonly BewerberEreignis[] = [],
  jetzt: Date = new Date(),
): string {
  if (istImNeuenProzess(b as Pick<Bewerber, "prozess">)) {
    const kennenlernen = ereignisse.find(
      (e) => e.id === KENNENLERNTERMIN_ID && e.art === "termin" && e.ms >= jetzt.getTime(),
    );
    if (kennenlernen) return "Kennenlerngespräch steht an";
  }

  const stufe = b.status as BewerberStatus | undefined;
  return (stufe && NAECHSTE_AKTION[stufe]) || "Nächsten Schritt festlegen";
}

/**
 * Der nächste Termin, der noch bevorsteht.
 *
 * Gesucht wird in den zusammengeführten Ereignissen, also über alle
 * Terminquellen hinweg: selbst gebuchter Videocall, von Hand gepflegter
 * Termin, Erstgespräch, Onboarding, Follow-up und Rückruf. Der zeitlich
 * nächste gewinnt, nicht der zuerst eingetragene.
 */
export function naechsterTermin(
  ereignisse: BewerberEreignis[],
  jetzt: Date = new Date(),
): BewerberEreignis | null {
  const ms = jetzt.getTime();
  const kommende = ereignisse.filter((e) => e.art === "termin" && e.ms >= ms);
  if (kommende.length === 0) return null;
  // Die Liste steht absteigend, der nächste ist also der letzte der kommenden.
  return kommende.reduce((a, z) => (z.ms < a.ms ? z : a));
}

/** Das jüngste Ereignis, das schon vorbei ist. */
export function letzteAktivitaet(
  ereignisse: BewerberEreignis[],
  jetzt: Date = new Date(),
): BewerberEreignis | null {
  const ms = jetzt.getTime();
  return ereignisse.find((e) => e.ms <= ms) || null;
}
