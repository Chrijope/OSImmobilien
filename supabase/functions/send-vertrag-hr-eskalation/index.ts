import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import {
  ABSCHLUSS_ABSAGEGRUND,
  BEWERBER_ERINNERUNGEN,
  gespraechNach,
  naechsteBewerberErinnerung,
} from "../_shared/vertrag-erinnerung-text.ts";

/**
 * Meldet HR, wenn ein versendeter Vertrag unsigniert liegen bleibt.
 *
 * Der Vertragsversand war bisher die stillste Stelle im Prozess: Der
 * Signaturlink ist 30 Tage gültig und lief danach lautlos ab. Weder der
 * Bewerber noch das Haus bekamen davon etwas mit. Genau dort ist aber bereits
 * alles investiert, was der Trichter kostet.
 *
 * Vier Stufen mit steigender Dringlichkeit. Jede Stufe geht genau einmal, der
 * Stand liegt in `meta.vertragHrEskalation`.
 *
 * Zwei Dinge gehören ausdrücklich NICHT in diese Leiter:
 *
 * 1. Bewerber, die den Vertragsschritt schon hinter sich haben (Rechnung,
 *    Nutzer anlegen, Aktiv) oder ausgeschieden sind (Kein Interesse,
 *    Abgelehnt). Vorher wurde der Bewerberstatus gar nicht gelesen, dadurch
 *    bekam HR am 03.09.2026 Meldungen zu längst aktiven Partnern und zu
 *    Absagen aus dem Juli.
 * 2. Verträge, die der Bewerber unterschrieben hat und bei denen nur die
 *    Gegenzeichnung durch Christian Kurz fehlt (`wartet_auf_kurz`). Das ist
 *    kein Fall für HR und schon gar nicht "nicht unterschrieben". Dafür gibt
 *    es einmal je Anfrage eine Glocke und eine Inbox-Aufgabe, nur für Kurz.
 *
 * Seit dem 19.09.2026 schreibt diese Funktion zusätzlich an den BEWERBER,
 * seit dem 30.09.2026 in drei Stufen an Tag 5, 7 und 14. Stufe 3 schließt den
 * Vorgang: Status „Kein Interesse“ mit Grund, Signaturlink geschlossen.
 * Vorher hörte er nach der Vertragsmail nie wieder etwas.
 *
 * Sie gelten nur für Verträge, die ab dem Ausrollen versendet wurden. Der
 * Bestand bleibt unberührt, siehe ERINNERUNG_AB.
 *
 * Die beiden Erinnerungen hängen bewusst in dieser Funktion und nicht in einer
 * eigenen. Sie lesen dieselben Daten, brauchen dieselben Ausschlüsse (kein
 * Ausgeschiedener, kein bereits Unterschriebener) und müssen sich mit den
 * HR-Stufen abstimmen. Zwei Funktionen mit denselben Filtern laufen früher
 * oder später auseinander, und dann schreibt eine von beiden jemandem, dem die
 * andere längst nicht mehr schreiben würde. Der Funktionsname ist dadurch zu
 * eng geworden; umbenannt wird er nicht, daran hängt der pg_cron-Eintrag.
 *
 * Läuft täglich über pg_cron.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_URL = "https://osimmobilien.netlify.app";

/** Nach so vielen Tagen verfällt der Signaturlink. */
const LINK_GUELTIG_TAGE = 30;

/**
 * Bewerber, deren Vertragsschritt abgeschlossen oder hinfällig ist. Für sie
 * ist eine "nicht unterschrieben"-Meldung immer falsch, egal was im
 * Vertragsstand steht. Bewusst als Ausschlussliste und nicht als
 * Positivfilter auf "Vertrag": Der Status kann manuell auch auf eine frühere
 * Stufe zurückgesetzt werden, dann soll die Leiter weiterlaufen.
 */
const STATUS_OHNE_MELDUNG = new Set(["Rechnung", "Nutzer_anlegen", "Aktiv", "KeinInteresse", "Abgelehnt"]);

/** Nur ausgeschiedene Bewerber: Für sie ist auch die Gegenzeichnung hinfällig. */
const STATUS_AUSGESCHIEDEN = new Set(["KeinInteresse", "Abgelehnt"]);

/**
 * Christian Kurz gegenzeichnet jeden Handelsvertretervertrag. Die Anfrage
 * liegt in seinem Postfach os@os-immobilien.com (siehe finalize-vertrag). Sein
 * Konto wird über diese Adresse gesucht, die feste ID ist nur der Rückfall,
 * falls das Profil die Adresse einmal nicht trägt.
 */
