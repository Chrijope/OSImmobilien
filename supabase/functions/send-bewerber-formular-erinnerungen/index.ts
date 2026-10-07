import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import { BEWERBER_ANZAHL_FRAGEN } from "../_shared/bewerber-eingangsmail.ts";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";

/**
 * Verschickt genau EINE Erinnerung an den Fragebogen, drei Tage nach der
 * Einladung. Läuft einmal täglich über pg_cron.
 *
 * Drei Bedingungen müssen zusammen erfüllt sein, sonst geht keine Mail:
 *
 *   1. Der Fragebogen ist noch offen und noch nicht abgelaufen.
 *   2. Es wurde noch keine Erinnerung verschickt.
 *   3. Das Erstgespräch wurde noch nicht geführt.
 *
 * Die dritte Bedingung ist die wichtigste. Sobald die HR-Managerin das
 * Erstgesprächsskript ausgefüllt hat, ist der Fragebogen gegenstandslos: Sie
 * weiß dann bereits alles, was darin stünde. Eine Erinnerung wäre in diesem
 * Moment nicht nur überflüssig, sondern peinlich, weil sie den Bewerber nach
 * dem Telefonat noch einmal um Vorabangaben bittet. Geprüft wird deshalb zum
 * Sendezeitpunkt und nicht beim Einplanen.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FORMULAR_BASIS_URL = "https://osimmobilien.netlify.app/bewerberfragen";
const ERINNERUNG_NACH_TAGEN = 3;

/**
 * Wurde das Erstgespräch bereits geführt oder begonnen?
 *
 * Als "begonnen" gilt jede inhaltliche Angabe im Skript. Bewusst großzügig
 * geprüft: Im Zweifel lieber keine Erinnerung schicken als eine überflüssige.
 */
function erstgespraechLaeuft(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false;

  // Ein gesetzter Erstgesprächstermin genügt bereits: Dann ist der Kontakt da.
  if (meta.erstgespraechDatum) return true;
  if (meta.closingTerminDatum) return true;

  const skript = meta.erstgespraechSkript as Record<string, unknown> | undefined;
  if (!skript) return false;
  if (skript.durchgefuehrtAm) return true;

  const inhaltlich = (wert: unknown): boolean => {
    if (wert == null) return false;
    if (typeof wert === "string") return wert.trim() !== "";
    if (Array.isArray(wert)) return wert.length > 0;
    if (typeof wert === "number") return wert > 0;
    if (typeof wert === "object") return Object.values(wert).some(inhaltlich);
    return Boolean(wert);
  };

  // Die strukturierten Antworten des Skripts. Sobald hier irgendetwas steht,
  // hat jemand mit dem Bewerber gesprochen.
  if (inhaltlich(skript.assessment)) return true;

  // Die älteren Freitextfelder der Vorfassung, aus denselben Gründen.
  return ["ausgangslage", "ziele", "motivation", "vorErfahrung", "naechsterSchritt"]
    .some((feld) => inhaltlich(skript[feld]));
}

/**
 * Die HR-Managerin fuer den Ansprechpartner-Kasten. Einmal je Lauf geladen,
 * nicht je Mail: Der Kasten ist fuer alle Empfaenger derselbe.
 */
