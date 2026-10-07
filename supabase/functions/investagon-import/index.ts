import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { type ImportProjekt, PROJEKTE } from "./daten.ts";
import {
  ABGLEICH_FASSUNG,
  anlageklasseNachImport,
  bilderAnfordern,
  einheitAus,
  einheitMeta,
  findeBestandsEinheit,
  importMetaZusammenfuehren,
  INVESTAGON_ERSTELLT_META_SCHLUESSEL,
  kennung,
  objektRechenspaltenNachImport,
  objektRechenwerte,
  projektAus,
  projektErstelltAm,
  projektKennungVon,
  projektKoordinaten,
  RECHENWERTE_META_SCHLUESSEL,
  rechenwerteAus,
  rechenwertNachImport,
  statusFelder,
} from "./mapping.ts";
import { KOORDINATEN_META_SCHLUESSEL } from "../_shared/objekt-koordinaten.ts";
import { hausgeldTeile } from "../_shared/einheit-hausgeld.ts";
import { type StandortBericht, standorteMessen, type StandortDb } from "./standort.ts";
import {
  globalSchalterNachImport,
  hausImCrmGebunden,
  istGlobalAnlageklasse,
} from "../_shared/globalobjekt.ts";
import { ApiFehler, holeJson, liste, text, zugaenge } from "./api.ts";
import {
  type AdressIndex,
  baueAdressIndex,
  eintragen,
  findeAdressTreffer,
  mitZweitkennung,
  slugsVon,
} from "./dubletten.ts";
import {
  beschreibeBefund,
  findeGruppen,
  planeWache,
  type WacheObjekt,
} from "./dublettenwache.ts";
import {
  type BildQuelle,
  leererBildBericht,
  uebernimmBilder,
} from "./bilder.ts";
import { ausUebergabe } from "./uebergabe.ts";
import { logActivityFromEdge } from "../_shared/activity-log.ts";
import { checkEdgeRateLimit } from "../_shared/edge-rate-limit.ts";
import {
  type Aufgabe,
  aufgabenHolen,
  fertig,
  projektZuAufgabe,
  spaeterErneut,
} from "./warteschlange.ts";
import {
  beschreibeRuecknahme,
  neueOhneAngebotAussortieren,
  planeRuecknahme,
  VERMERK_SCHLUESSEL,
  type VermerkObjekt,
} from "./sichtbarkeit.ts";
import {
  metaNachVerkauf,
  planeVerkaeufe,
  type VerkaufsZeile,
  verkaufteKennungen,
} from "./verkaeufe.ts";


/**
 * Die Investagon-Objekte ins CRM übernehmen.
 *
 * Kurzlisten liefern Kennungen, die vollständigen Daten kommen aus den
 * Detailendpunkten. API-Fehler brechen ab, ohne die statische Ersatzliste
 * automatisch zu importieren. Diese ist nur mit quelle=daten explizit wählbar.
 *
 * Zweimal aufrufen ist unschädlich. Jedes Projekt trägt seine
 * Investagon-Kennung in `meta.investagonSlug`, ein bereits angelegtes Objekt
 * wird aktualisiert statt ein zweites Mal erzeugt. Auch die Bilder sind
 * idempotent, Näheres im Kopf von `bilder.ts`.
 *
 * Aufruf:
 *   POST /functions/v1/investagon-import
 *   { "trockenlauf": true }          zeigt nur, was passieren würde
 *   { "bilder": true }               übernimmt zusätzlich die Bilder
 *   { "quelle": "daten" }            erzwingt die alte Datei
 *   { "roh": true }                  zeigt die Rohantwort der API (Diagnose)
 *   { "sync": true, "bilder": true } der tägliche Lauf von pg_cron
 *
 * Am Ende jedes vollen Laufs sieht die Dublettenwache den Bestand durch und
 * meldet jeden Doppelgänger. Entfernen darf sie nur, wenn der Schalter
 * `investagon_dubletten_loeschen` in `app_config` auf `true` steht; ohne ihn
 * wird ausschließlich gemeldet. Näheres bei `WACHE_SCHALTER` weiter unten und
 * im Kopf von `dublettenwache.ts`.
 *
 * Für alles außer `sync` gilt: nur Admin und Inhaber. Der Sync-Weg kommt
 * ohne Anmeldetoken (pg_cron hat keins) und ist dafür dreifach beschränkt:
 * Er liefert nur Stückzahlen zurück, keine Projektnamen und keine Rohdaten,
 * er ist über `check_rate_limit` auf vier Läufe je Stunde begrenzt, und er
 * kann nichts, was ein Admin-Lauf nicht auch könnte. In `supabase/config.toml`
 * steht deshalb `verify_jwt = false`, die Prüfung passiert hier im Code.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * `activity_log.kontakt_id` ist Pflicht, ein Systemlauf hat aber keinen
 * Kontakt. Die Null-UUID ist der im Projekt übliche System-Platzhalter
 * (sipgate-webhook, notificationStore); die Spalte hat keinen Fremdschlüssel.
 */
const SYSTEM_KONTAKT = "00000000-0000-0000-0000-000000000000";

/**
 * Edge Functions haben eine harte Laufzeitgrenze. Nach dem Zeitbudget bricht
 * der Lauf ehrlich ab und meldet den Teilstand; der nächste Lauf verwendet den Detailcache und erledigte Medienpakete.
 */
const LAUFZEIT_MS = 120 * 1000;

/** So viele Objekte fuellt der Sammellauf der Objekttexte je Anstoss hoechstens. */
const OBJEKT_TEXTE_JE_ANSTOSS = 6;

/**
 * Beschreibung, Standortargumente und Sanierungen nachziehen lassen.
 *
 * Christian am 23.09.2026: Jedes sichtbare Objekt soll sie tragen, und jedes
 * neue aus diesem Import schon gefuellt ankommen. Die Arbeit macht
 * `objekt-texte-ki` im Sammelmodus. Angestossen wird hier nur, ohne zu
 * warten: Der Sammelmodus antwortet sofort und arbeitet im Hintergrund, und
 * `waitUntil` haelt diese Function nur so lange am Leben, bis die Anfrage
 * draussen ist.
 *
 * Ein Fehler wird nur protokolliert. Der Import darf daran nie scheitern,
 * die Texte holt der naechste Lauf nach.
 */
function objektTexteAnstossen(): void {
  try {
    const anstoss = fetch(`${SUPABASE_URL}/functions/v1/objekt-texte-ki`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ sammel: true, limit: OBJEKT_TEXTE_JE_ANSTOSS }),
    })
      .then(async (r) => {
        const text = (await r.text()).slice(0, 200);
        if (!r.ok) {
          console.warn("investagon-import: Objekttexte nicht angestossen", r.status, text);
        }
      })
      .catch((e) => console.error("investagon-import: Objekttexte-Anstoss", e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(anstoss);
  } catch (e) {
    console.error("investagon-import: Objekttexte-Anstoss", e);
  }
}

interface Bericht {
  quelle: "api" | "daten" | "uebergabe";
  angelegt: string[];
  aktualisiert: string[];
  einheiten: number;
  fehler: string[];
  trockenlauf: boolean;
  sollProjekte?: number;
  sollEinheiten?: number;
  offen?: number;
  unvollstaendig?: boolean;
  bilder?: ReturnType<typeof leererBildBericht>;
  /** Objekte, die Investagon nicht mehr fuehrt und die entfernt wurden. */
  entfernt?: string[];
  /** Veraltete Objekte, die wegen Kundenbindung erhalten bleiben. */
  geschuetzt?: string[];
  /**
   * Was der Dublettenschutz getan hat: uebernommene Objekte, uebersprungene
   * Zweitlieferungen und Faelle, die von Hand angesehen werden sollten.
   */
  dubletten?: string[];
  /**
   * Was die Wache im Bestand gefunden hat. Ein Eintrag je Fund, mit beiden
   * Objekten und dem Ergebnis der Pruefung. Steht auch dann im Bericht, wenn
   * gar nicht geloescht werden darf: Melden ist der Teil ohne Risiko.
   */
  dublettenWache?: string[];
  /** Objekte, welche die Wache entfernt hat, mit dem Grund. */
  dublettenEntfernt?: string[];
  /**
   * Zurueckgenommene Ausblendungen der Fassung vom Vormittag des
   * 23.09.2026: wieder eingeblendet oder nur den Vermerk entfernt.
   */
  ausblendungZurueck?: string[];
  /** Wie viele davon eingeblendet wurden (der Rest war schon sichtbar). */
  wiederEingeblendet?: number;
  /** Einheiten, die Investagon verkauft hat und die hier nachgezogen wurden. */
  verkaufNachgezogen?: string[];
  /**
   * In Investagon verkauft, im CRM an einen Vorgang gebunden. Status bleibt,
   * das gehoert vor einen Menschen.
   */
  verkaufGebunden?: string[];
  /** Neue Projekte ohne angebotene Einheit, die nicht angelegt wurden. */
  ohneAngebotNichtAngelegt?: number;
  /**
   * Objekte, deren Schalter „Globalobjekt“ dieser Lauf umgestellt hat, und
   * solche, bei denen er wegen einer Hausreservierung stehen blieb.
   */
  globalobjekt?: string[];
  /** Die einmalige Standortmessung nach dem Abgleich, nur Zahlen (`standort.ts`). */
  standort?: StandortBericht;
  /**
   * Rechenwerte aus Investagon (AfA-Satz, Grundanteil, Erhaltungsaufwand),
   * die NICHT geschrieben wurden, weil im CRM ein Handwert steht. Siehe
   * `rechenwertNachImport` in mapping.ts.
   */
  rechenwerteGeschuetzt?: string[];
}

/** Wie der Schalter `global_objekt` eines vorhandenen Objekts gerade steht. */
async function globalSchalterLesen(
  db: SupabaseClient,
  objektId: string,
): Promise<boolean> {
  const { data, error } = await db.from("objekte").select("global_objekt")
    .eq("id", objektId).single();
  if (error) throw error;
  return (data as { global_objekt?: boolean | null } | null)?.global_objekt ===
    true;
}

/**
 * Haengt am Haus im CRM gerade ein Kunde? Siehe `hausImCrmGebunden`.
 *
 * Die Spalten der Hausreservierung gibt es erst nach
 * `20260923152000_globalobjekt_reservierung.sql`. Deshalb `*`: Das liefert,
 * was vorhanden ist, und scheitert nicht an einer Spalte, die noch fehlt.
 * Ohne die Spalten gibt es keine Hausreservierung, die Antwort ist dann nein.
 */
async function hausGebundenLesen(
  db: SupabaseClient,
  objektId: string,
): Promise<boolean> {
  const { data, error } = await db.from("objekte").select("*")
    .eq("id", objektId).single();
  if (error) throw error;
  return hausImCrmGebunden(data as Record<string, unknown> | null);
}

/**
 * Der Schalter, mit dem das Entfernen von Dubletten eingeschaltet wird.
 *
 * Ein Wert in `app_config`, kein Wert im Aufruf. Der regelmaessige Lauf kommt
 * von pg_cron ohne Anmeldetoken, `verify_jwt` steht fuer diese Funktion auf
 * `false`. Ein Schalter im Rumpf des Aufrufs koennte damit von jedem gesetzt
 * werden, der die Adresse kennt, und ausgerechnet der gefaehrlichste Teil
 * haette die schwaechste Tuer. `app_config` ist die im Projekt uebliche
 * Stelle fuer so etwas, siehe `tagesbriefing`.
 *
 * Einschalten (im Lovable-SQL-Editor):
 *
 *     insert into public.app_config (schluessel, wert)
 *     values ('investagon_dubletten_loeschen', 'true'::jsonb)
 *     on conflict (schluessel) do update set wert = excluded.wert;
 *
 * Wieder ausschalten: dasselbe mit `'false'::jsonb`.
 */
const WACHE_SCHALTER = "investagon_dubletten_loeschen";

/**
 * Voreinstellung: nur melden.
 *
 * Fehlt der Eintrag, ist er nicht lesbar oder steht er auf etwas anderem als
 * `true`, wird nichts entfernt. Das ist die richtige Voreinstellung, weil der
 * teure Fehler einseitig ist: Ein Fund zu viel im Bericht kostet einen Blick,
 * ein zu Unrecht geloeschtes Objekt nimmt Bilder, Texte und Einheiten mit und
 * ist ueber den Import nicht wiederherstellbar, sobald Investagon die zweite
 * Fassung nicht mehr fuehrt. Neun Paare im Bestand sehen wie Dubletten aus
 * und sind keine. Christian schaltet bewusst ein, wenn die ersten Berichte
 * zeigen, dass die Regel genau die richtigen Paare trifft.
 */
async function wacheDarfLoeschen(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.from("app_config")
    .select("wert")
    .eq("schluessel", WACHE_SCHALTER)
    .maybeSingle();
  if (error || !data) return false;
  const wert = (data as { wert?: unknown }).wert;
  return wert === true || wert === "true";
}

