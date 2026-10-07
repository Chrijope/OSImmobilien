/**
 * Eintragung aus dem oeffentlichen Steuerrechner.
 *
 * Gebaut wie `analyseLead.ts` und aus demselben Grund: Die Seite wird anonym
 * aufgerufen, ein direkter Insert scheiterte an der Zeilensicherheit. Der Weg
 * geht deshalb ueber die Edge Function `submit-lead`, die mit Service-Rolle
 * arbeitet und Zuweisung, Dublettenpruefung, Kundennummer, Inbox-Aufgabe,
 * Glocke und die beiden Mails ausloest.
 *
 * An der Function selbst aendert sich dafuer nichts. Sie ist quellenunabhaengig
 * gebaut, es genuegt eine eigene `quelle`.
 *
 * ZWEI DINGE, AN DENEN ALLES HAENGT:
 *
 *   `quelle`         muss auf das Muster /steuer/i passen, sonst steht in der
 *                    Glocke des Partners der falsche Weg. Siehe
 *                    `supabase/functions/_shared/lead-zuordnung.ts`, dort ist
 *                    der Steuerrechner bereits vorgesehen.
 *   `beraterSlug`    ist seit dem 24.09.2026 die Trennlinie zwischen einem
 *                    Lead des Partners und einem Lead der Gesellschaft. Das
 *                    Kuerzel aus /steuer/<kuerzel> geht mit, und der Server
 *                    ermittelt den Partner selbst daraus. Eine mitgeschickte
 *                    Kennung gibt dann keinen Ausschlag mehr, deshalb bleibt
 *                    `beraterUserId` in diesem Fall leer.
 *   `beraterUserId`  geht nur noch beim alten Link mit `?b=` mit, der kein
 *                    Kuerzel kennt. Bereits verschickte alte Links sollen
 *                    weiter beim Partner ankommen statt im Pool. Der Server
 *                    kennzeichnet diesen Weg als "alter Link".
 */
import { normalizeTelefon } from "@/lib/phoneUtils";
import {
  leadFehlermeldung,
  leadNetzfehlerMeldung,
  retryAfterSekunden,
} from "@/lib/leadFehlermeldung";
import { baueLeadEinwilligung, type EinwilligungSprache } from "@/lib/leadEinwilligung";
import { kampagneFuerLead } from "@/lib/kampagnenKennung";
import type { Ergebnis } from "@/lib/steuerRechner";
import type { SteuerAntworten } from "@/lib/steuerrechnerStrecke";
import { startzeitpunktTitel } from "@/lib/steuerrechnerStrecke";
import type { BeraterInfo } from "@/pages/AnalysePublic";

/** Genau diese Zeichenkette erkennt `herkunftBezeichnung` als Steuerrechner. */
export const STEUERRECHNER_QUELLE = "Steuerrechner";

export interface SteuerLeadEingabe {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  /** Pflichthaken. Ohne ihn geht kein Lead raus. */
  einwilligung?: boolean;
  /** Freiwilliger Haken fuer die werbliche Ansprache. */
  werbeeinwilligung?: boolean;
}

/**
 * Kontakt, Partner und ob der Kontakt schon bekannt war, sagt `submit-lead`
 * einem Browser seit dem 26.09.2026 nicht mehr (Befund HB-002). Deshalb gibt
 * es sie hier auch nicht.
 */
export interface SteuerLeadErgebnis {
  ok: boolean;
  fehler?: string;
  status?: number;
}

/**
 * Wie dringend ist der Interessent? Nur eine Einordnung fuer die Nachverfolgung,
 * sie entscheidet nichts am Weg des Leads.
 */
function leadQualitaet(a: SteuerAntworten): "hoch" | "mittel" | "niedrig" {
  if (a.startzeitpunkt === "sofort") return "hoch";
  if (a.startzeitpunkt === "zwoelf_monate") return "mittel";
  return "niedrig";
}

/**
 * Die Notiz, die der Partner im Kontakt sieht.
 *
 * Sie steht bewusst in ganzen Saetzen: Wer den Kontakt oeffnet, soll den Fall
 * lesen koennen, ohne die Rohwerte zusammenzusetzen.
 */
