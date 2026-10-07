/**
 * Der Weg der Steuerauswertung vom Browser zum Postfach.
 *
 * Gebaut nach dem Muster von `startfahrplanVersand.ts`: PDF bauen, ablegen,
 * signierte Adresse holen, Mail mit dem Knopf darauf verschicken. Ein zweiter
 * Versandweg entsteht bewusst nicht.
 *
 * Ein Unterschied bleibt, und er ist der Grund fuer die eigene Edge Function:
 * Beim Startfahrplan sitzt ein angemeldeter Mitarbeiter vor dem Bildschirm und
 * darf selbst in den Speicher schreiben. Hier ist es ein nicht angemeldeter
 * Besucher. Ein Ablageort, in den der schreiben darf, waere eine offene Tuer.
 * Also nimmt `steuer-auswertung-versand` das fertige PDF entgegen und legt es
 * mit der Service-Rolle ab.
 *
 * Am Lead aendert das nichts. Der laeuft unveraendert ueber
 * `steuerrechnerLead.ts` und `submit-lead` und ist bereits angekommen, bevor
 * dieser Weg ueberhaupt beginnt.
 */
import { baueSteuerAuswertungPdf, type SteuerPdfEmpfaenger } from "@/lib/steuerrechnerPdf";
import type { Ergebnis } from "@/lib/steuerRechner";
import type { SteuerAntworten } from "@/lib/steuerrechnerStrecke";
import type { BeraterInfo } from "@/pages/AnalysePublic";
import type { FormatSprache } from "@/lib/sprachFormat";

/** Die Meldungen dieses Wegs in beiden Sprachen der oeffentlichen Seite. */
const MELDUNGEN: Record<FormatSprache, { nichtErstellt: string; nichtVerschickt: string }> = {
  de: {
    nichtErstellt: "Die Auswertung konnte nicht erstellt werden.",
    nichtVerschickt: "Die Auswertung konnte nicht verschickt werden.",
  },
  en: {
    nichtErstellt: "Your analysis could not be created.",
    nichtVerschickt: "Your analysis could not be sent.",
  },
};

export interface SteuerVersandEingabe extends SteuerPdfEmpfaenger {
  email: string;
  /** Der Honigtopf des Formulars. Muss leer sein. */
  hp?: string;
  /** Wie lange das Formular offen war, in Millisekunden (Zeitfalle). */
  dauerMs?: number;
}

export interface SteuerVersandErgebnis {
  ok: boolean;
  /** Signierte Adresse der abgelegten Auswertung, 90 Tage gueltig. */
  pdfUrl?: string;
  /** Ist die Mail tatsaechlich hinausgegangen? */
  mailVersendet: boolean;
  /**
   * Die Auswertung selbst. Sie wird immer mitgegeben, auch wenn Ablage oder
   * Versand scheitern, damit der Interessent nie mit leeren Haenden dasteht.
   */
  blob?: Blob;
  dateiname?: string;
  fehler?: string;
}

/**
 * Ein Blob als Base64.
 *
 * Ueber den FileReader und nicht ueber `arrayBuffer` mit `btoa`: Der
 * FileReader kodiert in einem Zug, ohne dass die Datei byteweise durch den
 * Aufrufstapel muss, und er ist in jedem Browser vorhanden, den diese Seite
 * erreicht. Der Praefix `data:...;base64,` wird abgeschnitten, uebrig bleibt
 * genau das, was die Edge Function erwartet.
 */
function alsBase64(blob: Blob): Promise<string> {
  return new Promise((fertig, gescheitert) => {
    const leser = new FileReader();
    leser.onerror = () => gescheitert(leser.error ?? new Error("Datei nicht lesbar"));
    leser.onload = () => {
      const wert = typeof leser.result === "string" ? leser.result : "";
      const komma = wert.indexOf(",");
      fertig(komma >= 0 ? wert.slice(komma + 1) : wert);
    };
    leser.readAsDataURL(blob);
  });
}

/**
 * Loest den Download im Browser aus.
 *
 * Die Rueckfallebene, wenn die Mail nicht zugestellt werden konnte. Ein
 * Interessent, der seine Daten hergegeben und nichts bekommen hat, ist
 * schlimmer als einer, der sich nie eingetragen hat.
 */
export function ladeAuswertungHerunter(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function sendeSteuerAuswertung(
  eingabe: SteuerVersandEingabe,
  ergebnis: Ergebnis,
  antworten: SteuerAntworten,
  berater?: BeraterInfo,
  /* Die Sprache der Seite (Etappe 6, Plan D20 und M33). Standard "de", damit
     bestehende Aufrufer unveraendert bleiben. Sie bestimmt die Sprache des
     PDFs und geht als `sprache` an die Edge Function, die sie an den
     Mailversand weiterreicht. */
  sprache: FormatSprache = "de",
): Promise<SteuerVersandErgebnis> {
  const meldung = MELDUNGEN[sprache === "en" ? "en" : "de"];
  const projectId =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_PROJECT_ID ||
    "irwdgutegmivbtgmftyc";

  let blob: Blob;
  let dateiname: string;
  try {
    const gebaut = await baueSteuerAuswertungPdf(
      ergebnis,
      antworten,
      { vorname: eingabe.vorname, nachname: eingabe.nachname },
      berater,
      sprache,
    );
    blob = gebaut.blob;
    dateiname = gebaut.dateiname;
  } catch (err) {
    console.error("[steuer] Auswertung konnte nicht gebaut werden", err);
    return {
      ok: false,
      mailVersendet: false,
      fehler: meldung.nichtErstellt,
    };
  }

  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/steuer-auswertung-versand`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64: await alsBase64(blob),
          vorname: eingabe.vorname.trim(),
          nachname: eingabe.nachname.trim(),
          email: eingabe.email.trim(),
          /* Nur die Kennung des Partners. Name, Adresse, Telefon und
             Bezeichnung liest der Server seit dem 04.10.2026 selbst aus dem
             Partnerprofil, sonst liesse sich jeder beliebige Absenderblock in
             die Mail schreiben. Dieselbe Regel wie beim Lead: Kuerzel vor
             Kennung. */
          beraterSlug: (berater?.slug || "").trim(),
          beraterUserId: berater?.slug ? "" : berater?.userId || "",
          hp: eingabe.hp || "",
          ...(typeof eingabe.dauerMs === "number" ? { dauerMs: eingabe.dauerMs } : {}),
          sprache,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[steuer] Versand fehlgeschlagen", res.status, body);
      return {
        ok: false,
        mailVersendet: false,
        blob,
        dateiname,
        fehler: meldung.nichtVerschickt,
      };
    }

    const json = (await res.json().catch(() => ({}))) as {
      pdfUrl?: string;
      mailVersendet?: boolean;
    };
    return {
      ok: true,
      pdfUrl: json?.pdfUrl,
      mailVersendet: json?.mailVersendet !== false,
      blob,
      dateiname,
    };
  } catch (err) {
    console.error("[steuer] Versand, Netzfehler", err);
    return {
      ok: false,
      mailVersendet: false,
      blob,
      dateiname,
      fehler: meldung.nichtVerschickt,
    };
  }
}
