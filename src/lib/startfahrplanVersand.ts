/**
 * Versand des Startfahrplans (Paket-Übersicht als PDF) per E-Mail.
 *
 * Eine einzige Versandlogik für alle Auslöser: den Service-Knopf im
 * ClosingTab, die Unterlagen-Weiche in Teil 2 des Erstgesprächs
 * (ClosingDirektTeil) und seit dem 08.09.2026 die Tür „Möchte die Unterlagen"
 * im Abschluss des persönlichen Gesprächs (useBewerberVideocall). Vorher lebte
 * der komplette Ablauf als Handler im ClosingTab; hierher extrahiert, damit
 * kein Weg einen zweiten Versandweg bekommt.
 *
 * Es gibt zwei Fassungen des PDFs, und die Wahl liegt bewusst hier und nicht
 * bei den Auslösern, damit beide Wege automatisch dieselbe Regel benutzen:
 * Lief nur Teil 1, geht der bestehende kompakte Startfahrplan raus
 * (buildPaketUebersichtPdf). Ist Teil 2 "Closing direkt" komplett, geht die
 * erweiterte Fassung raus (buildStartfahrplanErweitertPdf), die das ganze
 * Gespräch nachzeichnet. Bewusst INHALTLICH und nicht am Abschluss-Klick
 * festgemacht (Entscheidung Christian, 02.09.2026): Die Unterlagen-Weiche
 * liegt mitten im Gespräch, der Abschluss kommt erst danach. Aus dem
 * persönlichen Gespräch geht die kompakte Fassung raus, mit Begründung bei
 * `waehleStartfahrplanFassung`.
 *
 * Ablauf: HR-Ansprechpartnerin laden, PDF bauen und hochladen, Tracking
 * anlegen (best effort), Mail über send-transactional-email verschicken und
 * den Versandzeitpunkt am Bewerber vermerken. Fehler werden mit der
 * jeweiligen Stufe im Text geworfen, damit die Oberfläche sie anzeigen kann.
 */
import { supabase } from "@/integrations/supabase/client";
import { updateBewerber, type Bewerber, type ErstgespraechSkript } from "./bewerbungStore";
import { buildPaketUebersichtPdf, uploadPaketUebersichtPdf } from "./paketUebersichtPdf";
import { buildStartfahrplanErweitertPdf } from "./startfahrplanErweitertPdf";
import { istClosingDirektKomplett } from "./closingDirektSkript";
import { istTeil1Abgeschlossen } from "./erstgespraechStand";
import { ladeHrAnsprechpartner } from "./bewerberKontaktversuch";

const SUPABASE_FN_BASE = "https://irwdgutegmivbtgmftyc.supabase.co/functions/v1";

/** Die zwei Fassungen des Startfahrplans. */
export type StartfahrplanFassung = "standard" | "erweitert";

// Die Definition von "Teil 1 abgeschlossen" liegt in erstgespraechStand.ts,
// weil auch der Einstieg in Präsentation und Moderation daran hängt. Hier nur
// weitergereicht, damit Aufrufer des Versands sie nicht doppelt importieren.
export { istTeil1Abgeschlossen };

/**
 * Ist das neue persönliche Gespräch abgeschlossen?
 *
 * Zwei Bedingungen zusammen, und beide setzt derselbe Abschluss-Klick in
 * `useKooperationsgespraechAbschluss`:
 *
 *   1. `durchgefuehrtAm` steht, das Gespräch ist also abgeschlossen.
 *   2. `bewerberVideocall.entscheidung` steht, die Einschätzung des Hauses
 *      liegt also vor.
 *
 * Warum diese beiden und nicht `letzteFolie` oder die Mitschrift: Die zuletzt
 * gezeigte Folie sagt nur, was jemand aufgeschlagen hat, nicht, dass das
 * Gespräch geführt wurde, und ihre Nummer hängt an den zugeschalteten Modulen.
 * Bestätigte Merkmale und Notizen sind freiwillig; ein vollständiges Gespräch
 * kann ohne sie enden. Der Abschluss dagegen ist der einzige Weg, auf dem aus
 * dem persönlichen Gespräch überhaupt ein Startfahrplan hinausgeht, und er
 * sitzt hinter der letzten Folie. Wer hier ankommt, hat das Gespräch geführt.
 *
 * Wichtig für den Aufrufer: Der Versand läuft im selben Augenblick wie das
 * Schreiben. Es muss der frisch geschriebene Stand hereingereicht werden, nicht
 * der Bewerber, wie er vor dem Klick im Speicher lag (siehe die Anmerkung in
 * `useKooperationsgespraechAbschluss`).
 */
export function istKooperationsgespraechAbgeschlossen(
  skript: ErstgespraechSkript | undefined | null,
): boolean {
  return (
    !!(skript?.durchgefuehrtAm ?? "").trim() &&
    !!(skript?.bewerberVideocall?.entscheidung ?? "").trim()
  );
}

