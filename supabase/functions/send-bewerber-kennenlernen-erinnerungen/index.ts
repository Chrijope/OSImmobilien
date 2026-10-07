import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import { ladeHrEmpfaenger, schreibeGlocke, PORTAL_URL } from "../_shared/hr-benachrichtigung.ts";
import {
  ERINNERUNG_3_ABSAGEGRUND,
  ERINNERUNG_3_AUTOR,
  KENNENLERNEN_BASIS_URL,
  KENNENLERNEN_GUELTIG_TAGE,
  SICHTUNG_TAG,
  SICHTUNG_TAG_2,
  buchungHrText,
  erinnerung3FehlerNotiz,
  erinnerung3NichtAnrufenNotiz,
  erinnerung3Notiz,
  sichtungHrText,
} from "../_shared/bewerber-kennenlernen-mail.ts";
import { kooperationsBuchungsLink } from "../_shared/bewerber-kooperationsgespraech-mail.ts";
import {
  MAIL_ERINNERUNG_1,
  MAIL_ERINNERUNG_3,
  linkMitZaehlung,
} from "../_shared/bewerber-mail-tracking.ts";
import { keinInteresseLink, zielStatusNachAbmeldung } from "../_shared/bewerber-nachfass.ts";
import {
  buchungStand,
  faelligeBuchungErinnerung,
  gehtAnHr,
  vermerkNachBuchungStufe,
  type BuchungFaellig,
} from "../_shared/bewerber-buchung-erinnerung.ts";
import { dauerMinuten } from "../_shared/bewerber-kennenlernen-ueberblick.ts";
import {
  darfFallSchliessen,
  erinnerungWortfassung,
  faelligeErinnerung,
  hatAngefangen,
  kennenlernenBlock,
  kettenStand,
  vermerkNachVersand,
  type FaelligeErinnerung,
  type FormularDaten,
} from "../_shared/kennenlernen-erinnerungen.ts";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";

/**
 * Der automatische Versand der Erinnerungskette des neuen Bewerberprozesses.
 *
 * Bis hierher gab es die Entscheidung, aber niemanden, der sie ausführt: Der
 * Bereich `/bewerberprozess` zeigte an, was fällig wäre, und verschickt hat es
 * niemand. Diese Function schließt die Lücke.
 *
 *   | Tag 3  | erste Erinnerung an den Bewerber            | Mail   |
 *   | Tag 11 | letzte Erinnerung, schliesst das Verfahren  | Mail, und der Stand geht auf „Kein Interesse" |
 *   | danach | nichts                                       |        |
 *
 * **Tag 8 ist am 26.09.2026 entfallen.** Wer bei der Umstellung zwischen Tag 3
 * und Tag 8 stand, bekommt an Tag 11 seine letzte Erinnerung; die Regel dafür
 * steht in `_shared/kennenlernen-erinnerungen.ts`.
 *
 * **Tag 11 war bis zum 14.09.2026 eine Bitte an die Rolle `hr`, anzurufen.**
 * Die Kette endete damit bei einem Menschen, der den Anruf erst noch machen
 * musste. Jetzt bekommt der Bewerber eine letzte Mail, und sein Stand wandert
 * dabei auf „Kein Interesse". Eine Glocke gibt es dafür nicht mehr; die Spur
 * ist ein Eintrag im Verlauf der Akte, damit die Statusänderung erklärt ist.
 *
 * **Eine Gruppe bekommt die Mail ohne den Statuswechsel.** Wer gebeten hat,
 * nicht angerufen zu werden, ist interessiert und will nur keinen Anruf. Bei
 * ihm bleibt der Stand stehen, und der Verlaufseintrag sagt warum. Sichtbar
 * wird er dadurch im Bereich `/bewerberprozess` als „wartet auf Entscheidung",
 * siehe `wartetAufEntscheidung` in `_shared/kennenlernen-erinnerungen.ts`.
 *
 * **Dazu eine zweite Kette, für den abgeschickten Bogen.** Sie hat seit dem
 * 08.09.2026 zwei Hälften, und wer die Nachricht bekommt, hängt allein daran,
 * ob wir schon eingeladen haben.
 *
 *   Vor der Einladung sind wir am Zug:
 *   | Tag 3  | „Ein Kennenlernen wartet auf eure Entscheidung" | Glocke und Mail an HR |
 *   | Tag 7  | dasselbe, deutlicher                            | Glocke und Mail an HR |
 *
 *   Nach der Einladung ist er am Zug:
 *   | Tag 3  | „Deine Einladung wartet noch"                | Mail   |
 *   | Tag 7  | „sonst rufen wir kurz an"                    | Mail   |
 *   | Tag 10 | Bitte um Anruf an die Rolle `hr`             | Glocke und Mail |
 *   | danach | nichts                                       |        |
 *
 * Ihre Regel steht in `_shared/bewerber-buchung-erinnerung.ts`. Die beiden
 * Ketten können sich nicht überlagern: Die erste hört auf, wo die zweite
 * anfängt, nämlich beim abgeschickten Bogen.
 *
 * **Was am 07.09.2026 dazukam.** Die zweite Kette endete bis dahin nach einer
 * einzigen Mail, und der Bewerber verschwand danach still. Das war die größte
 * Lücke des Ablaufs: Wer sich durch sieben Kapitel geklickt hat, ist erkennbar
 * interessiert. Und beide Ketten endeten mit einer Glocke, die nur sieht, wer
 * gerade im CRM arbeitet. Jetzt geht zusätzlich eine Mail hinaus.
 *
 * **Entschieden wird nicht hier.** Ob etwas fällig ist, sagt allein
 * `_shared/kennenlernen-erinnerungen.ts` mit seinen sechs Stoppbedingungen.
 * Diese Datei liest die Zeilen, führt aus und schreibt den Vermerk. Damit gibt
 * es die Regel einmal, und die Oberfläche zeigt genau das an, was der Zeitplan
 * auch tut.
 *
 * **Der Vermerk.** Jede verschickte Nachricht hebt
 * `meta.kennenlernen.erinnerungStufe` und trägt ihren Zeitpunkt ein. Ohne ihn
 * käme dieselbe Mail am nächsten Tag erneut, denn die Tage sind dann immer
 * noch vergangen. Geschrieben wird er ausschließlich hier, nie aus dem CRM,
 * wie der Vermerk der Einladung daneben (siehe `bewerberToDb` in
 * `src/lib/bewerbungStore.ts`).
 *
 * **Der Mengendeckel wirkt wirklich.** Im Bewerbermanagement steht ein Deckel
 * von 30 Mails je Stunde, der nie greift: Er zählt aus dem Browser in
 * `email_send_log`, und dort darf nur Admin lesen. Für die HR-Managerin
 * liefert die Zählung deshalb null, und der Deckel ist eine Attrappe. Hier
 * zählt die Service-Rolle, die die Zeilensicherheit ohnehin umgeht. Und wenn
 * die Zählung fehlschlägt, geht keine einzige Mail hinaus, statt einen Deckel
 * vorzutäuschen, den niemand prüfen kann.
 *
 * Läuft täglich über pg_cron. Der Takt steht in der Migration
 * `20260906130000_kennenlernen_erinnerungen_zeitplan.sql` samt Begründung.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Die zwei Vorlagen dieser Kette. Nur sie zählen für den Deckel.
 *
 * Die Vorlage "-2" (Tag 8) ist am 26.09.2026 entfallen. Die beiden anderen
 * behalten ihre Nummern, denn sie stecken in Idempotenzschlüsseln, im
 * Versandprotokoll und in den Trackingeinträgen alter Akten.
 */
