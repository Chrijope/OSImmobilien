import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";
import { reserviereNachUnterschrift, type EinheitDatenzugriff } from "../_shared/einheit-vormerkung.ts";
import { reserviereObjektNachUnterschrift, type ObjektDatenzugriff } from "../_shared/objekt-belegung.ts";
import { meldeUnterschriebeneReservierung } from "../_shared/reservierung-unterschrieben-meldung.ts";
import { widerrufsfristAbgelaufen } from "../_shared/widerrufsfrist.ts";

/**
 * Eskalation bei offenen Reservierungsvereinbarungen.
 *
 * Der Kunde hat sich für eine Einheit entschieden, die Vereinbarung liegt in
 * seinem Postfach, und danach passierte bisher nichts. Die vorhandene
 * `signatur-erinnerung` ist ausdrücklich auf Selbstauskünfte beschränkt.
 * Reservierungen fielen damit komplett durch, obwohl an dieser Stelle bereits
 * ein Objekt blockiert ist.
 *
 * Eine Stufe, genau einmal:
 *
 *   Tag 14   Aufgabe und Glocke für den zuständigen Berater. Ein Anruf,
 *            kein Mailverkehr.
 *
 * Bis zum 15.09.2026 gingen davor drei Mails an den Kunden (Tag 2, 5 und 10,
 * Vorlage `reservierung-erinnerung`). Christian hat alle automatischen
 * Erinnerungen an den Kunden abgeschaltet. Der Stand je Vorgang steht
 * weiterhin in `signature_requests.meta.eskalation`; alte Vermerke `t2`, `t5`
 * und `t10` bleiben dort stehen und stören nicht, geprüft wird nur noch `t14`.
 *
 * Der Signaturlink läuft dabei ausdrücklich NICHT ab. Ein abgelaufener Link
 * bedeutet, dass der Kunde beim späten Entschluss ins Leere klickt und der
 * Vorgang neu aufgesetzt werden muss. Genau das kostet Abschlüsse.
 *
 * Läuft täglich über pg_cron (Migration 20260822120000). Der Zeitplan bleibt,
 * weil die Aufgabe an den Berater an ihm hängt.
 *
 * Seit dem 15.09.2026 erledigt derselbe Lauf einen zweiten Abschnitt: Wer
 * in der Reservierungsvereinbarung gewählt hat, die Widerrufsfrist
 * abzuwarten, dessen Wohnung bleibt vierzehn Tage frei. `finalize-reservierung`
 * vermerkt dafür `rvReservierungAb` am Investment. An diesem Tag stellt
 * dieser Lauf die Wohnung auf reserviert, sofern sie noch frei ist. Ist sie
 * inzwischen anderweitig reserviert oder verkauft, bekommt der zuständige
 * Partner Aufgabe und Glocke: Kunde informieren, Gebühr zurückzahlen.
 * Entscheidung Christians vom 15.09.2026.
 *
 * Seit dem 23.09.2026 schreibt dieser Lauf nie mehr ohne Pruefung auf
 * „reserviert“. Vorher las er den Stand, entschied und schrieb danach
 * bedingungslos; reservierte dazwischen jemand anderes, ueberschrieb er
 * dessen Kunden. Jetzt entscheidet und schreibt
 * `reserviere_einheit_nach_unterschrift` in einem Schritt (ohne Migration ein
 * bedingtes Update), siehe `_shared/einheit-vormerkung.ts`. Eine laufende
 * Vormerkung eines anderen Partners haelt die Reservierung nicht auf: Wer
 * unterschrieben hat, geht vor.
 *
 * Seit dem 23.09.2026 gilt dasselbe fuer ein ganzes Haus (Globalobjekt,
 * `rvData.gesamtobjekt`): Nach Ablauf der Frist reserviert
 * `reserviere_objekt_nach_unterschrift` das Haus, nie eine Einheit daraus. Ist
 * es inzwischen vergeben, entfaellt die Vereinbarung wie bei der Wohnung.
 *
 * Seit dem 24.09.2026 ein dritter Abschnitt, der Rueckfall fuer die interne
 * Meldung „Reservierung unterschrieben“ an Partner und Geschaeftsfuehrung.
 * Normalerweise verschickt sie `finalize-reservierung`, sobald die PDF aus
 * dem Browser des Kunden angekommen ist. Bleibt die PDF aus, steht am
 * Investment weiter `rvUnterschriebenMeldungOffen`, und dieser Lauf holt die
 * Meldung nach: mit Download, falls die PDF inzwischen doch abgelegt ist,
 * sonst mit dem Hinweis, dass sie fehlt. Siehe
 * `_shared/reservierung-unterschrieben-meldung.ts`.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Nach so vielen Tagen ohne Unterschrift übernimmt der Berater. */
