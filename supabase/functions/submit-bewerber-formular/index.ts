import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import { zusammenfassungMailFelder } from "../_shared/bewerber-kennenlernen-mail.ts";
import { terminAusMeta } from "../_shared/bewerber-buchung-erinnerung.ts";
import {
  istKennenlernen,
  ueberblickFuerMail,
} from "../_shared/bewerber-kennenlernen-ueberblick.ts";
import { oeffnungAusBogen } from "../_shared/bewerber-mail-tracking.ts";

/**
 * Nimmt die Antworten des Bewerbers entgegen.
 *
 * Der Browser des Bewerbers hat keinerlei direkten Tabellenzugriff, deshalb
 * läuft das Schreiben ausschließlich hier über die Service-Rolle. Geprüft
 * werden Token, Status und Ablauf, danach die Antworten gegen ein festes
 * Schema. Ein Honigtopf-Feld fängt einfache Bots ab.
 *
 * Kein reCAPTCHA: Wer das Token hat, ist bereits als Bewerber bekannt, und ein
 * zusätzliches Hindernis würde nur die Ausfüllquote senken.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Erlaubte Schlüssel und ihre Form. Absichtlich als feste Liste und nicht als
 * offenes Objekt: Was hier nicht steht, landet auch nicht in der Datenbank.
 */
// Muss den Katalog in src/lib/bewerberFormular.ts vollstaendig spiegeln:
// Zod entfernt unbekannte Schluessel still. Genau so gingen bis 02.09.2026
// die Antworten auf sechs Fragen (region, erfahrungsdauer, perspektive,
// leadPraeferenz, erwartung, einsatz) verloren, ohne dass jemand es merkte.
const AntwortSchema = z.object({
  region: z.string().trim().max(120).optional(),
  beschaeftigung: z.string().trim().max(60).optional(),
  taetigkeit: z.string().trim().max(120).optional(),
  hintergrund: z.array(z.string().trim().max(40)).max(10).optional(),
  erfahrungsdauer: z.string().trim().max(40).optional(),
  immoSchwerpunkt: z.string().trim().max(40).optional(),
  findiSparten: z.array(z.string().trim().max(40)).max(10).optional(),
  zeitProWoche: z.string().trim().max(40).optional(),
  perspektive: z.string().trim().max(40).optional(),
  leadPraeferenz: z.string().trim().max(40).optional(),
  einkommensziel: z.string().trim().max(40).optional(),
  erwartung: z.string().trim().max(500).optional(),
  einsatz: z.string().trim().max(500).optional(),
  gewerbe34c: z.string().trim().max(40).optional(),
  startzeitpunkt: z.string().trim().max(40).optional(),
  erreichbarkeit: z.array(z.string().trim().max(40)).max(10).optional(),
  // Altfeld frueherer Fragebogen-Fassungen, bleibt fuer Bestandsdaten lesbar.
  motivation: z.string().trim().max(500).optional(),

  // ── Die zusaetzlichen Schluessel des Kennenlernens ──
  //
  // Der neue Bewerberprozess schreibt in dieselbe Spalte. Muss den Katalog in
  // src/lib/bewerberKennenlernen.ts spiegeln, sonst verschwinden die Antworten
  // still: Zod entfernt unbekannte Schluessel ohne Fehlermeldung. Genau so
  // gingen bis 02.09.2026 sechs Antworten des alten Bogens verloren.
  //
  // Die gemeinsamen Schluessel (zeitProWoche, perspektive, leadPraeferenz,
  // einkommensziel, startzeitpunkt, erreichbarkeit, hintergrund, gewerbe34c)
  // stehen bereits oben und gelten fuer beide Boegen.
  weg: z.string().trim().max(20).optional(),
  wegAntwort1: z.union([z.string().trim().max(200), z.array(z.string().trim().max(40)).max(12)]).optional(),
  wegAntwort2: z.union([z.string().trim().max(200), z.array(z.string().trim().max(40)).max(12)]).optional(),
  // Fehlten bis 08.09.2026 und gingen deshalb still verloren: die dritte
  // Wegfrage, die beiden Freitexte hinter "Etwas anderes" und die Begruendung
  // zur Erlaubnis.
  wegAntwort3: z.union([z.string().trim().max(200), z.array(z.string().trim().max(40)).max(12)]).optional(),
  wegAntwort1Frei: z.string().trim().max(200).optional(),
  wegAntwort2Frei: z.string().trim().max(200).optional(),
  erlaubnis34cBegruendung: z.string().trim().max(500).optional(),
  // Die dritte Tuer zu den Leads, nur auf Weg 1 und Weg 4.
  leadErfahrung: z.string().trim().max(500).optional(),
  leadQuote: z.string().trim().max(40).optional(),
  passung: z.array(z.string().trim().max(40)).max(10).optional(),
  verstaendnisFixum: z.string().trim().max(10).optional(),
  verstaendnisProvision: z.string().trim().max(10).optional(),
  // "Wie arbeitest du heute?", seit 09.09.2026. Klaert Nebentaetigkeit und
  // Wettbewerbsverbot und bekommt bewusst keine Punkte im Vorab-Score.
  arbeitsform: z.string().trim().max(20).optional(),
  gewerbe: z.string().trim().max(20).optional(),
  erlaubnis34c: z.string().trim().max(20).optional(),
  themen: z.array(z.string().trim().max(40)).max(12).optional(),
  eigeneFrage: z.string().trim().max(500).optional(),
});