/**
 * Hängt an dieser Einheit ein Kunde?
 *
 * Bedingung (d) der Wache nennt `kunde_id` und `kunde_name`. Reserviert und
 * verkauft kommen dazu, weil die Bereinigung nebenan genau dieselbe Grenze
 * zieht und weil eine Reservierung ohne eingetragenen Namen sonst durchs Netz
 * fiele. Die Wache wird dadurch nur vorsichtiger, nie mutiger.
 */
function gebunden(w: {
  kunde_id: string | null;
  kunde_name: string | null;
  reserviert_am: string | null;
  status: string | null;
}): boolean {
  return Boolean(
    w.kunde_id ||
      (w.kunde_name || "").trim() ||
      w.reserviert_am ||
      w.status === "reserviert" ||
      w.status === "verkauft",
  );
}

/** Große `in`-Listen in Häppchen, damit die Abfrage-URL nicht überläuft. */
function haeppchen<T>(werte: T[], groesse = 200): T[][] {
  const stapel: T[][] = [];
  for (let i = 0; i < werte.length; i += groesse) {
    stapel.push(werte.slice(i, i + groesse));
  }
  return stapel;
}

/**
 * Die Wache über den Bestand.
 *
 * Meldet jeden Doppelgänger und entfernt, wenn der Schalter es erlaubt und
 * kein Trockenlauf läuft, den älteren der beiden. Die Regel selbst steht in
 * `dublettenwache.ts` und ist dort ohne Datenbank geprüft.
 */
async function dublettenwache(
  db: SupabaseClient,
  bericht: Bericht,
  trockenlauf: boolean,
): Promise<void> {
  const { data: rohObjekte, error: leseFehler } = await db.from("objekte")
    .select(
      "id, titel, adresse, plz, erstellt_am, beschreibung, video_url, highlights, exklusiv_partner, meta",
    );
  if (leseFehler) {
    bericht.fehler.push("Dublettenwache: Bestand nicht lesbar");
    return;
  }

  const objekte: WacheObjekt[] = (rohObjekte || []).map((o: {
    id: string;
    titel?: string | null;
    adresse?: string | null;
    plz?: string | null;
    erstellt_am?: string | null;
    beschreibung?: string | null;
    video_url?: string | null;
    highlights?: string[] | null;
    exklusiv_partner?: string[] | null;
    meta?: Record<string, unknown> | null;
  }) => ({
    id: o.id,
    titel: o.titel || "",
    adresse: o.adresse,
    plz: o.plz,
    erstellt_am: o.erstellt_am,
    beschreibung: o.beschreibung,
    videoUrl: o.video_url,
    highlights: o.highlights,
    exklusivPartner: o.exklusiv_partner,
    meta: o.meta,
    einheiten: 0,
    gebundeneEinheiten: 0,
    bilder: 0,
    dokumente: 0,
  }));

  // Einheiten, Bilder und Dokumente werden nur für die Objekte gezählt, die
  // überhaupt einen Doppelgänger haben. Für den ganzen Bestand wären das drei
  // große Abfragen je Lauf, ohne dass sie irgendetwas entscheiden.
  const betroffen = new Map<string, WacheObjekt>();
  for (const gruppe of findeGruppen(objekte)) {
    for (const o of gruppe) betroffen.set(o.id, o);
  }
  if (betroffen.size === 0) {
    bericht.dublettenWache = [
      `${objekte.length} Objekte geprüft, keine Dublette gefunden.`,
    ];
    return;
  }

  const ids = [...betroffen.keys()];
  for (const teil of haeppchen(ids)) {
    const { data: wohnungen, error } = await db.from("wohnungen")
      .select("objekt_id, kunde_id, kunde_name, reserviert_am, status")
      .in("objekt_id", teil);
    if (error) {
      bericht.fehler.push(`Dublettenwache: Einheiten nicht lesbar (${error.message})`);
      return;
    }
    for (
      const w of (wohnungen || []) as {
        objekt_id: string;
        kunde_id: string | null;
        kunde_name: string | null;
        reserviert_am: string | null;
        status: string | null;
      }[]
    ) {
      const o = betroffen.get(w.objekt_id);
      if (!o) continue;
      o.einheiten++;
      if (gebunden(w)) o.gebundeneEinheiten++;
    }
  }
  for (
    const [tabelle, feld] of [
      ["objekt_bilder", "bilder"],
      ["objekt_dokumente", "dokumente"],
    ] as const
  ) {
    for (const teil of haeppchen(ids)) {
      const { data: zeilen, error } = await db.from(tabelle)
        .select("objekt_id")
        .in("objekt_id", teil);
      if (error) {
        // Ohne diese Zahl ist Bedingung (e) nicht prüfbar. Dann wird nur
        // gemeldet, statt auf gut Glück zu löschen.
        bericht.fehler.push(
          `Dublettenwache: ${tabelle} nicht lesbar (${error.message}), es wird nur gemeldet`,
        );
        return;
      }
      for (const z of (zeilen || []) as { objekt_id: string }[]) {
        const o = betroffen.get(z.objekt_id);
        if (o) o[feld]++;
      }
    }
  }

  const plan = planeWache(objekte);
  const geplant = new Set(plan.entfernen);
  const darfLoeschen = await wacheDarfLoeschen(db);

  const zeilen: string[] = [];
  const kandidaten = plan.befunde.filter((b) => b.entfernen !== null).length;
  zeilen.push(
    `${plan.befunde.length} Dubletten im Bestand, ${kandidaten} davon entfernbar. ` +
      (plan.notbremse
        ? `Notbremse: ${plan.notbremse}`
        : !darfLoeschen
        ? `Schalter "${WACHE_SCHALTER}" steht auf melden, es wird nichts entfernt.`
        : trockenlauf
        ? "Trockenlauf, es wird nichts entfernt."
        : `Entfernt werden in diesem Lauf ${plan.entfernen.length}, ` +
          `${plan.vertagt} warten auf den naechsten Lauf.`),
  );
  for (const b of plan.befunde) {
    zeilen.push(
      beschreibeBefund(b, geplant.has(b) && darfLoeschen && !trockenlauf),
    );
  }
  bericht.dublettenWache = zeilen;

  if (!darfLoeschen || trockenlauf || plan.entfernen.length === 0) return;

  const entfernt: string[] = [];
  for (const b of plan.entfernen) {
    const weg = b.entfernen!;
    const bleibt = b.behalten!;
    // Letzter Blick unmittelbar vor dem Löschen. Zwischen dem Lesen oben und
    // hier kann ein Kunde gesetzt worden sein; die Bereinigung nebenan prüft
    // aus demselben Grund einzeln nach.
    const { count, error: kundeFehler } = await db.from("wohnungen")
      .select("id", { count: "exact", head: true })
      .eq("objekt_id", weg.id)
      .or(
        "kunde_id.not.is.null,kunde_name.not.is.null,reserviert_am.not.is.null,status.in.(reserviert,verkauft)",
      );
    if (kundeFehler) {
      bericht.fehler.push(`Dublettenwache ${weg.titel}: ${kundeFehler.message}`);
      continue;
    }
    if ((count || 0) > 0) {
      bericht.fehler.push(
        `Dublettenwache ${weg.titel}: zwischenzeitlich ${count} gebundene Einheiten, nicht entfernt`,
      );
      continue;
    }
    const { error: loeschFehler } = await db.from("objekte").delete().eq(
      "id",
      weg.id,
    );
    if (loeschFehler) {
      bericht.fehler.push(`Dublettenwache ${weg.titel}: ${loeschFehler.message}`);
      continue;
    }
    const spur =
      `"${weg.titel}" (${weg.id}) entfernt, es bleibt "${bleibt.titel}" (${bleibt.id}). ` +
      `Grund: gleiche Adresse, PLZ und Titel, beide aus Investagon, kein Kunde, ` +
      `keine eigene Pflege, das entfernte war das aeltere.`;
    entfernt.push(spur);
    // Die Spur gehört ins Protokoll, nicht nur in den Bericht: Der Bericht
    // steht im Log eines einzelnen Laufs, das Protokoll bleibt.
    await logActivityFromEdge(
      db as unknown as Parameters<typeof logActivityFromEdge>[0],
      {
        kontaktId: SYSTEM_KONTAKT,
        action: "investagon_dublette_entfernt",
        entityType: "objekt",
        entityId: weg.id,
        meta: {
          entfernt: {
            id: weg.id,
            titel: weg.titel,
            adresse: weg.adresse,
            plz: weg.plz,
            erstelltAm: weg.erstellt_am,
            einheiten: weg.einheiten,
            bilder: weg.bilder,
            dokumente: weg.dokumente,
          },
          bleibt: {
            id: bleibt.id,
            titel: bleibt.titel,
            erstelltAm: bleibt.erstellt_am,
            einheiten: bleibt.einheiten,
          },
          schluessel: b.schluessel,
          grund: "Dublettenwache: alle Bedingungen erfuellt, aelteres Objekt",
        },
        source: "edge:investagon-import",
      },
    );
  }
  if (entfernt.length) bericht.dublettenEntfernt = entfernt;
}

/**
 * Verkaeufe aus Investagon sofort nachziehen, vor dem eigentlichen Abgleich.
 *
 * Laeuft in jedem Lauf und haengt weder am Fingerabdruck der Projekte noch
 * am Zeitbudget der Schleife. Die Regel steht in `verkaeufe.ts`.
 */
async function verkaeufeNachziehen(
  db: SupabaseClient,
  projekte: ImportProjekt[],
  titelNachObjekt: Map<string, string>,
  bericht: Bericht,
  trockenlauf: boolean,
): Promise<void> {
  const einheiten = projekte.flatMap((p) => p.einheiten);
  const verkauft = verkaufteKennungen(einheiten);
  if (verkauft.size === 0) return;

  const zeilen: VerkaufsZeile[] = [];
  for (const teil of haeppchen([...verkauft])) {
    const { data, error } = await db.from("wohnungen")
      .select(
        "id, objekt_id, we_nr, status, kunde_id, kunde_name, reserviert_am, meta",
      )
      .in("meta->>investagonId", teil)
      .or("status.is.null,status.neq.verkauft");
    if (error) {
      bericht.fehler.push(`Verkäufe: Einheiten nicht lesbar (${error.message})`);
      return;
    }
    zeilen.push(...((data || []) as VerkaufsZeile[]));
  }

  const plan = planeVerkaeufe(verkauft, zeilen, einheiten.length);
  if (plan.notbremse) {
    bericht.fehler.push(`Verkäufe: ${plan.notbremse}`);
    return;
  }
  const name = (z: VerkaufsZeile) =>
    `"${titelNachObjekt.get(z.objekt_id) || z.objekt_id}" WE ${z.we_nr || "?"}`;

  const nachgezogen: string[] = [];
  for (const z of plan.nachziehen) {
    if (!trockenlauf) {
      const { error } = await db.from("wohnungen").update({
        status: "verkauft",
        meta: metaNachVerkauf(z.meta, true),
      }).eq("id", z.id);
      if (error) {
        bericht.fehler.push(`Verkäufe ${name(z)}: ${error.message}`);
        continue;
      }
      await logActivityFromEdge(
        db as unknown as Parameters<typeof logActivityFromEdge>[0],
        {
          kontaktId: SYSTEM_KONTAKT,
          action: "investagon_verkauf_nachgezogen",
          entityType: "wohnung",
          entityId: z.id,
          meta: {
            objektId: z.objekt_id,
            weNr: z.we_nr,
            vorher: z.status,
            nachher: "verkauft",
            investagonId: z.meta?.investagonId,
          },
          source: "edge:investagon-import",
        },
      );
    }
    nachgezogen.push(`${name(z)}: ${z.status || "ohne Status"} -> verkauft`);
  }

  const gebunden: string[] = [];
  for (const z of plan.gebunden) {
    if (!trockenlauf) {
      const { error } = await db.from("wohnungen").update({
        meta: metaNachVerkauf(z.meta, false),
      }).eq("id", z.id);
      if (error) {
        bericht.fehler.push(`Verkäufe ${name(z)}: ${error.message}`);
        continue;
      }
    }
    gebunden.push(
      `${name(z)}: in Investagon verkauft, im CRM ${z.status || "ohne Status"} ` +
        "mit Kundenvorgang. Status nicht geändert, bitte prüfen.",
    );
  }
  if (nachgezogen.length) bericht.verkaufNachgezogen = nachgezogen;
  if (gebunden.length) bericht.verkaufGebunden = gebunden;
}

/**
 * Die Ausblendungen der Fassung vom Vormittag des 23.09.2026 zuruecknehmen.
 *
 * Christian hat am selben Tag entschieden, dass Objekte ohne angebotene
 * Einheit sichtbar bleiben. Jedes Objekt, das der Import ausgeblendet hat,
 * traegt den Vermerk `meta.investagonAusblendung`; genau diese werden wieder
 * eingeblendet, und der Vermerk faellt weg. Von Hand ausgeblendete Objekte
 * haben keinen Vermerk und bleiben, wie sie sind. Gelesen werden nur Objekte
 * mit Vermerk, nach der ersten Ruecknahme ist die Abfrage also leer und
 * kostet nichts. Die Regel steht in `sichtbarkeit.ts`.
 */
