import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { notarZeitpunkt, istEinladungFaellig } from "../_shared/notar-zeitpunkt.ts";

/**
 * Einladung zur Bewertung des Vertriebspartners, eine Stunde nach dem
 * Notartermin.
 *
 * Warum es diese Function gibt: Die Einladung existierte schon, aber sie wurde
 * vom Browser des Kunden ausgeloest. Sie ging erst raus, wenn er sich ins
 * Portal einloggte, und nur dann. Wer sich nie einloggt, wurde nie gefragt,
 * und genau das sind die Kunden, deren Rueckmeldung am meisten fehlt. Der
 * Zeitpunkt "eine Stunde nach dem Notartermin" war also gedacht, aber nicht
 * zuverlaessig.
 *
 * Jetzt entscheidet der Server. Der Ablauf je Lauf:
 *
 *   1. Alle Investments mit einem Notartermin laden.
 *   2. Den Termin als Berliner Wanduhrzeit lesen und in UTC umrechnen.
 *   3. Nur die nehmen, deren Termin zwischen einer und 25 Stunden zurueckliegt.
 *   4. Kunden ueberspringen, die schon bewertet haben oder die Mail schon haben.
 *   5. Verschicken und den Versand am Investment vermerken.
 *
 * Das Fenster von 25 Stunden ist Absicht. Nach unten schuetzt die eine Stunde
 * davor, dass die Bitte den Kunden erreicht, waehrend er noch beim Notar
 * sitzt. Nach oben verhindert die Grenze zweierlei: dass beim ersten Lauf
 * saemtliche Bestandskunden mit lange zurueckliegenden Terminen eine Mail
 * bekommen, und dass ein einzelner ausgefallener Lauf jemanden dauerhaft
 * verpasst, denn 25 Stunden decken einen ausgefallenen Lauf mit ab.
 *
 * Laeuft stuendlich ueber pg_cron.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Die beiden Erinnerungen an die Google-Bewertung, gerechnet ab deren Versand.
 *
 * Nach der zweiten ist Schluss. Wer bis dahin nicht reagiert hat, will nicht,
 * und eine dritte Bitte belastet nur die Beziehung zu einem Kunden, der gerade
 * sechsstellig investiert hat.
 *
 * Zu beachten: Ob jemand bei Google bewertet hat, koennen wir nicht sehen,
 * Google meldet das nicht zurueck. Es gibt hier also nichts, woran der Lauf
 * abbrechen koennte. Beide Erinnerungen sagen deshalb im Text, dass sie
 * hinfaellig sind, falls die Bewertung schon abgegeben wurde.
 *
 * Die vertrauliche Bewertung im Portal wird bewusst nicht als Abbruch
 * gewertet: Wer dort geantwortet hat, war deswegen noch nicht bei Google.
 */
const ERINNERUNGEN = [
  { stufe: 1, nachTagen: 4, vorlage: "google-bewertung-erinnerung-1", vermerk: "googleBewertungErinnerung1At" },
  { stufe: 2, nachTagen: 10, vorlage: "google-bewertung-erinnerung-2", vermerk: "googleBewertungErinnerung2At" },
] as const;

const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Wie lange eine Einladung hoechstens zurueckliegen darf, damit noch erinnert
 * wird.
 *
 * Ohne diese Grenze bekaeme beim allerersten Lauf jeder Bestandskunde eine
 * Erinnerung, dessen Einladung irgendwann in der Vergangenheit hinausging,
 * auch wenn sein Notartermin ein Jahr her ist. Dieselbe Ueberlegung steckt
 * schon im 25-Stunden-Fenster der Einladung.
 */
const ERINNERUNG_SPAETESTENS_TAGE = 30;

/**
 * Ist diese Erinnerungsstufe faellig?
 *
 * Das Fenster nach oben ist bewusst weit: Ein ausgefallener Lauf soll niemanden
 * dauerhaft verpassen. Doppelte Mails verhindert der Vermerk, nicht das Fenster.
 */