const SubmitSchema = z.object({
  token: z.string().trim().length(64),
  antworten: AntwortSchema,
  telefon: z.string().trim().max(50).optional().default(""),
  einwilligung: z.literal(true),
  einwilligungVersion: z.string().trim().max(40),
  hp: z.string().max(0).optional().default(""),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = SubmitSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Ungültige Daten", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const data = parsed.data;

    // Honigtopf: Bot bekommt eine freundliche Antwort, wir schreiben nichts.
    if (data.hp && data.hp.length > 0) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: formular, error: leseFehler } = await admin
      .from("bewerber_formular")
      // `antworten` wird mitgelesen, weil `send-bewerber-kennenlernen` beim
      // Anlegen `{ bogen: "kennenlernen" }` hineinschreibt. Das ist die
      // Rueckfallebene fuer die Frage, welcher der beiden Boegen hier gerade
      // abgeschickt wird; sie wird gleich mit den echten Antworten ueberschrieben.
      // `created_at` ist der Zeitpunkt, an dem die Einladung entstand, und
      // damit der Zeitpunkt der Mail: Die Zeile wird unmittelbar vor dem
      // Versand angelegt (`_shared/kennenlernen-versand.ts`). Gebraucht wird er
      // nur, falls unten eine Trackingzeile nachgetragen werden muss.
      .select("id, bewerbung_id, status, expires_at, antworten, created_at")
      .eq("token", data.token)
      .maybeSingle();

    if (leseFehler || !formular) {
      return new Response(JSON.stringify({ error: "Link unbekannt" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (formular.status === "eingereicht") {
      return new Response(JSON.stringify({ error: "bereits ausgefuellt" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (formular.status !== "offen" || new Date(formular.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Link abgelaufen" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jetzt = new Date().toISOString();
    const { error: schreibFehler } = await admin
      .from("bewerber_formular")
      .update({
        antworten: data.antworten,
        status: "eingereicht",
        eingereicht_am: jetzt,
        einwilligung_am: jetzt,
        einwilligung_version: data.einwilligungVersion,
      })
      .eq("id", formular.id);

    if (schreibFehler) {
      console.error("[submit-bewerber-formular] Speichern fehlgeschlagen", schreibFehler);
      return new Response(JSON.stringify({ error: "Speichern fehlgeschlagen" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Eine geänderte Telefonnummer gehört an den Bewerber, nicht ins Formular.
    // Bewusst nur die Nummer und nur, wenn sie sich unterscheidet: Das meta-Feld
    // bleibt dabei unangetastet.
    if (data.telefon) {
      const { data: bewerber } = await admin
        .from("bewerbungen")
        .select("telefon")
        .eq("id", formular.bewerbung_id)
        .maybeSingle();
      if (bewerber && (bewerber.telefon || "") !== data.telefon) {
        await admin.from("bewerbungen")
          .update({ telefon: data.telefon })
          .eq("id", formular.bewerbung_id);
      }
    }

    /*
     * Welcher der beiden Boegen kommt hier an?
     *
     * Steht schon vor der Glocke fest, weil sich seit dem 08.09.2026 auch der
     * Wortlaut der Meldung danach richtet: Beim Kennenlernen ist jetzt eine
     * Entscheidung faellig, einladen oder absagen, und nicht mehr ein Anruf.
     */
    const eigeneAntworten = data.antworten as Record<string, unknown>;
    const alteZeile = (formular.antworten || {}) as Record<string, unknown>;
    const neuerBogen = istKennenlernen(eigeneAntworten) || alteZeile.bogen === "kennenlernen";

    /*
     * Der Haken neben dem Mailzeichen in der Bewerberliste.
     *
     * Wer diesen Bogen abgeschickt hat, hat die Eingangsmail zwangsläufig
     * geöffnet: Der Link steht nur dort. Das Zählpixel bekommt das oft nicht
     * mit, weil viele Mailprogramme Bilder unterdrücken, und die Mails vor dem
     * 15.09.2026 trugen überhaupt keines. Deshalb wird die Öffnung hier
     * abgeleitet, erkennbar als Ableitung und nicht als Messung.
     *
     * Nur für den Kennenlernbogen. Der alte Vorabbogen lief über eine andere
     * Mail, die in diesem Tracking gar nicht vorkommt.
     */
    if (neuerBogen) {
      await oeffnungAusBogen(admin, formular.bewerbung_id, jetzt, formular.created_at);
    }

    // HR informieren. Bewusst nur die HR-Rolle: Inhaber und Admins standen
    // frueher mit auf der Liste, sollen diese Meldung aber nicht mehr
    // bekommen. Zustaendig ist HR.
    try {
      const { data: bewerber } = await admin
        .from("bewerbungen")
        .select("vorname, nachname")
        .eq("id", formular.bewerbung_id)
        .maybeSingle();

      const { data: rollen } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "hr");

      const empfaenger = [...new Set((rollen || []).map((r) => r.user_id))];
      if (empfaenger.length > 0) {
        const name = `${bewerber?.vorname || ""} ${bewerber?.nachname || ""}`.trim() || "Ein Bewerber";
        await admin.from("benachrichtigungen").insert(
          empfaenger.map((benutzer_id) => ({
            id: crypto.randomUUID(),
            benutzer_id,
            titel: neuerBogen ? "Kennenlernen ausgefüllt" : "Fragebogen ausgefüllt",
            /*
             * Beim Kennenlernen sagt die Meldung, was zu tun ist. Der Bewerber
             * kann sich seit dem 08.09.2026 keinen Termin mehr selbst buchen;
             * ohne unsere Entscheidung passiert also gar nichts. Erinnert wird
             * daran zusaetzlich an Tag 3 und Tag 7, siehe
             * `_shared/bewerber-buchung-erinnerung.ts`.
             */
            nachricht: neuerBogen
              ? `${name} hat das Kennenlernen abgeschickt. Bitte ansehen und entscheiden, ob eingeladen oder abgesagt wird.`
              : `${name} hat den Vorab-Fragebogen beantwortet.`,
            // `/bewerbung/<id>` gibt es als Route nicht, dieser Link führte auf
            // die Fehlerseite. Geöffnet wird die Akte über `openBewerber`.
            link: `/bewerberprozess?openBewerber=${formular.bewerbung_id}`,
            gelesen: false,
            erstellt_am: jetzt,
          })),
        );
      }
    } catch (e) {
      console.error("[submit-bewerber-formular] interne Meldung fehlgeschlagen", e);
    }

    /*
     * Nachricht 3: der persoenliche Ueberblick an den Bewerber.
     *
     * Die letzte Ansicht des Kennenlernens verspricht sie woertlich: „Du
     * bekommst gleich eine Mail mit deinen Angaben." Bis zum 06.09.2026 gab es
     * sie nicht, es entstand nur die Glocke oben.
     *
     * Nur fuer den neuen Bogen. Wer den alten Vorabbogen ausfuellt, laeuft im
     * bestehenden Bewerbungsmanagement und bekommt dort seinen Anruf; eine
     * zusaetzliche Mail waere in diesem Ablauf neu und ungefragt.
     *
     * Ein Fehlschlag darf die Antwort nicht verderben. Die Antworten sind
     * gespeichert, der Bewerber steht vor seinem Bildschirm, und eine
     * Fehlermeldung wuerde ihn glauben lassen, das Absenden sei misslungen.
     */
    try {
      if (neuerBogen) {
        const { data: bewerber } = await admin
          .from("bewerbungen")
          .select("vorname, nachname, email, meta")
          .eq("id", formular.bewerbung_id)
          .maybeSingle();

        if (bewerber?.email) {
          const hrKontakt = await hrAnsprechpartner(admin as never);
          /*
           * Steht der Termin schon, ersetzt der konkrete Satz den allgemeinen.
           *
           * Seit dem 08.09.2026 traegt diese Mail keinen Buchungsknopf mehr:
           * Der Bogen endet ohne Terminwahl, gebucht wird erst nach unserer
           * Einladung. Der Regelfall ist deshalb der Satz „wir melden uns".
           *
           * Ein Termin kann trotzdem schon stehen. Erstens traegt die
           * HR-Managerin ihn manchmal von Hand in die Akte. Zweitens legt eine
           * erneute Einladung eine neue Formularzeile an; wird die noch einmal
           * abgeschickt, steht der Termin aus der ersten Runde laengst. Ihm zu
           * schreiben, wir wuerden uns melden, waere dann falsch.
           *
           * Erkannt wird er ueber `terminAusMeta`, dieselbe Stelle, an der
           * auch die Erinnerungskette abliest, ob sie schweigen muss.
           */
          const termin = terminAusMeta(
            (bewerber.meta && typeof bewerber.meta === "object" ? bewerber.meta : null) as
              | Record<string, unknown>
              | null,
          );
          const versand = await sendeVorlage(admin, {
            templateName: "bewerber-kennenlernen-zusammenfassung",
            recipientEmail: bewerber.email,
            // Je abgeschicktem Bogen genau eine. Ein zweites Absenden ist
            // ohnehin unmoeglich, der Status steht dann auf "eingereicht".
            idempotencyKey: `bewerber-kennenlernen-zusammenfassung-${formular.id}`,
            templateData: {
              ...(hrKontakt ? { hrKontakt } : {}),
              bewerberName: `${bewerber.vorname || ""} ${bewerber.nachname || ""}`.trim(),
              ...zusammenfassungMailFelder({ termin }),
              gruppen: ueberblickFuerMail(eigeneAntworten),
            },
            metadata: { bewerbungId: formular.bewerbung_id, anlass: "kennenlernen-zusammenfassung" },
          });
          if (!versand.ok) {
            console.error("[submit-bewerber-formular] Zusammenfassung nicht verschickt", versand.grund);
          }

          /*
           * Den Zeitpunkt vermerken.
           *
           * Daran haengt die eine Erinnerung an den Termin, drei Tage spaeter:
           * `send-bewerber-kennenlernen-erinnerungen` rechnet ab hier. Ohne
           * den Vermerk gaebe es keine, denn das Absenden selbst hinterlaesst
           * sonst keinen Zeitstempel am Bewerber.
           */
          const meta = (bewerber.meta && typeof bewerber.meta === "object" ? bewerber.meta : {}) as Record<string, unknown>;
          const block = (meta.kennenlernen && typeof meta.kennenlernen === "object" && !Array.isArray(meta.kennenlernen)
            ? meta.kennenlernen
            : {}) as Record<string, unknown>;
          await admin
            .from("bewerbungen")
            .update({
              meta: {
                ...meta,
                kennenlernen: {
                  ...block,
                  zusammenfassungAm: jetzt,
                  zusammenfassungOk: versand.ok,
                },
              },
            })
            .eq("id", formular.bewerbung_id);
        }
      }
    } catch (e) {
      console.error("[submit-bewerber-formular] Zusammenfassung fehlgeschlagen", e);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[submit-bewerber-formular] Fehler", e);
    return new Response(JSON.stringify({ error: "Unerwarteter Fehler" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
