import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import { BEWERBER_MAIL_BASIS } from "../_shared/bewerber-absender.ts";
import {
  GESPRAECH_NAME,
  KALENDER_TITEL,
  baueIcs,
  kalenderAnhang,
  kalenderLink,
} from "../_shared/bewerber-termin-mail.ts";

/**
 * Meldet, dass ein Bewerber seinen Termin gebucht, verschoben oder abgesagt
 * hat: der HR-Managerin, und dem Bewerber selbst.
 *
 * ── Die zweite Mail ──
 *
 * Bis zum 06.09.2026 ging hier nur die Meldung an HR hinaus. Der Bewerber
 * bekam nichts, obwohl er derjenige ist, der den Termin einhalten soll. Er
 * bekommt jetzt eine Bestaetigung mit Datum, Uhrzeit, dem Link zum Videoraum
 * und einer Kalenderdatei im Anhang, so wie die Abstimmungsfassung es in der
 * Tabelle der Automatiken verlangt.
 *
 * Gerufen wird sie aus `src/lib/bewerberTerminStore.ts`, unmittelbar nachdem
 * die Datenbankfunktion durchgelaufen ist.
 *
 * ── Warum nur das Token uebergeben wird ──
 *
 * Der Aufruf traegt ausschliesslich das Kennenlern-Token und das Wort
 * `vorgang`, niemals einen Namen, eine Adresse oder einen Empfaenger. Sonst
 * waere diese Function ein Versandwerkzeug, mit dem sich Mails an Fremde
 * ausloesen liessen. Alles Weitere holt sie sich selbst aus der Datenbank, und
 * beide Empfaenger stehen damit fest: die Person mit der Rolle `hr`,
 * ersatzweise der Mitarbeiter, in dessen Kalender der Termin liegt, und der
 * Bewerber mit der Adresse, die in `bewerbungen` steht. An eine Adresse aus
 * dem Aufruf geht nichts.
 *
 * `verify_jwt = false`, denn der Bewerber hat kein Konto. Das Geheimnis ist
 * das Token, dazu kommt eine Ratenbremse je Absender.
 *
 * ── Warum HR ueberhaupt eine Mail bekommt ──
 *
 * Der Termin steht danach im Kalender, aber ein Kalendereintrag, der von
 * selbst erscheint, wird uebersehen. Die Mail ist die eine Stelle, an der
 * jemand aktiv erfaehrt, dass er am Montag um zehn ein Gespraech hat, wer
 * kommt, und was derjenige besprechen moechte.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Vorgang = "gebucht" | "verschoben" | "abgesagt";
const VORGAENGE: Vorgang[] = ["gebucht", "verschoben", "abgesagt"];

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ZONE = "Europe/Berlin";
const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/**
 * Datum und Uhrzeit eines Zeitpunkts in deutscher Zeit.
 *
 * Die Namen stehen fest im Code und kommen nicht aus `Intl`. Sonst hinge die
 * Beschriftung an der Sprachtabelle der Umgebung, in der die Function gerade
 * laeuft, und die ist auf einem Server meist englisch. Dieselbe Entscheidung
 * wie in `src/lib/buchungAuswahl.ts`.
 */
function deutscheZeit(iso: string): { datum: string; uhrzeit: string; kurz: string } {
  const zeitpunkt = new Date(iso);
  if (Number.isNaN(zeitpunkt.getTime())) return { datum: "", uhrzeit: "", kurz: "" };

  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(zeitpunkt);

  const wert: Record<string, string> = {};
  for (const teil of teile) {
    if (teil.type !== "literal") wert[teil.type] = teil.value;
  }
  const jahr = Number(wert.year);
  const monat = Number(wert.month);
  const tag = Number(wert.day);
  // Den Wochentag ueber einen UTC-Tag bestimmen, damit die Zone des Servers
  // ihn nicht verschiebt.
  const wochentag = WOCHENTAGE[new Date(Date.UTC(jahr, monat - 1, tag)).getUTCDay()] ?? "";
  const stunde = wert.hour === "24" ? "00" : wert.hour;

  return {
    datum: `${wochentag}, ${tag}. ${MONATE[monat - 1] ?? ""} ${jahr}`,
    uhrzeit: `${stunde}:${wert.minute}`,
    kurz: `${tag}. ${MONATE[monat - 1] ?? ""} ${jahr}, ${stunde}:${wert.minute} Uhr`,
  };
}