export function leadNotiz(a: SteuerAntworten, r: Ergebnis): string {
  const eur = (n: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(Math.round(n));

  const teile = [
    `Steuerrechner: Jahresbrutto ${eur(r.brutto)}, Steuerklasse ${a.steuerklasse}`,
    r.partnerBrutto > 0 ? `Partner ${eur(r.partnerBrutto)}` : "",
    a.kinder > 0 ? `${a.kinder} Kind${a.kinder === 1 ? "" : "er"}` : "keine Kinder",
    // Die Kirchensteuer fehlt hier absichtlich, siehe den Hinweis am Snapshot.
    a.bestehendeImmobilien > 0
      ? `${a.bestehendeImmobilien} bestehende Immobilie${a.bestehendeImmobilien === 1 ? "" : "n"}`
      : "Erstinvestor",
    r.beschaeftigung.titel,
  ].filter(Boolean);

  const zeitpunkt = a.startzeitpunkt ? startzeitpunktTitel(a.startzeitpunkt) : "";

  return [
    teile.join(", ") + ".",
    `Heutige Steuerlast ${eur(r.vorher.summe)} im Jahr.`,
    `Ausgewiesen wurde eine Spanne von ${eur(r.spanne.jahr1.von)} bis ${eur(r.spanne.jahr1.bis)} Steuerersparnis pro Jahr, über zehn Jahre ${eur(r.spanne.zehnJahre.von)} bis ${eur(r.spanne.zehnJahre.bis)}, gerechnet an einem typisierten Objekt zu ${eur(r.spanne.objekt.preis)}.`,
    `Das untere Ende ist die reguläre Abschreibung, das obere setzt ein Gutachten zur Restnutzungsdauer voraus.`,
    zeitpunkt ? `Gewünschter Start: ${zeitpunkt}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function sendeSteuerLead(
  eingabe: SteuerLeadEingabe,
  antworten: SteuerAntworten,
  ergebnis: Ergebnis,
  berater?: BeraterInfo,
  /* Die Sprache der Seite (Etappe 6). Sie steht hinten und hat den
     Standardwert "de", damit bestehende Aufrufer unveraendert bleiben. Sie
     bestimmt den Wortlaut der gespeicherten Einwilligung und geht als
     `sprache` an `submit-lead`, das daraus die Kundensprache des neuen
     Kontakts macht. Die Notiz an den Partner bleibt deutsch, sie geht ins CRM. */
  sprache: EinwilligungSprache = "de",
): Promise<SteuerLeadErgebnis> {
  const projectId =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_PROJECT_ID ||
    "DEIN-SUPABASE-PROJEKT";

  const notiz = leadNotiz(antworten, ergebnis);
  const kampagne = kampagneFuerLead();
  const linkKuerzel = (berater?.slug || "").trim();

  try {
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/submit-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vorname: eingabe.vorname.trim(),
        nachname: eingabe.nachname.trim(),
        email: eingabe.email.trim(),
        telefon: normalizeTelefon(eingabe.telefon),
        quelle: STEUERRECHNER_QUELLE,
        beraterName: berater?.name || "",
        beraterSlug: linkKuerzel,
        beraterUserId: linkKuerzel ? "" : berater?.userId || "",
        notizen: notiz,
        dsgvo_consent: baueLeadEinwilligung(
          !!eingabe.einwilligung,
          !!eingabe.werbeeinwilligung,
          new Date().toISOString(),
          sprache,
        ),
        sprache,
        // Die Pipelinestufe entscheidet ausschliesslich der Server, siehe
        // `pipelineStufeFuerLead`. Wer sie hier vorgibt, holt den Lead eines
        // Partners zurueck in die Lead-Verwaltung.
        meta: {
          leadQuality: leadQualitaet(antworten),
          /* Woher der Besucher kam, sofern die Anzeige es an den Link
             gehaengt hat. Ohne Kampagne faellt das Feld weg, das ist der
             Normalfall beim persoenlichen Partnerlink. Siehe
             `kampagnenKennung.ts`, dort steht auch, warum die Werte
             begrenzt werden. */
          ...(kampagne ? { kampagne } : {}),
          steuerNachricht: notiz,
          steuerStartzeitpunkt: antworten.startzeitpunkt,
          /* Der vollstaendige Stand des Rechners, so wie der Interessent ihn
             ausgefuellt und gesehen hat. Er wird im Kundenprofil angezeigt
             (SteuerrechnerAngaben), damit der zustaendige Partner ihn VOR dem
             ersten Anruf lesen kann. Das Datum steht mit drin, weil eine
             Angabe ohne Zeitpunkt nach ein paar Wochen wertlos ist. */
          steuerSnapshot: {
            erfasstAm: new Date().toISOString(),
            jahresbrutto: ergebnis.brutto,
            partnerBrutto: ergebnis.partnerBrutto,
            steuerklasse: antworten.steuerklasse,
            beschaeftigung: ergebnis.beschaeftigung.id,
            beschaeftigungTitel: ergebnis.beschaeftigung.titel,
            kinder: antworten.kinder,
            bundesland: antworten.bundesland || null,
            /* Die Kirchensteuer geht bewusst NICHT mit. Sie verraet die
               Religionszugehoerigkeit, ein besonders geschuetztes Datum nach
               Art. 9 DSGVO. Sie wird nur im Browser zum Rechnen gebraucht und
               darf weder am Kontakt noch in Notiz, Mail oder Ereignis landen. */
            bestehendeImmobilien: antworten.bestehendeImmobilien,
            startzeitpunkt: antworten.startzeitpunkt,
            zvE: Math.round(ergebnis.zvE),
            grenzsteuersatz: Math.round(ergebnis.grenzsteuersatz * 1000) / 10,
            steuerlastHeute: Math.round(ergebnis.vorher.summe),
            /* Die Spanne, die auf dem Bildschirm stand. Der Partner muss im
               Gespraech genau diese Zahlen kennen, sonst nennt er eine
               andere als die Seite. */
            ersparnisJahrVon: Math.round(ergebnis.spanne.jahr1.von),
            ersparnisJahrBis: Math.round(ergebnis.spanne.jahr1.bis),
            ersparnis10JVon: Math.round(ergebnis.spanne.zehnJahre.von),
            ersparnis10JBis: Math.round(ergebnis.spanne.zehnJahre.bis),
            erhaltungEinmalig: Math.round(ergebnis.spanne.erhaltung.ersparnisEinmalig),
            objektpreis: ergebnis.spanne.objekt.preis,
          },
        },
      }),
    });

    if (!res.ok) {
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