const CHRISTIAN_KURZ_EMAIL = "os@os-immobilien.com";
const CHRISTIAN_KURZ_USER_ID = "df8190e9-b5f2-4519-8343-293688ff062d";

/**
 * Auslöser der Inbox-Aufgabe. Das Präfix "bewerber_" plus Bewerbungs-ID
 * hinter dem Doppelpunkt ist die Form, die die Inbox versteht und in die
 * Bewerberakte verlinkt (bewerbungIdAusAusloeser in src/lib/aufgabenStore.ts).
 */
function gegenzeichnungAusloeser(bewerbungId: string): string {
  return `bewerber_vertrag_gegenzeichnung:${bewerbungId}`;
}

function datumDeutsch(wert: string): string {
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(wert.trim());
  const d = de ? new Date(Number(de[3]), Number(de[2]) - 1, Number(de[1])) : new Date(wert);
  return isNaN(d.getTime()) ? wert : d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
}

type Stufe = {
  id: string;
  abTagen: number;
  titel: string;
  /** Was HR jetzt tun soll. Steht in Mail und Glocke. */
  handlung: string;
  /** Erst ab dieser Stufe wird zusätzlich eine Mail verschickt. */
  mitMail: boolean;
};

/**
 * Die Eskalationsleiter. Bewusst mit einer stillen ersten Stufe: Nach drei
 * Tagen ist Nichtstun noch völlig normal, eine Mail wäre Alarmismus. Ab Tag
 * sieben wird es ernst, ab Tag vierzehn ist ein Anruf fällig, und kurz vor
 * Ablauf des Links muss jemand entscheiden.
 */
const STUFEN: Stufe[] = [
  {
    id: "t3", abTagen: 3, titel: "Stufe 1 von 4", mitMail: false,
    handlung: "Noch kein Grund zur Sorge. Im Blick behalten.",
  },
  {
    id: "t7", abTagen: 7, titel: "Stufe 2 von 4", mitMail: true,
    handlung: "Bitte einmal persönlich anrufen und fragen, ob beim Lesen etwas unklar war. Erfahrungsgemäß hakt es an einer einzelnen Klausel, nicht an der Entscheidung.",
  },
  {
    id: "t14", abTagen: 14, titel: "Stufe 3 von 4", mitMail: true,
    handlung: "Zwei Wochen ohne Unterschrift heißt fast immer: Es gibt eine offene Frage, die niemand gestellt hat. Bitte direkt anrufen und ehrlich fragen, woran es liegt.",
  },
  {
    id: "t25", abTagen: 25, titel: "Stufe 4 von 4", mitMail: true,
    handlung: "Letzte Gelegenheit vor Ablauf des Signaturlinks. Bitte heute entscheiden: nachfassen, Vertrag neu erzeugen oder den Vorgang sauber schließen.",
  },
];

/**
 * Ab wann die Erinnerungen an den Bewerber gelten.
 *
 * Christians Vorgabe vom 19.09.2026: nur neue Vertraege, der Bestand bleibt
 * unberuehrt. Der Grund ist einleuchtend. Bei einem Vertrag, der seit zwoelf
 * Tagen offen liegt, waere die erste automatische Nachricht ueberhaupt gleich
 * die mit der Ueberschrift "letzte Erinnerung". Der Bewerber bekaeme also aus
 * heiterem Himmel eine Schlussmahnung zu einem Vorgang, um den sich vielleicht
 * laengst jemand persoenlich kuemmert.
 *
 * Der Stichtag ist der Zeitpunkt, zu dem die Funktion ausgerollt wurde.
 * Gezaehlt wird gegen `created_at` der Signaturanfrage, also gegen den
 * Zeitpunkt des Versands. Wird ein alter Vertrag spaeter von Hand erneut
 * versendet, entsteht eine neue Anfrage, und ab dann gilt er als neu. Das ist
 * richtig so: In dem Moment hat der Bewerber eine frische Vertragsmail
 * bekommen, und eine Erinnerung darauf ergibt wieder Sinn.
 *
 * Diese Zeile darf spaeter ersatzlos verschwinden. Sobald der Bestand von
 * damals abgearbeitet ist, hat sie keine Wirkung mehr.
 */
const ERINNERUNG_AB = Date.parse("2026-09-19T08:00:00Z");

// Die Stufen (Tag 5, 7, 14) und die Auswahl stehen in
// _shared/vertrag-erinnerung-text.ts, geprüft in src/lib/vertragErinnerungText.test.ts.

