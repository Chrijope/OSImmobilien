import { supabase } from "@/integrations/supabase/client";
import { cacheGetById, cacheUpdate } from "./dataCache";
import { MAIL_KOOPERATION, linkMitZaehlung } from "./bewerberMailTracking";
import {
  KOOPERATION_BASIS_URL,
  kooperationsBuchungsLink,
} from "../../supabase/functions/_shared/bewerber-kooperationsgespraech-mail";

/**
 * Die Einladung zum persönlichen Gespräch, aus dem Bewerberprofil heraus.
 *
 * ## Warum es diesen Weg gibt
 *
 * Bis zum 08.09.2026 hat sich der Bewerber am Ende des Kennenlernbogens selbst
 * einen Termin gebucht, also bevor irgendjemand seine Antworten gelesen hatte.
 * Das ist umgedreht: Wir sehen uns die Antworten an, suchen nach dem
 * Bewerberscore die besten heraus und laden gezielt ein. Der Knopf dafür steht
 * in der Kennenlernen-Karte des Bewerberprofils, und der Bogen endet seither
 * ohne Terminwahl.
 *
 * ## Was hier bewusst NICHT passiert
 *
 * Es entsteht **kein zweiter Buchungsmechanismus**. Der Link in der Mail trägt
 * dasselbe Token wie das Kennenlernen (`bewerber_formular.token`), die Seite
 * dahinter fragt `bewerber_termin_zugang` und bucht über
 * `bewerber_termin_buchen`, genau wie der Bogen es bisher getan hat. Ein
 * eigenes Einladungs-Token wäre eine zweite Gültigkeit, die niemand pflegt.
 *
 * ## Warum der Versand über `send-transactional-email` läuft
 *
 * Dasselbe Muster wie `sendeBewerberAbsageMail`: Es gibt keine neue Edge
 * Function, die erst in Supabase bereitgestellt werden müsste. Die beiden
 * vorhandenen Functions reichen, nur ihre Vorlagensammlung ist gewachsen.
 *
 * ## Der Vermerk
 *
 * Der Zeitpunkt des Versands liegt in `meta.kennenlernen.einladungAm`, also im
 * JSON-Feld und nicht in einer eigenen Spalte. **Damit braucht es keine
 * Migration.** Drei Aufgaben hat er: Die Karte zeigt, dass eingeladen wurde,
 * der Knopf beschriftet sich beim zweiten Mal sichtbar als Wiederholung, und
 * die Erinnerungskette in `supabase/functions/_shared/bewerber-buchung-
 * erinnerung.ts` liest an ihm ab, wer gerade am Zug ist: ohne ihn wir, mit ihm
 * der Bewerber. Ein zweiter Versand bleibt möglich, denn Mails gehen verloren;
 * gezählt wird dann ab dem neuen Zeitpunkt, und das ist richtig so.
 *
 * Geschrieben wird der Vermerk hier und nicht über `updateBewerber`: Der Block
 * `meta.kennenlernen` fehlt in `bewerberToDb` mit Absicht, weil ihn sonst ein
 * Speichern aus einer veralteten Akte überschreiben würde. Deshalb der
 * gezielte Griff auf genau diesen einen Schlüssel, mit dem übrigen Bestand als
 * Grundlage.
 */

export { KOOPERATION_BASIS_URL, kooperationsBuchungsLink };

/** Wie die Kennenlernen-Karte einen Bewerber für den Versand beschreibt. */
export type EinladungsEmpfaenger = {
  id: string;
  vorname?: string;
  nachname?: string;
  email?: string;
};

/** Das Ergebnis eines Versands, so wie der Aufrufer es im Toast anzeigt. */
export type VersandErgebnis = { ok: boolean; grund?: string };

/**
 * Verschickt die Einladung zum persönlichen Gespräch.
 *
 * Der Knopf in der Mail führt seit dem 21.09.2026 auf unsere eigene
 * Terminseite `/kennenlerngespraech/:token`. Dort steckt der Kalender der
 * HR-Managerin, und darunter bestätigt der Bewerber die gebuchte Zeit.
 *
 * Ohne Token gibt es keinen Link und damit keine Mail: Die Seite erkennt am
 * Token, wer da bucht, und ohne es bestätigte der Bewerber ins Leere.
 */
