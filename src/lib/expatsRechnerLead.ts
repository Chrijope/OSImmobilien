/**
 * Eintragung aus dem EXPATS Calculator.
 *
 * Gebaut wie `steuerrechnerLead.ts` und `analyseLead.ts`, und zwar bewusst
 * nach demselben Muster: eine kleine Datei je Quelle, die denselben Weg geht.
 * Der Weg ist die Edge Function `submit-lead`. Sie arbeitet mit Service-Rolle
 * und uebernimmt Zuweisung, Dublettenpruefung, Kundennummer, Inbox-Aufgabe,
 * Glocke und die beiden Mails. An der Function aendert sich dafuer nichts, sie
 * ist quellenunabhaengig gebaut.
 *
 * Warum keine gemeinsame Funktion mit `steuerrechnerLead.ts`: Die beiden
 * Rechner haben nichts gemeinsam ausser dem Endpunkt. Ihre Notiz und ihr
 * Datenabzug bestehen aus verschiedenen Feldern, eine gemeinsame Funktion
 * haette am Ende nur `fetch` gekapselt und dafuer beide Aufrufer verbogen.
 *
 * ZWEI DINGE, AN DENEN ALLES HAENGT:
 *
 *   `quelle`         ist der Text, der in der Lead-Verwaltung in der Spalte
 *                    "Quelle" steht. Er muss ausserdem von
 *                    `herkunftBezeichnung` erkannt werden, sonst steht in der
 *                    Glocke des Partners der falsche Weg. Siehe
 *                    `supabase/functions/_shared/lead-zuordnung.ts`, dort gibt
 *                    es fuer diesen Rechner ein eigenes Muster.
 *                    NICHT das Wort "Meta", "Facebook" oder "Lead Form"
 *                    hineinschreiben: `formatMetaQuelle` in `submit-lead`
 *                    schreibt solche Quellen zu "Meta Ads: <Stadt>" um.
 *   `beraterUserId`  trennt den Lead eines Partners vom Lead der
 *                    Gesellschaft. Der Server prueft sie gegen Profil und
 *                    Rolle.
 *
 * WARUM DIESER RECHNER WEDER KENNUNG NOCH BERATERNAMEN SCHICKT:
 *
 * Der EXPATS Calculator ist eine Anzeigenstrecke des Hauses und kein
 * persoenlicher Partnerlink. Nach der Trennlinie in `lead-zuordnung.ts` gehoert
 * ein solcher Lead in die Lead-Verwaltung und wird dort von Hand verteilt.
 * Genau das ist auch die Vorgabe: Jeder Lead aus diesem Rechner soll in der
 * Lead-Verwaltung erscheinen.
 *
 * Deshalb bleiben BEIDE Felder leer, nicht nur die Kennung:
 *   - `beraterUserId` wuerde den Lead sofort dem angemeldeten Nutzer zuweisen.
 *     Die Seite ist heute nur fuer Admins offen, und Admin ist eine
 *     Beraterrolle. Der Lead haette also `zustaendig_id` bekommen.
 *   - `beraterName` allein reicht ebenfalls: Findet der Namensabgleich in
 *     `submit-lead` ein eindeutiges Profil, setzt er `zustaendig_id` nachtraeglich.
 * Ein Lead mit `zustaendig_id` faellt in `istOffenerPoolLead` heraus und steht
 * damit NICHT mehr in der Lead-Verwaltung. Wer hier spaeter einen
 * persoenlichen Partnerlink ergaenzen will, aendert damit zugleich, wo der
 * Lead landet. Das ist eine Entscheidung und kein Detail.
 */
import { normalizeTelefon } from "@/lib/phoneUtils";
import {
  leadFehlermeldung,
  leadNetzfehlerMeldung,
  retryAfterSekunden,
} from "@/lib/leadFehlermeldung";
import { baueLeadEinwilligung } from "@/lib/leadEinwilligung";
import { kampagneFuerLead } from "@/lib/kampagnenKennung";
import { EXPATS_ANNAHMEN, type ExpatsEingabe, type ExpatsErgebnis } from "@/lib/expatsRechner";

/**
 * Die Quelle, wie sie in der Lead-Verwaltung in der Spalte "Quelle" steht.
 *
 * Bewusst der Name, den die Seite auch traegt: Wer den Lead sieht, soll ohne
 * Nachfrage wissen, woher er kommt. `herkunftBezeichnung` erkennt ihn ueber ein
 * eigenes Muster, siehe `lead-zuordnung.ts`.
 */
export const EXPATS_QUELLE = "EXPATS Calculator";