/** Der Merker je Signaturanfrage: welche Erinnerungen schon hinausgingen. */
type ErinnerungsStand = { token?: string; stufen?: string[] };

/**
 * Samstag oder Sonntag in deutscher Zeit?
 *
 * Am Wochenende geht keine Erinnerung hinaus. Eine Vertragsmahnung am
 * Sonntagmorgen liest sich nach Druck, und antworten kann ohnehin niemand.
 * Weil der Job täglich läuft, rutscht die Mail dann von selbst auf Montag;
 * der Text nennt deshalb die echte Zahl der Tage und keine feste.
 */
function istWochenende(): boolean {
  const berlin = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const tag = berlin.getDay();
  return tag === 0 || tag === 6;
}

function tageSeit(wert: string): number {
  // Altbestand: sendVertrag schrieb frueher deutsches Datum ("31.8.2026").
  // new Date() liest das gar nicht oder falsch (Monat und Tag vertauscht),
  // dadurch fiel die Eskalation fuer diese Vertraege still aus. Neu wird ISO
  // geschrieben, das deutsche Format muss aber weiter lesbar bleiben.
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(wert.trim());
  const start = de
    ? new Date(Number(de[3]), Number(de[2]) - 1, Number(de[1])).getTime()
    : new Date(wert).getTime();
  if (isNaN(start)) return -1;
  return Math.floor((Date.now() - start) / 86_400_000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "send-vertrag-hr-eskalation", corsHeaders);
  if (abgewiesen) return abgewiesen;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { data: bewerber, error } = await admin
      .from("bewerbungen")
      .select("id, vorname, nachname, email, telefon, status, meta");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Empfänger einmal ermitteln, nicht je Bewerber.
    //
    // Nur die HR-Rolle. Admin und Inhaber standen hier mit auf der Liste und
    // bekamen jede Stufe als Glocke und teils als Mail, obwohl der offene
    // Vertrag eines Bewerbers nicht ihre Arbeit ist.
    const { data: rollen } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "hr");
    const empfaengerIds = [...new Set((rollen || []).map((r) => r.user_id))];

    const { data: profile } = empfaengerIds.length
      ? await admin.from("profiles").select("id, email").in("id", empfaengerIds)
      : { data: [] as { id: string; email: string | null }[] };

    const mailAdressen = (profile || [])
      .map((p) => p.email)
      .filter((e): e is string => !!e && e.includes("@"));

    // Konto von Christian Kurz für die Gegenzeichnungs-Meldung, einmal je Lauf.
    const { data: kurzProfil } = await admin
      .from("profiles").select("id").eq("email", CHRISTIAN_KURZ_EMAIL).limit(1).maybeSingle();
    const kurzId: string = (kurzProfil?.id as string | undefined) || CHRISTIAN_KURZ_USER_ID;

    // ── Unterlagen für die Erinnerungen an den Bewerber ──────────────────
    //
    // Der Signaturlink steht nicht in `meta`, sondern in `signature_requests`.
    // Das ist auch die bessere Quelle: Dort steht mit `expires_at` die echte
    // Gültigkeit und mit `created_at` der Zeitpunkt der zuletzt versendeten
    // Anfrage. Sendet HR von Hand erneut, entsteht eine neue Anfrage, und die
    // Zählung beginnt von vorn. Genau so soll es sein: Wer gestern eine
    // frische Vertragsmail bekommen hat, darf morgen nicht lesen, sein Vertrag
    // liege seit zehn Tagen herum.
    const { data: anfragen } = await admin
      .from("signature_requests")
      .select("kontakt_id, token, created_at, expires_at, sa_data")
      .eq("person_type", "vertrag")
      .eq("status", "pending");

    // Je Bewerber die jüngste offene Anfrage.
    const anfrageJeBewerber = new Map<string, { token: string; created_at: string; expires_at: string }>();
    for (const a of (anfragen || []) as Array<{ kontakt_id: string; token: string; created_at: string; expires_at: string; sa_data?: Record<string, unknown> | null }>) {
      // Ein Testversand ("Test-Mail an mich") ist eine eigene offene Anfrage.
      // Ohne diesen Filter bekam der Bewerber in der Erinnerung den Testlink,
      // und die Zählung begann neu.
      if (a.sa_data?.testversand === true) continue;
      const bisher = anfrageJeBewerber.get(a.kontakt_id);
      if (!bisher || new Date(a.created_at).getTime() > new Date(bisher.created_at).getTime()) {
        anfrageJeBewerber.set(a.kontakt_id, a);
      }
    }

    // Unter den Erinnerungen steht dieselbe Person wie unter der Vertragsmail:
    // wer die Rolle `hr` trägt. Einmal je Lauf, nicht je Bewerber.
    const hrKontakt = await hrAnsprechpartner(admin as never);

    // Am Wochenende schweigt die Automatik, siehe istWochenende().
    const wochenende = istWochenende();

    let gemeldet = 0;
    let gegenzeichnungGemeldet = 0;
    let erinnert = 0;

    for (const b of bewerber || []) {
      const meta = (b.meta as Record<string, unknown>) || {};
      if (meta._type && meta._type !== "bewerber") continue;

      const bewerberStatus = String(b.status || "");
      const status = String(meta.vertragStatus || "");
      const erstVersand = String(meta.vertragErstVersandAt || meta.vertragDatum || "");
      const name = `${b.vorname || ""} ${b.nachname || ""}`.trim() || "Ein Bewerber";

      // Bewerber hat unterschrieben, Christian Kurz noch nicht: keine
      // HR-Leiter, sondern genau eine Meldung an Kurz je Anfrage.
      if (status === "wartet_auf_kurz") {
        if (meta.vertragSignedAt) continue;
        if (STATUS_AUSGESCHIEDEN.has(bewerberStatus)) continue;
        const anfrageAt = String(meta.vertragKurzAnfrageAt || "");
        // Merker je Anfrage: Wird die Gegenzeichnung neu angefragt, ändert sich
        // der Zeitstempel und die Meldung geht erneut raus.
        if (anfrageAt && meta.vertragKurzInboxAnfrageAt === anfrageAt) continue;
        if (!anfrageAt && meta.vertragKurzInboxAnfrageAt) continue;

        const unterschriebenAm = datumDeutsch(String(meta.vertragBewerberSignedAt || anfrageAt || erstVersand));
        const tageOffen = anfrageAt ? tageSeit(anfrageAt) : -1;
        const seit = tageOffen >= 0 ? ` seit ${tageOffen} Tagen` : "";
        const titel = `Gegenzeichnung offen: ${name}`;
        const nachricht =
          `${name} hat den Vertrag am ${unterschriebenAm} unterschrieben. ` +
          `Der Vertrag wartet${seit} auf Deine Gegenzeichnung. ` +
          `Die Anfrage mit dem Signaturlink liegt in Deinem Postfach ${CHRISTIAN_KURZ_EMAIL}.`;

        // Aufgabe in der Inbox von Kurz. Der eindeutige Index auf
        // (zugewiesen_an, ausloeser_schluessel) hält sie je Bewerber einmalig,
        // solange sie offen ist; ein Duplikat-Fehler ist deshalb kein Problem.
        const { error: aufgabeFehler } = await admin.from("aufgaben").insert({
          benutzer_id: kurzId,
          zugewiesen_an: kurzId,
          titel,
          beschreibung: nachricht,
          prioritaet: "hoch",
          typ: "aufgabe",
          faellig_am: new Date().toISOString().slice(0, 10),
          erstellt_von_name: "Vertragsprozess",
          ausloeser_schluessel: gegenzeichnungAusloeser(b.id),
        });
        if (aufgabeFehler && !String(aufgabeFehler.message || "").toLowerCase().includes("duplicate")) {
          console.error("Gegenzeichnungs-Aufgabe konnte nicht angelegt werden:", aufgabeFehler);
        }

        await admin.from("benachrichtigungen").insert({
          id: crypto.randomUUID(),
          benutzer_id: kurzId,
          titel,
          nachricht,
          link: "/inbox",
          gelesen: false,
          erstellt_am: new Date().toISOString(),
        });

        await admin.from("bewerbungen").update({
          meta: { ...meta, vertragKurzInboxAnfrageAt: anfrageAt || new Date().toISOString() },
        }).eq("id", b.id);

        gegenzeichnungGemeldet++;
        continue;
      }

      // Nur offene Verträge. Unterschrieben, abgelehnt oder nie versendet: nichts zu tun.
      if (status !== "gesendet") continue;
      if (meta.vertragSignedAt) continue;
      if (!erstVersand) continue;
      // Wer den Vertragsschritt hinter sich hat oder ausgeschieden ist, wird
      // nicht als "nicht unterschrieben" gemeldet.
      if (STATUS_OHNE_MELDUNG.has(bewerberStatus)) continue;

      const tage = tageSeit(erstVersand);
      if (tage < STUFEN[0].abTagen) continue;

      // ── Erinnerung an den Bewerber ─────────────────────────────────────
      //
      // Bewusst vor der HR-Leiter und mit eigenem `if` statt `continue`: Die
      // beiden Zeitpläne laufen unabhängig. Ein Bewerber an Tag 4 bekommt
      // seine Erinnerung, auch wenn für HR an diesem Tag nichts ansteht.
      const anfrage = anfrageJeBewerber.get(b.id);
      // Nur Vertraege, die ab dem Stichtag versendet wurden, siehe ERINNERUNG_AB.
      const istNeuerVertrag = !!anfrage && Date.parse(anfrage.created_at) >= ERINNERUNG_AB;
      if (!wochenende && anfrage && istNeuerVertrag && b.email) {
        // Gezählt wird ab der zuletzt versendeten Anfrage, nicht ab dem
        // Erstversand, siehe Kommentar beim Laden.
        const tageSeitAnfrage = tageSeit(anfrage.created_at);
        const stand = (meta.vertragBewerberErinnerung as ErinnerungsStand) || {};
        // Neue Anfrage heißt neue Zählung: Der alte Stand gilt nicht mehr.
        const bereits = stand.token === anfrage.token && Array.isArray(stand.stufen) ? stand.stufen : [];

        // Die niedrigste offene Stufe, höchstens eine je Tag. Stufe 3 bleibt
        // aus, wenn HR nach dem Versand mit dem Bewerber gesprochen hat.
        const faelligeErinnerung = naechsteBewerberErinnerung(
          tageSeitAnfrage,
          bereits,
          gespraechNach(meta.kontaktversuche, anfrage.created_at),
        );

        if (faelligeErinnerung) {
          const gueltigBis = anfrage.expires_at
            ? new Date(anfrage.expires_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })
            : "";
          const abschluss = BEWERBER_ERINNERUNGEN[BEWERBER_ERINNERUNGEN.length - 1];
          const abschlussAm = new Date(Date.parse(anfrage.created_at) + abschluss.abTagen * 86_400_000)
            .toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

          const versand = await sendeVorlage(admin, {
            templateName: faelligeErinnerung.vorlage,
            recipientEmail: b.email,
            // Je Anfrage und Stufe genau einmal, auch wenn der Lauf zweimal
            // startet oder der Merker nicht geschrieben werden konnte.
            idempotencyKey: `vertrag-erinnerung-${faelligeErinnerung.id}-${anfrage.token}`,
            templateData: {
              name,
              signatureUrl: `${PORTAL_URL}/signatur?token=${anfrage.token}&type=vertrag`,
              tageOffen: tageSeitAnfrage,
              ...(gueltigBis ? { gueltigBis } : {}),
              abschlussAm,
              ...(hrKontakt ? { hrKontakt } : {}),
            },
          });

          if (versand.ok) {
            const stufenNeu = [...bereits, faelligeErinnerung.id];
            meta.vertragBewerberErinnerung = { token: anfrage.token, stufen: stufenNeu };

            if (faelligeErinnerung.id === "e3") {
              // Abschluss: Kein Interesse mit Grund, Link zu, Glocke an HR.
              // Danach nichts mehr, auch keine HR-Stufe für diesen Bewerber.
              const jetzt = new Date().toISOString();
              const skript = (meta.erstgespraechSkript && typeof meta.erstgespraechSkript === "object"
                ? meta.erstgespraechSkript
                : {}) as Record<string, unknown>;
              const notizenLog = Array.isArray(meta.notizenLog) ? meta.notizenLog : [];
              const autor = "Automatik Vertragserinnerung";
              const { error: abschlussFehler } = await admin.from("bewerbungen").update({
                status: "KeinInteresse",
                meta: {
                  ...meta,
                  vertragAutomatischGeschlossenAm: jetzt,
                  erstgespraechSkript: { ...skript, absageGrund: ABSCHLUSS_ABSAGEGRUND, abgelehntAm: jetzt, abgelehntVon: autor },
                  notizenLog: [{
                    id: crypto.randomUUID(),
                    text: `Auf Kein Interesse gesetzt: ${ABSCHLUSS_ABSAGEGRUND}. Abschlussmail verschickt, Signaturlink geschlossen.`,
                    datum: jetzt,
                    autor,
                    autorId: "",
                  }, ...notizenLog],
                },
              }).eq("id", b.id);
              if (abschlussFehler) console.error(`Abschluss fuer Bewerber ${b.id} nicht gespeichert:`, abschlussFehler);

              await admin.from("signature_requests").update({ status: "ueberholt" }).eq("token", anfrage.token).eq("status", "pending");

              if (empfaengerIds.length > 0) {
                await admin.from("benachrichtigungen").insert(
                  empfaengerIds.map((benutzer_id) => ({
                    id: crypto.randomUUID(),
                    benutzer_id,
                    titel: `Auf Kein Interesse gesetzt: ${name}`,
                    nachricht: `${ABSCHLUSS_ABSAGEGRUND}. Die Abschlussmail ist raus, der Signaturlink geschlossen. Meldet sich ${name}, einfach erneut zur Unterschrift senden.`,
                    link: `/bewerberprozess?openBewerber=${b.id}`,
                    gelesen: false,
                    erstellt_am: jetzt,
                  })),
                );
              }
              erinnert++;
              continue;
            }

            await admin.from("bewerbungen").update({ meta }).eq("id", b.id);
            erinnert++;
          } else {
            // Kein Abbruch: Die HR-Leiter ist davon unabhängig und soll laufen.
            console.error(
              `Erinnerung ${faelligeErinnerung.id} an Bewerber ${b.id} nicht versendet:`,
              versand.grund,
            );
          }
        }
      }

      const erledigt: string[] = Array.isArray(meta.vertragHrEskalation)
        ? (meta.vertragHrEskalation as string[])
        : [];

      // Die höchste erreichte Stufe, die noch nicht gemeldet wurde. Bewusst nur
      // eine je Lauf: Wer zehn Tage nichts geprüft hat, soll nicht drei Mails
      // auf einmal bekommen, sondern die aktuell zutreffende.
      const faellig = [...STUFEN]
        .reverse()
        .find((s) => tage >= s.abTagen && !erledigt.includes(s.id));
      if (!faellig) continue;

      // Alle niedrigeren Stufen gelten mit dieser Meldung als erledigt. Sonst
      // kämen sie an den Folgetagen einzeln hinterher, rückwärts von Stufe 4
      // zu Stufe 1, drei davon mit Mail. Genau das ist am 03.09.2026 mit dem
      // Altbestand passiert.
      const erledigtNeu = [
        ...erledigt,
        ...STUFEN.filter((s) => s.abTagen <= faellig.abTagen && !erledigt.includes(s.id)).map((s) => s.id),
      ];
      const restTage = Math.max(0, LINK_GUELTIG_TAGE - tage);
      const jetzt = new Date().toISOString();

      // Glocke für alle Zuständigen, auch bei der stillen ersten Stufe.
      if (empfaengerIds.length > 0) {
        await admin.from("benachrichtigungen").insert(
          empfaengerIds.map((benutzer_id) => ({
            id: crypto.randomUUID(),
            benutzer_id,
            titel: `Vertrag offen: ${name}`,
            nachricht: `Seit ${tage} Tagen nicht unterschrieben. ${faellig.handlung}`,
            // `/bewerbung/<id>` gibt es als Route nicht. Geöffnet wird die Akte
            // über `openBewerber`.
            link: `/bewerberprozess?openBewerber=${b.id}`,
            gelesen: false,
            erstellt_am: jetzt,
          })),
        );
      }

      if (faellig.mitMail) {
        for (const adresse of mailAdressen) {
          await sendeVorlage(admin, {
            templateName: "vertrag-hr-eskalation",
            recipientEmail: adresse,
            idempotencyKey: `vertrag-hr-eskalation-${b.id}-${faellig.id}-${adresse}`,
            templateData: {
              bewerberName: name,
              bewerberEmail: b.email || "",
              bewerberTelefon: b.telefon || "",
              tageOffen: tage,
              versendetAm: new Date(erstVersand).toLocaleDateString("de-DE"),
              stufe: faellig.titel,
              handlung: faellig.handlung,
              profilLink: `${PORTAL_URL}/bewerberprozess?openBewerber=${b.id}`,
              restTage,
            },
          });
        }
      }

      // Stand vermerken. Bewusst mit dem bestehenden meta als Basis, damit
      // nichts anderes verloren geht.
      await admin.from("bewerbungen").update({
        meta: { ...meta, vertragHrEskalation: erledigtNeu },
      }).eq("id", b.id);

      gemeldet++;
    }

    return new Response(JSON.stringify({ ok: true, gemeldet, gegenzeichnungGemeldet, erinnert }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannt" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
