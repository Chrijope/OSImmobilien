/**
 * Was `send-kunden-expose` vom Aufrufer annimmt, und nichts darüber hinaus.
 *
 * Bewusst NICHT dabei: eine Empfängeradresse. Die kommt ausschließlich aus
 * dem gespeicherten Kontakt (`empfaengerAusKontakt`), nie aus dem Aufruf.
 * Sonst ließe sich mit einer berechtigten Anmeldung ein persönlicher Link an
 * eine beliebige Adresse umleiten (dieselbe Lücke wie Befund F03A im Audit
 * vom 15.09.2026, siehe `_shared/kontakt-signatur-zugriff.ts`). Ein Feld wie
 * `email` oder `recipientEmail` im Aufruf wird deshalb schlicht übergangen.
 *
 * Ohne Deno-Importe, damit Vitest die Prüfung lesen kann
 * (`src/lib/kundenExposeVersand.test.ts`).
 */

import { istKundenlinkArt, type KundenlinkArt } from "../_shared/kunden-expose.ts";

export type VersandModus = "mail" | "link";

export interface VersandAuftrag {
  /** `mail`: Mail mit Knopf an den Kunden. `link`: nur den Link erzeugen, etwa für WhatsApp. */
  modus: VersandModus;
  /**
   * `objektuebersicht`: ein Link je Kunde, Investment und Objekt, Einstieg
   * bei `wohnungId`. `expose`: das Exposé genau dieser Einheit (oder des
   * ganzen Objekts). Fehlt die Angabe, ist es das Exposé: So schicken es
   * Browser, die noch den Stand vor dem 23.09.2026 geladen haben.
   */
  art: KundenlinkArt;
  kontaktId: string;
  investmentId: string;
  objektId: string;
  /**
   * Exposé: die Einheit, leer beim Exposé des ganzen Objekts (Globalobjekt).
   * Objektübersicht: die Einstiegswohnung, leer heißt Hausebene.
   */
  wohnungId: string | null;
  /**
   * Nur Objektübersicht (Christian, 05.10.2026): die Wohnungen, die der
   * Kunde über den Link sehen darf. `null` heißt alle freien, wie bisher;
   * so schickt es der Dialog auch, wenn alle angehakt sind. Die
   * Einstiegswohnung muss darunter sein.
   *
   * Fehlt die Angabe, bleibt die Auswahl des Links, wie sie ist: So sendet
   * „Erneut senden“ im Kundenprofil, und so senden Browser mit älterem Stand.
   * Ein neuer Link zeigt dann alle freien Wohnungen. Beim Exposé fehlt sie
   * immer.
   */
  wohnungAuswahl?: string[] | null;
}

/** Mehr Wohnungen hat kein Haus im Bestand; schützt nur vor unsinnig langen Listen. */
const AUSWAHL_HOECHSTENS = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function kennung(wert: unknown): string {
  return typeof wert === "string" && UUID.test(wert.trim()) ? wert.trim() : "";
}

export function pruefeVersandAuftrag(
  body: unknown,
): { ok: true; auftrag: VersandAuftrag } | { ok: false; fehler: string } {
  const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;

  const modus = b.modus === "mail" || b.modus === "link" ? b.modus : null;
  if (!modus) return { ok: false, fehler: "Bitte angeben, ob der Link per Mail geht oder nur erzeugt wird." };

  // Fehlend heißt Exposé (älterer Browserstand). Ein unbekannter Wert wird
  // abgewiesen, statt still zum Exposé zu werden.
  let art: KundenlinkArt = "expose";
  if (b.art !== undefined && b.art !== null && b.art !== "") {
    if (!istKundenlinkArt(b.art)) return { ok: false, fehler: "Bitte Objektübersicht oder Exposé wählen." };
    art = b.art;
  }

  const kontaktId = kennung(b.kontaktId);
  if (!kontaktId) return { ok: false, fehler: "Bitte einen Kunden wählen." };

  const investmentId = kennung(b.investmentId);
  if (!investmentId) return { ok: false, fehler: "Bitte ein Investment des Kunden wählen." };

  const objektId = kennung(b.objektId);
  if (!objektId) return { ok: false, fehler: "Das Objekt fehlt." };

  // Leer oder fehlend heißt: das ganze Objekt. Eine Angabe in falscher Form
  // wird dagegen abgewiesen, statt still zum ganzen Objekt zu werden.
  let wohnungId: string | null = null;
  if (b.wohnungId !== undefined && b.wohnungId !== null && b.wohnungId !== "") {
    wohnungId = kennung(b.wohnungId);
    if (!wohnungId) return { ok: false, fehler: "Die Einheit ist ungültig." };
  }

  let wohnungAuswahl: string[] | null | undefined;
  if (art === "objektuebersicht" && b.wohnungAuswahl === null) wohnungAuswahl = null;
  if (art === "objektuebersicht" && b.wohnungAuswahl !== undefined && b.wohnungAuswahl !== null) {
    if (!Array.isArray(b.wohnungAuswahl) || b.wohnungAuswahl.length > AUSWAHL_HOECHSTENS) {
      return { ok: false, fehler: "Die Auswahl der Wohnungen ist ungültig." };
    }
    const kennungen = b.wohnungAuswahl.map(kennung);
    if (kennungen.some((k) => !k)) return { ok: false, fehler: "Die Auswahl der Wohnungen ist ungültig." };
    wohnungAuswahl = [...new Set(kennungen)];
    if (wohnungAuswahl.length === 0) return { ok: false, fehler: "Bitte mindestens eine Wohnung auswählen." };
    if (wohnungId && !wohnungAuswahl.includes(wohnungId)) {
      return { ok: false, fehler: "Die Wohnung, bei der der Link öffnet, muss ausgewählt sein." };
    }
  }

  return {
    ok: true,
    auftrag: { modus, art, kontaktId, investmentId, objektId, wohnungId, ...(wohnungAuswahl !== undefined ? { wohnungAuswahl } : {}) },
  };
}