export interface ExpatsLeadEingabe {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  /** Pflichthaken. Ohne ihn geht kein Lead raus. */
  einwilligung?: boolean;
  /** Freiwilliger Haken fuer die werbliche Ansprache. */
  werbeeinwilligung?: boolean;
  /**
   * Der Honigtopf. Ein Feld, das auf der Seite niemand sieht und deshalb
   * immer leer ist. Ist es gefuellt, nimmt `submit-lead` den Lead freundlich
   * an und schreibt nichts. Der Bot erfaehrt nicht, dass er aufgefallen ist.
   */
  honigtopf?: string;
}

/** Ohne Kontakt und Dublettenhinweis, siehe `SteuerLeadErgebnis` (HB-002). */
export interface ExpatsLeadErgebnis {
  ok: boolean;
  fehler?: string;
  status?: number;
}

const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

/**
 * Die Notiz, die der zustaendige Partner im Kontakt sieht.
 *
 * Sie ist deutsch, obwohl die Seite englisch ist: Sie liest nicht der
 * Interessent, sondern der Partner im CRM.
 *
 * Sie nennt ausdruecklich die Annahmen, mit denen gerechnet wurde. Wer den
 * Kontakt anruft, muss wissen, welche Zahlen auf dem Bildschirm standen und
 * worauf sie beruhen, sonst nennt er im Gespraech andere. Der Hinweis auf die
 * englische Seite steht mit drin, damit niemand auf Deutsch zurueckruft.
 */
export function expatsLeadNotiz(eingabe: ExpatsEingabe, r: ExpatsErgebnis): string {
  const a = EXPATS_ANNAHMEN;
  /* Gerundet, bevor daraus Text wird. Ohne das Runden stand in der Notiz
     "4,3999999999999995 Prozent Zins": 0.044 * 100 laesst sich binaer nicht
     exakt darstellen. Der Partner liest diese Notiz, bevor er anruft. */
  const proz = (anteil: number) =>
    String(Math.round(anteil * 1000) / 10).replace(".", ",");
  return [
    `EXPATS Calculator (englische Seite, Zielgruppe Expats): ${eur(eingabe.eigenkapital)} Eigenkapital, ${eur(eingabe.jahresbrutto)} Jahresbrutto, ${eingabe.verheiratet ? "verheiratet" : "ledig"}.`,
    `Ausgewiesen wurden ${eur(r.steuervorteilJahr1)} Steuerersparnis im ersten Jahr und ${eur(r.steuervorteilZehnJahre)} über ${r.betrachtungsjahre} Jahre.`,
    `Gerechnet an einem typisierten Objekt zu ${eur(r.objektvolumen)} mit ${eur(r.darlehen)} Darlehen, ${eur(r.mieteMonat)} Miete, ${eur(r.bewirtschaftungMonat)} nicht umlagefähige Kosten und ${eur(r.rateMonat)} Rate im Monat, Zahlungsstrom nach Steuer ${eur(r.zahlungsstromNachSteuerMonat)} im Monat.`,
    /* Der Durchschnitt ueber zehn Jahre allein waere im Gespraech irrefuehrend,
       weil das erste Jahr den einmaligen Sanierungsabzug traegt. Deshalb steht
       der Dauerzustand ausdruecklich daneben, genau wie auf der Seite. */
    `Ab dem zweiten Jahr, also ohne den einmaligen Sanierungsabzug, liegt der Zahlungsstrom bei ${eur(r.zahlungsstromNachSteuerMonatAbJahr2)} im Monat. In zehn Jahren werden ${eur(r.tilgungZehnJahre)} getilgt, die Restschuld liegt dann bei ${eur(r.restschuld)}.`,
    `Annahmen: ${proz(a.gebaeudeanteil)} Prozent Gebäudeanteil, ${proz(a.afaSatz)} Prozent Abschreibung, ${proz(a.sanierungsanteil)} Prozent Sanierungsaufwand im ersten Jahr, ${proz(a.mietrendite)} Prozent Mietrendite, ${proz(a.zins)} Prozent Zins, ${proz(a.tilgung)} Prozent Tilgung und ${proz(a.bewirtschaftungskosten)} Prozent nicht umlagefähige Bewirtschaftungskosten.`,
    `Der Abschreibungssatz setzt ein Gutachten zur Restnutzungsdauer oder eine degressive Neubau-Abschreibung voraus, der Regelsatz liegt bei 2 Prozent. Mieteinnahmen und Schuldzinsen sind in der Steuerrechnung nicht enthalten. Die Zahlen sind eine Modellrechnung und keine Steuerberatung.`,
  ].join(" ");
}

