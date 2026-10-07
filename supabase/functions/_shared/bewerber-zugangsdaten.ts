// Eingabepruefung fuer send-bewerber-zugangsdaten.
//
// Die Logik liegt hier im _shared-Ordner, weil die Edge Function in Deno
// laeuft und nichts aus src/ importieren kann. Getestet wird sie aus
// src/lib/bewerberZugangsdaten.test.ts, so wie bei berater-namensabgleich
// und standort-messung.
//
// Bewusste Entscheidungen:
//
//   Die persoenliche Adresse MUSS auf @os-immobilien.com enden. Die Mail teilt dem
//   neuen Partner seine Firmenadresse samt Passwort mit; eine fremde Domain
//   waere immer ein Tippfehler oder ein Missbrauchsversuch.
//
//   Das Passwort wird nur durchgereicht, nie gespeichert. Hier wird lediglich
//   geprueft, dass es nicht leer ist, denn erzeugt wird es beim Mailanbieter
//   und der Partner aendert es nach der ersten Anmeldung ohnehin.
//
//   Die Einrichtungsanleitung liegt als feste PDF unter public/. Der Bewerber
//   hat beim Empfang noch keinen CRM-Zugang, ein Link ins CRM liefe auf die
//   Anmeldung. Die Datei enthaelt keine persoenlichen Daten, deshalb darf sie
//   oeffentlich sein (Test: src/lib/mailAnleitungPdf.test.ts).

import { BEWERBER_MAIL_BASIS } from "./bewerber-absender.ts";

/** Pfad der Anleitung "OS Immobilien Mail einrichten" unter public/. */
export const MAIL_ANLEITUNG_PFAD = "/dokumente/moreimmo-mail-einrichten.pdf";
/** Name, unter dem HR die Anleitung im Aktivierungsreiter sieht. */
export const MAIL_ANLEITUNG_NAME = "Anleitung OS Immobilien Mail einrichten (PDF)";
/** Absolute Adresse fuer die Mail, immer auf osimmobilien.netlify.app. */
export const MAIL_ANLEITUNG_URL = `${BEWERBER_MAIL_BASIS}${MAIL_ANLEITUNG_PFAD}`;

/** "2026-10-07" oder "07.10.2026" wird "07.10.2026"; Unbekanntes bleibt stehen. */
function deutschesDatum(datum: string): string {
  const iso = datum.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : datum;
}

/**
 * Letzter Satz der Zugangsdaten-Mail zum Onboarding-Termin.
 *
 * Datum und Uhrzeit sind deutsche Ortszeit, so wie HR sie in Schritt 1
 * eintraegt; umgerechnet wird nichts. Fehlt der Termin, verspricht der Satz
 * keine gemeinsame Abstimmung, denn gebucht wird der Termin von HR.
 */
export function onboardingTerminSatz(datum?: string, uhrzeit?: string): string {
  const d = deutschesDatum((datum || "").trim());
  const u = ((uhrzeit || "").trim().match(/^\d{1,2}:\d{2}/) || [""])[0];
  if (!d) return "Den Termin für dein Onboarding schicken wir dir separat.";
  const wann = u ? `am ${d} um ${u} Uhr` : `am ${d}`;
  return `Den Termin für dein Onboarding ${wann} bestätigen wir dir hiermit auch nochmals. Den Zoom-Link dazu hast du in einer separaten Mail erhalten.`;
}

export interface ZugangsdatenAuftrag {
  /** Private Bewerber-Adresse, an die die Zugangsdaten gehen. */
  empfaengerEmail: string;
  vorname: string;
  /** Neue persoenliche Adresse, muss auf @os-immobilien.com enden. */
  persoenlicheEmail: string;
  passwort: string;
  /** Optional: gebuchter Onboarding-Termin (TT.MM.JJJJ). */
  onboardingDatum?: string;
  /** Optional: Uhrzeit des Onboarding-Termins (HH:MM). */
  onboardingUhrzeit?: string;
}

// Bewusst dieselbe pragmatische Pruefung wie in send-anlage-v: ein @,
// ein Punkt in der Domain, keine Leerzeichen.
const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function pruefeZugangsdatenAuftrag(
  body: unknown,
): { ok: true; auftrag: ZugangsdatenAuftrag } | { ok: false; fehler: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const empfaengerEmail = typeof b.empfaengerEmail === "string" ? b.empfaengerEmail.trim() : "";
  if (!empfaengerEmail || empfaengerEmail.length > 254 || !EMAIL_MUSTER.test(empfaengerEmail)) {
    return { ok: false, fehler: "Bitte eine gültige private E-Mail-Adresse des Bewerbers angeben." };
  }

  const persoenlicheEmail =
    typeof b.persoenlicheEmail === "string" ? b.persoenlicheEmail.trim().toLowerCase() : "";
  if (!persoenlicheEmail || persoenlicheEmail.length > 254 || !EMAIL_MUSTER.test(persoenlicheEmail)) {
    return { ok: false, fehler: "Bitte die persönliche OS Immobilien-Adresse angeben." };
  }
  if (!persoenlicheEmail.endsWith("@os-immobilien.com")) {
    return { ok: false, fehler: "Die persönliche Adresse muss auf @os-immobilien.com enden." };
  }

  const passwort = typeof b.passwort === "string" ? b.passwort : "";
  if (!passwort.trim()) {
    return { ok: false, fehler: "Bitte das Start-Passwort angeben." };
  }
  if (passwort.length > 200) {
    return { ok: false, fehler: "Das Passwort ist unplausibel lang." };
  }

  const vorname = (typeof b.vorname === "string" ? b.vorname.trim() : "").slice(0, 100);

  // Termin ist optional; fehlt er, ersetzt die Vorlage die Terminzeile durch
  // einen neutralen Satz. Freies Format wird nicht erzwungen, nur begrenzt.
  const onboardingDatum =
    (typeof b.onboardingDatum === "string" ? b.onboardingDatum.trim() : "").slice(0, 40) || undefined;
  const onboardingUhrzeit =
    (typeof b.onboardingUhrzeit === "string" ? b.onboardingUhrzeit.trim() : "").slice(0, 20) || undefined;

  return {
    ok: true,
    auftrag: { empfaengerEmail, vorname, persoenlicheEmail, passwort, onboardingDatum, onboardingUhrzeit },
  };
}