const VORLAGEN: Record<"tag3" | "tag11", string> = {
  tag3: "bewerber-kennenlernen-erinnerung-1",
  tag11: "bewerber-kennenlernen-erinnerung-3",
};

/**
 * Die Art des Trackingeintrags je Stufe.
 *
 * Die Erinnerungen werden mitgemessen, und das ist kein Beiwerk: Sie tragen
 * denselben Link und stellen dieselbe Frage wie die Eingangsmail. Waeren nur
 * die Eingangsmail gemessen, bliebe das Briefsymbol bei jedem grau, der erst
 * die letzte Erinnerung oeffnet, und das ist genau die falsche Fehlanzeige,
 * vor der der Tooltip warnt.
 */
const TRACKING_ART: Record<"tag3" | "tag11", string> = {
  tag3: MAIL_ERINNERUNG_1,
  tag11: MAIL_ERINNERUNG_3,
};

/**
 * Die Vorlage der zweiten Kette: die Erinnerungen an den Termin.
 *
 * Eine Vorlage für beide Stufen, unterschieden über das Feld `stufe`. Sie
 * läuft in demselben täglichen Lauf, weil sie dieselben Zeilen liest und
 * denselben Deckel teilt. Ein eigener Zeitplan wäre ein zweiter Dienst, der
 * zur selben Minute dieselbe Tabelle liest, und niemand könnte mehr sagen,
 * welcher der beiden dem Bewerber eine Mail geschickt hat.
 */
const BUCHUNG_VORLAGE = "bewerber-kennenlernen-buchung-erinnerung";

/** Welche Stufe der zweiten Kette welchen Wortlaut bekommt. */
const BUCHUNG_STUFE: Record<"tag3" | "tag7", "1" | "2"> = { tag3: "1", tag7: "2" };

/** Die Bitte an HR, anzurufen. Nur noch die zweite Kette endet damit. */
const HR_VORLAGE = "bewerber-hr-anruf";