export async function sendeKooperationsEinladung(
  b: EinladungsEmpfaenger,
  token: string,
): Promise<VersandErgebnis> {
  if (!b.email) return { ok: false, grund: "Am Bewerber steht keine E-Mail-Adresse" };
  const link = kooperationsBuchungsLink(token);
  if (!link) {
    return {
      ok: false,
      grund:
        "Es gibt keinen eingereichten Kennenlernbogen. Ohne ihn lässt sich der Termin später " +
        "keinem Bewerber zuordnen. Erst das Kennenlernen verschicken und abwarten.",
    };
  }

  const name = `${b.vorname || ""} ${b.nachname || ""}`.trim();
  /*
   * Die Zählmarke am Link, seit dem 26.09.2026 statt des Zählpixels. Die
   * Terminseite meldet sie beim Aufruf (`meldeLinkAufruf`). Scheitert der
   * Eintrag, geht die Einladung mit dem nackten Link hinaus.
   */
  const mailLink = await linkMitZaehlung(b.id, MAIL_KOOPERATION, link);
  try {
    const { data, error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "bewerber-kooperationsgespraech-einladung",
        recipientEmail: b.email,
        // Der Zeitstempel im Schlüssel lässt die Wiederholung ausdrücklich zu.
        // Doppelklicks fängt der Knopf selbst ab, indem er währenddessen sperrt.
        idempotencyKey: `bewerber-kooperation-einladung-${b.id}-${Date.now()}`,
        templateData: {
          bewerberName: name,
          buchungsLink: mailLink,
        },
        metadata: { bewerbungId: b.id, anlass: "kooperationsgespraech-einladung" },
      },
    });
    if (error) return { ok: false, grund: error.message || "Versand fehlgeschlagen" };
    const antwort = data as { success?: boolean; reason?: string } | null;
    if (antwort && antwort.success === false) {
      return { ok: false, grund: String(antwort.reason || "nicht zugestellt") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, grund: e instanceof Error ? e.message : "Versand fehlgeschlagen" };
  }
}

/** Der Block `meta.kennenlernen` einer Bewerberzeile, so weit er hier zählt. */
type KennenlernenBlock = Record<string, unknown>;

function blockAus(zeile: unknown): KennenlernenBlock {
  const meta = (zeile as { meta?: unknown } | undefined)?.meta;
  if (!meta || typeof meta !== "object") return {};
  const block = (meta as Record<string, unknown>).kennenlernen;
  return block && typeof block === "object" ? (block as KennenlernenBlock) : {};
}

/**
 * Wann die Einladung zum persönlichen Gespräch hinausging, als ISO-Zeitpunkt.
 *
 * Leer heißt: noch nie. Gelesen wird aus dem Zwischenspeicher, damit die Karte
 * dafür keine eigene Abfrage braucht.
 */
export function leseKooperationsEinladung(bewerbungId: string): string {
  const wert = blockAus(cacheGetById("bewerbungen", bewerbungId)).einladungAm;
  return typeof wert === "string" ? wert : "";
}

/**
 * Den Versand am Bewerber vermerken.
 *
 * Bewusst nachsichtig: Fehlt die Zeile im Zwischenspeicher, geschieht nichts,
 * statt zu werfen. Die Mail ist zu diesem Zeitpunkt bereits hinaus, und ein
 * fehlender Vermerk ist kein Grund, dem Nutzer einen Fehler zu zeigen.
 */
export async function vermerkeKooperationsEinladung(
  bewerbungId: string,
  zeitpunkt = new Date().toISOString(),
): Promise<void> {
  const zeile = cacheGetById("bewerbungen", bewerbungId) as { meta?: Record<string, unknown> } | undefined;
  if (!zeile) return;
  const meta = (zeile.meta && typeof zeile.meta === "object" ? zeile.meta : {}) as Record<string, unknown>;
  await cacheUpdate("bewerbungen", bewerbungId, {
    meta: {
      ...meta,
      kennenlernen: { ...blockAus(zeile), einladungAm: zeitpunkt },
    },
  });
}