/**
 * Wählt die Fassung für einen Bewerber. Zwei Abläufe führen hierher, und sie
 * werden getrennt beantwortet.
 *
 * **Altes Erstgespräch.** Erweitert, sobald Teil 2 komplett durchlaufen ist
 * (istClosingDirektKomplett in closingDirektSkript.ts). Unverändert.
 *
 * **Neues persönliches Gespräch.** Bewusst der kompakte Startfahrplan, auch
 * nach einem vollständigen Gespräch. Bis zum 08.09.2026 kam er dort nur
 * deshalb heraus, weil der neue Ablauf nie etwas in `closingDirekt` schreibt
 * und die Regel den neuen Ablauf gar nicht kannte. Jetzt ist es eine
 * Entscheidung und kein Zufall, und zwar aus dem Inhalt heraus: Die erweiterte
 * Fassung zeichnet die alte Closing-Präsentation nach, nicht das
 * persönliche Gespräch. Sie enthält Partnerstimmen, den Beispieldeal und den
 * Kasten „Was Warten kostet", die dort niemand gezeigt hat, ihr Abschnitt
 * „Deine Zahlen aus dem Gespräch" lebt von `closingDirekt.notizen.
 * rechnerAbschluesse`, das der neue Ablauf nicht führt, und der Druck des
 * Warte-Kastens widerspricht genau dem Satz, den die Schlussfolie kurz vorher
 * gibt: keine Frist, du musst heute nichts entscheiden. Ein Dokument, das ein
 * anderes Gespräch nacherzählt, ist schlechter als ein kurzes, das stimmt.
 *
 * Damit die Regel den neuen Ablauf trotzdem erkennt, steht er hier als eigener
 * Zweig und nicht als stiller Durchfall. Wer die erweiterte Fassung dort
 * einmal will, braucht zuerst eine eigene Fassung für das
 * persönliche Gespräch, nicht diese Zeile.
 */
export function waehleStartfahrplanFassung(b: Bewerber): StartfahrplanFassung {
  const skript = b.erstgespraechSkript;
  const teil2 = istClosingDirektKomplett(skript?.closingDirekt, b.closingEntscheidung, b.paketwahl);
  if (teil2) return "erweitert";
  // Der neue Ablauf, ausdrücklich erkannt: Auch ein vollständiges
  // persönliche Gespräch bekommt die kompakte Fassung. Der Zweig steht als
  // eigene Zeile da, damit die Wahl sichtbar und prüfbar bleibt und nicht
  // wieder unbemerkt daran hängt, dass niemand `closingDirekt` füllt.
  if (istKooperationsgespraechAbgeschlossen(skript)) return "standard";
  return "standard";
}

export async function sendeStartfahrplan(
  b: Bewerber,
  opts: { hrName?: string; paketId?: string } = {},
): Promise<{ fassung: StartfahrplanFassung }> {
  if (!b.email) {
    throw new Error("Im Bewerberprofil ist keine E-Mail-Adresse hinterlegt.");
  }
  const fassung = waehleStartfahrplanFassung(b);
  let stage = "init";
  try {
    const fullName = [b.vorname, b.nachname].filter(Boolean).join(" ");
    // Ansprechpartnerin ist die HR-Managerin aus ihrem Nutzerprofil, nicht
    // der eingeloggte Nutzer (siehe Historie im ClosingTab).
    stage = "hr-kontakt";
    const hrKontakt = await ladeHrAnsprechpartner();
    stage = "pdf-build";
    const paketId = opts.paketId || b.paketwahl || "";
    const blob = fassung === "erweitert"
      ? await buildStartfahrplanErweitertPdf({
          empfaengerName: fullName,
          berater: hrKontakt,
          paketId,
          // Das in Teil 2 erfasste Abschlusstempo personalisiert den
          // Abschnitt "Deine Zahlen aus dem Gespräch".
          abschluesseProMonat: b.erstgespraechSkript?.closingDirekt?.notizen?.rechnerAbschluesse || "",
        })
      : await buildPaketUebersichtPdf({
          empfaengerName: fullName,
          berater: hrKontakt,
          paketId,
        });
    stage = "pdf-upload";
    const pdfUrl = await uploadPaketUebersichtPdf(b.id, blob);
    // Tracking-Eintrag anlegen (Token), best effort: blockiert den Versand nicht.
    stage = "tracking-insert";
    // Nur die Linkzählung über die Weiterleitung, kein Zählpixel mehr
    // (26.09.2026, Paragraf 25 TDDDG, siehe bewerberMailTracking.ts).
    let trackingClickUrl: string | undefined;
    try {
      const { data: trk, error: trkErr } = await supabase
        .from("bewerber_mail_tracking")
        .insert({ bewerber_id: b.id, kind: "paket_uebersicht", tracked: true })
        .select("token")
        .single();
      if (trkErr) throw trkErr;
      const token = trk.token as string;
      trackingClickUrl = `${SUPABASE_FN_BASE}/track-bewerber-mail?token=${token}&mode=click&url=${encodeURIComponent(pdfUrl)}`;
    } catch (trkE) {
      console.warn("[startfahrplan] tracking insert failed, sende ohne Tracking:", trkE);
    }
    stage = "email-send";
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "paket-uebersicht",
        recipientEmail: b.email,
        idempotencyKey: `paket-uebersicht-${b.id}-${Date.now()}`,
        templateData: {
          bewerberName: fullName,
          pdfUrl,
          // Vollständige HR-Daten aus dem Profil; fällt die Auflösung aus,
          // löst send-transactional-email den Namen serverseitig auf.
          ...(hrKontakt ? { berater: hrKontakt } : { beraterName: opts.hrName || undefined }),
          trackingClickUrl,
        },
      },
    });
    if (error) {
      const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
      let detail = "";
      try { detail = ctx && typeof ctx.text === "function" ? await ctx.text() : ""; } catch { /* noop */ }
      console.error("[startfahrplan] send-transactional-email error:", error, detail);
      throw new Error(detail || (error as Error).message || "E-Mail-Versand fehlgeschlagen");
    }
    updateBewerber(b.id, { paketUebersichtSentAt: new Date().toISOString() });
    return { fassung };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[startfahrplan] Fehler in Stufe "${stage}":`, e);
    throw new Error(`Stufe ${stage}: ${msg || "Bitte erneut versuchen."}`);
  }
}
