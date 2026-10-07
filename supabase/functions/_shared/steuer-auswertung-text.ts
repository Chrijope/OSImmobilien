/**
 * Die beiden Entscheidungen der Auswertungsmail, getrennt von der Vorlage.
 *
 * Warum ausgelagert: Die Vorlage selbst ist eine `.tsx` mit `npm:react` und
 * laesst sich in Vitest nicht laden. Die Regel, die hier drin steckt, soll
 * aber geprueft sein, denn sie entscheidet ueber den Inhalt einer Mail an
 * einen Interessenten.
 *
 * DIE REGEL
 *
 * Seit der Steuerrechner ohne Kuerzel in bezahlter Werbung laeuft, kommen
 * Leads an, denen noch kein Vertriebspartner zugeteilt ist. Er wird erst
 * spaeter vergeben. Dann darf die Mail keinen Unterschriftsblock tragen: Der
 * Platzhalter "OS Immobilien Team" mit der allgemeinen Nummer sieht aus wie ein
 * persoenlicher Ansprechpartner, ist aber keiner.
 *
 * Und die Zeile "Wie es weitergeht" muss anders lauten. Die Zusage bleibt, es
 * meldet sich jemand, nur steht der Name noch nicht fest.
 */

import { nurEchteBezeichnung } from "./berufsbezeichnung.ts";

export interface AuswertungPerson {
  name: string;
  rolle: string;
  telefon?: string;
  email?: string;
  bildUrl?: string;
}

export interface AuswertungPersonEingabe {
  beraterName?: string;
  beraterEmail?: string;
  beraterTelefon?: string;
  beraterPosition?: string;
  berater?: {
    name?: string;
    rolle?: string;
    telefon?: string;
    email?: string;
    bildUrl?: string;
  };
}

/**
 * Der Ansprechpartner der Mail, oder `undefined`, wenn es keinen gibt.
 *
 * Massgeblich ist der Name. Frueher genuegte ein vorhandenes `berater`-Objekt,
 * dann stand bei einem leeren Objekt ein Unterschriftsblock ohne Namen in der
 * Mail. `undefined` heisst fuer die Vorlage: `ohneUnterschrift`.
 */
export function auswertungPerson(
  eingabe: AuswertungPersonEingabe,
): AuswertungPerson | undefined {
  const name = (eingabe.berater?.name || eingabe.beraterName || "").trim();
  if (!name) return undefined;
  return {
    name,
    // Nie eine Rollenkennung: "Admin" unter einer Auswertung liest sich wie
    // eine Systemmeldung. Siehe berufsbezeichnung.ts.
    rolle:
      nurEchteBezeichnung(eingabe.berater?.rolle) ||
      nurEchteBezeichnung(eingabe.beraterPosition) ||
      "Dein Ansprechpartner bei OS Immobilien",
    telefon: eingabe.berater?.telefon || eingabe.beraterTelefon,
    email: eingabe.berater?.email || eingabe.beraterEmail,
    bildUrl: eingabe.berater?.bildUrl,
  };
}

/**
 * Der erste Punkt unter "Wie es weitergeht".
 *
 * Ohne Partner bleibt die Zusage bestehen, nur ohne Namen. Kein "Dein
 * Ansprechpartner meldet sich": Das klingt, als gaebe es einen, den der
 * Empfaenger kennen muesste.
 */
export function naechsterSchrittZeile(name?: string): string {
  const sauber = (name || "").trim();
  return sauber
    ? `${sauber} meldet sich zeitnah bei dir für ein Erstgespräch.`
    : "Einer unserer Berater meldet sich zeitnah bei dir für ein Erstgespräch.";
}