/**
 * Höchstens so viele Mails dieser Kette in einer Stunde.
 *
 * Großzügig bemessen: Die Kette schickt je Bewerber und Stufe genau eine Mail,
 * ein normaler Lauf bleibt weit darunter. Der Deckel ist keine Fachregel,
 * sondern die Bremse gegen eine Schleife, die sonst das Tageskontingent des
 * Mailversands aufbraucht.
 */
const MAX_JE_STUNDE = 30;

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Fehlt die Tabelle noch? Postgres meldet 42P01, PostgREST zusätzlich einen Text. */
function tabelleFehlt(fehler: { code?: string; message?: string } | null): boolean {
  if (!fehler) return false;
  if (fehler.code === "42P01" || fehler.code === "PGRST205") return true;
  return /does not exist|could not find the table|schema cache/i.test(fehler.message || "");
}

/**
 * Wie viele Mails dieser Kette in der letzten Stunde hinausgingen.
 *
 * `null` heißt: nicht zählbar. Der Lauf bricht dann ab. Ein Deckel, der bei
 * einem Lesefehler stillschweigend null zurückgibt, ist genau die Attrappe,
 * die im Bewerbermanagement steht.
 */
async function mailsLetzteStunde(admin: any): Promise<number | null> {
  const seit = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error } = await admin
    .from("email_send_log")
    .select("id", { count: "exact", head: true })
    .in("template_name", [VORLAGEN.tag3, VORLAGEN.tag11, BUCHUNG_VORLAGE])
    .gte("created_at", seit);
  if (error) {
    console.error("[kennenlernen-erinnerungen] Zählstand nicht lesbar", error);
    return null;
  }
  return count ?? 0;
}

/**
 * Der Abmeldelink für diesen Bewerber, oder ein leerer String.
 *
 * Ein offenes, noch gültiges Token wird wiederverwendet; sonst entsteht ein
 * neues. Fehlt die Tabelle `bewerber_abmeldung`, weil ihre Migration noch
 * nicht gelaufen ist, bleibt der Link leer und die Vorlage schreibt statt des
 * Knopfes den Satz „antworte kurz auf diese Mail“. Die Mail geht trotzdem
 * hinaus: Eine Erinnerung ohne Abmeldeknopf ist besser als keine Erinnerung.
 */
async function abmeldeLinkFuer(admin: any, bewerbungId: string, vorname: string): Promise<string> {
  try {
    const { data: offen, error: leseFehler } = await admin
      .from("bewerber_abmeldung")
      .select("token, expires_at")
      .eq("bewerbung_id", bewerbungId)
      .eq("status", "offen")
      .order("erstellt_am", { ascending: false })
      .limit(1);

    if (leseFehler) {
      if (!tabelleFehlt(leseFehler)) {
        console.error("[kennenlernen-erinnerungen] Abmelde-Token nicht lesbar", leseFehler);
      }
      return "";
    }

    const vorhanden = (offen || [])[0] as { token?: string; expires_at?: string } | undefined;
    if (vorhanden?.token && (!vorhanden.expires_at || new Date(vorhanden.expires_at) > new Date())) {
      return keinInteresseLink(vorhanden.token);
    }

    const { data: neu, error: anlegeFehler } = await admin
      .from("bewerber_abmeldung")
      .insert({ bewerbung_id: bewerbungId, vorname: vorname || "" })
      .select("token")
      .single();
    if (anlegeFehler || !neu?.token) {
      console.error("[kennenlernen-erinnerungen] Abmelde-Token nicht angelegt", anlegeFehler);
      return "";
    }
    return keinInteresseLink(neu.token);
  } catch (e) {
    console.error("[kennenlernen-erinnerungen] Abmelde-Token fehlgeschlagen", e);
    return "";
  }
}

/**
 * Die Bitte an HR, einen Bewerber anzurufen: Glocke UND Mail.
 *
 * Nur noch die zweite Kette endet hier, also der abgeschickte Bogen ohne
 * Termin und die liegen gebliebene Sichtung. Die erste Kette schickt an Tag 11
 * seit dem 14.09.2026 eine Mail an den Bewerber und schließt den Fall selbst.
 *
 * Bis zum 07.09.2026 gab es nur die Glocke. Eine Glocke sieht nur, wer gerade
 * im CRM arbeitet; wer drei Tage unterwegs ist, findet sie in der Liste nie
 * wieder, und genau an dieser Stelle brach der Ablauf lautlos ab.
 *
 * Traegt niemand die Rolle `hr`, bekommen Inhaber und Admin wenigstens die
 * Glocke. Eine Mail geht dann nicht hinaus: `ladeHrEmpfaenger` liefert nur
 * Adressen der HR-Rolle, und eine Bewerbermeldung an einen Verteiler zu
 * schicken, der sie nichts angeht, waere der falsche Weg.
 *
 * Der Rueckgabewert sagt, ob wenigstens ein Weg funktioniert hat. Nur dann
 * gilt die Stufe als erledigt.
 */