export async function sendeExpatsLead(
  lead: ExpatsLeadEingabe,
  eingabe: ExpatsEingabe,
  ergebnis: ExpatsErgebnis,
): Promise<ExpatsLeadErgebnis> {
  const projectId =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_PROJECT_ID ||
    "DEIN-SUPABASE-PROJEKT";

  const notiz = expatsLeadNotiz(eingabe, ergebnis);
  const kampagne = kampagneFuerLead();

  try {
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/submit-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vorname: lead.vorname.trim(),
        nachname: lead.nachname.trim(),
        email: lead.email.trim(),
        telefon: normalizeTelefon(lead.telefon),
        /* Der Honigtopf. Er geht als `hp` mit, so heisst das Feld auch in
           `submit-bewerbung`. Ein Mensch fuellt es nie. */
        hp: lead.honigtopf || "",
        quelle: EXPATS_QUELLE,
        /* Beide Felder bleiben leer, und zwar mit Absicht. Die lange
           Begruendung steht oben im Dateikopf. Kurz: nur so steht der Lead in
           der Lead-Verwaltung. */
        beraterName: "",
        beraterUserId: "",
        /* Die Seite ist englisch, also auch der neue Kontakt. `submit-lead`
           schreibt daraus die Kundensprache (Plan Kundensprache, 2.4). */
        sprache: "en",
        notizen: notiz,
        /* Englischer Wortlaut, weil die Seite englisch ist. Gespeichert wird,
           was die Person gelesen hat, siehe `leadEinwilligung.ts`. */
        dsgvo_consent: baueLeadEinwilligung(
          !!lead.einwilligung,
          !!lead.werbeeinwilligung,
          undefined,
          "en",
        ),
        // Die Pipelinestufe entscheidet ausschliesslich der Server.
        meta: {
          ...(kampagne ? { kampagne } : {}),
          steuerNachricht: notiz,
          /* Der Stand des Rechners, so wie der Interessent ihn gesehen hat.
             Ohne Zeitpunkt ist eine solche Angabe nach ein paar Wochen
             wertlos, deshalb steht er mit drin. */
          expatsSnapshot: {
            erfasstAm: new Date().toISOString(),
            eigenkapital: Math.round(eingabe.eigenkapital),
            jahresbrutto: Math.round(eingabe.jahresbrutto),
            verheiratet: !!eingabe.verheiratet,
            steuerjahr: ergebnis.steuerjahr,
            objektvolumen: Math.round(ergebnis.objektvolumen),
            gebaeudewert: Math.round(ergebnis.gebaeudewert),
            darlehen: Math.round(ergebnis.darlehen),
            mieteMonat: Math.round(ergebnis.mieteMonat),
            rateMonat: Math.round(ergebnis.rateMonat),
            steuerOhneImmobilie: Math.round(ergebnis.steuerOhneImmobilie),
            grenzsteuersatz: Math.round(ergebnis.grenzsteuersatz * 1000) / 10,
            steuervorteilJahr1: Math.round(ergebnis.steuervorteilJahr1),
            steuervorteilZehnJahre: Math.round(ergebnis.steuervorteilZehnJahre),
            zahlungsstromVorSteuerMonat: Math.round(ergebnis.zahlungsstromVorSteuerMonat),
            zahlungsstromNachSteuerMonat: Math.round(ergebnis.zahlungsstromNachSteuerMonat),
            /* Der Dauerzustand ab Jahr zwei und der Vermoegensaufbau. Beide
               stehen seit September 2026 auf der Ergebnisseite, also muss der
               Partner sie kennen, bevor er anruft. */
            zahlungsstromNachSteuerMonatAbJahr2: Math.round(
              ergebnis.zahlungsstromNachSteuerMonatAbJahr2,
            ),
            bewirtschaftungMonat: Math.round(ergebnis.bewirtschaftungMonat),
            tilgungZehnJahre: Math.round(ergebnis.tilgungZehnJahre),
            restschuld: Math.round(ergebnis.restschuld),
            /* Aufwand und Ersparnis getrennt, weil genau diese beiden Zahlen
               im Gespraech sonst verwechselt werden. */
            sanierungsaufwand: Math.round(ergebnis.sanierungsaufwand),
            sanierungErsparnis: Math.round(ergebnis.sanierungErsparnis),
            annahmen: { ...EXPATS_ANNAHMEN },
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
        /* Englisch, weil die ganze Seite englisch ist. Vorher stand hier im
           Fehlerfall ein deutscher Satz mitten in einer englischen Seite. Die
           deutschen Aufrufer geben nichts mit und bekommen weiterhin Deutsch,
           siehe `leadFehlermeldung.ts`. */
        fehler: leadFehlermeldung(res.status, retryAfterSekunden(res.headers), "en"),
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("submit-lead network error:", err);
    return { ok: false, fehler: leadNetzfehlerMeldung("en") };
  }
}