async function ausblendungenZuruecknehmen(
  db: SupabaseClient,
  bericht: Bericht,
  trockenlauf: boolean,
): Promise<void> {
  const { data, error } = await db.from("objekte")
    .select("id, titel, sichtbar, meta")
    .not(`meta->${VERMERK_SCHLUESSEL}`, "is", null);
  if (error) {
    bericht.fehler.push(`Rücknahme: Objekte nicht lesbar (${error.message})`);
    return;
  }
  const zeilen: string[] = [];
  for (const r of planeRuecknahme((data || []) as VermerkObjekt[])) {
    if (!trockenlauf) {
      const { error: schreibFehler } = await db.from("objekte").update({
        meta: r.meta,
        ...(r.einblenden ? { sichtbar: true } : {}),
      }).eq("id", r.id);
      if (schreibFehler) {
        bericht.fehler.push(`Rücknahme "${r.titel}": ${schreibFehler.message}`);
        continue;
      }
      // Das Einblenden gehoert ins Protokoll des Objekts, damit spaeter
      // nachvollziehbar ist, wer es wann warum getan hat.
      if (r.einblenden) {
        await logActivityFromEdge(
          db as unknown as Parameters<typeof logActivityFromEdge>[0],
          {
            kontaktId: SYSTEM_KONTAKT,
            action: "investagon_objekt_eingeblendet",
            entityType: "objekt",
            entityId: r.id,
            meta: {
              titel: r.titel,
              grund: "Objekte ohne Angebot bleiben sichtbar, Entscheidung vom 23.09.2026",
            },
            source: "edge:investagon-import",
          },
        );
      }
    }
    if (r.einblenden) bericht.wiederEingeblendet = (bericht.wiederEingeblendet || 0) + 1;
    zeilen.push(beschreibeRuecknahme(r));
  }
  if (zeilen.length) {
    bericht.ausblendungZurueck = trockenlauf
      ? ["Trockenlauf, nichts geschrieben.", ...zeilen]
      : zeilen;
  }
}

/** Kennzahlen über alle Einheiten eines Projekts, für die Objektkacheln. */
function spanne(p: ImportProjekt) {
  const preise = p.einheiten.map((e) => e.kp + (e.moebel || 0)).filter((n) =>
    n > 0
  );
  const groessen = p.einheiten.map((e) => e.qm).filter((n) => n > 0);
  const renditen = p.einheiten
    .filter((e) => e.kp > 0 && e.miete > 0)
    .map((e) => ((e.miete * 12) / (e.kp + (e.moebel || 0))) * 100);
  const z = (
    a: number[],
    f: (...n: number[]) => number,
  ) => (a.length ? Math.round(f(...a) * 100) / 100 : 0);
  return {
    preisVon: z(preise, Math.min),
    preisBis: z(preise, Math.max),
    groesseVon: z(groessen, Math.min),
    groesseBis: z(groessen, Math.max),
    renditeVon: z(renditen, Math.min),
    renditeBis: z(renditen, Math.max),
    gesamtQm: Math.round(groessen.reduce((s, n) => s + n, 0) * 100) / 100,
    gesamtPreis: preise.reduce((s, n) => s + n, 0),
  };
}

// ── Von der API in die Form, die der Import ohnehin schon kennt ────────────
//
// Damit bleibt unten alles gleich, egal woher die Daten stammen. Ein zweiter
// Schreibpfad hätte sonst über kurz oder lang andere Objekte erzeugt als der
// erste, und niemand hätte gewusst, welcher der beiden richtig ist.

/**
 * Projekte samt Einheiten aus der API holen. Wirft, wenn die API ablehnt.
 * `bildQuellen` hebt je Projekt die Rohantworten und den Zugang auf, damit
 * die Bildübernahme die Adressen darin findet und Dokumentenpakete laden kann.
 */
