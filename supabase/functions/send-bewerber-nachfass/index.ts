import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { versendeKennenlernen } from "../_shared/kennenlernen-versand.ts";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { darfBewerberbereich } from "../_shared/bewerber-rollen.ts";
import {
  KL_NACHFASS_BETREFF,
  KL_NACHFASS_VERLAUFSTEXT,
  inPakete,
  kandidatName,
  metaNachNachfass,
  normalisiereMail,
  waehleKennenlernNachfassEmpfaenger,
  type NachfassKandidat,
} from "../_shared/bewerber-nachfass.ts";

/**
 * Die einmalige Nachfass-Mail an alle Bewerber im Status Eingang.
 *
 * Zwei Modi, dieselbe Empfängerliste:
 *
 *   vorschau   liefert Empfänger und Ausgeschlossene (ohne Mailadresse, Mail
 *              schon erhalten, Bogen abgeschickt, Adresse gesperrt) für den
 *              Bestätigungsdialog im CRM und für die Kennzeichen in der
 *              Bewerberliste, ändert nichts
 *   senden     legt je Empfänger ein Abmelde-Token an, verschickt die Vorlage
 *              `bewerber-nachfass-eingang` über send-transactional-email in
 *              Paketen von 10, setzt meta.klNachfassMailAm und schreibt
 *              „Sammelmail zum Kennenlernen gesendet" in den Verlauf. Die
 *              Erinnerungskette startet dabei seit dem 26.09.2026 nicht
 *              mehr neu, siehe `metaNachNachfass`.
 *
 * Ein Abbruch ist unkritisch: Wer die Mail hat, trägt nachfassMailAm und wird
 * beim nächsten Lauf übersprungen. Ein zweiter Lauf nimmt nur die Übrigen.
 *
 * Mit Anmeldung (verify_jwt = true). Zusätzlich wird die Rolle geprüft: Nur
 * HR, Admin, Inhaber und Backoffice dürfen senden, dieselben Rollen wie
 * kannBewerberVerwalten im CRM (`_shared/bewerber-rollen.ts`). Ein
 * ausgeblendeter Knopf ist keine Zugriffskontrolle.
 *
 * Fehlt die Tabelle bewerber_abmeldung, weil die Migration noch nicht
 * gelaufen ist, meldet die Vorschau das sauber, und der Versand bricht ab,
 * bevor eine einzige Mail hinausgeht: Eine Mail ohne gültigen Abmeldelink
 * wäre ein leeres Versprechen.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function antwort(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return antwort({ error: "Nur POST" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return antwort({ error: "Nicht autorisiert" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return antwort({ error: "Nicht autorisiert" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const darf = await darfBewerberbereich(admin, caller.id);
    if (!darf) return antwort({ error: "Keine Berechtigung" }, 403);

    const body = await req.json().catch(() => ({}));
    const modus = body?.modus === "senden" ? "senden" : "vorschau";

    // Alle im Eingang. Stellen und Termine liegen in derselben Tabelle mit
    // eigenem _type; die Auswahl sortiert sie aus.
    const { data: zeilen, error: leseFehler } = await admin
      .from("bewerbungen")
      .select("id, vorname, nachname, email, status, meta")
      .eq("status", "Eingang");
    if (leseFehler) {
      console.error("[send-bewerber-nachfass] Bewerber nicht lesbar", leseFehler);
      return antwort({ error: "Bewerber konnten nicht geladen werden" }, 500);
    }

    /*
     * Wer den Kennenlernbogen schon geschickt hat, bekommt keine
     * Aufforderung mehr.
     *
     * Beide Boegen liegen in derselben Tabelle. Unterschieden werden sie am
     * Kennzeichen in `antworten`: Der Kennenlernbogen traegt `bogen` gleich
     * "kennenlernen" oder einen gewaehlten `weg`. Alles andere ist der
     * fruehere Vorab-Bogen, und der zaehlt seit dem 12.09.2026 nicht mehr
     * als erledigt (Begruendung bei `waehleKennenlernNachfassEmpfaenger`).
     * Deshalb wird hier nur noch die eine Menge gebaut.
     */
    const { data: boegen } = await admin
      .from("bewerber_formular")
      .select("bewerbung_id, status, antworten")
      .eq("status", "eingereicht");

    const bogenEingereicht = new Set<string>();
    for (const b of (boegen || []) as Array<{ bewerbung_id: string; antworten: unknown }>) {
      const a = (b.antworten && typeof b.antworten === "object" ? b.antworten : {}) as Record<string, unknown>;
      const istKennenlernen = a.bogen === "kennenlernen" || (typeof a.weg === "string" && a.weg.trim() !== "");
      if (istKennenlernen) bogenEingereicht.add(b.bewerbung_id);
    }

    /*
     * Die gesperrten Adressen.
     *
     * `send-transactional-email` haelt jede Mail an eine Adresse aus
     * `suppressed_emails` zurueck. Ein Bewerber mit gesperrter Adresse stand
     * bis zum 14.09.2026 trotzdem in der Empfaengerliste. Sein Versand
     * scheiterte dann jedes Mal mit „Adresse steht auf der Sperrliste", und
     * diese Meldung sah nur, wer im selben Moment vor dem Versanddialog sass.
     * Danach war er wieder ein offener Versandfall wie jeder andere, und beim
     * naechsten Lauf scheiterte er erneut. Jetzt wird er vorher ausgewiesen.
     *
     * Gelesen wird hier mit der Service-Rolle. Das CRM kann diese Tabelle
     * nicht selbst lesen: Die Zeilensicherheit erlaubt es nur Admin und
     * Inhaber, die HR-Managerin bekaeme stillschweigend null Zeilen und
     * damit ein falsches Bild.
     */
    const gesperrteAdressen = new Set<string>();
    const { data: sperrliste, error: sperrFehler } = await admin
      .from("suppressed_emails")
      .select("email");
    if (sperrFehler) {
      // Kein Abbruch: Ohne Sperrliste fehlt eine Kennzeichnung, aber die
      // Auswahl selbst bleibt richtig.
      console.error("[send-bewerber-nachfass] Sperrliste nicht lesbar", sperrFehler);
    }
    for (const zeile of (sperrliste || []) as Array<{ email: string | null }>) {
      const adresse = normalisiereMail(zeile.email);
      if (adresse) gesperrteAdressen.add(adresse);
    }

    const auswahl = waehleKennenlernNachfassEmpfaenger(
      (zeilen || []) as NachfassKandidat[],
      bogenEingereicht,
      gesperrteAdressen,
    );

    const { error: tabellenFehler } = await admin
      .from("bewerber_abmeldung")
      .select("id")
      .limit(1);
    const migrationFehlt = tabelleFehlt(tabellenFehler);

    const empfaengerListe = auswahl.empfaenger.map((k) => ({
      id: k.id,
      name: kandidatName(k),
      email: (k.email || "").trim(),
    }));

    if (modus === "vorschau") {
      return antwort({
        ok: true,
        modus,
        betreff: KL_NACHFASS_BETREFF,
        empfaenger: empfaengerListe,
        ausgeschlossen: auswahl.ausgeschlossen,
        migrationFehlt,
      });
    }

    if (migrationFehlt) {
      return antwort({ error: "Migration noch nicht ausgeführt", migrationFehlt: true }, 409);
    }

    // Wenige Läufe je Nutzer und Stunde: Der Versand ist eine Welle, kein Knopf
    // zum Dauerdrücken. Ein zweiter Lauf nimmt ohnehin nur die Übrigen.
    const limit = await checkRateLimit(req, caller.id, { scope: "send-bewerber-nachfass", perHour: 5 });
    if (!limit.ok) return rateLimitErrorBody("send-bewerber-nachfass", limit, corsHeaders);

    const { data: profil } = await admin
      .from("profiles")
      .select("name")
      .eq("id", caller.id)
      .maybeSingle();
    const autor = String(profil?.name || "").trim() || "HR";

    const hrKontakt = await hrAnsprechpartner(admin);

    let gesendet = 0;
    const fehlgeschlagen: Array<{ id: string; name: string; grund: string }> = [];

    for (const paket of inPakete(auswahl.empfaenger)) {
      await Promise.all(paket.map(async (k) => {
        const name = kandidatName(k);
        try {
          // Es soll immer nur ein Link je Bewerber gelten.
          await admin
            .from("bewerber_abmeldung")
            .update({ status: "ersetzt" })
            .eq("bewerbung_id", k.id)
            .eq("status", "offen");

          const { data: tokenZeile, error: anlegeFehler } = await admin
            .from("bewerber_abmeldung")
            .insert({ bewerbung_id: k.id, vorname: k.vorname || "" })
            .select("id, token")
            .single();
          if (anlegeFehler || !tokenZeile) {
            fehlgeschlagen.push({ id: k.id, name, grund: "Token konnte nicht angelegt werden" });
            return;
          }

          /*
           * Der persoenliche Kennenlernlink.
           *
           * Ein noch gueltiger wird wiederverwendet, sonst legt
           * das gemeinsame Modul `_shared/kennenlernen-versand.ts` einen neuen
           * an. Der Aufruf laeuft direkt im selben Prozess, ohne Umweg ueber
           * das Netz und ohne zweite Anmeldung.
           *
           * Ohne Link geht die Mail nicht hinaus. Eine Sammelmail, die zum
           * Kennenlernen einlaedt und keinen Weg dorthin zeigt, waere
           * schlimmer als keine Mail.
           */
          const linkErgebnis = await versendeKennenlernen(admin, {
            bewerbungId: k.id,
            nurLink: true,
          });
          const kennenlernenLink = String((linkErgebnis.koerper as { link?: string }).link || "");
          if (!kennenlernenLink) {
            fehlgeschlagen.push({ id: k.id, name, grund: "Kennenlernlink konnte nicht erzeugt werden" });
            return;
          }

          const versand = await sendeVorlage(admin, {
            templateName: "bewerber-nachfass-kennenlernen",
            recipientEmail: (k.email || "").trim(),
            idempotencyKey: `bewerber-nachfass-kl-${tokenZeile.id}`,
            templateData: {
              ...(hrKontakt ? { hrKontakt } : {}),
              bewerberName: `${k.vorname || ""} ${k.nachname || ""}`.trim(),
              kennenlernenLink,
              abmeldeToken: tokenZeile.token,
            },
            metadata: { bewerbungId: k.id, anlass: "nachfass-kennenlernen" },
          });
          if (!versand.ok) {
            fehlgeschlagen.push({ id: k.id, name, grund: versand.grund || "Versand fehlgeschlagen" });
            return;
          }

          // Meta frisch lesen, damit eine parallele Änderung im CRM nicht
          // mit dem Stand vom Anfang des Laufs überschrieben wird.
          const jetzt = new Date().toISOString();
          const { data: aktuell } = await admin
            .from("bewerbungen")
            .select("meta")
            .eq("id", k.id)
            .maybeSingle();
          const meta = (aktuell?.meta && typeof aktuell.meta === "object" ? aktuell.meta : {}) as Record<string, unknown>;
          // Nur Merker und Verlaufseintrag. Die Erinnerungskette bleibt
          // unberuehrt, Begruendung bei `metaNachNachfass`.
          const { error: schreibFehler } = await admin
            .from("bewerbungen")
            .update({
              meta: metaNachNachfass(meta, jetzt, {
                id: crypto.randomUUID(),
                text: KL_NACHFASS_VERLAUFSTEXT,
                datum: jetzt,
                autor,
                autorId: caller.id,
              }),
            })
            .eq("id", k.id);
          if (schreibFehler) {
            // Die Mail ist draußen; ohne Vermerk bekäme er beim nächsten Lauf
            // eine zweite. Deshalb laut ins Log und als Fehlschlag melden.
            console.error("[send-bewerber-nachfass] Vermerk fehlgeschlagen", k.id, schreibFehler);
            fehlgeschlagen.push({ id: k.id, name, grund: "Mail gesendet, Vermerk in der Akte fehlgeschlagen" });
            return;
          }
          gesendet += 1;
        } catch (e) {
          console.error("[send-bewerber-nachfass] Fehler bei", k.id, e);
          fehlgeschlagen.push({ id: k.id, name, grund: e instanceof Error ? e.message : "Unerwarteter Fehler" });
        }
      }));
    }

    return antwort({
      ok: true,
      modus,
      gesendet,
      fehlgeschlagen,
      uebersprungen: auswahl.ausgeschlossen.length,
    });
  } catch (e) {
    console.error("[send-bewerber-nachfass] Fehler", e);
    return antwort({ error: "Unerwarteter Fehler" }, 500);
  }
});
