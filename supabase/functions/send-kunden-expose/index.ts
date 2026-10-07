/**
 * Kundenlink senden: per Mail mit Knopf oder nur als Link.
 *
 * Seit dem 23.09.2026 der eine Weg für „Kundenlink senden“ (Auftrag von
 * Christian). Jeder Versand landet als Zeile in `objekt_exposes` und damit im
 * Kundenprofil beim Investment, unter „Gesendete Links“.
 *
 * Zwei Arten (`auftrag.art`, siehe `_shared/kunden-expose.ts`):
 *   - `objektuebersicht`: GENAU EINE lebende Zeile je Kunde, Investment und
 *     Objekt, ohne `wohnung_id`. Die Wohnung, aus der gesendet wird, steht in
 *     `einstieg_wohnung_id`. Erneut senden, auch aus einer anderen Wohnung,
 *     nimmt dieselbe Zeile, setzt nur die Einstiegswohnung neu und verlängert
 *     die Frist. Link: https://portal.more.immo/immobilie/<token>.
 *     Senden dürfen das seit dem 05.10.2026 Admin, Inhaber, Vertriebsleitung
 *     und Vertriebspartner, Partner nur für eigene und vertretene Kunden.
 *   - `expose`: wie bisher eine Zeile je Einheit (oder ganzes Objekt).
 *
 * Ablauf:
 *   1. Anmeldung, Mengenbremse, interne Rolle, Zugriff auf genau diesen Kontakt
 *      (`pruefeKontaktZugriff`, dieselbe Regel wie beim Unterschriftsversand).
 *   2. Investment gehört zum Kunden, Objekt ist freigegeben, Einheit gehört
 *      zum Objekt. Ein nicht freigegebenes Objekt würde der Kunde über den
 *      Link gar nicht sehen, deshalb geht dann nichts hinaus.
 *   3. Zeile wiederverwenden (siehe oben) oder neu anlegen, mit neutralen
 *      Annahmen. Frist: jetzt plus 60 Tage. Die Regeln stehen in `zeile.ts`.
 *   4. Modus `mail`: Mail über `sendeVorlage`, Empfänger NUR aus dem Kontakt,
 *      Antworten gehen an den Partner (`replyTo`). Modus `link`: keine Mail.
 *   5. Gesendet vermerken (samt neuer Frist und Einstiegswohnung, erst nach
 *      der Mail, damit ein Fehlschlag nichts verstellt) und eine Aktivität
 *      am Kunden anlegen.
 *
 * Entscheidungen von Christian:
 *   - Der Link zeigt neutrale Rechenannahmen, nie Werte aus der
 *     Selbstauskunft, weil er weitergeleitet werden kann. Die Zeile bekommt
 *     deshalb leere Annahmen, und `get-expose` liest sie für den Link nicht.
 *   - Persönlich, 60 Tage gültig, jederzeit zurückziehbar.
 *
 * Ohne die Migration 20260923151000 antwortet die Function mit 409 und der
 * Meldung „Migration Exposé-Versand noch nicht ausgeführt“, bevor irgendetwas
 * geschrieben oder verschickt wird. Ohne 20260923171000 (Spalten `art` und
 * `einstieg_wohnung_id`) geht das Exposé weiter wie bisher; nur die
 * Objektübersicht antwortet dann mit 409 und „Migration Kundenlink noch nicht
 * ausgeführt“.
 *
 * Wohnungsauswahl (Christian, 05.10.2026): Die Objektübersicht kann auf
 * einzelne Wohnungen beschränkt sein (`auftrag.wohnungAuswahl`, gespeichert
 * in `objekt_exposes.wohnung_auswahl`, ausgeliefert nur über
 * `get-kundenansicht`). Ohne 20261005100000 geht sie mit allen Wohnungen
 * (`null`) wie bisher; eine echte Auswahl antwortet dann mit 409, bevor
 * etwas geschrieben oder verschickt wird.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { emailIstBrauchbar, empfaengerAusKontakt, pruefeKontaktZugriff } from "../_shared/kontakt-signatur-zugriff.ts";
import { einheitExklusivFrei, exklusivNutzerAusZeile, objektFuerBetrachter, objektSichtAusZeile } from "../_shared/objekt-zugang.ts";
import {
  datumLang, EXPOSE_VERSAND_MIGRATION_FEHLT, exposeBezeichnung, gueltigBisAb, KUNDENLINK_AUSWAHL_MIGRATION_FEHLT, KUNDENLINK_MIGRATION_FEHLT,
  kundenlinkFuer,
  versandSpalteFehlt,
} from "../_shared/kunden-expose.ts";
import { hatKundenaktionsRolle } from "../_shared/kundenaktionen-rollen.ts";
import { pruefeVersandAuftrag } from "./auftrag.ts";
import { auswahlSpeichern, versandVermerk, zeileFuerVersand, type ZeilenClient } from "./zeile.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Immer derselbe Satz, egal ob es den Kontakt nicht gibt oder er nicht erlaubt ist. */
const ZUGRIFF_ABGELEHNT = "Für diesen Kunden darfst du keinen Kundenlink senden.";