/**
 * Die Beschriftungen der Themen, wie der Bewerber sie angekreuzt hat.
 *
 * Sie stehen hier ein zweites Mal, weil eine Edge Function in Deno laeuft und
 * `src/lib/bewerberKennenlernen.ts` nicht erreichen kann. Massgeblich ist die
 * Frage `themen` dort; wer die Optionen dort aendert, aendert sie auch hier.
 * Ein unbekannter Wert wird unveraendert durchgereicht, dann steht in der Mail
 * das Kuerzel statt gar nichts.
 */
const THEMEN_LABELS: Record<string, string> = {
  // In der Mail bewusst "Vergütung" statt "Verdienst" (26.09.2026, Spamfilter).
  verdienst: "Vergütung und Rechenwege",
  kosten: "Leads und Kosten",
  zeit: "Zeit und Vereinbarkeit",
  einstieg: "Einstieg, Training und Begleitung",
  objekte: "Objekte und Standorte",
  formales: "Gewerbe, Erlaubnis, Formales",
  leads: "Leads und Kundengewinnung",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Links in Bewerbermails zeigen immer auf osimmobilien.netlify.app, nie auf eine
  // per Umgebungsvariable eingetragene andere Adresse (seit 26.09.2026).
  const basisAdresse = BEWERBER_MAIL_BASIS;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Ohne Anmeldung erreichbar, deshalb eine Ratenbremse je Absender.
  const bremse = await checkEdgeRateLimit({
    scope: "bewerber-termin",
    key: clientIp(req),
    perHour: 30,
    perDay: 200,
  });
  if (bremse.exceeded) {
    return new Response(
      JSON.stringify({ error: "rate_limited", message: "Zu viele Anfragen. Bitte später erneut versuchen." }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(bremse.retryAfterSeconds ?? 3600) },
      },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const vorgang = String(body?.vorgang || "gebucht") as Vorgang;

    if (!/^[0-9a-f]{32,128}$/i.test(token)) return antwort({ error: "Kein gueltiger Token" }, 400);
    if (!VORGAENGE.includes(vorgang)) return antwort({ error: "Unbekannter Vorgang" }, 400);

    const { data: formular } = await admin
      .from("bewerber_formular")
      .select("bewerbung_id, antworten")
      .eq("token", token)
      .maybeSingle();
    // Kein Hinweis darauf, ob das Token falsch oder der Bogen fort ist.
    if (!formular?.bewerbung_id) return antwort({ ok: true, gesendet: false, grund: "nichts zu melden" });

    const { data: bewerber } = await admin
      .from("bewerbungen")
      .select("id, vorname, nachname, email, telefon")
      .eq("id", formular.bewerbung_id)
      .maybeSingle();

    /*
     * Die Buchung dazu.
     *
     * Bei einer Absage ist ihr Status bereits 'abgesagt', deshalb wird hier
     * nicht danach gefiltert. Genommen wird die zuletzt angelegte Zeile: Sagt
     * jemand ab und bucht danach neu, sind es zwei, und gemeint ist die neue.
     */
    const { data: buchungen } = await admin
      .from("buchungen")
      .select("id, start_at, ende_at, dauer_minuten, status, bezeichnung, mitarbeiter_id, videoraum_id, meta")
      .eq("bewerbung_id", formular.bewerbung_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const buchung = (buchungen || [])[0];
    if (!buchung) return antwort({ ok: true, gesendet: false, grund: "keine Buchung" });

    /*
     * Sperre gegen doppelten Versand, je Vorgang und je Zielzeit.
     *
     * Derselbe Kniff wie in send-buchung-aenderung: Die Startzeit steckt im
     * Schluessel. Verschiebt der Bewerber ein zweites Mal, steht dort eine
     * andere Zahl und es geht wieder eine Mail hinaus. Ruft dagegen jemand
     * denselben Aufruf zweimal ab, faengt die Warteschlange ihn ab.
     */
    const startZahl = new Date(String(buchung.start_at)).getTime();
    const schluessel = `bewerber-termin-${vorgang}-${buchung.id}-${Number.isFinite(startZahl) ? startZahl : 0}`;

    /*
     * Wer die Meldung bekommt.
     *
     * Zuerst die Rolle `hr`, denn ihr gehoert der Bewerberprozess. Traegt
     * niemand sie, geht die Mail an den Mitarbeiter, in dessen Kalender der
     * Termin liegt. Der muss es in jedem Fall wissen, und lieber die zweitbeste
     * Adresse als gar keine.
     */
    const hr = await hrAnsprechpartner(admin as never);

    /*
     * Der Gastgeber wird jetzt immer geladen, nicht nur ersatzweise.
     *
     * Sein Name und seine Adresse stehen in der Kalenderdatei des Bewerbers als
     * ORGANIZER. Ohne sie steht dort „OS Immobilien" ohne Person, und wer im
     * Kalender nachsieht, weiss nicht, mit wem er spricht.
     */
    let gastgeberName = "";
    let gastgeberEmail = "";
    if (buchung.mitarbeiter_id) {
      const { data: gastgeber } = await admin
        .from("profiles")
        .select("name, email")
        .eq("id", buchung.mitarbeiter_id)
        .maybeSingle();
      gastgeberName = (gastgeber?.name || "").trim();
      gastgeberEmail = (gastgeber?.email || "").trim();
    }

    let empfaenger = hr?.email?.trim() || "";
    if (!empfaenger) empfaenger = gastgeberEmail;
    if (!empfaenger) {
      console.error("[send-bewerber-termin] Kein Empfaenger gefunden");
      return antwort({ ok: false, grund: "kein Empfaenger" });
    }

    /*
     * Zwei Adressen zu einem Raum, und sie duerfen nicht verwechselt werden.
     *
     * `/raum/<token>` ist die Gastansicht: Namenseingabe, Technikpruefung,
     * Warteraum. Dorthin gehoert der Bewerber.
     *
     * `/videocall/raum/<id>` ist die Gastgeberansicht, in der man den Raum
     * oeffnet und den Wartenden einlaesst. Dorthin gehoert HR.
     *
     * Bis hierhin bekamen beide dieselbe Adresse, naemlich die des Gastes.
     * Wer aus HR in der Terminmail klickte, landete im eigenen Warteraum und
     * wartete darauf, von sich selbst eingelassen zu werden. In der
     * CRM-Liste war das bereits repariert (`src/lib/bewerberTerminStore.ts`),
     * in der Mail nicht.
     */
    let raumUrl = "";
    let gastgeberUrl = "";
    if (buchung.videoraum_id) {
      const { data: raum } = await admin
        .from("videoraeume")
        .select("token")
        .eq("id", buchung.videoraum_id)
        .maybeSingle();
      if (raum?.token) raumUrl = `${basisAdresse}/raum/${raum.token}`;
      gastgeberUrl = `${basisAdresse}/videocall/raum/${buchung.videoraum_id}`;
    }

    const zeit = deutscheZeit(String(buchung.start_at));
    const antworten = (formular.antworten || {}) as Record<string, unknown>;
    const themen = Array.isArray(antworten.themen)
      ? (antworten.themen as string[]).map((t) => THEMEN_LABELS[t] || t)
      : [];
    const eigeneFrage = typeof antworten.eigeneFrage === "string" ? antworten.eigeneFrage.trim() : "";

    // Beim Verschieben die alte Zeit nennen, damit die Meldung ohne Nachsehen
    // verstaendlich ist. Sie steht in `meta.mail_stand`, das send-buchung-
    // aenderung fuehrt; fehlt sie, entfaellt die Zeile.
    const meta = (buchung.meta || {}) as Record<string, unknown>;
    const vorherZahl = Number(meta.bewerber_mail_stand);
    const alteZeit =
      vorgang === "verschoben" && Number.isFinite(vorherZahl) && vorherZahl !== startZahl
        ? deutscheZeit(new Date(vorherZahl).toISOString()).kurz
        : "";

    const name = `${bewerber?.vorname || ""} ${bewerber?.nachname || ""}`.trim();

    const versand = await sendeVorlage(admin, {
      templateName: "bewerber-termin-hr",
      recipientEmail: empfaenger,
      idempotencyKey: schluessel,
      templateData: {
        vorgang,
        bewerberName: name,
        bewerberEmail: bewerber?.email || "",
        bewerberTelefon: bewerber?.telefon || "",
        terminDatum: zeit.datum,
        terminUhrzeit: zeit.uhrzeit,
        terminDauer: Number(buchung.dauer_minuten) || undefined,
        // Auch in der Meldung an HR heisst der Termin so, wie er dem Bewerber
        // gegenueber heisst. Sonst reden Mail und Bewerber aneinander vorbei.
        terminTitel: GESPRAECH_NAME,
        ...(alteZeit ? { alteZeit } : {}),
        ...(themen.length > 0 ? { themen } : {}),
        ...(eigeneFrage ? { eigeneFrage } : {}),
        bewerberUrl: `${basisAdresse}/bewerberprozess?bewerber=${formular.bewerbung_id}`,
        // HR bekommt die Gastgeberansicht, nicht den Warteraum.
        ...(gastgeberUrl ? { zugangUrl: gastgeberUrl } : {}),
      },
    });

    if (!versand.ok) {
      console.error("[send-bewerber-termin] Versand fehlgeschlagen", versand.grund);
    }

    /*
     * Und dieselbe Nachricht an den Bewerber, mit Kalenderdatei.
     *
     * Bis zum 06.09.2026 ging hier ausschliesslich die Meldung an die
     * HR-Managerin hinaus. Der Bewerber sah eine Bestaetigung auf dem
     * Bildschirm und hatte danach nichts mehr: kein Datum im Postfach, keinen
     * Kalendereintrag, keinen Link zum Videoraum. Die Abstimmungsfassung nennt
     * die „Bestaetigung mit Kalenderdatei" in der Tabelle der Automatiken.
     *
     * Der Zaehler fuer die Kalenderdatei steigt mit jeder Nachricht. Ohne ihn
     * lassen Apple Kalender und Outlook beim Verschieben den alten Eintrag
     * stehen, denn die UID bleibt dieselbe. Dieselbe Begruendung wie bei `seq`
     * in `get-ics`.
     */
    const sequenzVorher = Number(meta.bewerber_ics_sequenz);
    const sequenz = Number.isFinite(sequenzVorher) ? sequenzVorher + 1 : 0;
    let bewerberVersandOk = false;

    if (bewerber?.email) {
      const tagesordnung = [
        ...themen,
        ...(eigeneFrage ? [`Deine Frage: ${eigeneFrage}`] : []),
      ];
      /*
       * Was im Kalendereintrag steht.
       *
       * Der Titel kommt bewusst NICHT aus `buchungen.bezeichnung`. Dort steht
       * „Bewerbergespräch", so hat die Migration die Terminart angelegt, und
       * genau dieses Wort soll der Bewerber nach Entscheidung E1 nirgends mehr
       * lesen. Die Terminart umzubenennen waere eine Migration und traefe
       * zugleich die Anzeige im CRM.
       *
       * Der Link zum Videoraum steht zweimal: in LOCATION, damit Apple
       * Kalender und Google ihn als anklickbaren Ort zeigen, und noch einmal in
       * DESCRIPTION, weil Outlook das Ortsfeld nur als Text darstellt. Ohne
       * beides muesste der Bewerber im Termin die Mail wiederfinden, und genau
       * das ist Christians Punkt P5.
       */
      const icsBeschreibung = [
        raumUrl ? `Videoraum: ${raumUrl}` : "",
        tagesordnung.length > 0 ? `Das besprechen wir zuerst: ${tagesordnung.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      const icsUid = `bewerber-termin-${buchung.id}@os-immobilien.com`;

      /*
       * Auch die Absage bekommt eine Kalenderdatei, nur eben eine, die absagt.
       *
       * Vorher hing bei einer Absage gar nichts an, und die Mail bat den
       * Bewerber, den Eintrag von Hand zu loeschen. Das tut kaum jemand, und
       * der Termin steht dann wochenlang im Kalender. Mit METHOD:CANCEL,
       * gleicher UID und hoeherer SEQUENCE raeumen Apple Kalender, Outlook
       * und Google ihn selbst weg.
       */
      const ics = baueIcs({
        titel: KALENDER_TITEL,
        startIso: String(buchung.start_at),
        endeIso: String(buchung.ende_at || buchung.start_at),
        beschreibung: icsBeschreibung,
        ort: raumUrl || "Online",
        uid: icsUid,
        sequenz,
        organisator: gastgeberName || "OS Immobilien",
        organisatorEmail: gastgeberEmail || "os@os-immobilien.com",
        teilnehmerEmail: bewerber.email,
        absage: vorgang === "abgesagt",
      });

      /*
       * Derselbe Termin noch einmal als Link, fuer den Knopf „In meinen
       * Kalender eintragen". Nicht jedes Postfach bietet den Anhang zum
       * Eintragen an; Gmail im Browser etwa zeigt bei einer Datei ohne
       * METHOD:REQUEST keinen Knopf. Die Function `get-ics` liefert dieselbe
       * Datei als Download.
       */
      const kalenderUrl =
        vorgang === "abgesagt"
          ? ""
          : kalenderLink({
              supabaseUrl: SUPABASE_URL,
              titel: KALENDER_TITEL,
              startIso: String(buchung.start_at),
              endeIso: String(buchung.ende_at || buchung.start_at),
              beschreibung: icsBeschreibung,
              ort: raumUrl || "Online",
              uid: icsUid,
              sequenz,
              organisator: gastgeberName || "OS Immobilien",
              organisatorEmail: gastgeberEmail || "os@os-immobilien.com",
            });

      const bewerberVersand = await sendeVorlage(admin, {
        templateName: "bewerber-termin-bestaetigung",
        recipientEmail: bewerber.email,
        // Derselbe Kniff wie oben: Die Startzeit steckt im Schluessel, damit
        // eine zweite Verschiebung wieder eine Mail ausloest und ein doppelter
        // Aufruf nicht.
        idempotencyKey: `bewerber-termin-bewerber-${vorgang}-${buchung.id}-${Number.isFinite(startZahl) ? startZahl : 0}`,
        templateData: {
          ...(hr ? { hrKontakt: hr } : {}),
          vorgang,
          bewerberName: name,
          terminDatum: zeit.datum,
          terminUhrzeit: zeit.uhrzeit,
          terminDauer: Number(buchung.dauer_minuten) || undefined,
          ...(alteZeit ? { alteZeit } : {}),
          ...(raumUrl ? { zugangUrl: raumUrl } : {}),
          ...(kalenderUrl ? { kalenderUrl } : {}),
          /*
           * Die Buchungsstrecke, nicht mehr der Kennenlernbogen.
           *
           * Ueber diesen Link verschiebt und sagt der Bewerber ab, und ueber
           * ihn bucht er nach einer Absage neu. Bis zum 08.09.2026 zeigte er
           * auf `/kennenlernen/<token>`, weil der Kalender dort stand; der
           * Bogen endet seither ohne Terminwahl und wuerde ihn in eine
           * Danksagung fuehren. Dasselbe Token, dieselbe Datenbanklogik.
           */
          verwaltenUrl: `${basisAdresse.replace(/\/+$/, "")}/kooperationsgespraech/${token}`,
          ...(themen.length > 0 ? { themen } : {}),
          ...(eigeneFrage ? { eigeneFrage } : {}),
        },
        ...(ics ? { attachments: kalenderAnhang(ics) } : {}),
        metadata: { bewerbungId: formular.bewerbung_id, anlass: `bewerber-termin-${vorgang}` },
      });
      bewerberVersandOk = bewerberVersand.ok;
      if (!bewerberVersand.ok) {
        console.error("[send-bewerber-termin] Bestaetigung an den Bewerber fehlgeschlagen", bewerberVersand.grund);
      }
    }

    // Die Zielzeit merken, damit die naechste Verschiebung sagen kann, wo der
    // Termin vorher lag, und den Stand des Kalenderzaehlers dazu.
    await admin
      .from("buchungen")
      .update({ meta: { ...meta, bewerber_mail_stand: startZahl, bewerber_ics_sequenz: sequenz } })
      .eq("id", buchung.id);

    /*
     * Zusaetzlich die Glocke im CRM, fuer den Mitarbeiter, in dessen Kalender
     * der Termin liegt. Eine Mail wird gelesen, wenn man ins Postfach sieht;
     * die Glocke sieht man beim Arbeiten. Schlaegt sie fehl, ist das kein
     * Grund, die Antwort zu verderben, die Mail ist ohnehin schon hinaus.
     */
    try {
      if (buchung.mitarbeiter_id) {
        const titel =
          vorgang === "abgesagt"
            ? "Bewerbertermin abgesagt"
            : vorgang === "verschoben"
              ? "Bewerbertermin verschoben"
              : "Neuer Bewerbertermin";
        await admin.from("benachrichtigungen").insert({
          id: crypto.randomUUID(),
          benutzer_id: buchung.mitarbeiter_id,
          titel,
          nachricht: `${name || "Ein Bewerber"}${zeit.kurz ? `, ${zeit.kurz}` : ""}.`,
          link: `/bewerberprozess?bewerber=${formular.bewerbung_id}`,
          gelesen: false,
          erstellt_am: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("[send-bewerber-termin] Glocke fehlgeschlagen", e);
    }

    return antwort({
      ok: true,
      gesendet: versand.ok,
      empfaenger: hr?.email ? "hr" : "gastgeber",
      bewerberGesendet: bewerberVersandOk,
    });
  } catch (e) {
    console.error("[send-bewerber-termin] Fehler", e);
    return antwort({ error: "Unerwarteter Fehler" }, 500);
  }
});
