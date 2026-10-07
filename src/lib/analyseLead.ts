/**
 * Anlage eines Leads aus dem Analysetool.
 *
 * Die öffentliche Analyseseite wird anonym aufgerufen, ein direkter Insert
 * würde an der Zeilensicherheit scheitern. Deshalb läuft die Anlage über die
 * Edge Function `submit-lead`, die mit Service-Rolle arbeitet und zusätzlich
 * die Benachrichtigung an den Vertriebspartner auslöst.
 *
 * Vorher stand dieser Aufruf inline in der Ergebnisseite. Da die Eintragung
 * jetzt an zwei Stellen möglich ist, liegt er hier an einer.
 */
import { normalizeTelefon } from "@/lib/phoneUtils";
import {
  leadFehlermeldung,
  leadNetzfehlerMeldung,
  retryAfterSekunden,
} from "@/lib/leadFehlermeldung";
import { baueLeadEinwilligung } from "@/lib/leadEinwilligung";
import { kampagneFuerLead } from "@/lib/kampagnenKennung";
import type { AnalysisData, ScoreResult } from "@/lib/scoringEngine";
import type { BeraterInfo } from "@/pages/AnalysePublic";
import type { Sprache } from "@/lib/seitenSprache";

export interface AnalyseLeadEingabe {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  notizen?: string;
  /** Pflichthaken im Formular. Ohne ihn geht kein Lead raus. */
  einwilligung?: boolean;
  /** Freiwilliger Haken fuer die werbliche Ansprache. */
  werbeeinwilligung?: boolean;
}

/**
 * Ohne Kontaktkennung und Dublettenhinweis: Beides sagt `submit-lead` einem
 * Browser seit dem 26.09.2026 nicht mehr (Befund HB-002). Was der Partner vom
 * Ergebnis sehen soll, geht als `analyseSnapshot` mit dem Lead.
 */
export interface AnalyseLeadErgebnis {
  ok: boolean;
  /** Für den Nutzer verständliche Meldung, wenn es nicht geklappt hat. */
  fehler?: string;
  /** HTTP-Status der Antwort, falls es überhaupt eine gab. */
  status?: number;
}

function zerlegeStrasse(strasse: string): { strasse: string; hausnummer: string } {
  const teile = strasse.trim().match(/^(.+?)\s*(\d+.*)$/);
  if (!teile) return { strasse: strasse.trim(), hausnummer: "" };
  return { strasse: teile[1], hausnummer: teile[2] };
}

/**
 * @param sprache  Die Sprache der Seite, auf der das Formular stand (Plan
 *   Kundensprache, Etappe 6). Sie geht als `sprache` an `submit-lead`, das
 *   daraus die Kundensprache des Kontakts schreibt, und bestimmt den Wortlaut
 *   des Einwilligungsnachweises. Er muss derselbe sein, den das Formular
 *   gezeigt hat. Standard Deutsch, damit das interne Analysetool unverändert
 *   bleibt. Alles, was ins CRM geht (Kategorie als `finanzierbarkeit`,
 *   Notizen, `meta`), bleibt in beiden Sprachen deutsch.
 */
export async function sendeAnalyseLead(
  eingabe: AnalyseLeadEingabe,
  result: ScoreResult,
  _data: AnalysisData,
  berater?: BeraterInfo,
  sprache: Sprache = "de",
): Promise<AnalyseLeadErgebnis> {
  const adresse = zerlegeStrasse(eingabe.strasse || "");
  const kampagne = kampagneFuerLead();
  // Mit Kuerzel ermittelt der Server den Partner selbst, eine Kennung gibt
  // dann keinen Ausschlag mehr. Nur der alte Link mit `?b=` hat kein Kuerzel.
  const linkKuerzel = (berater?.slug || "").trim();
  const projectId =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_PROJECT_ID ||
    "irwdgutegmivbtgmftyc";

  try {
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/submit-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vorname: eingabe.vorname.trim(),
        nachname: eingabe.nachname.trim(),
        email: eingabe.email.trim(),
        telefon: normalizeTelefon(eingabe.telefon),
        strasse: adresse.strasse,
        hausnummer: adresse.hausnummer,
        plz: eingabe.plz || "",
        ort: eingabe.ort || "",
        notizen: (eingabe.notizen || "").trim(),
        quelle: "Analysetool",
        beraterName: berater?.name || "",
        beraterSlug: linkKuerzel,
        beraterUserId: linkKuerzel ? "" : berater?.userId || "",
        sprache,
        finanzierbarkeit: result.categoryLabel,
        // Nachweis der Einwilligung mit Zeitpunkt und Wortlaut. Die Function
        // legt ihn am Kontakt ab.
        dsgvo_consent: baueLeadEinwilligung(
          !!eingabe.einwilligung,
          !!eingabe.werbeeinwilligung,
          undefined,
          sprache,
        ),
        meta: {
          // Die Pipelinestufe entscheidet der Server, siehe
          // `supabase/functions/_shared/lead-zuordnung.ts`. Frueher stand hier
          // fest "neuer_lead", damit landete auch der Lead eines Partners in
          // der Lead-Verwaltung statt bei ihm.
          leadQuality: result.leadQuality,
          // Kampagnenkennungen aus der Adresse, falls der Aufruf über eine
          // Anzeige kam. Derselbe Helfer wie im Steuerrechner, siehe
          // `kampagnenKennung.ts`. Ohne Kampagne fällt das Feld weg.
          ...(kampagne ? { kampagne } : {}),
          analyseScore: result.totalScore,
          ...(eingabe.notizen?.trim() ? { analyseNachricht: eingabe.notizen.trim() } : {}),
          analyseSnapshot: {
            // Das Datum steht mit dabei, seit der Schnappschuss im
            // Kundenprofil angezeigt wird (RechnerAngaben). Eine Angabe ohne
            // Zeitpunkt ist nach ein paar Wochen nichts mehr wert, und wer sie
            // fuer aktuell haelt, ruft mit veralteten Zahlen an.
            erfasstAm: new Date().toISOString(),
            monthlyZuzahlung: result.projection.monthlyZuzahlung,
            wealthAfter10Years: result.projection.wealthAfter10Years,
          },
        },
      }),
    });

    if (!res.ok) {
      // Die Serverantwort selbst bekommt der Interessent nie zu sehen, sie
      // gehört ins Log. Was er sieht, hängt am Statuscode: Ein Rate-Limit
      // verlangt eine andere Auskunft als ein Serverfehler.
      const body = await res.json().catch(() => ({}));
      console.error("submit-lead error:", res.status, body);
      return {
        ok: false,
        status: res.status,
        fehler: leadFehlermeldung(res.status, retryAfterSekunden(res.headers), sprache),
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("submit-lead network error:", err);
    return { ok: false, fehler: leadNetzfehlerMeldung(sprache) };
  }
}