/** Zwei Sendungen zum selben Link zugleich: die spätere bricht ab, statt die frühere still zu überschreiben. */
const LINK_GERADE_GEAENDERT = "Der Link wurde gerade geändert, bitte erneut senden.";

/** Kundenlinks senden nur die Rollen mit Kundenaktionen (`kundenaktionen-rollen.ts`). */
const KUNDENLINK_NICHT_ERLAUBT = "Kundenlinks senden nur Admin, Inhaber, Vertriebsleitung und Vertriebspartner.";

function antwort(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Setzt eine schon gespeicherte Wohnungsauswahl zurück, falls danach etwas scheitert (siehe unten).
  let auswahlZuruecksetzen = async () => {};
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return antwort({ error: "Nicht autorisiert" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return antwort({ error: "Nicht autorisiert" }, 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return antwort({ error: "Ungültige Anfrage" }, 400);
    }
    const geprueft = pruefeVersandAuftrag(body);
    if (!geprueft.ok) return antwort({ error: geprueft.fehler }, 400);
    const auftrag = geprueft.auftrag;

    // Mengenbremse je Nutzer, gegen Massenversand aus einem übernommenen Konto.
    // Fällt die Bremse selbst aus, geht nichts hinaus (Prüfung Codex, 05.10.2026).
    const limit = await checkRateLimit(req, caller.id, { scope: "send-kunden-expose", perHour: 30, perDay: 150, failClosed: true });
    if (!limit.ok) return rateLimitErrorBody("send-kunden-expose", limit, corsHeaders);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    /*
     * Nur interne Rollen senden Exposés. `pruefeKontaktZugriff` ließe auch den
     * Kunden selbst an seinen Kontakt (Kundenportal); ein Kunde soll sich aber
     * keine Exposés zu beliebigen Objekten schicken können. Nur ein
     * ausdrückliches `true` zählt, siehe dreiwertige Logik in
     * `_shared/kontakt-signatur-zugriff.ts`.
     */
    const { data: intern } = await callerClient.rpc("is_internal_role", { _user_id: caller.id });
    if (intern !== true) return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);

    /*
     * Kundenlinks beider Arten senden Admin, Inhaber, Vertriebsleitung und
     * Vertriebspartner (Christians Go vom 05.10.2026; vorher die
     * Objektübersicht nur Admin und Inhaber, das Exposé jede interne Rolle).
     * Hier und nicht nur am Knopf, denn ein ausgeblendeter Knopf ist keine
     * Zugriffskontrolle. Welche Kunden, entscheidet danach
     * `pruefeKontaktZugriff`: Vertriebspartner nur eigene und vertretene.
     */
    let rollenListe: unknown[] = [];
    {
      const { data: rollen, error: rollenFehler } = await supabase.from("user_roles").select("role").eq("user_id", caller.id);
      rollenListe = ((rollen || []) as Array<{ role?: unknown }>).map((r) => r.role);
      if (rollenFehler || !hatKundenaktionsRolle(rollenListe)) {
        return antwort({ error: KUNDENLINK_NICHT_ERLAUBT }, 403);
      }
    }

    // Die Helfer beschreiben den Client bewusst lose (nur was sie brauchen);
    // gegen den vollen Typ von supabase-js kommt TypeScript dabei nicht an.
    const { erlaubt, kontakt } = await pruefeKontaktZugriff(
      supabase as unknown as Parameters<typeof pruefeKontaktZugriff>[0],
      callerClient as unknown as Parameters<typeof pruefeKontaktZugriff>[1],
      auftrag.kontaktId,
      caller.id,
    );
    if (!erlaubt || !kontakt) {
      console.warn(`Kundenlink-Versand abgelehnt: Nutzer ${caller.id} darf nicht für Kontakt ${auftrag.kontaktId} handeln.`);
      return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);
    }

    // Migration da? Vorher wird nichts geschrieben und nichts verschickt.
    {
      const { error } = await supabase
        .from("objekt_exposes")
        .select("id, investment_id, gesendet_am, gesendet_von, versandweg, zurueckgezogen_am, erstmals_aufgerufen_am")
        .limit(1);
      if (error) {
        if (versandSpalteFehlt(error) || error.code === "42P01" || error.code === "PGRST205") {
          return antwort({ error: EXPOSE_VERSAND_MIGRATION_FEHLT, migrationFehlt: true }, 409);
        }
        throw error;
      }
    }

    // Spalten der Objektübersicht da? Ohne sie geht nur das Exposé, wie bisher.
    let mitArt = true;
    {
      const { error } = await supabase.from("objekt_exposes").select("id, art, einstieg_wohnung_id").limit(1);
      if (error) {
        if (!versandSpalteFehlt(error)) throw error;
        mitArt = false;
      }
    }
    if (!mitArt && auftrag.art === "objektuebersicht") {
      return antwort({ error: KUNDENLINK_MIGRATION_FEHLT, migrationFehlt: true }, 409);
    }

    // Spalte der Wohnungsauswahl da? Ohne sie nur „alle Wohnungen“, wie bisher.
    let mitAuswahl = false;
    if (auftrag.art === "objektuebersicht") {
      const { error } = await supabase.from("objekt_exposes").select("id, wohnung_auswahl").limit(1);
      if (error && !versandSpalteFehlt(error)) throw error;
      mitAuswahl = !error;
      if (!mitAuswahl && auftrag.wohnungAuswahl) {
        return antwort({ error: KUNDENLINK_AUSWAHL_MIGRATION_FEHLT, migrationFehlt: true }, 409);
      }
    }

    /*
     * Ein Lesefehler ist kein „gibt es nicht“: Er landet im Protokoll und
     * kommt als 500 zurück, statt als irreführende 404 („Das Objekt gibt es
     * nicht mehr.“) oder 400. Die 404 dieser Function trägt immer einen Grund
     * in `error`; so unterscheidet die Oberfläche sie von der 404 einer nicht
     * ausgerollten Function (`src/lib/edgeFehler.ts`).
     */

    // Das Investment muss zu genau diesem Kunden gehören.
    const { data: investment, error: investmentFehler } = await supabase
      .from("investments").select("id, kunde_id").eq("id", auftrag.investmentId).maybeSingle();
    if (investmentFehler) throw new Error(`investments: ${investmentFehler.message}`);
    if (!investment || String(investment.kunde_id ?? "") !== auftrag.kontaktId) {
      return antwort({ error: "Dieses Investment gehört nicht zu diesem Kunden." }, 400);
    }

    const { data: objekt, error: objektFehler } = await supabase
      .from("objekte").select("id, titel, adresse, ort, sichtbar, exklusiv_partner, meta").eq("id", auftrag.objektId).maybeSingle();
    if (objektFehler) throw new Error(`objekte: ${objektFehler.message}`);
    if (!objekt) return antwort({ error: "Das Objekt gibt es nicht mehr." }, 404);
    if (objekt.sichtbar !== true) {
      return antwort({ error: "Das Objekt ist nicht freigegeben. Über den Link könnte der Kunde es nicht öffnen." }, 400);
    }
    /*
     * Fremde Exklusivobjekte und -einheiten (05.10.2026): dieselbe Regel wie
     * in der Objektübersicht, über die Kennung, der Name nur als Rückfall.
     * Neutral wie „gibt es nicht“, damit die Antwort nichts verrät.
     */
    const { data: profil } = await supabase.from("profiles").select("name").eq("id", caller.id).maybeSingle();
    const betrachter = { rollen: rollenListe, benutzerId: caller.id, name: (profil?.name as string | null) ?? null };
    if (!objektFuerBetrachter(objektSichtAusZeile(objekt as Record<string, unknown>), betrachter)) {
      return antwort({ error: "Das Objekt gibt es nicht mehr." }, 404);
    }

    let weNr: string | null = null;
    if (auftrag.wohnungId) {
      const { data: wohnung, error: wohnungFehler } = await supabase
        .from("wohnungen").select("id, objekt_id, we_nr, meta").eq("id", auftrag.wohnungId).maybeSingle();
      if (wohnungFehler) throw new Error(`wohnungen: ${wohnungFehler.message}`);
      if (!wohnung || wohnung.objekt_id !== auftrag.objektId) {
        return antwort({ error: "Diese Einheit gehört nicht zum Objekt." }, 400);
      }
      if (!einheitExklusivFrei(exklusivNutzerAusZeile(wohnung as Record<string, unknown>), betrachter)) {
        return antwort({ error: "Diese Einheit gehört nicht zum Objekt." }, 400);
      }
      weNr = typeof wohnung.we_nr === "string" ? wohnung.we_nr : wohnung.we_nr != null ? String(wohnung.we_nr) : null;
    }

    // Jede gewählte Wohnung muss zu diesem Objekt gehören.
    if (auftrag.wohnungAuswahl) {
      const { data: gewaehlt, error: auswahlFehler } = await supabase
        .from("wohnungen").select("id, meta").eq("objekt_id", auftrag.objektId).in("id", auftrag.wohnungAuswahl);
      if (auswahlFehler) throw new Error(`wohnungen: ${auswahlFehler.message}`);
      const frei = (gewaehlt || []).filter((w) => einheitExklusivFrei(exklusivNutzerAusZeile(w as Record<string, unknown>), betrachter));
      if (frei.length !== auftrag.wohnungAuswahl.length) {
        return antwort({ error: "Eine der gewählten Wohnungen gehört nicht zum Objekt." }, 400);
      }
    }

    /*
     * Empfänger ausschließlich aus dem gespeicherten Kontakt. Vorab geprüft,
     * damit ohne brauchbare Adresse gar nicht erst eine Zeile entsteht.
     */
    const empfaenger = empfaengerAusKontakt(kontakt, "person1");
    if (auftrag.modus === "mail" && !emailIstBrauchbar(empfaenger.email)) {
      return antwort({
        error: "Am Kunden ist keine gültige E-Mail-Adresse hinterlegt. Trag sie in den Stammdaten ein oder kopier den Link.",
      }, 400);
    }

    const jetzt = new Date();
    const gueltigBis = gueltigBisAb(jetzt);
    const uebersicht = auftrag.art === "objektuebersicht";

    /*
     * Zeile wiederverwenden oder neu anlegen (Regeln in `zeile.ts`). Die neue
     * Frist und bei der Objektübersicht die neue Einstiegswohnung bekommt
     * eine vorhandene Zeile erst mit dem Vermerk unten, also nach einer
     * gelungenen Mail.
     */
    const db = supabase as unknown as ZeilenClient;
    const { zeile, neu } = await zeileFuerVersand(db, auftrag, { erstelltVon: caller.id, gueltigBis, mitArt, mitAuswahl });

    /*
     * Die Wohnungsauswahl gilt, bevor eine Mail hinausgeht (Prüfung Codex,
     * 05.10.2026). Eine neue Zeile trägt sie schon seit dem Anlegen; eine
     * bestehende bekommt sie jetzt, gesperrt gegen eine gleichzeitige
     * Sendung. Scheitert das, geht nichts hinaus. Scheitert danach Mail oder
     * Vermerk, kommt die bisherige Auswahl zurück, damit keine breitere
     * Freigabe stehen bleibt.
     */
    const bisherigeAuswahl = zeile.wohnungAuswahl;
    const auswahlStand = uebersicht && mitAuswahl && !neu ? await auswahlSpeichern(db, zeile, auftrag.wohnungAuswahl) : "unveraendert";
    if (auswahlStand === "geaendert") return antwort({ error: LINK_GERADE_GEAENDERT }, 409);
    if (auswahlStand === "gespeichert") {
      auswahlZuruecksetzen = async () => {
        const { error } = await supabase.from("objekt_exposes").update({ wohnung_auswahl: bisherigeAuswahl ?? null }).eq("id", zeile.id);
        if (error) console.error("Wohnungsauswahl nicht zurückgesetzt:", zeile.id, error.message);
      };
    }
    // Die Auswahl, die nach diesem Versand gilt: die mitgeschickte, sonst die schon gespeicherte des Links.
    const auswahl: string[] | null = auftrag.wohnungAuswahl !== undefined ? auftrag.wohnungAuswahl : bisherigeAuswahl ?? null;

    const link = kundenlinkFuer(auftrag.art, auftrag.objektId, auftrag.wohnungId, zeile.token);
    const bezeichnung = exposeBezeichnung({
      mitEinheit: !!auftrag.wohnungId,
      weNr,
      objektTitel: objekt.titel,
      adresse: objekt.adresse,
      ort: objekt.ort,
    });

    // Name des Absenders für die Aktivität, Adresse als Rückfall für Antworten.
    const { data: absender } = await supabase
      .from("profiles").select("name, email").eq("id", caller.id).maybeSingle();
    const absenderName = typeof absender?.name === "string" && absender.name.trim() ? absender.name.trim() : "System";

    if (auftrag.modus === "mail") {
      /*
       * Unterschrieben vom zuständigen Partner, ohne ihn vom Absender. Die
       * Antwort des Kunden soll bei genau dieser Person ankommen, nicht bei
       * noreply@.
       */
      const berater = await zustaendigerAnsprechpartner(
        supabase as unknown as Parameters<typeof zustaendigerAnsprechpartner>[0],
        auftrag.kontaktId,
      );
      const beraterUserId = berater && kontakt.zustaendig_id ? kontakt.zustaendig_id : caller.id;
      const antwortAn = [berater?.email, absender?.email, caller.email]
        .map((a) => (typeof a === "string" ? a.trim() : ""))
        .find((a) => emailIstBrauchbar(a));

      const versand = await sendeVorlage(supabase, {
        templateName: "kunden-expose",
        // Ausschließlich aus dem Kontakt, siehe auftrag.ts.
        recipientEmail: empfaenger.email,
        idempotencyKey: `kunden-expose-${zeile.id}-${jetzt.getTime()}`,
        templateData: {
          art: auftrag.art,
          name: empfaenger.name,
          bezeichnung,
          // Nur bei der Objektübersicht mit Einstiegswohnung: der Satz über die übrigen freien Wohnungen.
          // Mit Wohnungsauswahl entfällt er, der Kunde sieht dann nicht alle freien.
          mitWohnungen: uebersicht && !!auftrag.wohnungId && !auswahl,
          link,
          gueltigBis: datumLang(gueltigBis),
          ...(berater ? { berater } : {}),
          beraterUserId,
        },
        metadata: {
          kontakt_id: auftrag.kontaktId,
          investment_id: auftrag.investmentId,
          objekt_id: auftrag.objektId,
          wohnung_id: auftrag.wohnungId,
          art: auftrag.art,
          expose_id: zeile.id,
          sent_by: caller.id,
        },
        ...(antwortAn ? { replyTo: antwortAn } : {}),
      });

      if (!versand.ok) {
        // Eine eben angelegte Zeile wieder entfernen: Sonst stünde ein Link
        // im System, den nie jemand bekommen hat.
        if (neu) await supabase.from("objekt_exposes").delete().eq("id", zeile.id);
        await auswahlZuruecksetzen();
        console.error("Kundenlink-Versand fehlgeschlagen:", versand.grund);
        return antwort({ error: `Die Mail ging nicht hinaus: ${versand.grund || "unbekannter Grund"}` }, 502);
      }
    }

    /*
     * Gesendet vermerken, mit der neuen Frist. Bei der Objektübersicht auch
     * die Einstiegswohnung: Erneut senden aus Wohnung 9 öffnet danach bei
     * Wohnung 9, der Link bleibt derselbe.
     */
    const { error: vermerkFehler } = await supabase
      .from("objekt_exposes")
      .update(versandVermerk(auftrag, { jetzt, gueltigBis, gesendetVon: caller.id }))
      .eq("id", zeile.id);
    if (vermerkFehler) throw vermerkFehler;
    // Ab hier ist der Versand vermerkt; die Auswahl bleibt.
    auswahlZuruecksetzen = async () => {};

    // Aktivität am Kunden. Beiwerk: Scheitert sie, ist der Versand trotzdem erfolgt.
    try {
      const frist = gueltigBis.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
      const was = uebersicht ? "Objektübersicht" : "Exposé";
      const { error } = await supabase.from("aktivitaeten").insert({
        kunde_id: auftrag.kontaktId,
        art: auftrag.modus === "mail" ? "email" : "notiz",
        beschreibung: auftrag.modus === "mail"
          ? `${was} per Mail gesendet: ${bezeichnung} (gültig bis ${frist})`
          : `${uebersicht ? "Link zur Objektübersicht" : "Exposé-Link"} erzeugt: ${bezeichnung} (gültig bis ${frist})`,
        von: absenderName,
        benutzer_id: caller.id,
        datum: jetzt.toISOString(),
      });
      if (error) console.error("Aktivität zum Kundenlink nicht angelegt:", error.message);
    } catch (fehler) {
      console.error("Aktivität zum Kundenlink nicht angelegt:", fehler);
    }

    return antwort({
      ok: true,
      exposeId: zeile.id,
      art: auftrag.art,
      link,
      gueltigBis: gueltigBis.toISOString(),
      versandweg: auftrag.modus,
      neu,
      // Daran erkennt der Dialog, dass diese Fassung die Auswahl kennt und gespeichert hat.
      ...(uebersicht ? { wohnungAuswahl: auswahl } : {}),
    });
  } catch (fehler) {
    await auswahlZuruecksetzen().catch((e) => console.error("Wohnungsauswahl nicht zurückgesetzt:", e));
    // Keine internen Fehlertexte nach außen, die Einzelheiten stehen im Protokoll.
    console.error("send-kunden-expose:", fehler instanceof Error ? fehler.message : fehler);
    return antwort({ error: "Der Kundenlink konnte nicht gesendet werden." }, 500);
  }
});