let hrKontaktCache: Awaited<ReturnType<typeof hrAnsprechpartner>> | undefined;
let hrKontaktGeladen = false;
async function holeHrKontakt(db: any) {
  if (!hrKontaktGeladen) {
    hrKontaktCache = await hrAnsprechpartner(db);
    hrKontaktGeladen = true;
  }
  return hrKontaktCache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "send-bewerber-formular-erinnerungen", corsHeaders);
  if (abgewiesen) return abgewiesen;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const grenze = new Date(Date.now() - ERINNERUNG_NACH_TAGEN * 24 * 3600 * 1000);

    const { data: offene, error } = await admin
      .from("bewerber_formular")
      .select("id, token, bewerbung_id, expires_at, created_at")
      .eq("status", "offen")
      // Zeilen des neuen Bewerberprozesses gehören nicht hierher. Sie tragen
      // ihr Kennzeichen ab dem Anlegen, und für sie läuft eine eigene Kette in
      // `send-bewerber-kennenlernen-erinnerungen`. Ohne diesen Filter bekäme
      // ein Bewerber an Tag 3 zwei Mails, und die zweite führte ihn mit
      // demselben Zugangscode in den alten Bogen.
      .is("antworten->>bogen", null)
      .is("erinnerung_am", null)
      .lt("created_at", grenze.toISOString())
      .gt("expires_at", new Date().toISOString());

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let gesendet = 0;
    let uebersprungen = 0;

    for (const formular of offene || []) {
      const { data: bewerber } = await admin
        .from("bewerbungen")
        .select("vorname, nachname, email, status, meta")
        .eq("id", formular.bewerbung_id)
        .maybeSingle();

      if (!bewerber?.email) { uebersprungen++; continue; }

      /*
       * Wer in den Bewerberprozess umgezogen ist, darf keine Erinnerung an den
       * alten Vorabbogen mehr bekommen.
       *
       * Der Filter weiter oben schliesst nur Zeilen des neuen Bogens aus. Ein
       * uebernommener Bewerber hat aber eine offene Zeile des ALTEN Bogens,
       * angelegt vor seinem Umzug. Ohne diese Pruefung fuehrte ihn die
       * Erinnerung in einen Bogen, den sein Ablauf nicht mehr kennt.
       *
       * Der Zeitstempel wird gesetzt, damit die Zeile nicht bei jedem Lauf
       * erneut geprueft wird.
       */
      const meta = (bewerber.meta || {}) as Record<string, unknown>;
      if (String(meta.prozess || "") === "neu") {
        await admin.from("bewerber_formular")
          .update({ erinnerung_am: new Date().toISOString() })
          .eq("id", formular.id);
        uebersprungen++;
        continue;
      }

      /*
       * Erinnert wird ausschliesslich, solange der Bewerber im Eingang liegt.
       *
       * Vorher stand hier eine Ausschlussliste mit vier Status. Sie liess
       * sieben andere durch, darunter Erstgespraech, Follow-Up, Bedenkzeit und
       * Paketwahl. Wer bereits im Closing-Prozess steckt oder mit dem sogar
       * schon telefoniert wurde, bekam also weiter die Aufforderung, doch bitte
       * den Fragebogen auszufuellen. Das wirkt, als wuerde niemand mitlesen.
       *
       * Aus der Ausschlussliste wird deshalb eine Einschlussliste mit einem
       * einzigen Wert. Alles, was nicht Eingang ist, heisst: Der Vorgang laeuft
       * bereits, das Formular hat seinen Zweck verloren.
       *
       * Der Zeitstempel wird trotzdem gesetzt, damit dieser Fragebogen nicht
       * bei jedem Lauf erneut geprueft wird.
       */
      if (String(bewerber.status || "") !== "Eingang") {
        await admin.from("bewerber_formular")
          .update({ erinnerung_am: new Date().toISOString() })
          .eq("id", formular.id);
        uebersprungen++;
        continue;
      }

      /*
       * Der Bewerber hat inzwischen den Kennenlernbogen bekommen.
       *
       * Dann ist der frühere Vorabbogen gegenstandslos, aus demselben Grund
       * wie beim geführten Erstgespräch weiter unten: Wir fragen längst
       * ausführlicher. Eine Erinnerung an den alten Bogen wäre für den
       * Bewerber nicht nur überflüssig, sondern verwirrend, denn er hätte zwei
       * verschiedene Formulare von uns, beide angemahnt.
       *
       * Der Filter auf `antworten->>bogen` oben hält nur die Zeilen des neuen
       * Prozesses heraus. Dass derselbe Bewerber daneben eine alte Zeile hat,
       * sieht er nicht; genau dieser Fall ist seit dem Sammelversand vom
       * 14.09.2026 der Regelfall.
       */
      const { count: kennenlernBoegen } = await admin
        .from("bewerber_formular")
        .select("id", { count: "exact", head: true })
        .eq("bewerbung_id", formular.bewerbung_id)
        .eq("antworten->>bogen", "kennenlernen");
      if ((kennenlernBoegen ?? 0) > 0) {
        await admin.from("bewerber_formular")
          .update({ erinnerung_am: new Date().toISOString() })
          .eq("id", formular.id);
        uebersprungen++;
        continue;
      }

      // Die zentrale Bedingung: Erstgespräch schon gelaufen, also nichts senden.
      // Der Zeitstempel wird trotzdem gesetzt, damit dieser Fragebogen nicht bei
      // jedem Lauf erneut geprüft wird.
      if (erstgespraechLaeuft(bewerber.meta as Record<string, unknown> | null)) {
        await admin.from("bewerber_formular")
          .update({ erinnerung_am: new Date().toISOString() })
          .eq("id", formular.id);
        uebersprungen++;
        continue;
      }

      const ablauf = new Date(formular.expires_at).toLocaleDateString("de-DE", {
        day: "numeric", month: "long", year: "numeric",
      });

      const hrKontakt = await holeHrKontakt(admin);

      const versand = await sendeVorlage(admin, {
        templateName: "bewerber-formular-erinnerung",
        recipientEmail: bewerber.email,
        idempotencyKey: `bewerber-formular-erinnerung-${formular.id}`,
        templateData: {
          ...(hrKontakt ? { hrKontakt } : {}),
          bewerberName: `${bewerber.vorname || ""} ${bewerber.nachname || ""}`.trim(),
          formularLink: `${FORMULAR_BASIS_URL}/${formular.token}`,
          ablaufdatum: ablauf,
          anzahlFragen: BEWERBER_ANZAHL_FRAGEN,
        },
      });

      // Auch ein Fehlschlag wird vermerkt. Sonst versucht es der Dienst jede
      // Nacht erneut und der Bewerber bekommt die Mail am Ende doch mehrfach,
      // sobald der Fehler behoben ist.
      await admin.from("bewerber_formular")
        .update({ erinnerung_am: new Date().toISOString() })
        .eq("id", formular.id);

      if (versand.ok) gesendet++;
      else console.error("[formular-erinnerung] Versand fehlgeschlagen", formular.id, versand.grund);
    }

    return new Response(JSON.stringify({ ok: true, gesendet, uebersprungen }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannt" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