const AB_TAGEN = 14;
/** Vermerk in `meta.eskalation`, unverändert aus der Zeit mit vier Stufen. */
const STUFE_ID = "t14";

function fehlerText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    return [o.message, o.details, o.hint, o.code].filter(Boolean).join(" | ") || JSON.stringify(o);
  }
  return String(e);
}

function tageSeit(iso: string): number {
  const start = new Date(iso).getTime();
  if (isNaN(start)) return -1;
  return Math.floor((Date.now() - start) / 86_400_000);
}

function datumDe(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Reservierungen, deren Widerrufsfrist abgelaufen ist, wirksam setzen.
 *
 * Gesucht werden Investments mit `rvReservierungAb` in der Vergangenheit,
 * bei denen weder `rvReservierungWirksamAm` noch `rvReservierungEntfallenAm`
 * gesetzt ist. Jedes wird genau einmal behandelt, der Vermerk am Investment
 * ist der Riegel. Fehler eines Vorgangs landen im Bericht und halten die
 * übrigen nicht auf.
 */
async function reservierungenWirksamSetzen(
  // Als Parametertyp ergibt der Client nur `never`-Tabellen; deshalb lose,
  // wie in den geteilten Helfern unter _shared.
  // deno-lint-ignore no-explicit-any
  db: any,
  bericht: { reserviert: number; entfallen: number; fehler: string[] },
): Promise<void> {
  try {
    const { data: faellige, error } = await db
      .from("investments")
      .select("id, kunde_id, meta")
      .not("meta->>rvReservierungAb", "is", null)
      .is("meta->>rvReservierungWirksamAm", null)
      .is("meta->>rvReservierungEntfallenAm", null)
      .lte("meta->>rvReservierungAb", new Date().toISOString())
      .limit(200);
    if (error) throw error;

    for (const inv of faellige ?? []) {
      const meta = (inv.meta ?? {}) as Record<string, any>;
      // Der Textvergleich oben ist nur ein Vorfilter; entschieden wird ueber
      // den echten Zeitpunkt. Seit dem 04.10.2026 steht in `rvReservierungAb`
      // 00:00 Uhr deutscher Zeit am 15. Tag nach der Unterschrift.
      if (!widerrufsfristAbgelaufen(meta.rvReservierungAb)) continue;
      const kontaktId = (inv.kunde_id as string | null) || (meta.kontaktId as string | undefined) || null;
      const rvData = (meta.rvData ?? {}) as Record<string, any>;
      const kundeName = `${rvData.vorname || ""} ${rvData.nachname || ""}`.trim() || "Kunde";
      const objektTitel = (meta.objektTitel as string | undefined) || (meta.objekt as string | undefined) || "";
      const jetzt = new Date().toISOString();
      // Das ganze Haus statt einer Wohnung, siehe Kopf der Datei.
      const gesamtobjekt = rvData.gesamtobjekt === true;
      const gegenstand = gesamtobjekt ? "Haus" : "Wohnung";

      try {
        if (gesamtobjekt) {
          const objektId = (meta.objektId as string | undefined) || null;
          if (!objektId || !kontaktId) {
            // Ohne Haus oder Kunden laesst sich nichts reservieren. Der Vorgang
            // bleibt offen und steht im Bericht, statt still zu entfallen.
            bericht.fehler.push(`${kundeName}: Widerrufsfrist abgelaufen, aber ${objektId ? "kein Kontakt" : "kein Objekt"} hinterlegt`);
            continue;
          }
          const { data: zustaendig } = await db
            .from("kontakte").select("zustaendig_id").eq("id", kontaktId).maybeSingle();
          const haus = await reserviereObjektNachUnterschrift(db as unknown as ObjektDatenzugriff, {
            objektId,
            kontaktId,
            kundeName: rvData.kaeuferArt === "gesellschaft" && rvData.firma
              ? `${String(rvData.firma).trim()} (${kundeName})`
              : kundeName,
            reserviertAm: jetzt,
            reserviertVon: (zustaendig as { zustaendig_id?: string | null } | null)?.zustaendig_id ?? null,
          });
          // Ein Fehler ist kein „vergeben“: Der Vorgang kommt beim naechsten Lauf wieder.
          if (haus.ergebnis === "fehler" || haus.ergebnis === "nicht_gefunden") {
            throw new Error(haus.fehler || "Haus nicht gefunden");
          }
          if (haus.ergebnis === "reserviert") {
            await db.from("investments")
              .update({ meta: { ...meta, rvReservierungWirksamAm: jetzt } })
              .eq("id", inv.id);
            await db.from("aktivitaeten").insert({
              kunde_id: kontaktId,
              art: "reservierung",
              beschreibung: `Reservierung des Hauses${objektTitel ? ` ${objektTitel}` : ""} nach Ablauf der Widerrufsfrist wirksam`,
              datum: jetzt,
            });
            bericht.reserviert++;
            continue;
          }
          // Vergeben oder kein Globalobjekt mehr: weiter unten wie bei der Wohnung.
        }

        // Die Wohnung finden, wie in finalize-reservierung. Beim Haus gibt es keine.
        let wohnungId: string | null = gesamtobjekt ? null : ((meta.wohnungId as string | undefined) || null);
        if (!gesamtobjekt && !wohnungId && meta.objektId && meta.weNr) {
          const { data: w } = await db
            .from("wohnungen").select("id").eq("objekt_id", meta.objektId).eq("we_nr", meta.weNr).maybeSingle();
          wohnungId = (w as { id?: string } | null)?.id || null;
        }

        /*
         * Ohne Einheit im eigenen Bestand gibt es nichts zu sperren; die
         * Reservierung gilt dann ab heute als wirksam, so wie bei „sofort"
         * ohne Einheit auch nur ein Vermerk entsteht. Dasselbe, wenn die
         * vermerkte Einheit nicht mehr existiert. Beim Haus steht hier nur
         * noch, wer oben nicht reserviert wurde, also das vergebene Haus.
         */
        let frei = !gesamtobjekt;
        if (wohnungId && !kontaktId) {
          // Ohne Kunden laesst sich nichts fuer einen Kunden reservieren.
          bericht.fehler.push(`${kundeName}: Widerrufsfrist abgelaufen, aber kein Kontakt hinterlegt`);
          continue;
        }
        if (wohnungId && kontaktId) {
          // Als Ausloeser steht der zustaendige Partner da, wie in finalize-reservierung.
          const { data: zustaendig } = await db
            .from("kontakte").select("zustaendig_id").eq("id", kontaktId).maybeSingle();
          const ergebnis = await reserviereNachUnterschrift(db as unknown as EinheitDatenzugriff, {
            wohnungId,
            kontaktId,
            kundeName,
            reserviertAm: jetzt,
            reserviertVon: (zustaendig as { zustaendig_id?: string | null } | null)?.zustaendig_id ?? null,
          });
          // Ein Fehler ist kein „vergeben“: Der Vorgang bleibt offen und kommt
          // beim naechsten Lauf wieder, statt faelschlich zu entfallen.
          if (ergebnis.ergebnis === "fehler") throw new Error(ergebnis.fehler || "Reservierung fehlgeschlagen");
          frei = ergebnis.ergebnis === "reserviert" || ergebnis.ergebnis === "nicht_gefunden";
        }

        if (frei) {
          await db.from("investments")
            .update({ meta: { ...meta, rvReservierungWirksamAm: jetzt, ...(wohnungId ? { wohnungId } : {}) } })
            .eq("id", inv.id);
          if (kontaktId) {
            await db.from("aktivitaeten").insert({
              kunde_id: kontaktId,
              art: "reservierung",
              beschreibung: `Reservierung${objektTitel ? ` für ${objektTitel}` : ""} nach Ablauf der Widerrufsfrist wirksam`,
              datum: jetzt,
            });
          }
          bericht.reserviert++;
          continue;
        }

        /*
         * Die Wohnung (beim Globalobjekt das Haus) ist inzwischen weg. Die
         * Vereinbarung ist damit nach Abschnitt 7 entfallen; der Partner ruft
         * an und veranlasst die Rückzahlung. Ohne Zuständigen bleibt nur der
         * Vermerk und ein Eintrag im Bericht.
         */
        await db.from("investments")
          // Ohne den Namen des anderen Kunden: Das Investment liest auch der
          // Kunde selbst ueber sein Portal.
          .update({ meta: { ...meta, rvReservierungEntfallenAm: jetzt, rvReservierungEntfallenGrund: `${gegenstand} inzwischen anderweitig reserviert` } })
          .eq("id", inv.id);
        bericht.entfallen++;

        if (!kontaktId) { bericht.fehler.push(`${kundeName}: Reservierung entfallen, aber kein Kontakt hinterlegt`); continue; }
        const { data: kontakt } = await db
          .from("kontakte").select("zustaendig_id").eq("id", kontaktId).maybeSingle();
        const besitzer = (kontakt as { zustaendig_id?: string } | null)?.zustaendig_id;
        if (!besitzer) { bericht.fehler.push(`${kundeName}: Reservierung entfallen, aber kein Zuständiger`); continue; }

        const { error: aufgabeFehler } = await db.from("aufgaben").insert({
          benutzer_id: besitzer,
          zugewiesen_an: besitzer,
          kontakt_id: kontaktId,
          titel: `${gegenstand} inzwischen anderweitig reserviert: ${kundeName}`,
          beschreibung:
            `${kundeName} hat die Widerrufsfrist abgewartet. ${gesamtobjekt ? "Das Haus" : "Die Wohnung"}${objektTitel ? ` (${objektTitel})` : ""} ist inzwischen anderweitig reserviert, ` +
            `die Reservierungsvereinbarung ist damit nach Abschnitt 7 entfallen. Bitte den Kunden informieren und eine bereits gezahlte ` +
            `Reservierungsgebühr innerhalb von vierzehn Tagen vollständig zurückzahlen.`,
          prioritaet: "hoch",
          faellig_am: jetzt.slice(0, 10),
          typ: "aufgabe",
          ausloeser_schluessel: `reservierung_entfallen:${inv.id}`,
        });
        if (aufgabeFehler) { bericht.fehler.push(`Aufgabe ${kundeName}: ${aufgabeFehler.message}`); continue; }

        await db.from("benachrichtigungen").insert({
          id: crypto.randomUUID(),
          benutzer_id: besitzer,
          titel: `${gegenstand} inzwischen anderweitig reserviert: ${kundeName}`,
          nachricht: `Reservierung nach Ablauf der Widerrufsfrist (${datumDe(String(meta.rvReservierungAb))}) nicht mehr möglich. Kunde informieren, Gebühr zurückzahlen.`,
          link: `/kunden/${kontaktId}`,
          gelesen: false,
          erstellt_am: jetzt,
        });
        await db.from("aktivitaeten").insert({
          kunde_id: kontaktId,
          art: "reservierung",
          beschreibung: `Reservierung${objektTitel ? ` für ${objektTitel}` : ""} entfallen: ${gegenstand} bei Ablauf der Widerrufsfrist anderweitig reserviert`,
          datum: jetzt,
        });
      } catch (e) {
        bericht.fehler.push(`Reservierung ${inv.id}: ${fehlerText(e)}`);
      }
    }
  } catch (e) {
    console.error("reservierungenWirksamSetzen:", e);
    bericht.fehler.push(fehlerText(e));
  }
}

/** Erst nach dieser Wartezeit greift der Rueckfall, vorher ist die PDF meist noch unterwegs. */
const MELDUNG_NACH_STUNDEN = 1;
/** Aeltere offene Meldungen werden nicht mehr versucht, damit ein Dauerfehler nicht ewig laeuft. */
const MELDUNG_BIS_TAGE = 14;

/**
 * Offene Meldungen „Reservierung unterschrieben“ nachholen.
 *
 * Jede Meldung genau einmal: Der Helfer prueft `rvUnterschriebenGemeldetAm`,
 * und jede Mail traegt einen festen Idempotenzschluessel. Geschrieben werden
 * nur die Felder der Meldung, auf das frisch gelesene Meta, damit dieser Lauf
 * nichts ueberschreibt, was inzwischen jemand anderes am Investment geaendert
 * hat.
 */
async function offeneMeldungenNachholen(
  // deno-lint-ignore no-explicit-any
  db: any,
  bericht: { gemeldet: number; fehler: string[] },
): Promise<void> {
  try {
    const jetzt = Date.now();
    const { data: offene, error } = await db
      .from("investments")
      .select("id, kunde_id, meta")
      .eq("meta->>rvUnterschriebenMeldungOffen", "true")
      .lte("meta->>rvSignedAt", new Date(jetzt - MELDUNG_NACH_STUNDEN * 3_600_000).toISOString())
      .gte("meta->>rvSignedAt", new Date(jetzt - MELDUNG_BIS_TAGE * 86_400_000).toISOString())
      .limit(100);
    if (error) throw error;

    for (const inv of offene ?? []) {
      const meta = (inv.meta ?? {}) as Record<string, any>;
      const kontaktId = (inv.kunde_id as string | null) || (meta.kontaktId as string | undefined) || null;
      if (!kontaktId) {
        bericht.fehler.push(`Meldung ${inv.id}: kein Kontakt am Investment`);
        continue;
      }
      try {
        const { data: kontakt } = await db
          .from("kontakte").select("vorname, nachname").eq("id", kontaktId).maybeSingle();
        const rvData = (meta.rvData ?? {}) as Record<string, any>;
        const kundeName = `${kontakt?.vorname || ""} ${kontakt?.nachname || ""}`.trim() ||
          `${rvData.vorname || ""} ${rvData.nachname || ""}`.trim() || "Kunde";

        const meldung = await meldeUnterschriebeneReservierung(db, { investmentId: inv.id, kontaktId, meta, kundeName });
        if (meldung.hinweise.length > 0) console.warn(`Reservierungsmeldung ${inv.id}:`, meldung.hinweise);
        if (meldung.fehler.length > 0) bericht.fehler.push(...meldung.fehler.map((f) => `Meldung ${inv.id}: ${f}`));

        // Schon gemeldet, aber das Merkmal stand noch: nur aufraeumen.
        const patch = meldung.bereitsGemeldet ? { rvUnterschriebenMeldungOffen: false } : meldung.metaPatch;
        const { data: frisch } = await db.from("investments").select("meta").eq("id", inv.id).maybeSingle();
        const { error: schreibFehler } = await db
          .from("investments")
          .update({ meta: { ...((frisch?.meta as Record<string, unknown>) ?? meta), ...patch } })
          .eq("id", inv.id);
        if (schreibFehler) bericht.fehler.push(`Meldung ${inv.id}: Vermerk nicht gespeichert: ${schreibFehler.message}`);
        if (meldung.versendet.length > 0) bericht.gemeldet++;
      } catch (e) {
        bericht.fehler.push(`Meldung ${inv.id}: ${fehlerText(e)}`);
      }
    }
  } catch (e) {
    console.error("offeneMeldungenNachholen:", e);
    bericht.fehler.push(fehlerText(e));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "send-reservierung-eskalation", corsHeaders);
  if (abgewiesen) return abgewiesen;

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const bericht = { aufgaben: 0, reserviert: 0, entfallen: 0, gemeldet: 0, fehler: [] as string[] };

  // Abschnitt 1: abgewartete Widerrufsfristen, die heute ablaufen.
  await reservierungenWirksamSetzen(db, bericht);

  // Abschnitt 3 (vorgezogen, weil kurz): offene Meldungen „unterschrieben“.
  await offeneMeldungenNachholen(db, bericht);

  try {
    // Nur Reservierungsvereinbarungen. Ihre Kennung beginnt mit "rv_",
    // siehe send-reservation-signature.
    const { data: offene, error } = await db
      .from("signature_requests")
      .select("id, name, kontakt_id, created_at, meta, sa_data, person_type")
      .eq("status", "pending")
      .like("person_type", "rv_%")
      .limit(200);

    if (error) throw error;

    for (const s of offene ?? []) {
      const meta = (s.meta ?? {}) as Record<string, unknown>;
      const erledigt: string[] = Array.isArray(meta.eskalation) ? (meta.eskalation as string[]) : [];
      const tage = tageSeit(s.created_at as string);
      if (tage < AB_TAGEN || erledigt.includes(STUFE_ID)) continue;

      const saData = (s.sa_data ?? {}) as Record<string, unknown>;
      const objektTitel =
        (saData.objektTitel as string | undefined) ||
        (saData.objekt as string | undefined) ||
        "";

      // Der Berater übernimmt. Ohne Zuständigen keine Aufgabe, denn eine
      // Aufgabe ohne Besitzer liest niemand.
      if (!s.kontakt_id) { bericht.fehler.push(`${s.name}: kein Kontakt hinterlegt`); continue; }
      const { data: kontakt } = await db
        .from("kontakte").select("zustaendig_id").eq("id", s.kontakt_id).maybeSingle();
      const besitzer = (kontakt as { zustaendig_id?: string } | null)?.zustaendig_id;
      if (!besitzer) { bericht.fehler.push(`${s.name}: kein Zuständiger`); continue; }

      const jetzt = new Date().toISOString();
      const { error: aufgabeFehler } = await db.from("aufgaben").insert({
        benutzer_id: besitzer,
        zugewiesen_an: besitzer,
        kontakt_id: s.kontakt_id,
        titel: `Reservierung seit ${tage} Tagen nicht unterschrieben: ${s.name}`,
        beschreibung:
          `${s.name} hat die Reservierungsvereinbarung${objektTitel ? ` für ${objektTitel}` : ""} vor ${tage} Tagen bekommen ` +
          `und noch nicht unterschrieben. Eine automatische Erinnerung an den Kunden gibt es nicht, jetzt hilft ein Anruf. ` +
          `Bitte klären, woran es liegt. Der Signaturlink bleibt gültig, es muss nichts neu erzeugt werden.`,
        prioritaet: "hoch",
        faellig_am: jetzt.slice(0, 10),
        typ: "aufgabe",
        ausloeser_schluessel: `reservierung_offen:${s.id}`,
      });
      if (aufgabeFehler) { bericht.fehler.push(`Aufgabe ${s.name}: ${aufgabeFehler.message}`); continue; }

      await db.from("benachrichtigungen").insert({
        id: crypto.randomUUID(),
        benutzer_id: besitzer,
        titel: `Reservierung offen: ${s.name}`,
        nachricht: `Seit ${tage} Tagen nicht unterschrieben. Bitte anrufen und nachfassen.`,
        link: `/kunden/${s.kontakt_id}`,
        gelesen: false,
        erstellt_am: jetzt,
      });
      bericht.aufgaben++;

      // Stand vermerken, damit die Aufgabe nicht jede Nacht erneut entsteht.
      await db.from("signature_requests")
        .update({ meta: { ...meta, eskalation: [...erledigt, STUFE_ID] } })
        .eq("id", s.id);
    }
  } catch (e) {
    console.error("send-reservierung-eskalation:", e);
    bericht.fehler.push(fehlerText(e));
  }

  /*
   * Nach aussen nur Zahlen.
   *
   * Die Function ist ohne Anmeldung erreichbar, weil pg_cron sie ruft und der
   * Zeitplan keinen Ausweis mitschickt. Sie ist damit fuer jeden aufrufbar,
   * der die Adresse kennt. In `bericht.fehler` stehen Klarnamen von Kunden
   * ("Nachname: Reservierung entfallen, aber kein Zustaendiger"): Wer sie
   * aufrief, bekam die Namen derer zurueck, deren Reservierung offen ist oder
   * entfallen war. Derselbe Fehler war bei `signatur-erinnerung` schon einmal
   * behoben, siehe der Kommentar dort.
   *
   * Die vollstaendige Liste bleibt im Log, dort gehoert sie hin.
   */
  console.log("send-reservierung-eskalation:", JSON.stringify(bericht));
  return new Response(JSON.stringify({
    ok: true,
    aufgaben: bericht.aufgaben,
    reserviert: bericht.reserviert,
    entfallen: bericht.entfallen,
    gemeldet: bericht.gemeldet,
    fehler: bericht.fehler.length,
  }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