async function ausApi(): Promise<{
  projekte: ImportProjekt[];
  hinweise: string[];
  bildQuellen: Map<string, BildQuelle>;
}> {
  const zugriffe = zugaenge(Deno.env);
  if (zugriffe.length === 0) {
    throw new Error("Kein INVESTAGON_API_TOKEN hinterlegt");
  }

  const projekte: ImportProjekt[] = [];
  const hinweise: string[] = [];
  const bildQuellen = new Map<string, BildQuelle>();

  // Jeder Zugang wird für sich geprüft. Lehnt einer ab, etwa weil das Token
  // die Rolle ROLE_PERMISSION_PROPERTY_VIEW nicht hat, laufen die übrigen
  // Bautraeger trotzdem durch. Nur wenn kein einziger Zugang liefert, wirft
  // die Funktion und der Aufrufer weicht auf die hinterlegte Liste aus.
  let erfolge = 0;
  let letzterFehler = "";
  for (let i = 0; i < zugriffe.length; i++) {
    const z = zugriffe[i];
    /*
     * Der Bautraeger im Klartext plus das Namenskuerzel seines Secrets, also
     * etwa `Immoheld (INVESTAGON_API_TOKEN_4)`. Vorher stand hier
     * `Zugang ${i + 1}`, die blosse Position in der Liste. Wer das Protokoll
     * las, wusste weder welcher Bautraeger gemeint war noch welches Secret er
     * anfassen muss, und nach dem Entfernen eines Zugangs zeigte jedes
     * aeltere Protokoll auf den Falschen.
     */
    const name = `${z.name} (INVESTAGON_API_TOKEN${z.slot})`;
    /*
     * Ohne Organisationskennung antwortet Investagon so, als waeren wir gar
     * nicht angemeldet, und zwar mit einer Meldung ueber eine fehlende Rolle.
     * Diese Meldung hat uns lange in die Irre gefuehrt. Deshalb sagen wir es
     * hier deutlich, statt den Aufruf ins Leere laufen zu lassen.
     */
    if (!z.orgId) {
      hinweise.push(
        `${name}: INVESTAGON_ORG_ID fehlt. Ohne Organisationskennung lehnt Investagon jede Anfrage ab, ` +
          `und zwar mit einer Meldung ueber eine fehlende Berechtigung. Die Kennung ist eine UUID und steht ` +
          `in den Investagon-Einstellungen bei den API-Schluesseln.`,
      );
      continue;
    }
    let projektRoh: Record<string, unknown>[];
    let einheitenRoh: Record<string, unknown>[];
    try {
      /*
       * Die Listenpfade heissen `api_projects` und `api_properties`, mit
       * Praefix. Ohne ihn antwortet Investagon mit 404, was zusammen mit der
       * fehlenden Organisationskennung lange wie ein Rechteproblem aussah.
       * Nachgesehen in der REST-Dokumentation am 26.08.2026.
       */
      projektRoh = liste(
        await holeJson(z, "/api/api_projects?pagination=false"),
      );
      einheitenRoh = liste(
        await holeJson(z, "/api/api_properties?pagination=false"),
      );
    } catch (e) {
      letzterFehler = e instanceof Error ? e.message : String(e);
      hinweise.push(`${name}: API abgelehnt (${letzterFehler}), übersprungen`);
      continue;
    }
    erfolge++;

    /*
     * Was dieser Bautraeger insgesamt geliefert hat, unabhaengig davon, was
     * der Abgleich daraus macht.
     *
     * Ohne diese Zeile stand im Protokoll nur, wie viele Objekte der Lauf
     * angefasst hat, und das ist beim vollen Abgleich fast immer eine kleine
     * Zahl: Projekte ohne Aenderung werden uebersprungen. Eine Gesamtzahl gab
     * es nirgends, und deshalb liess sich nicht pruefen, ob eine Abweichung
     * zur Investagon-Oberflaeche am Import liegt oder an einem Zugang, der
     * gar nichts liefert. Genau diese Frage stand am 16.09.2026 im Raum.
     */
    hinweise.push(
      `${name}: geliefert ${projektRoh.length} Objekte, ${einheitenRoh.length} Einheiten`,
    );

    const nachProjekt = new Map<string, Record<string, unknown>[]>();
    const ohneProjekt: Record<string, unknown>[] = [];
    for (const e of einheitenRoh) {
      const pid = projektKennungVon(e);
      if (!pid) {
        ohneProjekt.push(e);
        continue;
      }
      const bisher = nachProjekt.get(pid) || [];
      bisher.push(e);
      nachProjekt.set(pid, bisher);
    }

    const bekannteProjekte = new Set(projektRoh.map(kennung));
    for (const [id] of nachProjekt) {
      if (!bekannteProjekte.has(id)) projektRoh.push({ id });
    }
    for (const p of projektRoh) {
      const id = kennung(p);
      const roheEinheiten = nachProjekt.get(id) || [];
      const einheiten = roheEinheiten.map(einheitAus);
      if (einheiten.length === 0) {
        hinweise.push(
          `${text(p, ["name", "title"]) || id}: keine Einheiten in der API`,
        );
      }
      projekte.push(projektAus(p, einheiten));
      bildQuellen.set(id, {
        zugang: z,
        projektRoh: p,
        einheiten: roheEinheiten.map((e, i) => ({
          we: einheiten[i].we,
          roh: e,
          propertyId: kennung(e),
        })),
      });
    }

    // Einzelwohnungen ohne Projekt werden jede für sich ein Objekt, sonst
    // fielen sie beim Import lautlos unter den Tisch.
    for (const e of ohneProjekt) {
      const einheit = einheitAus(e);
      projekte.push(projektAus(e, [einheit]));
      bildQuellen.set(kennung(e), {
        zugang: z,
        projektRoh: e,
        einheiten: [{ we: einheit.we, roh: e, propertyId: kennung(e) }],
      });
    }
  }

  if (erfolge === 0) {
    // Alle Zugaenge einzeln benennen, sonst sieht man im Log nur den letzten.
    throw new Error(
      hinweise.join(" | ") || letzterFehler || "Kein Zugang lieferte Daten",
    );
  }

  /*
   * Alle Projekte gehen zurueck, auch die ohne angebotene Einheit.
   *
   * Hier stand bis zum 23.09.2026 der Filter `vertrieblich`, der Projekte
   * ohne vertriebliche Einheit ganz hinauswarf. Zwei Fehler steckten darin.
   * Er las `visibility === 0` als unsichtbar, laut Investagon heisst 0 aber
   * "Ueberpruefung ausstehend", Offline ist -1 und lief durch. Und ein
   * hinausgeworfenes Projekt wurde gar nicht mehr abgeglichen: Verkaufte
   * jemand die letzte freie Einheit, blieb sie im CRM frei stehen, auch auf
   * dem Webhook-Weg, weil der dieselbe Liste filtert.
   *
   * Was angeboten wird, entscheidet jetzt `_shared/einheit-angebot.ts`, und
   * was daraus folgt, der Hauptablauf: Ein Projekt ohne Angebot wird nicht
   * NEU angelegt, ein vorhandenes wird weiter abgeglichen und bleibt
   * sichtbar (Christian, 23.09.2026, siehe `sichtbarkeit.ts`). Das geht nur
   * dort, weil erst dort der CRM-Bestand bekannt ist.
   */
  return {
    projekte: [...new Map(projekte.map((p) => [p.slug, p])).values()],
    hinweise,
    bildQuellen,
  };

}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const laufBeginn = Date.now();
  const frist = laufBeginn + LAUFZEIT_MS;
  /** Die Objekte dieses Laufs, deren Standort nach dem Abgleich geprüft wird. */
  const standortKandidaten: string[] = [];

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* ohne Rumpf: echter Lauf aus der API */ }

  const sync = body?.sync === true;
  const bilder = bilderAnfordern(body);
  /*
   * Ereignisbetrieb: Ein Webhook meldet einzelne Projekte. Dann laeuft
   * derselbe Import wie immer, nur auf diese Kennungen beschraenkt. Ein
   * zweiter Schreibweg entsteht dadurch nicht, und die Bereinigung bleibt
   * dem vollen Abgleich vorbehalten: eine Teilliste darf nichts loeschen.
   */
  const nurSlugs = Array.isArray(body?.nurSlugs)
    ? (body.nurSlugs as unknown[]).map(String).filter(Boolean)
    : [];
  /** Die Warteschlange abarbeiten, die der Webhook gefuellt hat. */
  const warteschlange = body?.warteschlange === true;


  let trockenlauf = false;
  let roh = false;
  let quelleWunsch: "api" | "daten" | "uebergabe" = "api";

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (sync) {
    // ── Der tägliche Lauf von pg_cron, ohne Nutzerkontext ──
    //
    // Damit ein offener Aufruf keinen Schaden anrichtet: höchstens vier
    // Läufe je Stunde, und die Antwort enthält nur Stückzahlen. Trockenlauf,
    // Rohdaten und die Ersatzliste bleiben dem Admin-Weg vorbehalten.
    // Ereignislaeufe treffen nur einzelne Projekte und sind entsprechend
    // klein. Sie brauchen ein eigenes, groesseres Kontingent, sonst wuerde
    // eine Aenderungswelle vom vollen Abgleich ausgebremst.
    const limit = await checkEdgeRateLimit(
      body?.webhookAnmelden === true
        ? { scope: "investagon-anmeldung", key: "webhook", perHour: 6 }
        : nurSlugs.length || warteschlange
        ? { scope: "investagon-ereignis", key: "queue", perHour: 240 }
        : { scope: "investagon-sync", key: "cron", perHour: 4 },
    );



    if (!limit.ok) {
      return json(
        { error: "Zu viele Läufe, bitte später erneut versuchen." },
        429,
      );
    }
  } else {
    // ── Nur Admin und Inhaber ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Nicht angemeldet" }, 401);
    const alsNutzer = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await alsNutzer.auth.getUser();
    if (!user) return json({ error: "Nicht angemeldet" }, 401);

    const { data: rollen } = await db.from("user_roles").select("role").eq(
      "user_id",
      user.id,
    );
    const darf = (rollen || []).some((r: { role: string }) =>
      r.role === "admin" || r.role === "inhaber"
    );
    if (!darf) return json({ error: "Nur Admin und Inhaber" }, 403);

    trockenlauf = body?.trockenlauf === true;
    roh = body?.roh === true;
    if (body?.quelle === "daten") quelleWunsch = "daten";
    // Uebergabe-Paket aus der Investagon-Oberflaeche, siehe `uebergabe.ts`.
    if (body?.quelle === "uebergabe") quelleWunsch = "uebergabe";
  }

  /*
   * ── Warteschlangenbetrieb ──
   *
   * Faellige Meldungen uebernehmen, daraus die betroffenen Projekte
   * bestimmen und danach ganz normal weiterlaufen, nur eben beschraenkt auf
   * genau diese Projekte. Eine Meldung, deren Projekt sich nicht bestimmen
   * laesst, bleibt liegen und wird spaeter erneut versucht.
   */
  let aufgaben: Aufgabe[] = [];
  if (warteschlange) {
    if (!sync) return json({ error: "Nur im Ereignisbetrieb" }, 400);
    try {
      aufgaben = await aufgabenHolen(db);
    } catch (e) {
      const grund = e instanceof Error ? e.message : JSON.stringify(e);
      console.error("investagon-import: Warteschlange", grund);
      return json({ error: "Warteschlange nicht lesbar", details: grund }, 500);

    }
    if (aufgaben.length === 0) {
      return json({ warteschlange: true, aufgaben: 0, projekte: 0 });
    }
    for (const a of aufgaben) {
      try {
        const slug = await projektZuAufgabe(db, a);
        if (slug && !nurSlugs.includes(slug)) nurSlugs.push(slug);
      } catch (e) {
        await spaeterErneut(db, a, e instanceof Error ? e.message : String(e));
        aufgaben = aufgaben.filter((x) => x.id !== a.id);
      }
    }
    if (nurSlugs.length === 0) {
      return json({ warteschlange: true, aufgaben: 0, projekte: 0 });
    }
  }

  /*
   * ── Den Rueckruf bei Investagon anmelden ──
   *
   * Nur von Hand durch Admin oder Inhaber. Angemeldet wird die Adresse
   * unserer Webhook-Funktion samt Token; der Token steht ausschliesslich in
   * den Secrets und wird nie zurueckgegeben. Angemeldet wird nur fuer die
   * Zugaenge, die tatsaechlich antworten. Bestehende Integrationen anderer
   * Systeme bleiben unberuehrt: put_token hinterlegt genau diese eine
   * Rueckrufadresse, es ist keine Liste, die wir ueberschreiben.
   */
  if (body?.webhookAnmelden === true) {
    const callbackToken = (Deno.env.get("INVESTAGON_CALLBACK_TOKEN") || "")
      .trim();
    if (!callbackToken) {
      return json({ error: "INVESTAGON_CALLBACK_TOKEN fehlt" }, 400);
    }
    const ziel = `${SUPABASE_URL}/functions/v1/investagon-webhook`;
    const ergebnis: Array<{ zugang: number; status: number; text: string }> =
      [];
    const alle = zugaenge(Deno.env);
    for (let i = 0; i < alle.length; i++) {
      const z = alle[i];
      try {
        const antwort = await fetch(
          `${z.basis}/api/webhook_callbacks/put_token${
            z.orgId ? `?organization_id=${encodeURIComponent(z.orgId)}` : ""
          }`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${z.token}`,
            },
            body: JSON.stringify({
              url: ziel,
              token: callbackToken,
              eventsToListen: [
                "properties_added",
                "properties_updates",
                "properties_removed",
                "parking_spots_added",
                "parking_spots_updated",
                "reservation_create",
                "reservation_update",
              ],
            }),
          },
        );
        ergebnis.push({
          zugang: i + 1,
          status: antwort.status,
          text: (await antwort.text()).slice(0, 300),
        });
      } catch (e) {
        ergebnis.push({ zugang: i + 1, status: 0, text: String(e).slice(0, 300) });
      }
    }
    // Ohne Anmeldung nur Statuszahlen, keine Antworttexte der Gegenseite.
    return json({
      webhookAnmelden: true,
      ziel,
      ergebnis: sync
        ? ergebnis.map((r) => ({ zugang: r.zugang, status: r.status }))
        : ergebnis,
    });

  }


  // Diagnose: die ersten Datensätze im Original, um die Feldnamen zu prüfen.
  if (roh) {
    /*
     * Den ersten brauchbaren Zugang nehmen, nicht stur den ersten.
     *
     * Vorher stand hier `zugaenge(Deno.env)[0]`. Liegt auf Platz 1 ein Zugang ohne
     * Organisationskennung, meldete die Diagnose fuer jeden Pfad einen
     * Rechtefehler, waehrend der Trockenlauf daneben mit einem spaeteren
     * Zugang laengst Daten holte. Zwei Anzeigen, zwei Aussagen, und die
     * falsche stand im Diagnosefenster.
     */
    const alleZugaenge = zugaenge(Deno.env);
    if (alleZugaenge.length === 0) {
      return json({ error: "Kein INVESTAGON_API_TOKEN hinterlegt" }, 400);
    }
    /*
     * Den Zugang nehmen, der tatsaechlich antwortet.
     *
     * Eine hinterlegte Organisationskennung heisst noch nicht, dass sie
     * stimmt. Bei uns tragen alle fuenf Zugaenge eine, aber nur einer gehoert
     * zu einem gueltigen Schluessel. Deshalb wird hier nicht geprueft, ob
     * etwas eingetragen ist, sondern ob es funktioniert, genau wie der
     * Trockenlauf es tut.
     */
    let z = alleZugaenge[0];
    let benutzterPlatz = 1;
    const abgelehnt: string[] = [];
    for (let i = 0; i < alleZugaenge.length; i++) {
      try {
        await holeJson(alleZugaenge[i], "/api/api_projects");
        z = alleZugaenge[i];
        benutzterPlatz = i + 1;
        break;
      } catch (e) {
        abgelehnt.push(
          `Zugang ${i + 1}: ${
            e instanceof Error ? e.message.slice(0, 120) : String(e)
          }`,
        );
        if (i === alleZugaenge.length - 1) {
          return json({
            error: "Kein Zugang liefert Daten",
            hinweis:
              "Alle hinterlegten Zugaenge wurden abgewiesen. Stimmen Schluessel und " +
              "Organisationskennung zusammen? Die Kennung ist eine UUID und steht in den " +
              "Investagon-Einstellungen beim jeweiligen API-Schluessel.",
            abgelehnt,
          }, 400);
        }
      }
    }
    const ergebnis: Record<string, unknown> = {};
    /*
     * Die Diagnose probiert bewusst mehr als die beiden echten Pfade: Wenn
     * etwas klemmt, sagt der Vergleich zwischen ihnen am meisten. Die ersten
     * beiden sind die richtigen, die uebrigen zeigen, wie eine falsche Adresse
     * beantwortet wird.
     */
    const pfade = [
      "/api/api_projects",
      "/api/api_properties",
      "/api/projects",
      "/api/properties",
      "/api/me",
      "/api/organizations",
    ];
    for (const pfad of pfade) {
      try {
        const daten = liste(await holeJson(z, pfad));
        ergebnis[pfad] = { anzahl: daten.length, beispiel: daten[0] ?? null };
      } catch (e) {
        ergebnis[pfad] = { fehler: e instanceof Error ? e.message : String(e) };
      }
    }
    /*
     * Der volle Datensatz einer einzelnen Einheit.
     *
     * Die Liste `/api/api_properties` liefert nur Stammdaten: Kennung,
     * Adresse, Status, Provision. Kaufpreis, Flaeche, Zimmer und Miete stehen
     * dort nicht. Wer nur die Liste importiert, legt Einheiten voller Nullen
     * an. Deshalb zeigt die Diagnose zusaetzlich einen Einzelabruf, an dem
     * sich ablesen laesst, welche Felder es wirklich gibt.
     */
    try {
      const listeRoh = liste(
        await holeJson(z, "/api/api_properties?pagination=false"),
      );
      const ersteId = listeRoh[0]?.id;
      if (ersteId) {
        ergebnis["/api/properties/{id}"] = await holeJson(
          z,
          `/api/properties/${encodeURIComponent(String(ersteId))}`,
        );
      }
    } catch (e) {
      ergebnis["/api/properties/{id}"] = {
        fehler: e instanceof Error ? e.message : String(e),
      };
    }

    try {
      const projekteRoh = liste(
        await holeJson(z, "/api/api_projects?pagination=false"),
      );
      const ersteProjektId = projekteRoh[0]?.id;
      if (ersteProjektId) {
        ergebnis["/api/projects/{id}"] = await holeJson(
          z,
          `/api/projects/${encodeURIComponent(String(ersteProjektId))}`,
        );
      }
    } catch (e) {
      ergebnis["/api/projects/{id}"] = {
        fehler: e instanceof Error ? e.message : String(e),
      };
    }

    ergebnis["_zugang"] = {
      benutzt: benutzterPlatz,
      vonInsgesamt: alleZugaenge.length,
      ...(abgelehnt.length ? { vorherAbgelehnt: abgelehnt } : {}),
    };
    return json(ergebnis);
  }

  let projekte: ImportProjekt[] = PROJEKTE;
  let quelle: "api" | "daten" | "uebergabe" = "daten";
  let bildQuellen = new Map<string, BildQuelle>();
  const fehler: string[] = [];

  if (quelleWunsch === "api") {
    try {
      const ergebnis = await ausApi();
      projekte = ergebnis.projekte;
      quelle = "api";
      bildQuellen = ergebnis.bildQuellen;
      fehler.push(...ergebnis.hinweise);
    } catch (e) {
      const grund = e instanceof ApiFehler || e instanceof Error
        ? e.message
        : String(e);
      console.error("investagon-import: API nicht nutzbar:", grund);
      return json({
        error:
          "Investagon konnte nicht geladen werden. Kein Datenbestand wurde verändert.",
        ...(sync ? {} : { details: grund }),
      }, 502);
    }
  }
  if (quelleWunsch === "uebergabe") {
    try {
      const ergebnis = await ausUebergabe(db);
      projekte = ergebnis.projekte;
      quelle = "uebergabe";
      bildQuellen = ergebnis.bildQuellen;
      fehler.push(...ergebnis.hinweise);
    } catch (e) {
      const grund = e instanceof Error ? e.message : String(e);
      console.error("investagon-import: Übergabe nicht nutzbar:", grund);
      return json({
        error: "Übergabepaket nicht lesbar. Kein Datenbestand wurde verändert.",
        details: grund,
      }, 502);
    }
  }

  // Ereignislauf: nur die gemeldeten Projekte, alles andere bleibt liegen.
  if (nurSlugs.length) {
    const gesucht = new Set(nurSlugs);
    projekte = projekte.filter((p) => gesucht.has(p.slug));
  }

  const bericht: Bericht = {
    quelle,
    angelegt: [],
    aktualisiert: [],
    einheiten: 0,
    fehler,
    trockenlauf,
  };
  bericht.sollProjekte = projekte.length;
  bericht.sollEinheiten = projekte.reduce((n, p) => n + p.einheiten.length, 0);
  if (bilder && !trockenlauf) bericht.bilder = leererBildBericht();


  /*
   * Alle Kennungen, die dieser Lauf ueberhaupt geliefert bekommen hat. Steht
   * bewusst vor jeder Filterung: Sowohl die Bereinigung als auch der
   * Dublettenschutz muessen wissen, was es insgesamt gibt, nicht nur was
   * dieser Durchgang noch anfasst.
   */
  const liveSlugs = new Set(projekte.map((p) => p.slug).filter(Boolean));

  /*
   * ── Eins zu eins: Objekte entfernen, die Investagon nicht mehr fuehrt ──
   *
   * Nur Objekte mit Investagon-Kennung kommen infrage, von Hand angelegte
   * bleiben unangetastet. Objekte, an denen ein Kunde haengt, werden nie
   * geloescht, sondern im Bericht benannt. Und wenn die Live-Liste leer ist
   * oder ploetzlich mehr als die Haelfte des Bestands wegfiele, bricht die
   * Bereinigung ab: das waere eher ein Ausfall auf der Gegenseite als eine
   * echte Abmeldung.
   *
   * Seit dem 23.09.2026 laeuft sie nur noch auf ausdruecklichen Wunsch
   * (`aufraeumen: true`). Vorher lief sie, sobald der Schalter fehlte, und
   * der Knopf "Import jetzt ausfuehren" liess ihn weg. Christians Regel vom
   * selben Tag: nie loeschen, weder Objekte noch Einheiten. Was Investagon
   * nicht mehr anbietet, bleibt als Objekt stehen; nur seine Einheiten
   * fallen aus den Angebotslisten (`_shared/einheit-angebot.ts`).
   * `liveSlugs` enthaelt zudem jedes gelieferte Projekt, auch die ohne
   * Angebot; nur ein wirklich verschwundenes kaeme hier ueberhaupt infrage.
   */
  if (quelle === "api" && body?.aufraeumen === true && !nurSlugs.length) {
    const { data: bestand, error: bestandFehler } = await db.from("objekte")
      .select("id, titel, meta");
    if (bestandFehler) {
      bericht.fehler.push("Bereinigung: CRM-Bestand nicht lesbar");
    } else {
      const investagon = (bestand || []).filter((
        o: { meta?: Record<string, unknown> | null },
      ) => typeof o.meta?.investagonSlug === "string");
      /*
       * Ein Objekt gilt als aktuell, sobald irgendeine seiner Kennungen noch
       * geliefert wird. Nach einer Uebernahme ueber die Adresse traegt es
       * mehrere: die urspruengliche und die des zweiten Zugangs. Wuerde hier
       * nur die Hauptkennung zaehlen, loeschte die Bereinigung genau das
       * Objekt, das der andere Zugang gerade noch pflegt.
       */
      const veraltet = investagon.filter((
        o: { meta?: Record<string, unknown> | null },
      ) => !slugsVon(o.meta).some((s) => liveSlugs.has(s)));
      if (liveSlugs.size === 0) {
        bericht.fehler.push("Bereinigung: keine Live-Liste, übersprungen");
      } else if (veraltet.length > investagon.length / 2) {
        bericht.fehler.push(
          `Bereinigung: ${veraltet.length} von ${investagon.length} Objekten wären betroffen, ` +
            "das sieht nach einem Ausfall aus. Nichts gelöscht.",
        );
      } else {
        const entfernt: string[] = [];
        const geschuetzt: string[] = [];
        for (const o of veraltet as { id: string; titel: string }[]) {
          // Geschuetzt ist alles, woran im CRM etwas haengt: ein Kunde, eine
          // Reservierung oder ein Verkauf. Nur voellig freie Altbestaende
          // duerfen verschwinden.
          const { count, error: kundeFehler } = await db.from("wohnungen")
            .select("id", { count: "exact", head: true })
            .eq("objekt_id", o.id)
            .or(
              "kunde_id.not.is.null,reserviert_am.not.is.null,status.in.(reserviert,verkauft)",
            );
          if (kundeFehler) {
            bericht.fehler.push(`Bereinigung ${o.titel}: ${kundeFehler.message}`);
            continue;
          }
          if ((count || 0) > 0) {
            geschuetzt.push(`${o.titel} (${count} gebundene Einheiten)`);
            continue;
          }

          if (trockenlauf) {
            entfernt.push(o.titel);
            continue;
          }
          const { error: loeschFehler } = await db.from("objekte").delete().eq(
            "id",
            o.id,
          );
          if (loeschFehler) {
            bericht.fehler.push(`Bereinigung ${o.titel}: ${loeschFehler.message}`);
            continue;
          }
          entfernt.push(o.titel);
        }
        if (entfernt.length) bericht.entfernt = entfernt;
        if (geschuetzt.length) bericht.geschuetzt = geschuetzt;
      }
    }
  }


  const { data: syncBestand, error: syncLesefehler } = await db.from("objekte")
    .select("id, titel, adresse, plz, meta");
  if (syncLesefehler) {
    return json({ error: "CRM-Bestand konnte nicht gelesen werden." }, 500);
  }
  type BestandsObjekt = {
    id: string;
    titel?: string | null;
    adresse?: string | null;
    plz?: string | null;
    meta: Record<string, unknown>;
  };
  const bestandsObjekte = (syncBestand || []) as BestandsObjekt[];
  /*
   * ── Zweite Wiedererkennung ueber die Adresse ──
   *
   * Der Import erkennt ein Objekt bisher nur an seiner Investagon-Kennung.
   * Als am 16.09.2026 der eigene Zugang von OS Immobilien dazukam, waren dessen
   * Kopien derselben Haeuser fuer ihn fremd, und 35 Objekte lagen doppelt im
   * CRM. Das Verzeichnis unten schlaegt zusaetzlich ueber Adresse, PLZ und
   * Titel nach. Warum der Titel dazugehoert, steht im Kopf von `dubletten.ts`.
   */
  const adressIndex: AdressIndex = baueAdressIndex(bestandsObjekte);
  /** Kennung eines zweiten Zugangs -> Objekt, das sie schon traegt. */
  const zweitkennungen = new Map<string, BestandsObjekt>();
  for (const o of bestandsObjekte) {
    for (const s of slugsVon(o.meta).slice(1)) zweitkennungen.set(s, o);
  }
  const metaNachSlug = new Map(
    (syncBestand || []).map((
      o: { meta: Record<string, unknown> },
    ) => [o.meta?.investagonSlug, o.meta]),
  );
  const versionen = new Map<string, string>();
  /*
   * Hinweise aus dem Verbindungsaufbau stehen schon in der Liste, etwa zu
   * Zugaengen, die dauerhaft nicht antworten. Fuer die Warteschlange zaehlt
   * nur, was ab hier schiefgeht: sonst wuerde jede Meldung ewig wiederholt.
   */
  const fehlerVorLauf = bericht.fehler.length;

  /*
   * ── Projekte ohne Angebot ──
   *
   * Ein Projekt, das in Investagon keine Einheit anbietet (online, weder
   * verkauft noch Entwurf), wird nicht NEU angelegt: Was dort nie online
   * war, gehoert nicht ins CRM. Liegt es aber schon im CRM, wird es weiter
   * abgeglichen, Verkaeufe und Stammdaten werden nachgezogen, und es bleibt
   * sichtbar. Genau das fehlte, solange `vertrieblich` solche Projekte
   * vorher hinauswarf. Fehlen die Angaben, bleibt es beim Anlegen wie
   * bisher, eine Luecke in den Daten soll nichts verhindern.
   */
  const imCrm = new Set<string>();
  for (const o of bestandsObjekte) {
    for (const s of slugsVon(o.meta)) imCrm.add(s);
  }
  const auswahl = neueOhneAngebotAussortieren(projekte, imCrm);
  if (auswahl.nichtAngelegt.length) {
    projekte = auswahl.behalten;
    bericht.ohneAngebotNichtAngelegt = auswahl.nichtAngelegt.length;
    bericht.sollProjekte = projekte.length;
    bericht.sollEinheiten = projekte.reduce(
      (n, p) => n + p.einheiten.length,
      0,
    );
  }
  /** Alles, was dieser Lauf abgleicht, auch was die Abkuerzung unten auslaesst. */
  const abzugleichen = projekte;

  /*
   * ── Verkaeufe sofort nachziehen ──
   *
   * Vor der Schleife und ohne die Abkuerzung fuer unveraenderte Projekte,
   * damit ein Verkauf spaetestens im naechsten Viertelstundenlauf ankommt,
   * auch wenn das Zeitbudget fuer die Schleife nicht reicht. Einzelheiten in
   * `verkaeufe.ts`.
   */
  if (quelle === "api") {
    try {
      await verkaeufeNachziehen(
        db,
        abzugleichen,
        new Map(bestandsObjekte.map((o) => [o.id, o.titel || ""])),
        bericht,
        trockenlauf,
      );
    } catch (e) {
      const meldung = e instanceof Error ? e.message : JSON.stringify(e);
      console.error("Verkäufe:", e);
      bericht.fehler.push(`Verkäufe: ${meldung}`);
    }
  }

  for (const p of projekte) {

    const bytes = new TextEncoder().encode(
      JSON.stringify([
        new Date().toISOString().slice(0, 10),
        // Eine neue Fassung gleicht den ganzen Bestand noch einmal ab.
        ABGLEICH_FASSUNG,
        p.roh?.updated,
        p.einheiten.map(
          (e) => [
            e.investagonId,
            e.roh?.updated,
            e.roh?.active,
            e.roh?.visibility,
          ],
        ),
      ]),
    );
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    versionen.set(
      p.slug,
      Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
  }
  /*
   * Beim vollen Abgleich werden Projekte uebersprungen, deren Stand sich
   * nachweislich nicht geaendert hat. Ein Ereignislauf laesst diese Abkuerzung
   * bewusst aus: Investagon meldet auch Aenderungen an Bildern und Unterlagen,
   * die den Kennzahlen-Fingerabdruck nicht beruehren.
   */
  if (!trockenlauf && bilder && !nurSlugs.length) {
    projekte = projekte.filter((p) =>
      metaNachSlug.get(p.slug)?.investagonVollSyncVersion !==
        versionen.get(p.slug)
    );
  }

  bericht.offen = projekte.length;
  const letzterStand = new Map(
    (syncBestand || []).map((
      o: { meta: Record<string, unknown> },
    ) => [o.meta?.investagonSlug, String(o.meta?.investagonDatenSyncAt || "")]),
  );
  projekte.sort((a, b) =>
    (letzterStand.get(a.slug) || "").localeCompare(
      letzterStand.get(b.slug) || "",
    )
  );
  for (let p of projekte) {
    if (Date.now() > frist) {
      bericht.unvollstaendig = true;
      bericht.fehler.push(
        "Zeitgrenze erreicht. Erneut starten, um weitere Projekte zu übernehmen.",
      );
      break;
    }
    try {
      const fehlerVorProjekt = bericht.fehler.length;
      if (!p.slug) {
        bericht.fehler.push(
          `${p.name}: keine Investagon-Kennung, übersprungen`,
        );
        continue;
      }
      /*
       * Dasselbe Haus, zweiter Zugang, und der erste liefert es noch selbst.
       * Dann ist hier nichts zu tun: Zustaendig fuer die Daten ist genau ein
       * Projekt je Objekt, naemlich das mit der Hauptkennung. Sonst wuerde das
       * Objekt in jedem Lauf zweimal ueberschrieben, einmal aus jeder Quelle,
       * und die Einheiten kaemen doppelt herein. Faellt die Hauptquelle
       * dagegen weg, uebernimmt der zweite Zugang von allein.
       *
       * Der Abbruch steht bewusst vor dem Detailabruf, sonst kostete jede
       * Zweitlieferung in jedem Lauf einen API-Aufruf je Einheit.
       */
      const schonUebernommen = zweitkennungen.get(p.slug);
      if (schonUebernommen) {
        const hauptkennung = slugsVon(schonUebernommen.meta)[0] || "";
        if (hauptkennung !== p.slug && liveSlugs.has(hauptkennung)) {
          (bericht.dubletten ||= []).push(
            `${p.name}: liegt als "${schonUebernommen.titel}" schon im CRM, zweite Kennung ${p.slug} übersprungen`,
          );
          continue;
        }
      }

      const bildQuelle = bildQuellen.get(p.slug);
      if (quelle === "api" && bildQuelle) {
        const detailEinheiten = [];
        for (const e of bildQuelle.einheiten) {
          if (Date.now() > frist - 15_000) {
            throw new Error(
              "Zeitgrenze vor Detailabruf; Projekt noch nicht verändert.",
            );
          }
          const schluessel =
            `${bildQuelle.zugang.basis}|${bildQuelle.zugang.orgId}|${e.propertyId}`;
          /*
           * Verkauf und Sichtbarkeit gehoeren in die Version. Aendert sich
           * `updated` bei einem Verkauf nicht mit, lieferte der Zwischen-
           * speicher sonst den alten Einzeldatensatz, und der legte sich beim
           * Zusammenfuehren unten ueber das frische `active = 0` aus der
           * Kurzliste. Die Einheit stuende bis zum naechsten Tag frei.
           */
          const version = JSON.stringify([
            new Date().toISOString().slice(0, 10),
            e.roh.updated,
            e.roh.active,
            e.roh.visibility,
          ]);
          const { data: cache, error: cacheFehler } = await db.from(
            "investagon_import_details",
          ).select("roh, version").eq("schluessel", schluessel).maybeSingle();
          if (cacheFehler) throw cacheFehler;
          const detail = cache?.version === version
            ? cache.roh as Record<string, unknown>
            : await holeJson<Record<string, unknown>>(
              bildQuelle.zugang,
              `/api/properties/${encodeURIComponent(e.propertyId)}`,
            );
          if (
            !detail || typeof detail !== "object" || Array.isArray(detail) ||
            !("object_size" in detail) ||
            !("purchase_price_apartment" in detail)
          ) {
            throw new Error(
              `Unvollständige Detailantwort für ${e.propertyId}; Projekt nicht importiert.`,
            );
          }
          if (!trockenlauf && cache?.version !== version) {
            const { error: cacheSchreibfehler } = await db.from(
              "investagon_import_details",
            ).upsert({
              schluessel,
              version,
              roh: detail,
              geladen_am: new Date().toISOString(),
            });
            if (cacheSchreibfehler) throw cacheSchreibfehler;
          }
          e.roh = { ...e.roh, ...detail, api_property_id: e.propertyId };
          const einheit = einheitAus(e.roh);
          e.we = einheit.we;
          detailEinheiten.push(einheit);
        }
        const einzel = bildQuelle.einheiten.length === 1 &&
          p.slug === bildQuelle.einheiten[0].propertyId;
        const detail = einzel
          ? bildQuelle.einheiten[0].roh
          : await holeJson<Record<string, unknown>>(
            bildQuelle.zugang,
            `/api/projects/${encodeURIComponent(p.slug)}`,
          );
        bildQuelle.projektRoh = {
          ...bildQuelle.projektRoh,
          ...detail,
          [einzel ? "api_property_id" : "api_project_id"]: p.slug,
        };
        p = {
          ...projektAus({
            ...(detailEinheiten[0]?.roh || {}),
            ...bildQuelle.projektRoh,
          }, detailEinheiten),
          slug: p.slug,
        };
        const nummern = new Set<string>();
        for (const e of detailEinheiten) {
          if (nummern.has(e.we)) {
            throw new Error(
              `Doppelte Wohnungsnummer ${e.we}; Zuordnung muss geklärt werden.`,
            );
          }
          nummern.add(e.we);
        }
      }
      const s = spanne(p);
      /** Die Anlageklasse aus Investagon, leer als `undefined`. */
      const gelieferteKlasse = anlageklasseNachImport(p.anlageklasse, undefined);
      /** Wann Investagon das Haus angelegt hat, fuer das Kennzeichen „Neu“. */
      const erstelltAm = projektErstelltAm(p.einheiten.map((e) => e.roh));
      /** Die Lage aus `lat`/`lng` der Einheiten, fuer die Karte im Exposé. */
      const koordinaten = projektKoordinaten(
        p.einheiten.map((e) => e.roh),
        new Date().toISOString(),
      );
      /**
       * AfA-Satz, Grundanteil und bei einer Einzelwohnung der
       * Erhaltungsaufwand, soweit alle Einheiten dasselbe liefern. Geschrieben
       * wird nur, was nicht von Hand gepflegt ist (`rechenwertNachImport`).
       */
      const rechenwerteObjekt = objektRechenwerte(p.einheiten.map((e) => e.roh));
      const felder = {
        titel: p.name,
        adresse: p.adresse,
        plz: p.plz,
        ort: p.ort,
        beschreibung: p.beschreibung,
        badge: p.foerderung || p.bauzustand,
        /*
         * Ein Objekt aus Investagon ist sofort sichtbar, nicht erst Entwurf.
         *
         * Investagon ist die fuehrende Objektdatenbank: Was dort steht, ist
         * bereits geprueft und soll im CRM ohne einen zweiten Handgriff im
         * Vertrieb ankommen. Der Entwurf war dafuer nur eine Huerde, jedes
         * neue Objekt musste erst von Hand freigeschaltet werden.
         *
         * Der Entwurf bleibt fuer Objekte, die jemand hier von Hand anlegt
         * (siehe `ObjektNeu.tsx`). Nur dort ist die Freigabe ein echter
         * Arbeitsschritt.
         *
         * Wichtig: Diese beiden Felder gelten nur beim ERSTEN Anlegen. Beim
         * Abgleich eines schon vorhandenen Objekts werden sie bewusst
         * herausgenommen, siehe `ohneFreigabe` weiter unten. Ein von Hand
         * ausgeblendetes Objekt bleibt also ausgeblendet.
         */
        status: "freigegeben",
        sichtbar: true,
        global_baujahr: p.baujahr ?? null,
        global_zustand: p.bauzustand,
        global_gesamt_qm: s.gesamtQm,
        global_verkaufspreis: s.gesamtPreis,
        groesse_von: s.groesseVon,
        groesse_bis: s.groesseBis,
        preis_von: s.preisVon,
        preis_bis: s.preisBis,
        rendite_von: s.renditeVon,
        rendite_bis: s.renditeBis,
        meta: {
          investagonSlug: p.slug,
          ...(p.roh ? { investagonRaw: p.roh } : {}),
          /*
           * Ueber welchen Zugang das Objekt hereinkam, im Klartext und mit
           * Platznummer. Stand vorher nur im Funktionsprotokoll, das nach
           * wenigen Tagen weg ist. Damit laesst sich die Frage "welcher
           * Bautraeger hat welche Objekte geliefert" mit einer Abfrage
           * beantworten. Wird bei jedem Lauf neu geschrieben, zeigt also
           * immer den zuletzt liefernden Zugang.
           */
          ...(bildQuelle
            ? {
              investagonBautraeger: bildQuelle.zugang.name,
              investagonZugangPlatz: bildQuelle.zugang.platz,
              investagonZugangSecret:
                `INVESTAGON_API_TOKEN${bildQuelle.zugang.slot}`,
            }
            : {}),
          // Nur ein gelieferter Wert. Ein leerer loescht nie, was schon da ist,
          // siehe `importMetaZusammenfuehren`.
          ...(gelieferteKlasse ? { anlageklasse: gelieferteKlasse } : {}),
          // Auch hier nur ein gelieferter Wert. Beim Abgleich behaelt
          // `importMetaZusammenfuehren` das fruehere Datum und nimmt es nur
          // von der Hauptquelle, nie von der Kopie eines zweiten Zugangs.
          ...(erstelltAm
            ? { [INVESTAGON_ERSTELLT_META_SCHLUESSEL]: erstelltAm }
            : {}),
          // Die Lage nur, wenn Investagon eine gueltige liefert. Beim Abgleich
          // ueberschreibt ein fehlender Wert nie einen vorhandenen, siehe
          // `koordinatenNachImport`. So braucht die Karte im Exposé keine
          // Adresssuche im Browser des Besuchers.
          ...(koordinaten ? { [KOORDINATEN_META_SCHLUESSEL]: koordinaten } : {}),
          // Einzelne Wohnung: Die Objektseite leitet dann auf die Wohnung.
          einzelwohnung: p.einheiten.length === 1,
          importQuelle: quelle === "api"
            ? "investagon-api"
            : quelle === "uebergabe"
            ? "investagon-uebergabe"
            : "investagon-berateransicht",
          importStand: new Date().toISOString().slice(0, 10),
        },
      };

      // Schon da? Dann aktualisieren statt verdoppeln.
      // `meta` wird mitgelesen, weil der Import es zusammenfuehren und nicht
      // ersetzen darf, siehe unten.
      type Bestandstreffer = { id: string; meta?: Record<string, unknown> | null };
      const { data: direkt, error: bestandFehler } = await db
        .from("objekte").select("id, meta").eq("meta->>investagonSlug", p.slug)
        .maybeSingle();

      if (bestandFehler) throw bestandFehler;
      let vorhanden = direkt as Bestandstreffer | null;
      /** Gesetzt, wenn die Kennung dieses Laufs als zweite einzutragen ist. */
      let neueZweitkennung = "";
      /** Vermerk am neuen Objekt, wenn eine Uebernahme bewusst unterblieb. */
      let dublettenVerdacht: Record<string, unknown> | null = null;

      if (!vorhanden && schonUebernommen) {
        // Die Hauptquelle liefert nicht mehr, dieser Zugang uebernimmt.
        vorhanden = { id: schonUebernommen.id, meta: schonUebernommen.meta };
      }
      if (!vorhanden) {
        const treffer = findeAdressTreffer(adressIndex, p);
        if (treffer.art === "import") {
          vorhanden = { id: treffer.id, meta: null };
          neueZweitkennung = p.slug;
          (bericht.dubletten ||= []).push(
            `${p.name}: gleiche Adresse und gleicher Titel wie "${treffer.titel}", Kennung ${p.slug} dort eingetragen statt neu angelegt`,
          );
        } else if (treffer.art === "handarbeit") {
          /*
           * Von Hand angelegt: nicht uebernehmen. Das Objekt bekaeme sonst
           * eine Investagon-Kennung und geriete damit in die Bereinigung.
           * Stattdessen wird es angelegt und der Verdacht vermerkt.
           */
          dublettenVerdacht = {
            objektId: treffer.id,
            titel: treffer.titel,
            grund: "gleiche Adresse und gleicher Titel, aber von Hand angelegt",
            erkanntAm: new Date().toISOString().slice(0, 10),
          };
          (bericht.dubletten ||= []).push(
            `${p.name}: gleiche Adresse wie das von Hand angelegte "${treffer.titel}", neu angelegt und als möglicher Doppeleintrag vermerkt`,
          );
        } else if (treffer.art === "mehrdeutig") {
          dublettenVerdacht = {
            anzahl: treffer.anzahl,
            grund: "mehrere Objekte mit gleicher Adresse und gleichem Titel",
            erkanntAm: new Date().toISOString().slice(0, 10),
          };
          (bericht.dubletten ||= []).push(
            `${p.name}: ${treffer.anzahl} Objekte im CRM haben diese Adresse und diesen Titel, nichts zusammengeführt`,
          );
        }
      }

      if (trockenlauf) {
        (vorhanden ? bericht.aktualisiert : bericht.angelegt).push(p.name);
        bericht.einheiten += p.einheiten.length;
        // Damit ein Trockenlauf auch zwei Kopien im selben Lauf erkennt.
        if (!vorhanden) {
          eintragen(adressIndex, {
            id: `trockenlauf:${p.slug}`,
            titel: p.name,
            adresse: p.adresse,
            plz: p.plz,
            meta: { investagonSlug: p.slug },
          });
        }
        continue;
      }

      let objektId: string;
      if (vorhanden) {
        const vor = vorhanden as Bestandstreffer;
        objektId = vor.id;
        if (vor.meta == null) {
          // Bei einer Uebernahme ueber die Adresse stand das `meta` noch nicht
          // fest. Frisch lesen, damit nichts verlorengeht, was ein frueherer
          // Schritt desselben Laufs schon geschrieben hat.
          const { data: standMeta, error: metaLesefehler } = await db
            .from("objekte").select("meta").eq("id", objektId).single();
          if (metaLesefehler) throw metaLesefehler;
          vor.meta = (standMeta as { meta?: Record<string, unknown> | null })
            .meta || {};
        }
        // Status und Sichtbarkeit bleiben, wie das CRM sie gesetzt hat. Ein
        // freigegebenes Objekt darf ein Sync nicht wieder zum Entwurf machen.
        const { status: _s, sichtbar: _v, ...ohneFreigabe } = felder;
        const updateFelder: Record<string, unknown> = { ...ohneFreigabe };
        for (const [key, value] of Object.entries(updateFelder)) {
          if (value === "" || value == null) delete updateFelder[key];
        }
        if (quelle === "api") {
          const fehlt = (feld: string) =>
            !p.einheiten.length ||
            p.einheiten.some((e) => e.roh?.[feld] == null);
          if (fehlt("object_size")) {
            for (
              const key of ["global_gesamt_qm", "groesse_von", "groesse_bis"]
            ) delete updateFelder[key];
          }
          if (fehlt("purchase_price_apartment")) {
            for (
              const key of [
                "global_verkaufspreis",
                "preis_von",
                "preis_bis",
                "rendite_von",
                "rendite_bis",
              ]
            ) delete updateFelder[key];
          }
          if (fehlt("rent_apartment_month")) {
            for (const key of ["rendite_von", "rendite_bis"]) {
              delete updateFelder[key];
            }
          }
        }
        /*
         * `meta` wird zusammengefuehrt, nicht ersetzt.
         *
         * Vorher schrieb der Lauf sein schmales Meta-Objekt einfach darueber.
         * Alles, was im CRM daneben gepflegt worden war, verschwand damit in
         * der naechsten Nacht wieder. Der Import kennt nur seine eigenen
         * Schluessel, alles andere gehoert ihm nicht und bleibt deshalb stehen.
         * Eine leere Anlageklasse aus Investagon loescht die vorhandene nicht.
         */
        const zusammengefuehrt = importMetaZusammenfuehren(
          vor.meta,
          felder.meta as Record<string, unknown>,
        );
        /*
         * Globalobjekt: Der Schalter folgt der Anlageklasse aus Investagon
         * (Christian, 23.09.2026). Nennt sie ein Globalobjekt, geht er an.
         * Sonst geht er aus, ausser am Haus haengt im CRM gerade ein Kunde
         * (reserviert, verkauft oder zur Unterschrift vorgemerkt). Einheiten
         * fasst das nicht an: Bestehende Einheitsreservierungen bleiben, neue
         * lehnt die Datenbank bei einem Globalobjekt ab.
         */
        const klasse = zusammengefuehrt.anlageklasse;
        const klasseText = String(klasse ?? "").trim() || "ohne Angabe";
        const bisherGlobal = await globalSchalterLesen(db, objektId);
        const schalter = globalSchalterNachImport({
          anlageklasse: klasse,
          bisher: bisherGlobal,
          // Nur gefragt, wenn es darauf ankommt: Der Schalter ist an, die
          // Klasse aus Investagon nennt aber kein Globalobjekt mehr.
          hausGebunden: bisherGlobal && !istGlobalAnlageklasse(klasse)
            ? await hausGebundenLesen(db, objektId)
            : false,
        });
        if (schalter !== bisherGlobal) updateFelder.global_objekt = schalter;
        if (!bisherGlobal && schalter) {
          (bericht.globalobjekt ||= []).push(
            `${p.name}: jetzt Globalobjekt (Anlageklasse in Investagon "${klasseText}"), einzelne Einheiten sind nicht mehr reservierbar`,
          );
        } else if (bisherGlobal && !schalter) {
          (bericht.globalobjekt ||= []).push(
            `${p.name}: kein Globalobjekt mehr (Anlageklasse in Investagon "${klasseText}")`,
          );
        } else if (bisherGlobal && !istGlobalAnlageklasse(klasse)) {
          (bericht.globalobjekt ||= []).push(
            `${p.name}: bleibt Globalobjekt, weil das Haus im CRM reserviert oder vorgemerkt ist (Anlageklasse in Investagon "${klasseText}")`,
          );
        }
        if (neueZweitkennung) {
          /*
           * Die Hauptkennung bleibt, wie sie war. An ihr haengen Bereinigung
           * und Abgleich; wuerde sie ueberschrieben, waere das Objekt fuer
           * den urspruenglichen Zugang verschwunden. Die neue Kennung kommt
           * daneben, mit Datum und Bautraeger im Klartext.
           */
          const haupt = vor.meta?.investagonSlug;
          if (typeof haupt === "string" && haupt) {
            zusammengefuehrt.investagonSlug = haupt;
          }
          Object.assign(
            zusammengefuehrt,
            mitZweitkennung(
              vor.meta,
              neueZweitkennung,
              bildQuelle?.zugang.name || "",
            ),
          );
          zweitkennungen.set(neueZweitkennung, {
            id: objektId,
            titel: p.name,
            meta: zusammengefuehrt,
          });
        }
        /*
         * Rechenwerte am Objekt, seit dem 25.09.2026. Die Spalten sind im CRM
         * bearbeitbar, deshalb nur, wenn dort noch der Standard oder der
         * zuletzt importierte Wert steht. Sonst bleibt der Handwert, und der
         * Bericht nennt ihn.
         */
        if (Object.keys(rechenwerteObjekt).length) {
          const { data: spaltenStand, error: spaltenFehler } = await db
            .from("objekte")
            .select("afa_satz, grundstueck_anteil, erhaltungsaufwand")
            .eq("id", objektId).single();
          if (spaltenFehler) throw spaltenFehler;
          const rechnung = objektRechenspaltenNachImport(
            rechenwerteObjekt,
            spaltenStand as Record<string, unknown>,
            vor.meta?.[RECHENWERTE_META_SCHLUESSEL],
          );
          Object.assign(updateFelder, rechnung.spalten);
          if (Object.keys(rechnung.vermerk).length) {
            zusammengefuehrt[RECHENWERTE_META_SCHLUESSEL] = rechnung.vermerk;
          }
          if (rechnung.geschuetzt.length) {
            (bericht.rechenwerteGeschuetzt ||= []).push(
              `${p.name}: ${rechnung.geschuetzt.join(", ")} von Hand gepflegt, Investagon-Wert nicht übernommen`,
            );
          }
        }
        const { error } = await db
          .from("objekte")
          .update({ ...updateFelder, meta: zusammengefuehrt })
          .eq("id", objektId);
        if (error) throw error;
      } else {
        // Ein neues Objekt hat noch keinen Handwert, die Rechenwerte gelten.
        const neueRechenwerte = objektRechenspaltenNachImport(
          rechenwerteObjekt,
          null,
          null,
        );
        const { data: neu, error } = await db.from("objekte").insert({
          ...felder,
          ...neueRechenwerte.spalten,
          // Globalobjekt, wenn die Anlageklasse aus Investagon eines nennt.
          global_objekt: istGlobalAnlageklasse(gelieferteKlasse),
          meta: {
            ...(felder.meta as Record<string, unknown>),
            ...(Object.keys(neueRechenwerte.vermerk).length
              ? { [RECHENWERTE_META_SCHLUESSEL]: neueRechenwerte.vermerk }
              : {}),
            ...(dublettenVerdacht
              ? { investagonMoeglicheDublette: dublettenVerdacht }
              : {}),
            /*
             * Wann der Import dieses Objekt angelegt hat. Daran haengt das
             * Kennzeichen "Neu" in der Objektuebersicht
             * (`src/lib/objekteNeu.ts`), der Schluessel ist deshalb ein
             * Vertrag und heisst genau so.
             *
             * Nur hier, beim ersten Anlegen. Beim Abgleich eines vorhandenen
             * Objekts wird `meta` zusammengefuehrt (siehe oben), und weil der
             * Schluessel nicht in `felder.meta` steht, bleibt er dort stehen,
             * wie er war. Ein uebernommenes Objekt (Zweitkennung) ist nicht
             * neu und bekommt ihn nicht.
             */
            investagonNeuAngelegtAm: new Date().toISOString(),
          },
        })
          .select("id").single();
        if (error) throw error;
        objektId = (neu as { id: string }).id;
        if (istGlobalAnlageklasse(gelieferteKlasse)) {
          (bericht.globalobjekt ||= []).push(
            `${p.name}: neu als Globalobjekt angelegt (Anlageklasse in Investagon "${gelieferteKlasse}")`,
          );
        }
        // Ein zweites Haus mit derselben Adresse im selben Lauf trifft jetzt
        // dieses hier, statt noch einmal neu angelegt zu werden.
        eintragen(adressIndex, {
          id: objektId,
          titel: p.name,
          adresse: p.adresse,
          plz: p.plz,
          meta: { investagonSlug: p.slug },
        });
      }
      standortKandidaten.push(objektId);

      /*
       * Wohnungen abgleichen, nicht wegwerfen und neu bauen.
       *
       * Vorher loeschte jeder Lauf alle freien Einheiten und legte sie neu an.
       * Damit bekamen sie jede Nacht neue IDs, und alles, was im CRM daran
       * hing, war weg: von Hand hochgeladene Bilder und Dokumente, Hausgeld,
       * Ruecklage, geplante Mieterhoehung. Reservierte und verkaufte Einheiten
       * waren zwar schon immer geschuetzt, weil an ihnen ein Kunde haengt,
       * aber die Pflege an einer freien Wohnung ist genauso Arbeit.
       *
       * Jetzt gilt: Was Investagon liefert, wird aktualisiert oder neu
       * angelegt. Fehlende Einheiten bleiben erhalten; eine unvollständige
       * Liste darf keine Wohnung mit ihren Unterlagen löschen.
       */
      const { data: bestand, error: wohnungenFehler } = await db
        .from("wohnungen").select(
          "id, we_nr, status, kunde_id, kunde_name, reserviert_am, meta",
        ).eq(
          "objekt_id",
          objektId,
        );

      if (wohnungenFehler) throw wohnungenFehler;
      // Name und Reservierungsdatum braucht `statusFelder`, um einen
      // Kundenvorgang aus dem CRM zu erkennen (siehe `verkaeufe.ts`).
      type Bestandszeile = {
        id: string;
        we_nr?: string;
        status?: string;
        kunde_id?: string;
        kunde_name?: string | null;
        reserviert_am?: string | null;
        meta?: Record<string, unknown> | null;
      };
      const bestandsZeilen = (bestand || []) as Bestandszeile[];

      // Fehlende Einheiten bleiben erhalten: Listen können unvollständig sein.

      /*
       * Alle Kennungen dieser Lieferung. Die Zuordnung ueber die blosse
       * Wohnungsnummer darf keine Einheit erwischen, die zu einer anderen
       * gelieferten Wohnung gehoert, siehe `findeBestandsEinheit`.
       */
      const gelieferteKennungen = new Set(
        p.einheiten.map((e) => e.investagonId).filter((k): k is string => !!k),
      );

      let angelegt = 0;
      let aktualisiert = 0;
      for (const e of p.einheiten) {
        // Die Felder, die aus Investagon stammen. Status und Vermietung
        // gehoeren dem CRM und stehen deshalb nicht dabei.
        const importFelder: Record<string, unknown> = {
          etage: e.geschoss ?? "",
          groesse: e.qm,
          zimmer: e.zi,
          miete_gesamt: e.miete,
          vk_gesamt: e.kp + (e.moebel || 0),
          qm_preis: e.qmPreis,
          rendite: e.kp > 0 && e.miete > 0
            ? Math.round(((e.miete * 12) / (e.kp + (e.moebel || 0))) * 10000) /
              100
            : 0,
        };
        if (e.roh) {
          const quellen: Record<string, string[]> = {
            etage: ["object_floor"],
            groesse: ["object_size"],
            zimmer: ["object_rooms"],
            miete_gesamt: ["rent_apartment_month"],
            vk_gesamt: ["purchase_price_apartment"],
            qm_preis: ["object_size", "purchase_price_apartment"],
            rendite: ["purchase_price_apartment", "rent_apartment_month"],
          };
          for (const [feld, keys] of Object.entries(quellen)) {
            if (keys.some((k) => e.roh![k] == null || e.roh![k] === "")) {
              delete importFelder[feld];
            }
          }
        }
        const importMeta: Record<string, unknown> = {
          ...(e.investagonId ? { investagonId: e.investagonId } : {}),
          ...(e.roh ? { investagonRaw: e.roh, ...einheitMeta(e.roh) } : {}),
          ...(!e.roh || e.roh.purchase_price_furniture != null
            ? { moebelPreis: e.moebel || 0 }
            : {}),
          ...(e.stellplatzPreis !== undefined &&
              (!e.roh || e.roh.purchase_price_parking != null)
            ? { stellplatzPreis: e.stellplatzPreis }
            : {}),
          ...(e.stellplatzMiete !== undefined &&
              (!e.roh || e.roh.rent_parking_month != null)
            ? { stellplatzMiete: e.stellplatzMiete }
            : {}),
          // Nur schreiben, was Investagon liefert. Sonst bleibt die Handpflege
          // (siehe ObjektWohnung im objekteStore) unangetastet.
          ...(e.stadtteil ? { stadtteil: e.stadtteil } : {}),
          ...(e.sanierungsjahr ? { sanierungsjahr: e.sanierungsjahr } : {}),
          ...(e.sanierungAnteilProzent
            ? { sanierungAnteilProzent: e.sanierungAnteilProzent }
            : {}),
          ...(e.sanierungAnteilBetrag
            ? { sanierungAnteilBetrag: e.sanierungAnteilBetrag }
            : {}),
        };

        const vorhandeneEinheit = findeBestandsEinheit(
          bestandsZeilen,
          e.investagonId,
          e.we,
          gelieferteKennungen,
        );
        /*
         * Erhaltungsaufwand der Einheit, seit dem 25.09.2026 aus Investagons
         * `initial_investment_extra_1y`. Er landet im Sanierungsanteil in
         * Euro, den der Investmentrechner als „davon Erhaltungsaufwand“
         * übernimmt. Das Feld ist im CRM von Hand pflegbar
         * (EinheitFelderDialog), deshalb derselbe Schutz wie am Objekt.
         * Liefert Investagon schon einen Sanierungsanteil über die älteren
         * Feldnamen, bleibt es bei dem.
         */
        const erhaltungEinheit = e.roh ? rechenwerteAus(e.roh).erhaltungsaufwand : undefined;
        if (erhaltungEinheit !== undefined && e.sanierungAnteilBetrag === undefined) {
          const bisherMeta = vorhandeneEinheit?.meta || {};
          const bisherVermerk = bisherMeta[RECHENWERTE_META_SCHLUESSEL] &&
              typeof bisherMeta[RECHENWERTE_META_SCHLUESSEL] === "object"
            ? bisherMeta[RECHENWERTE_META_SCHLUESSEL] as Record<string, unknown>
            : {};
          const erhaltung = rechenwertNachImport(
            erhaltungEinheit,
            bisherMeta.sanierungAnteilBetrag,
            bisherVermerk.sanierungAnteilBetrag,
            [0],
          );
          if (erhaltung.schreiben && erhaltung.wert !== undefined) {
            importMeta.sanierungAnteilBetrag = erhaltung.wert;
            importMeta[RECHENWERTE_META_SCHLUESSEL] = {
              ...bisherVermerk,
              sanierungAnteilBetrag: erhaltung.wert,
            };
          } else if (erhaltung.geschuetzt) {
            (bericht.rechenwerteGeschuetzt ||= []).push(
              `${p.name}, ${e.we}: Sanierungsanteil von Hand gepflegt, Investagon-Wert nicht übernommen`,
            );
          }
        }
        /*
         * Hausgeld gesamt der Einheit, seit dem 05.10.2026 nach der Regel in
         * `_shared/einheit-hausgeld.ts`, gerechnet nur aus Investagons Teilen.
         * Das Feld ist im CRM von Hand pflegbar, deshalb derselbe Schutz wie
         * beim Sanierungsanteil. Als unberührt gilt auch die Summe aus den
         * bisherigen Rohdaten: Die Oberfläche zeigt sie als Rückfall an, und
         * wer die Einheit speichert, schreibt sie unverändert zurück.
         */
        if (e.roh) {
          const bisherMeta = vorhandeneEinheit?.meta || {};
          const bisherVermerk = bisherMeta[RECHENWERTE_META_SCHLUESSEL] &&
              typeof bisherMeta[RECHENWERTE_META_SCHLUESSEL] === "object"
            ? bisherMeta[RECHENWERTE_META_SCHLUESSEL] as Record<string, unknown>
            : {};
          const bisherSumme = hausgeldTeile({ investagonRaw: bisherMeta.investagonRaw }).gesamt;
          const hausgeld = rechenwertNachImport(
            hausgeldTeile({ investagonRaw: e.roh }).gesamt,
            bisherMeta.hausgeldMonat,
            bisherVermerk.hausgeldMonat,
            bisherSumme === undefined ? [0] : [0, bisherSumme],
          );
          if (hausgeld.schreiben && hausgeld.wert !== undefined) {
            importMeta.hausgeldMonat = hausgeld.wert;
            importMeta[RECHENWERTE_META_SCHLUESSEL] = {
              ...bisherVermerk,
              ...(importMeta[RECHENWERTE_META_SCHLUESSEL] as Record<string, unknown> | undefined),
              hausgeldMonat: hausgeld.wert,
            };
          } else if (hausgeld.geschuetzt) {
            (bericht.rechenwerteGeschuetzt ||= []).push(
              `${p.name}, ${e.we}: Hausgeld von Hand gepflegt, Investagon-Wert nicht übernommen`,
            );
          }
        }
        const quellenStatus = statusFelder(e.roh, vorhandeneEinheit);
        if (quellenStatus.verwaltet) {
          importMeta.investagonStatusVerwaltet = true;
        }
        if (vorhandeneEinheit) {
          const { error } = await db
            .from("wohnungen")
            .update({
              we_nr: e.we,
              ...importFelder,
              ...(quellenStatus.status ? { status: quellenStatus.status } : {}),
              // Auch hier zusammenfuehren: Was das CRM gepflegt hat, bleibt.
              meta: { ...(vorhandeneEinheit.meta || {}), ...importMeta },
            })
            .eq("id", vorhandeneEinheit.id);
          if (error) {
            throw error;
          }
          aktualisiert++;
        } else {
          const { error } = await db.from("wohnungen").insert({
            objekt_id: objektId,
            we_nr: e.we,
            ...importFelder,
            status: quellenStatus.status || (e.roh ? "reserviert" : "frei"),
            vermietet: e.roh?.rent_status === "rented",
            meta: importMeta,
          });
          if (error) {
            throw error;
          }
          angelegt++;
        }
      }

      (vorhanden ? bericht.aktualisiert : bericht.angelegt).push(p.name);
      bericht.einheiten += angelegt + aktualisiert;
      const { data: aktuellesObjekt, error: metaFehler } = await db.from(
        "objekte",
      ).select("meta").eq("id", objektId).single();
      if (metaFehler) throw metaFehler;
      const { error: standFehler } = await db.from("objekte").update({
        meta: {
          ...aktuellesObjekt.meta,
          investagonDatenSyncAt: new Date().toISOString(),
        },
      }).eq("id", objektId);
      if (standFehler) throw standFehler;
      /*
       * Bilder, nach den Wohnungen: Sie werden ueber die Wohnungsnummer
       * zugeordnet. Seit die Einheiten ihre IDs behalten, bleiben auch ihre
       * Bilder liegen, und der Doppelungsschutz in `uebernimmBilder` greift.
       * Vorher fiel mit jeder geloeschten Wohnung ihr Bildbestand weg und
       * wurde in derselben Nacht neu heruntergeladen.
       */
      if (bericht.bilder) {
        const weiter = await uebernimmBilder({
          db,
          objektId,
          slug: p.slug,
          projektName: p.name,
          quelle: bildQuellen.get(p.slug),
          frist,
          fehler: bericht.fehler,
          bericht: bericht.bilder,
        });
        if (!weiter) {
          bericht.unvollstaendig = true;
          break;
        }
      }
      if (bilder && bericht.fehler.length === fehlerVorProjekt) {
        const { data: stand, error: leseFehler } = await db.from("objekte")
          .select("meta").eq("id", objektId).single();
        if (leseFehler) throw leseFehler;
        const { error: speichern } = await db.from("objekte").update({
          meta: {
            ...stand.meta,
            investagonVollSyncVersion: versionen.get(p.slug),
          },
        }).eq("id", objektId);
        if (speichern) throw speichern;
        bericht.offen = Math.max(0, (bericht.offen || 0) - 1);
      }
    } catch (e) {
      const meldung = e instanceof Error ? e.message : JSON.stringify(e);
      if (Date.now() > frist - 15_000) bericht.unvollstaendig = true;
      console.error(`Import ${p.name}:`, e);
      bericht.fehler.push(`${p.name}: ${meldung}`);
    }
  }

  /*
   * ── Eigene Ausblendungen zuruecknehmen ──
   *
   * Der Import blendet nichts mehr aus, Objekte ohne Angebot bleiben
   * sichtbar (Christian, 23.09.2026). Was die Fassung vom Vormittag mit
   * Vermerk ausgeblendet hat, kommt hier wieder, in jedem Lauf, bis kein
   * Vermerk mehr uebrig ist. Handausblendungen ohne Vermerk bleiben.
   */
  try {
    await ausblendungenZuruecknehmen(db, bericht, trockenlauf);
  } catch (e) {
    const meldung = e instanceof Error ? e.message : JSON.stringify(e);
    console.error("Rücknahme:", e);
    bericht.fehler.push(`Rücknahme: ${meldung}`);
  }

  /*
   * ── Die Wache über den Bestand ──
   *
   * Ganz am Ende, damit sie sieht, was dieser Lauf hinterlassen hat. Nur beim
   * vollen Abgleich: Ein Ereignislauf des Webhooks trifft ein einzelnes
   * Projekt und kann bis zu 240 Mal je Stunde kommen. Liefe die Wache dort
   * mit, wäre die Obergrenze je Lauf keine Obergrenze mehr, und die
   * Bereinigung nebenan hält aus demselben Grund dieselbe Grenze ein.
   */
  if (!nurSlugs.length) {
    try {
      await dublettenwache(db, bericht, trockenlauf);
    } catch (e) {
      // Die Wache ist eine Zugabe. Bricht sie, soll der Import trotzdem sein
      // Ergebnis melden, statt den ganzen Lauf zu verlieren.
      const meldung = e instanceof Error ? e.message : JSON.stringify(e);
      console.error("Dublettenwache:", e);
      bericht.fehler.push(`Dublettenwache: ${meldung}`);
    }
  }

  /*
   * ── Standort einmal messen ──
   *
   * Nach dem Abgleich, für die Objekte dieses Laufs, nur wo die Analyse fehlt
   * oder die Adresse sich geändert hat. Höchstens 25 je Lauf, nacheinander,
   * solange die Zeit reicht; der Rest kommt beim nächsten Lauf. Scheitert
   * etwas, steht es am Objekt und im Bericht, der Import läuft weiter.
   */
  if (!trockenlauf && standortKandidaten.length) {
    bericht.standort = await standorteMessen(db as unknown as StandortDb, standortKandidaten, { laufBeginn });
  }

  console.log("investagon-import:", JSON.stringify(bericht));

  /*
   * ── Objekttexte nachziehen ──
   *
   * Nach jedem echten vollen Abgleich, also etwa alle 15 Minuten, und nach
   * einem Ereignislauf nur, wenn er ein Objekt neu angelegt hat. Ereignislaeufe
   * koennen bis zu 240 Mal je Stunde kommen; stiessen alle an, liefen mehrere
   * Sammellaeufe gleichzeitig ueber dieselben Objekte. Der Trockenlauf
   * schreibt nichts und stoesst deshalb auch nichts an.
   */
  if (!trockenlauf && (!nurSlugs.length || bericht.angelegt.length > 0)) {
    objektTexteAnstossen();
  }

  /*
   * Erst nach dem Lauf wird quittiert. Ging etwas schief, bleibt die Meldung
   * in der Warteschlange und wird mit wachsendem Abstand erneut versucht.
   */
  if (warteschlange && aufgaben.length) {
    const neueFehler = bericht.fehler.slice(fehlerVorLauf);
    if (neueFehler.length === 0) {
      await fertig(db, aufgaben.map((a) => a.id));
    } else {
      for (const a of aufgaben) {
        await spaeterErneut(db, a, neueFehler.slice(0, 3).join(" | "));
      }
    }

  }


  if (sync) {
    // Nur Stückzahlen nach draußen; der volle Bericht steht im Log oben und
    // als Eintrag im activity_log, damit nachvollziehbar ist, wann was ankam.
    const stueckzahlen = {
      sync: true,
      sollProjekte: bericht.sollProjekte,
      sollEinheiten: bericht.sollEinheiten,
      offen: bericht.offen,
      unvollstaendig: bericht.unvollstaendig || false,
      quelle: bericht.quelle,
      angelegt: bericht.angelegt.length,
      aktualisiert: bericht.aktualisiert.length,
      einheiten: bericht.einheiten,
      fehlerAnzahl: bericht.fehler.length,
      entfernt: bericht.entfernt?.length || 0,
      geschuetzt: bericht.geschuetzt?.length || 0,
      rechenwerteGeschuetzt: bericht.rechenwerteGeschuetzt?.length || 0,
      // Die erste Zeile der Wache ist ihre Kopfzeile, die Funde folgen.
      dublettenGefunden: Math.max(0, (bericht.dublettenWache?.length || 0) - 1),
      dublettenEntfernt: bericht.dublettenEntfernt?.length || 0,
      // Nur Zahlen, keine Objektnamen: siehe Kommentar oben.
      wiederEingeblendet: bericht.wiederEingeblendet || 0,
      vermerkEntfernt: bericht.ausblendungZurueck?.length || 0,
      verkaufNachgezogen: bericht.verkaufNachgezogen?.length || 0,
      verkaufGebunden: bericht.verkaufGebunden?.length || 0,
      ohneAngebotNichtAngelegt: bericht.ohneAngebotNichtAngelegt || 0,
      ...(bericht.standort ? { standort: bericht.standort } : {}),
      ...(bericht.bilder
        ? {
          bilder: {
            uebernommen: bericht.bilder.uebernommen,
            uebersprungen: bericht.bilder.uebersprungen,
            fehlgeschlagen: bericht.bilder.fehlgeschlagen,
          },
        }
        : {}),
    };
    // Gemeinsamer Logger verwendet noch supabase-js 2.45; nur der Typ ist inkompatibel.
    await logActivityFromEdge(
      db as unknown as Parameters<typeof logActivityFromEdge>[0],
      {
        kontaktId: SYSTEM_KONTAKT,
        action: "investagon_sync",
        entityType: "system",
        // Die Funde der Wache gehören ins Protokoll, nicht in die Antwort:
        // Der Sync-Weg kommt ohne Anmeldung und gibt darum nur Stückzahlen
        // heraus, während das Protokoll nur mit Rolle lesbar ist.
        meta: {
          ...stueckzahlen,
          fehler: bericht.fehler.slice(0, 20),
          ...(bericht.dublettenWache
            ? { dublettenWache: bericht.dublettenWache.slice(0, 40) }
            : {}),
          ...(bericht.dublettenEntfernt
            ? { dublettenEntferntDetails: bericht.dublettenEntfernt }
            : {}),
          ...(bericht.ausblendungZurueck
            ? { ausblendungZurueck: bericht.ausblendungZurueck.slice(0, 60) }
            : {}),
          ...(bericht.verkaufNachgezogen
            ? { verkaufNachgezogenDetails: bericht.verkaufNachgezogen.slice(0, 60) }
            : {}),
          ...(bericht.verkaufGebunden
            ? { verkaufGebundenDetails: bericht.verkaufGebunden }
            : {}),
        },
        source: "edge:investagon-import",
      },
    );
    return json(stueckzahlen);
  }

  return json(bericht);
});