async function meldeHrAnruf(
  admin: any,
  angaben: {
    bewerbungId: string;
    name: string;
    email: string;
    telefon: string;
    /*
     * Zwei Anlaesse, eine Vorlage. `sichtung` bittet nicht um einen Anruf,
     * sondern darum, den Bogen anzusehen und zu entscheiden. Deshalb traegt er
     * auch einen eigenen Idempotenzschluessel, sonst ginge die zweite Meldung
     * an Tag 7 als Dublette der ersten unter.
     */
    anlass: "termin" | "sichtung";
    schluessel?: string;
    glockenTitel: string;
    nachricht: string;
  },
): Promise<boolean> {
  // Die Glocke bekommt den Pfad, die Mail die volle Adresse. Seit
  // 20260928160000 nimmt die Glocke nur Pfade im CRM an.
  const pfad = `/bewerberprozess?bewerber=${angaben.bewerbungId}`;
  const link = `${PORTAL_URL}${pfad}`;
  const { glockenIds, mailAdressen } = await ladeHrEmpfaenger(admin as never);

  let empfaenger = glockenIds;
  if (empfaenger.length === 0) {
    const { data: rollen } = await admin
      .from("user_roles").select("user_id").in("role", ["admin", "inhaber"]);
    empfaenger = [...new Set(((rollen || []) as Array<{ user_id: string }>).map((r) => r.user_id).filter(Boolean))];
    console.warn("[kennenlernen-erinnerungen] Keine HR-Rolle vergeben, die Meldung geht an Admin und Inhaber.");
  }

  await schreibeGlocke(admin as never, empfaenger, {
    titel: angaben.glockenTitel,
    nachricht: angaben.nachricht,
    link: pfad,
  });

  let mailOk = false;
  for (const adresse of mailAdressen) {
    const versand = await sendeVorlage(admin, {
      templateName: HR_VORLAGE,
      recipientEmail: adresse,
      // Je Bewerber, Anlass und Empfaengerin genau eine Mail, auch wenn dieser
      // Lauf zweimal am Tag kommt.
      idempotencyKey: `${HR_VORLAGE}-${angaben.schluessel || angaben.anlass}-${angaben.bewerbungId}-${adresse}`,
      templateData: {
        anlass: angaben.anlass,
        bewerberName: angaben.name,
        bewerberEmail: angaben.email,
        bewerberTelefon: angaben.telefon,
        nachricht: angaben.nachricht,
        bewerberUrl: link,
      },
      metadata: { bewerbungId: angaben.bewerbungId, anlass: `hr-anruf-${angaben.anlass}` },
    });
    if (versand.ok) mailOk = true;
    else console.error("[kennenlernen-erinnerungen] Mail an HR fehlgeschlagen", angaben.bewerbungId, versand.grund);
  }

  return empfaenger.length > 0 || mailOk;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "send-bewerber-kennenlernen-erinnerungen", corsHeaders);
  if (abgewiesen) return abgewiesen;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    /*
     * Nur Bewerber mit einem Kennenlernen-Block. Wer keinen hat, läuft im
     * bestehenden Bewerbermanagement und hat mit dieser Kette nichts zu tun.
     * Stellen und Termine liegen in derselben Tabelle und tragen ein eigenes
     * `_type`; sie fallen schon durch diese Bedingung heraus.
     */
    const { data: zeilen, error: leseFehler } = await admin
      .from("bewerbungen")
      // `telefon` gehoert mit in die Auswahl: Die Mail an HR bittet um einen
      // Anruf, und eine Bitte um einen Anruf ohne Nummer ist eine Zumutung.
      .select("id, vorname, nachname, email, telefon, status, meta")
      .not("meta->kennenlernen", "is", null);

    if (leseFehler) {
      console.error("[kennenlernen-erinnerungen] Bewerber nicht lesbar", leseFehler);
      return antwort({ error: leseFehler.message }, 500);
    }

    const bewerber = (zeilen || []) as Array<{
      id: string;
      vorname: string | null;
      nachname: string | null;
      email: string | null;
      telefon: string | null;
      status: string | null;
      meta: Record<string, unknown> | null;
    }>;

    if (bewerber.length === 0) {
      return antwort({ ok: true, geprueft: 0, gesendet: 0, gemeldet: 0 });
    }

    /*
     * Die Bögen aller Betroffenen in einer Abfrage, nicht einer je Bewerber.
     * Absteigend sortiert: Die erste Zeile je Bewerber ist die jüngste, ältere
     * Token stehen ohnehin auf "ersetzt".
     */
    const boegen: Record<string, FormularDaten> = {};
    const { data: formulare, error: bogenFehler } = await admin
      .from("bewerber_formular")
      .select("bewerbung_id, token, status, antworten, created_at, expires_at")
      .in("bewerbung_id", bewerber.map((b) => b.id))
      .order("created_at", { ascending: false });
    if (bogenFehler) {
      console.error("[kennenlernen-erinnerungen] Bögen nicht lesbar", bogenFehler);
      return antwort({ error: bogenFehler.message }, 500);
    }
    const token: Record<string, string> = {};
    for (const zeile of (formulare || []) as Array<Record<string, unknown>>) {
      const id = String(zeile.bewerbung_id || "");
      if (!id || boegen[id]) continue;
      boegen[id] = {
        status: (zeile.status as string) ?? null,
        expires_at: (zeile.expires_at as string) ?? null,
        created_at: (zeile.created_at as string) ?? null,
        antworten: (zeile.antworten as Record<string, unknown>) ?? null,
      };
      token[id] = String(zeile.token || "");
    }

    // Erst entscheiden, dann senden. So steht die Menge fest, bevor die erste
    // Mail hinausgeht, und der Deckel kann überhaupt greifen.
    const faellig: Array<{ bewerber: typeof bewerber[number]; art: Exclude<FaelligeErinnerung, "keine"> }> = [];
    for (const b of bewerber) {
      const art = faelligeErinnerung(kettenStand(b, boegen[b.id]));
      if (art !== "keine") faellig.push({ bewerber: b, art });
    }

    // Beide Stufen dieser Kette sind Mails an den Bewerber. Eine
    // eigene Liste für die Glocke an HR gibt es nicht mehr.
    const mailFaellig = faellig;

    /*
     * Die zweite Kette: der abgeschickte Bogen.
     *
     * Sie kann sich mit der ersten nicht überlagern. Deren erste
     * Stoppbedingung heißt „abgeschickt", und genau das ist hier die
     * Voraussetzung. Wer in der einen Liste steht, steht nie in der anderen.
     *
     * Seit dem 08.09.2026 hat sie zwei Hälften. Vor der Einladung geht nichts
     * an den Bewerber, sondern nur an uns: Er kann gar nicht buchen, solange
     * wir ihn nicht eingeladen haben. Erst danach erinnern die beiden Mails an
     * den Termin. `gehtAnHr` trennt die beiden Sorten, und nur die Mails an
     * den Bewerber zählen gegen den Mengendeckel.
     */
    const buchungAlle: Array<{ bewerber: typeof bewerber[number]; art: Exclude<BuchungFaellig, "keine"> }> = [];
    for (const b of bewerber) {
      const art = faelligeBuchungErinnerung(buchungStand(b));
      if (art !== "keine") buchungAlle.push({ bewerber: b, art });
    }
    const buchungFaellig = buchungAlle.filter((f) => !gehtAnHr(f.art));
    const buchungHrFaellig = buchungAlle.filter((f) => gehtAnHr(f.art));

    /*
     * Der Deckel, und zwar einer, der greift.
     *
     * Gezählt wird mit der Service-Rolle, deshalb ist die Zahl echt. Ist sie
     * nicht zu ermitteln, bricht der Lauf ab, bevor eine Mail hinausgeht.
     *
     * Zurückgehalten wird nur der Überhang, nicht der ganze Lauf. Ein harter
     * Abbruch wäre eine Falle: Lägen einmal 31 Erinnerungen an, käme der
     * Zählstand nie über null, und die Kette stünde für immer. So gehen die
     * ersten hinaus und der Rest am nächsten Morgen.
     *
     * Beide Ketten teilen sich denselben Deckel. Sie schreiben an dieselben
     * Menschen, und zwei getrennte Deckel wären zusammen der doppelte.
     */
    let zurueckgehalten = 0;
    let mailArbeit = mailFaellig;
    let buchungArbeit = buchungFaellig;

    if (mailFaellig.length + buchungFaellig.length > 0) {
      const bisher = await mailsLetzteStunde(admin);
      if (bisher === null) {
        return antwort({ error: "Zählstand des Mailversands nicht lesbar, es wurde nichts verschickt" }, 500);
      }
      let platz = Math.max(0, MAX_JE_STUNDE - bisher);
      mailArbeit = mailFaellig.slice(0, platz);
      platz -= mailArbeit.length;
      buchungArbeit = buchungFaellig.slice(0, platz);
      zurueckgehalten =
        (mailFaellig.length - mailArbeit.length) + (buchungFaellig.length - buchungArbeit.length);
      if (zurueckgehalten > 0) {
        console.error(
          `[kennenlernen-erinnerungen] Deckel greift: ${bisher} Mails in der letzten Stunde, ` +
          `${mailFaellig.length + buchungFaellig.length} wären fällig, erlaubt sind ${MAX_JE_STUNDE}. ` +
          `${zurueckgehalten} warten auf den nächsten Lauf.`,
        );
      }
    }

    // Die HR-Managerin für den Kasten am Fuß der Mail, einmal je Lauf: Der
    // Kasten ist für alle Empfänger derselbe.
    const hrKontakt =
      mailArbeit.length + buchungArbeit.length > 0 ? await hrAnsprechpartner(admin as never) : undefined;

    let gesendet = 0;
    let gemeldet = 0;
    let geschlossen = 0;
    const fehlgeschlagen: Array<{ id: string; grund: string }> = [];

    for (const { bewerber: b, art } of mailArbeit) {
      const name = `${b.vorname || ""} ${b.nachname || ""}`.trim() || "Ein Bewerber";
      const jetzt = new Date().toISOString();
      let versandOk = false;
      let versandGrund = "";

      const bogenToken = token[b.id] || "";
      if (!b.email || !bogenToken) {
        /*
         * Ohne Adresse geht nichts hinaus, ohne Bogen wäre die Mail eine
         * Erinnerung an einen Link, den es nicht mehr gibt. Beides ändert
         * sich morgen nicht von selbst, deshalb wird trotzdem vermerkt: Ein
         * täglicher Fehlversuch verdeckt nur die echten Fehler.
         */
        versandGrund = b.email ? "kein Bogen mehr vorhanden" : "keine Mailadresse";
        fehlgeschlagen.push({ id: b.id, grund: versandGrund });
      } else {
        const wortfassung = erinnerungWortfassung(hatAngefangen(boegen[b.id]));
        /*
         * Die Zaehlmarke am Link, seit dem 26.09.2026 statt des Zaehlpixels.
         * Best effort: Scheitert der Eintrag, geht die Erinnerung mit dem
         * nackten Link hinaus.
         *
         * Der Eintrag entsteht vor dem Versand, denn sein Token gehoert an den
         * Link. Wird die Mail danach als Doppelgaenger abgewiesen (der
         * `idempotencyKey` laesst je Bewerber und Stufe genau eine zu), bleibt
         * eine Zeile ohne zugehoerige Mail stehen. Sie zaehlt dann als
         * "verschickt, keine Oeffnung gemessen" und macht die Quote etwas
         * schlechter, als sie ist. Das ist die harmlosere Seite: Der
         * umgekehrte Fall waere eine Mail ohne Messung, und der erzeugt genau
         * die falsche Fehlanzeige, die hier vermieden werden soll.
         */
        const kennenlernenLink = await linkMitZaehlung(
          admin,
          b.id,
          TRACKING_ART[art],
          `${KENNENLERNEN_BASIS_URL}/${bogenToken}`,
        );
        const versand = await sendeVorlage(admin, {
          templateName: VORLAGEN[art],
          recipientEmail: b.email,
          // Je Bewerber und Stufe genau eine Mail, auch wenn diese Function
          // zweimal am selben Tag läuft.
          idempotencyKey: `${VORLAGEN[art]}-${b.id}`,
          templateData: {
            ...(hrKontakt ? { hrKontakt } : {}),
            bewerberName: name,
            kennenlernenLink,
            gueltigTage: KENNENLERNEN_GUELTIG_TAGE,
            wortfassung,
            /*
             * Die letzte Mail bekommt keinen Abmeldeknopf. Er führte genau zu
             * dem Stand, den diese Mail ohnehin setzt, wäre also ein Knopf
             * ohne Wirkung. Die Vorlage kennt das Feld dort auch nicht.
             */
            ...(art === "tag11"
              ? {}
              : { abmeldeLink: await abmeldeLinkFuer(admin, b.id, b.vorname || "") }),
          },
          metadata: { bewerbungId: b.id, anlass: `kennenlernen-${art}` },
        });
        versandOk = versand.ok;
        versandGrund = versand.grund || "";
        if (versand.ok) gesendet++;
        else {
          console.error("[kennenlernen-erinnerungen] Versand fehlgeschlagen", b.id, versand.grund);
          fehlgeschlagen.push({ id: b.id, grund: versand.grund || "Versand fehlgeschlagen" });
        }
      }

      /*
       * Vermerken, auch wenn es schiefging.
       *
       * Sonst versucht es der Dienst jeden Morgen erneut, und sobald der
       * Fehler behoben ist, bekommt der Bewerber die Mail doch mehrfach.
       * Dieselbe Begründung steht in send-bewerber-formular-erinnerungen. Ob
       * es geklappt hat, steht daneben.
       *
       * Der Meta-Stand wird frisch gelesen, damit eine parallele Änderung im
       * CRM nicht mit dem Stand vom Anfang des Laufs überschrieben wird. Der
       * Status wird aus demselben Grund frisch gelesen: Zwischen dem Anfang
       * des Laufs und dieser Zeile kann jemand den Bewerber weitergeschoben
       * haben.
       */
      const { data: aktuell } = await admin
        .from("bewerbungen").select("status, meta").eq("id", b.id).maybeSingle();
      const meta = (aktuell?.meta && typeof aktuell.meta === "object" ? aktuell.meta : {}) as Record<string, unknown>;

      /*
       * Tag 11 schließt das Verfahren.
       *
       * Nur bei tatsächlich verschickter Mail. Wer den Stand „Kein Interesse"
       * bekommt, ohne davon erfahren zu haben, ist stillschweigend aussortiert,
       * und genau das soll diese Stufe beenden. Ging die Mail nicht hinaus,
       * bleibt der Status stehen und der Verlaufseintrag sagt, warum.
       *
       * `zielStatusNachAbmeldung` entscheidet, aus welchen Stufen überhaupt
       * geschlossen wird. Dieselbe Regel wie beim Abmeldeknopf: Wer inzwischen
       * einen Vertrag unterschrieben hat, wird von der Maschine nicht wieder
       * ausgetragen.
       *
       * **Und eine Gruppe bekommt die Mail, aber keinen Statuswechsel.** Wer
       * gesagt hat „bitte nicht anrufen", hat damit gesagt, dass er
       * interessiert ist. Ihn auf „Kein Interesse" zu setzen schriebe das
       * Gegenteil in die Akte. `darfFallSchliessen` trennt die beiden Fälle,
       * und der Verlaufseintrag benennt den Unterschied.
       */
      const zusatz: Record<string, unknown> = {};
      let neuerStatus: string | null = null;
      if (art === "tag11") {
        const alterStatus = String(aktuell?.status ?? b.status ?? "");
        const standJetzt = kettenStand({ status: alterStatus, meta }, boegen[b.id]);
        const darfSchliessen = darfFallSchliessen(standJetzt);
        neuerStatus = versandOk && darfSchliessen ? zielStatusNachAbmeldung(alterStatus) : null;
        const skript = (meta.erstgespraechSkript && typeof meta.erstgespraechSkript === "object"
          ? meta.erstgespraechSkript
          : {}) as Record<string, unknown>;
        const notizenLog = Array.isArray(meta.notizenLog) ? meta.notizenLog : [];
        const notiz = {
          id: crypto.randomUUID(),
          text: !versandOk
            ? erinnerung3FehlerNotiz(versandGrund)
            : darfSchliessen
            ? erinnerung3Notiz(neuerStatus !== null, alterStatus)
            : erinnerung3NichtAnrufenNotiz(alterStatus),
          datum: jetzt,
          autor: ERINNERUNG_3_AUTOR,
          autorId: "",
        };
        zusatz.notizenLog = [notiz, ...notizenLog];
        // Nur bei echter Statusänderung als Absage vermerken, sonst stünde bei
        // einem aktiven Partner ein Absagegrund in der Akte. Gleiche Regel wie
        // in `bewerber-kein-interesse`.
        if (neuerStatus !== null) {
          zusatz.erstgespraechSkript = {
            ...skript,
            absageGrund: ERINNERUNG_3_ABSAGEGRUND,
            abgelehntAm: jetzt,
            abgelehntVon: ERINNERUNG_3_AUTOR,
          };
        }
      }

      const { error: schreibFehler } = await admin
        .from("bewerbungen")
        .update({
          meta: {
            ...meta,
            ...zusatz,
            kennenlernen: vermerkNachVersand(kennenlernenBlock(meta), art, jetzt, versandOk),
          },
          ...(neuerStatus !== null ? { status: neuerStatus } : {}),
        })
        .eq("id", b.id);
      if (schreibFehler) {
        // Die Mail ist draußen; ohne Vermerk ginge morgen eine zweite hinaus.
        console.error("[kennenlernen-erinnerungen] Vermerk fehlgeschlagen", b.id, schreibFehler);
        fehlgeschlagen.push({ id: b.id, grund: "Nachricht raus, Vermerk in der Akte fehlgeschlagen" });
      } else if (neuerStatus !== null) {
        geschlossen++;
      }
    }

    /*
     * Die Kette nach dem Absenden: erst die Sichtung an uns, dann die
     * Terminerinnerungen an den Bewerber.
     *
     * Getrennter Durchgang und nicht in der Schleife oben: Beide Ketten führen
     * zwar eine Stufe, aber jede in ihrem eigenen Feld und mit ihrem eigenen
     * Zähler. Zwei verschiedene Regeln in einer Schleife zu führen, war schon
     * einmal der Weg zu einer Mail, die niemand erklären konnte.
     */
    let buchungGesendet = 0;
    for (const { bewerber: b, art } of [...buchungArbeit, ...buchungHrFaellig]) {
      const name = `${b.vorname || ""} ${b.nachname || ""}`.trim() || "Ein Bewerber";
      const jetzt = new Date().toISOString();
      const bogenToken = token[b.id] || "";
      let versandOk = false;

      if (art === "sichtung3" || art === "sichtung7") {
        /*
         * Die umgedrehte Hälfte: Der Bogen liegt abgeschickt da, und niemand
         * hat entschieden. Gemahnt wird deshalb nicht der Bewerber, sondern
         * wir. Ohne diese Meldung wäre die Umstellung auf die Einladung aus
         * dem Profil ein Rückschritt: Vorher passierte wenigstens etwas, wenn
         * niemand etwas tat.
         */
        const tage = art === "sichtung3" ? SICHTUNG_TAG : SICHTUNG_TAG_2;
        versandOk = await meldeHrAnruf(admin, {
          bewerbungId: b.id,
          name,
          email: b.email || "",
          telefon: b.telefon || "",
          anlass: "sichtung",
          schluessel: art,
          glockenTitel: `Kennenlernbogen wartet: ${name}`,
          nachricht: sichtungHrText(name, tage),
        });
        if (versandOk) gemeldet++;
        else fehlgeschlagen.push({ id: b.id, grund: "kein Empfänger für die Meldung" });
      } else if (art === "hr10") {
        /*
         * Tag 10 nach der Einladung ist keine dritte Mail an den Bewerber,
         * sondern die Bitte an HR, anzurufen. Genau diese Stufe fehlte bis zum
         * 07.09.2026, und damit endete die Kette bei jemandem, der sein
         * Kennenlernen fertig gemacht hat, ohne dass irgendjemand davon erfuhr.
         */
        versandOk = await meldeHrAnruf(admin, {
          bewerbungId: b.id,
          name,
          email: b.email || "",
          telefon: b.telefon || "",
          anlass: "termin",
          glockenTitel: `Kein Termin gebucht: ${name}`,
          nachricht: buchungHrText(name),
        });
        if (versandOk) gemeldet++;
        else fehlgeschlagen.push({ id: b.id, grund: "kein Empfänger für die Meldung" });
      } else if (!b.email || !bogenToken) {
        fehlgeschlagen.push({ id: b.id, grund: b.email ? "kein Bogen mehr vorhanden" : "keine Mailadresse" });
      } else {
        const antworten = (boegen[b.id]?.antworten || {}) as Record<string, unknown>;
        const versand = await sendeVorlage(admin, {
          templateName: BUCHUNG_VORLAGE,
          recipientEmail: b.email,
          // Je Bewerber und Stufe genau eine, auch wenn dieser Lauf zweimal am
          // Tag kommt. Die Stufe gehoert in den Schluessel, sonst gaebe die
          // Warteschlange die zweite Mail als Dublette der ersten aus.
          idempotencyKey: `${BUCHUNG_VORLAGE}-${art}-${b.id}`,
          templateData: {
            ...(hrKontakt ? { hrKontakt } : {}),
            stufe: BUCHUNG_STUFE[art],
            bewerberName: name,
            /*
             * Der Buchungslink, nicht mehr der Link zum Bogen. Der Bogen endet
             * seit dem 08.09.2026 ohne Terminwahl; ein Knopf dorthin führte in
             * eine Danksagung statt in den Kalender. Dasselbe Token und
             * dieselbe Strecke wie in der Einladung aus dem Bewerberprofil.
             */
            terminLink: kooperationsBuchungsLink(bogenToken),
            dauerMinuten: dauerMinuten(antworten),
          },
          metadata: { bewerbungId: b.id, anlass: `kennenlernen-buchung-${art}` },
        });
        versandOk = versand.ok;
        if (versand.ok) buchungGesendet++;
        else {
          console.error("[kennenlernen-erinnerungen] Buchungserinnerung fehlgeschlagen", b.id, versand.grund);
          fehlgeschlagen.push({ id: b.id, grund: versand.grund || "Versand fehlgeschlagen" });
        }
      }

      // Auch hier vermerken, wenn es schiefging: Sonst versucht es der Dienst
      // jeden Morgen erneut und schickt die Mail doch mehrfach, sobald der
      // Fehler behoben ist. Dieselbe Begründung wie oben.
      const { data: aktuell } = await admin
        .from("bewerbungen").select("meta").eq("id", b.id).maybeSingle();
      const meta = (aktuell?.meta && typeof aktuell.meta === "object" ? aktuell.meta : {}) as Record<string, unknown>;
      const { error: schreibFehler } = await admin
        .from("bewerbungen")
        .update({
          meta: {
            ...meta,
            kennenlernen: vermerkNachBuchungStufe(kennenlernenBlock(meta), art, jetzt, versandOk),
          },
        })
        .eq("id", b.id);
      if (schreibFehler) {
        console.error("[kennenlernen-erinnerungen] Vermerk fehlgeschlagen", b.id, schreibFehler);
        fehlgeschlagen.push({ id: b.id, grund: "Nachricht raus, Vermerk in der Akte fehlgeschlagen" });
      }
    }

    return antwort({
      ok: true,
      geprueft: bewerber.length,
      faellig: faellig.length + buchungAlle.length,
      gesendet,
      buchungErinnerungen: buchungGesendet,
      zurueckgehalten,
      gemeldet,
      geschlossen,
      fehlgeschlagen,
    });
  } catch (e) {
    console.error("[kennenlernen-erinnerungen] Fehler", e);
    return antwort({ error: e instanceof Error ? e.message : "Unbekannt" }, 500);
  }
});