function istErinnerungFaellig(einladungAm: string | undefined, nachTagen: number, jetzt: number): boolean {
  if (!einladungAm) return false;
  const start = Date.parse(einladungAm);
  if (Number.isNaN(start)) return false;
  const vergangen = jetzt - start;
  if (vergangen > ERINNERUNG_SPAETESTENS_TAGE * TAG_MS) return false;
  return vergangen >= nachTagen * TAG_MS;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function fehlerText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    return [o.message, o.details, o.hint, o.code].filter(Boolean).join(" | ") || JSON.stringify(o);
  }
  return String(e);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const bericht = { geprueft: 0, faellig: 0, gesendet: 0, uebersprungen: 0, erinnert: 0, fehler: [] as string[] };

  try {
    const jetzt = new Date();
    const { data: investments, error } = await db
      .from("investments")
      .select("id, kunde_id, meta")
      .not("meta", "is", null);
    if (error) throw error;

    // Je Kunde hoechstens eine Mail, auch wenn er mehrere Investments hat.
    // Der Bewertungsbogen haengt am Kontakt und gibt es nur einmal.
    const jeKunde = new Map<string, { investmentId: string; meta: Record<string, unknown> }>();

    for (const inv of (investments ?? []) as Array<{ id: string; kunde_id: string | null; meta: Record<string, unknown> | null }>) {
      bericht.geprueft++;
      const meta = (inv.meta ?? {}) as Record<string, unknown>;
      if (!inv.kunde_id) continue;
      if (meta.vpBewertungMailAt) continue;

      if (!istEinladungFaellig(notarZeitpunkt(meta), jetzt)) continue;

      bericht.faellig++;
      if (!jeKunde.has(inv.kunde_id)) jeKunde.set(inv.kunde_id, { investmentId: inv.id, meta });
    }

    /*
     * Erinnerungen. Sie haengen an der Einladung und nicht am Notartermin:
     * Wenn die erste Mail einen Tag spaeter hinausging, weil ein Lauf
     * ausgefallen war, sollen die vier Tage auch erst dann zu zaehlen
     * beginnen. Wie oben gilt je Kunde hoechstens eine Mail.
     */
    const jeKundeErinnerung = new Map<
      string,
      { investmentId: string; meta: Record<string, unknown>; stufe: (typeof ERINNERUNGEN)[number] }
    >();

    for (const inv of (investments ?? []) as Array<{ id: string; kunde_id: string | null; meta: Record<string, unknown> | null }>) {
      const meta = (inv.meta ?? {}) as Record<string, unknown>;
      if (!inv.kunde_id) continue;
      const einladungAm = meta.googleBewertungMailAt as string | undefined;
      if (!einladungAm) continue;

      // Die spaetere Stufe zuerst pruefen: Wer laenger nicht reagiert hat,
      // soll die letzte Erinnerung bekommen und nicht die erste nachgereicht.
      for (const stufe of [...ERINNERUNGEN].reverse()) {
        if (meta[stufe.vermerk]) break;
        if (!istErinnerungFaellig(einladungAm, stufe.nachTagen, jetzt.getTime())) continue;
        if (!jeKundeErinnerung.has(inv.kunde_id)) {
          jeKundeErinnerung.set(inv.kunde_id, { investmentId: inv.id, meta, stufe });
        }
        break;
      }
    }

    for (const [kundeId, eintrag] of jeKunde) {
      try {
        // Wer im Portal schon bewertet hat, bekommt die vertrauliche Bitte
        // nicht noch einmal. Die Google-Bitte geht trotzdem hinaus, denn sie
        // fragt nach etwas anderem.
        const { data: vorhanden } = await db
          .from("vp_bewertungen").select("id").eq("kontakt_id", kundeId).maybeSingle();

        const { data: kontakt } = await db
          .from("kontakte")
          .select("id, vorname, nachname, email, berater, zustaendig_id")
          .eq("id", kundeId)
          .maybeSingle();
        const k = kontakt as {
          vorname?: string; nachname?: string; email?: string;
          berater?: string; zustaendig_id?: string;
        } | null;
        if (!k?.email) { bericht.uebersprungen++; continue; }

        const berater = await zustaendigerAnsprechpartner(db, kundeId);
        const vpName = berater?.name || k.berater || "";

        const daten = {
          kundeName: [k.vorname, k.nachname].filter(Boolean).join(" ").trim(),
          ...(vpName ? { vpName } : {}),
          ...(berater ? { berater } : {}),
        };

        /*
         * Zwei Mails zum selben Zeitpunkt, bewusst getrennt.
         *
         * Die oeffentliche Bitte bei Google und die vertrauliche Rueckmeldung
         * im Portal sind zwei verschiedene Fragen an zwei verschiedene
         * Adressaten. In einer Mail zusammengefasst muesste der Leser waehlen,
         * und dann tut er meist keines von beidem.
         *
         * Zuerst Google, damit diese Mail im Postfach obenauf liegt. An ihr
         * haengen auch die beiden Erinnerungen.
         */
        const versandGoogle = await sendeVorlage(db, {
          templateName: "google-bewertung-einladung",
          recipientEmail: k.email,
          idempotencyKey: `google-bewertung-einladung-${kundeId}`,
          kontaktId: kundeId,
          templateData: daten,
        });
        if (!versandGoogle.ok) {
          bericht.fehler.push(`Google an ${k.email}: ${versandGoogle.grund}`);
        } else {
          bericht.gesendet++;
        }

        if (vorhanden) {
          bericht.uebersprungen++;
        } else {
          const versandPortal = await sendeVorlage(db, {
            templateName: "vp-bewertung-einladung",
            recipientEmail: k.email,
            // Derselbe Schluessel, den das Kundenportal benutzt hat. Sollte
            // dort noch eine alte Fassung laufen, bleibt es bei einer Mail.
            idempotencyKey: `vp-bewertung-einladung-${kundeId}`,
            kontaktId: kundeId,
            templateData: daten,
          });
          if (!versandPortal.ok) {
            bericht.fehler.push(`Portal an ${k.email}: ${versandPortal.grund}`);
          } else {
            bericht.gesendet++;
          }
        }

        /*
         * Die Vermerke werden auch nach einem Fehlschlag gesetzt. Sonst
         * versucht es der Dienst stuendlich erneut, und eine Adresse auf der
         * Sperrliste erzeugt 25 Anlaeufe je Kunde.
         *
         * `googleBewertungMailAt` ist der Startpunkt der beiden Erinnerungen.
         */
        const jetztIso = new Date().toISOString();
        await db.from("investments")
          .update({
            meta: {
              ...eintrag.meta,
              vpBewertungMailAt: jetztIso,
              googleBewertungMailAt: jetztIso,
            },
          })
          .eq("id", eintrag.investmentId);
      } catch (e) {
        bericht.fehler.push(`${kundeId}: ${fehlerText(e)}`);
      }
    }

    // ── Erinnerungen verschicken ──
    for (const [kundeId, eintrag] of jeKundeErinnerung) {
      try {
        /*
         * Hier wird nichts geprueft, was den Versand stoppen koennte: Ob
         * jemand bei Google bewertet hat, meldet Google nicht zurueck, und
         * eine Bewertung im Portal ist keine bei Google. Begrenzt wird das
         * Ganze durch die zwei Stufen und die 30-Tage-Grenze.
         */
        const { data: kontakt } = await db
          .from("kontakte")
          .select("id, vorname, nachname, email, berater, zustaendig_id")
          .eq("id", kundeId)
          .maybeSingle();
        const k = kontakt as {
          vorname?: string; nachname?: string; email?: string; berater?: string;
        } | null;
        if (!k?.email) { bericht.uebersprungen++; continue; }

        const berater = await zustaendigerAnsprechpartner(db, kundeId);
        const vpName = berater?.name || k.berater || "";

        const versand = await sendeVorlage(db, {
          templateName: eintrag.stufe.vorlage,
          recipientEmail: k.email,
          idempotencyKey: `${eintrag.stufe.vorlage}-${kundeId}`,
          kontaktId: kundeId,
          templateData: {
            kundeName: [k.vorname, k.nachname].filter(Boolean).join(" ").trim(),
            ...(vpName ? { vpName } : {}),
            ...(berater ? { berater } : {}),
          },
        });

        if (!versand.ok) {
          bericht.fehler.push(`Erinnerung ${eintrag.stufe.stufe} an ${k.email}: ${versand.grund}`);
        } else {
          bericht.erinnert++;
        }

        // Wie oben: Der Vermerk wird auch nach einem Fehlschlag gesetzt.
        await db.from("investments")
          .update({ meta: { ...eintrag.meta, [eintrag.stufe.vermerk]: new Date().toISOString() } })
          .eq("id", eintrag.investmentId);
      } catch (e) {
        bericht.fehler.push(`Erinnerung ${kundeId}: ${fehlerText(e)}`);
      }
    }
  } catch (e) {
    console.error("send-vp-bewertung-einladungen:", e);
    bericht.fehler.push(fehlerText(e));
  }

  /*
   * Nach aussen nur Zahlen.
   *
   * In `bericht.fehler` stehen Mailadressen von Kunden ("Google an
   * kunde@example.de: ..."). Die Function verlangt zwar eine Anmeldung
   * (kein Eintrag in config.toml, also verify_jwt = true), prueft aber nicht,
   * WER sie aufruft. Ein angemeldeter Kunde oder Tippgeber bekam damit die
   * Adressen fremder Kunden zurueck. Dieselbe Stelle war bei
   * `signatur-erinnerung` und `send-reservierung-eskalation` schon einmal
   * zu korrigieren.
   *
   * Die vollstaendige Liste bleibt im Log, dort gehoert sie hin.
   */
  console.log("send-vp-bewertung-einladungen:", JSON.stringify(bericht));
  return new Response(JSON.stringify({
    ok: true,
    geprueft: bericht.geprueft,
    faellig: bericht.faellig,
    gesendet: bericht.gesendet,
    uebersprungen: bericht.uebersprungen,
    erinnert: bericht.erinnert,
    fehler: bericht.fehler.length,
  }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
