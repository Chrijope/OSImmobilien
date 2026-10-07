/**
 * Wer unter einer Mail steht, von der Anwendung aus gesucht.
 *
 * Warum es diese Datei gibt: Mehrere Versandstellen haben den Berater ueber
 * seinen Namen gesucht, jede auf eigene Weise. Ging der Vergleich ins Leere,
 * blieben Adresse, Bezeichnung und Bild leer, und die Vorlage unterschrieb
 * mit der allgemeinen Firmenadresse. Christian bekam so eine Einladung, unter
 * der "Ansprechpartner bei MOREImmo" und office@more.immo standen, obwohl er
 * selbst der Berater war.
 *
 * Der Name ist dafuer die falsche Quelle und hat im Projekt schon dreimal
 * danebengegriffen: Hermann Vogl wurde als "Vogel" gesucht, die
 * Provisionszuordnung vergleicht `p.name = _berater` Zeichen fuer Zeichen,
 * und in der Meeting-Einladung stand derselbe Vergleich noch einmal.
 * Massgeblich ist deshalb die Kennung, also die Nutzer-ID.
 */

import { berufsbezeichnung } from "@/lib/berufsbezeichnung";
import { findeBeraterNachName } from "@/lib/beraterNamensabgleich";
import { loadAllUsers, type SystemUser } from "./loadAllUsers";

/** Die Angaben, die unter der Mail stehen. */
export interface BeraterAngaben {
  id: string;
  name: string;
  email: string;
  telefon: string;
  /** Berufsbezeichnung, nie die technische Rolle. */
  position: string;
  /** Adresse des Profilbildes, so wie sie im Profil steht. */
  bild: string;
}

/**
 * Findet den Berater, vorrangig ueber seine Kennung.
 *
 * Bleibt nur der Name, gilt die Regel aus `beraterNamensabgleich`: Gross- und
 * Kleinschreibung sowie ueberzaehlige Leerzeichen sind egal, zwei gleichnamige
 * Nutzer gelten bewusst als nicht gefunden. Ein stiller Fehlgriff waere
 * schlimmer als eine fehlende Angabe. Bewusst dieselbe Regel und keine zweite
 * daneben.
 */
export function findeBerater(kennung: string | undefined, name: string): BeraterAngaben | null {
  let nutzer: SystemUser[] = [];
  try {
    nutzer = loadAllUsers();
  } catch {
    return null;
  }

  const id = (kennung || "").trim();
  let treffer = id ? nutzer.find((u) => u.id === id) : undefined;
  if (!treffer) {
    const namensTreffer = findeBeraterNachName(name, nutzer.map((u) => ({ id: u.id, name: u.name })));
    treffer = namensTreffer.art === "eindeutig"
      ? nutzer.find((u) => u.id === namensTreffer.id)
      : undefined;
  }
  if (!treffer) return null;

  return {
    id: treffer.id || id,
    name: (treffer.name || name).trim(),
    email: treffer.email || "",
    telefon: treffer.telefon || "",
    // Die Bezeichnung kommt aus der Rolle. Der frueher an den Versandstellen
    // gelesene Wert `position` steht gar nicht im SystemUser, das Feld blieb
    // also immer leer, und in der Mail fehlte die Zeile unter dem Namen.
    position: berufsbezeichnung(treffer.rollen ?? treffer.rolle),
    bild: treffer.bildUrl || "",
  };
}

/**
 * Die Felder, die der Ansprechpartner in `templateData` belegt.
 *
 * Das Profilbild reist im verschachtelten Feld `berater`, nicht flach: Nur
 * dort signiert die Edge Function die Speicheradresse. Eine flache Adresse
 * ginge ungezeichnet hinaus, und ein Mailprogramm ohne Anmeldung laedt sie
 * nicht. Die Vorlagen verstecken die Initialen, sobald eine Adresse da ist,
 * der Kreis bliebe also ganz leer statt wenigstens die Initialen zu zeigen.
 *
 * `beraterUserId` ist der einzige Hinweis, den die Edge Function nicht falsch
 * verstehen kann. Mit ihr loest sie den Ansprechpartner selbst auf, holt die
 * Adresse aus den Einstellungen und signiert das Bild.
 */
export function beraterMailFelder(
  gefunden: BeraterAngaben | null,
  rueckfallName: string,
  rueckfallKennung?: string,
): Record<string, unknown> {
  return {
    beraterName: gefunden?.name || rueckfallName,
    beraterUserId: gefunden?.id || rueckfallKennung || undefined,
    beraterEmail: gefunden?.email || "",
    beraterTelefon: gefunden?.telefon || "",
    beraterPosition: gefunden?.position || "",
    ...(gefunden
      ? {
          berater: {
            name: gefunden.name,
            rolle: gefunden.position || undefined,
            telefon: gefunden.telefon || undefined,
            email: gefunden.email || undefined,
            bildUrl: gefunden.bild || undefined,
          },
        }
      : {}),
  };
}
