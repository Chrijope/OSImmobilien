import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { istExposeToken, oeffentlicherAnsprechpartner, oeffentlichesObjekt, oeffentlicheWohnung } from "../_shared/expose-oeffentlich.ts";
import {
  aufrufZaehlen, exposeArtErlaubt, glockenEmpfaenger, glockenText, glockenTitel, LINK_SPALTEN, LINK_SPALTEN_ALT, linkBereich, linkZustand,
  type ExposeLinkZeile, type GeladeneEinheit, type LinkBereich, type ZaehlClient,
} from "../_shared/expose-kundenlink.ts";
import {
  DATEI_GUELTIG_SEKUNDEN, findeGrundriss, grundrisseZumLink, grundrissOhneAblage, oeffentlicheUnterlagen, pruefeDateiAnfrage,
} from "./unterlagen.ts";
import { exposeBezeichnung, versandSpalteFehlt } from "../_shared/kunden-expose.ts";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { spracheAusMeta, type Sprache } from "../_shared/kunden-sprache.ts";
import { ohneFremdePartner } from "../_shared/glocke-zustaendiger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OeffentlicherPartner = ReturnType<typeof oeffentlicherAnsprechpartner>;

interface KontaktKurz {
  vorname: string | null;
  nachname: string | null;
  zustaendig_id: string | null;
  meta?: unknown;
  geloescht?: boolean | null;
}

/**
 * Was ein Token für diesen Aufruf bedeutet.
 *
 *   ohne        kein gültiger Token für genau dieses Objekt und diese Einheit.
 *               Das Exposé erscheint wie ohne Token, ohne Partner und ohne
 *               Zählen, so wie bisher.
 *   abgelaufen  der Token gehört hierher, ist aber abgelaufen oder
 *               zurückgezogen. Hinaus geht nur ein Hinweis mit dem Partner.
 *   gueltig     alles passt: Partner oben im Exposé, der Aufruf wird gezählt.
 */
type Kundenlink =
  | { art: "ohne" }
  | { art: "abgelaufen"; ansprechpartner: OeffentlicherPartner; sprache?: Sprache }
  | {
    art: "gueltig"; ansprechpartner: OeffentlicherPartner; zeile: ExposeLinkZeile; mitVersandSpalten: boolean; kontakt: KontaktKurz | null; sprache?: Sprache;
    /** Wofür der Link bei diesem Aufruf gilt, aus `linkBereich`. Grundrisse und Dateien richten sich danach. */
    bereich: LinkBereich;
  };

const OHNE: Kundenlink = { art: "ohne" };

/**
 * Die Zeile zum Token. Erst mit den Spalten der Migration 20260923151000,
 * fehlen sie noch, mit den alten: Der Partner im Exposé soll nicht
 * verschwinden, nur weil die Migration noch nicht gelaufen ist.
 */
async function ladeLinkZeile(supabase: SupabaseClient, token: string): Promise<{ zeile: ExposeLinkZeile | null; mitVersandSpalten: boolean }> {
  const neu = await supabase.from("objekt_exposes").select(LINK_SPALTEN).eq("token", token).maybeSingle();
  if (!neu.error) return { zeile: (neu.data as ExposeLinkZeile | null) ?? null, mitVersandSpalten: true };
  if (!versandSpalteFehlt(neu.error)) return { zeile: null, mitVersandSpalten: true };
  const alt = await supabase.from("objekt_exposes").select(LINK_SPALTEN_ALT).eq("token", token).maybeSingle();
  if (alt.error) return { zeile: null, mitVersandSpalten: false };
  return { zeile: (alt.data as ExposeLinkZeile | null) ?? null, mitVersandSpalten: false };
}

/**
 * Die Einheit des Aufrufs aus der Tabelle, nur wenn sie an diesem Objekt
 * hängt. Gebraucht nur für einen Objekt-Link auf einer Einheitsseite
 * (`linkBereich`). Jeder Fehler, auch eine Kennung in falscher Form, ist
 * „keine Einheit“: Der Token gilt dann nicht.
 */
async function ladeEinheit(supabase: SupabaseClient, objektId: string, wohnungId: string): Promise<GeladeneEinheit | null> {
  const { data, error } = await supabase.from("wohnungen").select("id, objekt_id").eq("id", wohnungId).eq("objekt_id", objektId).maybeSingle();
  if (error || !data) return null;
  return data as GeladeneEinheit;
}

/**
 * Gehört der Token zu einem Exposé und nicht zu einer Objektübersicht?
 *
 * Die Spalte `art` führt eine eigene Migration ein. Deshalb eine getrennte,
 * kleine Abfrage: Fehlt die Spalte noch, gibt es nur Exposés. Jeder andere
 * Fehler zählt als „nein", im Zweifel geht der Partner nicht hinaus.
 */
async function istExposeLink(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("objekt_exposes").select("art").eq("id", id).maybeSingle();
  if (error) return versandSpalteFehlt(error);
  return exposeArtErlaubt((data as { art?: unknown } | null)?.art);
}

/**
 * Den Token eines Kunden-Exposés prüfen und den Vertriebspartner dazu laden.
 *
 * Der Token muss zu einem gespeicherten Exposé (`objekt_exposes`) gehören,
 * das zu genau diesem Objekt und dieser Einheit passt. Der Partner ist der
 * für den Kunden zuständige (`kontakte.zustaendig_id`), sonst der Ersteller
 * des Exposés; dieselbe Reihenfolge wie im CRM
 * (`src/lib/exposeAnsprechpartner.ts`). Vom Kunden selbst geht nichts hinaus:
 * Vor- und Nachname werden nur für die Glocke an den Partner gelesen.
 *
 * Eine beliebige Nutzerkennung aus der Adresse (`?berater=`) wird hier
 * bewusst NICHT aufgelöst: Sonst ließen sich mit jeder bekannten Kennung Name,
 * Telefon und E-Mail eines beliebigen Nutzers abfragen.
 *
 * Jeder Fehler endet still als „ohne“. Das Exposé selbst soll daran nicht
 * scheitern; die Seite zeigt dann den Weg zu OS Immobilien.
 */
async function pruefeKundenlink(
  supabase: SupabaseClient,
  token: string,
  objektId: string,
  wohnungId: string | null,
): Promise<Kundenlink> {
  const { zeile, mitVersandSpalten } = await ladeLinkZeile(supabase, token);
  if (!zeile) return OHNE;
  // Ein Objekt-Link auf einer Einheitsseite gilt nur für eine Einheit, die als Zeile an diesem Objekt hängt.
  const einheit = !zeile.wohnung_id && wohnungId && zeile.objekt_id === objektId ? await ladeEinheit(supabase, objektId, wohnungId) : null;
  const bereich = linkBereich(zeile, objektId, wohnungId, einheit);
  if (!bereich) return OHNE;
  if (!(await istExposeLink(supabase, zeile.id))) return OHNE;

  let kontakt: KontaktKurz | null = null;
  if (zeile.kontakt_id) {
    const { data } = await supabase.from("kontakte").select("vorname, nachname, zustaendig_id, meta, geloescht").eq("id", zeile.kontakt_id).maybeSingle();
    kontakt = (data as KontaktKurz | null) ?? null;
  }
  // Die Sprache des Kunden (Plan Kundensprache, Etappe 3). Ohne Kontakt keine, die Seite bleibt deutsch.
  const sprache = kontakt ? spracheAusMeta(kontakt.meta) : undefined;
  const partnerId = kontakt?.zustaendig_id || zeile.erstellt_von || null;
  let ansprechpartner: OeffentlicherPartner = undefined;
  if (partnerId) {
    const { data: profil } = await supabase.from("profiles").select("name, telefon, email, avatar_url").eq("id", partnerId).maybeSingle();
    ansprechpartner = oeffentlicherAnsprechpartner(profil);
  }

  if (linkZustand(zeile) === "abgelaufen") return { art: "abgelaufen", ansprechpartner, sprache };
  return { art: "gueltig", ansprechpartner, zeile, mitVersandSpalten, kontakt, sprache, bereich };
}

/**
 * Die Glocke beim ersten Aufruf. Wirft nie, das Exposé geht auch ohne sie
 * hinaus. Ohne Kunden am Exposé gibt es niemanden, der „geöffnet hat“.
 */
async function glockeLaeuten(
  supabase: SupabaseClient,
  link: Extract<Kundenlink, { art: "gueltig" }>,
  objekt: Record<string, unknown>,
  wohnungen: Array<Record<string, unknown>>,
): Promise<void> {
  const { zeile, kontakt } = link;
  if (!zeile.kontakt_id) return;
  try {
    // Regel vom 29.09.2026: Der Absender des Links bekommt die Glocke nur,
    // wenn ihm der Kunde noch gehoert oder er kein Vertriebspartner ist. Ohne
    // Zustaendigen erfaehrt es die Leitung, bei geloeschtem Kontakt nicht.
    const empfaenger = await ohneFremdePartner(
      supabase,
      glockenEmpfaenger(kontakt?.zustaendig_id, zeile.gesendet_von, zeile.erstellt_von),
      kontakt?.zustaendig_id,
      !!kontakt && kontakt.geloescht !== true,
    );
    if (empfaenger.length === 0) return;
    const wohnung = zeile.wohnung_id ? wohnungen.find((w) => w.id === zeile.wohnung_id) : undefined;
    const bezeichnung = exposeBezeichnung({
      mitEinheit: !!zeile.wohnung_id,
      weNr: typeof wohnung?.we_nr === "string" ? wohnung.we_nr : null,
      objektTitel: typeof objekt.titel === "string" ? objekt.titel : null,
      adresse: typeof objekt.adresse === "string" ? objekt.adresse : null,
      ort: typeof objekt.ort === "string" ? objekt.ort : null,
    });
    const { error } = await supabase.from("benachrichtigungen").insert(empfaenger.map((benutzerId) => ({
      benutzer_id: benutzerId,
      titel: glockenTitel(kontakt?.vorname, kontakt?.nachname),
      nachricht: glockenText(bezeichnung),
      link: `/kunden/${zeile.kontakt_id}`,
      gelesen: false,
    })));
    if (error) console.error("[get-expose] Glocke nicht gesetzt:", error.message);
  } catch (fehler) {
    console.error("[get-expose] Glocke nicht gesetzt:", fehler instanceof Error ? fehler.message : fehler);
  }
}

/** Antwort der Aktion „datei“. Sie gehört zu genau diesem Link, keine geteilte Zwischenablage darf sie weiterreichen. */
function jsonPrivat(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

const KEINE_DATEI = { error: "Diese Datei ist nicht verfügbar." };

/** Mengenbremse für Dateien je Adresse des Aufrufers, dieselben Werte wie in der Kundenansicht. */
const DATEI_BREMSE = { perHour: 300, perDay: 1500 } as const;

/**
 * Aktion „datei“: die befristete Adresse (15 Minuten) für genau einen
 * Grundriss, nach dem Muster der Kundenansicht (`get-kundenansicht`).
 *
 * Geprüft wird in dieser Reihenfolge, jede Lücke endet ohne Datei:
 *   1. Schlüssel in gültiger Form, Bereich und Kennung lesbar. Ohne Schlüssel
 *      gibt es keine Datei, auch nicht für die öffentliche Vorschau.
 *   2. Mengenbremse je Aufrufer.
 *   3. Das Objekt ist sichtbar.
 *   4. Der Schlüssel gehört zu einem Exposé genau dieses Objekts und dieser
 *      Einheit (oder zum ganzen Objekt, und die Einheit hängt an ihm, siehe
 *      `linkBereich`) und gilt noch, also weder abgelaufen noch zurückgezogen.
 *   5. Der Grundriss steht in derselben Liste, die das Laden liefert: am
 *      Objekt oder an der Einheit des Links, Ampel erlaubt, Kopie im eigenen
 *      Speicher (`grundrisseZumLink` in `unterlagen.ts`).
 *
 * Gezählt wird nichts, die Glocke läutet nicht.
 */
async function dateiAusliefern(req: Request, url: URL, supabase: SupabaseClient, objektId: string): Promise<Response> {
  const anfrage = pruefeDateiAnfrage(url.searchParams);
  if (!anfrage) return jsonPrivat(KEINE_DATEI, 404);

  const bremse = await checkEdgeRateLimit({ scope: "get-expose-datei", key: `ip:${clientIp(req)}`, ...DATEI_BREMSE });
  if (!bremse.ok) return jsonPrivat({ error: "Zu viele Aufrufe, bitte versuche es später noch einmal." }, 429);

  const { data: objekt, error: objektFehler } = await supabase.from("objekte").select("id, meta").eq("id", objektId).eq("sichtbar", true).maybeSingle();
  if (objektFehler || !objekt) return jsonPrivat(KEINE_DATEI, 404);

  const link = await pruefeKundenlink(supabase, anfrage.token, objektId, url.searchParams.get("wohnung")).catch(() => OHNE);
  if (link.art !== "gueltig") return link.art === "ohne" ? jsonPrivat(KEINE_DATEI, 404) : jsonPrivat({ abgelaufen: true }, 410);

  // Die Einheit, für die der Link bei diesem Aufruf gilt: die des Links oder, bei einem Objekt-Link, die geprüfte der Adresse.
  const wohnungId = link.bereich.wohnung_id;
  const [objektDokumente, wohnung] = await Promise.all([
    supabase.from("objekt_dokumente").select("*").eq("objekt_id", objektId),
    wohnungId
      ? supabase.from("wohnungen").select("id, objekt_id, we_nr, etage, meta, wohnungs_dokumente(*)").eq("id", wohnungId).eq("objekt_id", objektId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (objektDokumente.error) throw new Error(`objekt_dokumente: ${objektDokumente.error.message}`);
  if (wohnung.error) throw new Error(`wohnungen: ${wohnung.error.message}`);

  const grundriss = findeGrundriss(grundrisseZumLink({
    link: link.bereich,
    objekt: objekt as Record<string, unknown>,
    objektZeilen: objektDokumente.data || [],
    wohnungen: wohnung.data ? [wohnung.data] : [],
  }), anfrage);
  if (!grundriss) return jsonPrivat(KEINE_DATEI, 404);

  const { data: signiert, error } = await supabase.storage.from(grundriss.ablage.eimer).createSignedUrl(grundriss.ablage.pfad, DATEI_GUELTIG_SEKUNDEN);
  if (error || !signiert?.signedUrl) {
    console.error("[get-expose] Datei nicht signiert:", grundriss.ablage.eimer, error?.message);
    return jsonPrivat(KEINE_DATEI, 404);
  }
  return jsonPrivat({ url: signiert.signedUrl, name: grundriss.name });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const objektId = url.searchParams.get("id");
    if (!objektId) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const token = url.searchParams.get("token");
    const wohnungParam = url.searchParams.get("wohnung");
    /*
     * Gezählt wird nur, was die Seite ausdrücklich als Aufruf meldet: das
     * erste Laden (`aufruf=1`). Das Nachladen beim Zurückwechseln in den Tab
     * zählt nicht, und `vorschau=1` (der Partner öffnet den Link aus dem
     * Kundenprofil) erst recht nicht.
     */
    const zaehlen = url.searchParams.get("aufruf") === "1" && url.searchParams.get("vorschau") !== "1";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Eine einzelne Datei statt des Exposés, eigene Prüfung, siehe oben.
    if (url.searchParams.get("aktion") === "datei") return await dateiAusliefern(req, url, supabase, objektId);

    const { data: objekt, error: oErr } = await supabase.from("objekte").select("*").eq("id", objektId).eq("sichtbar", true).maybeSingle();
    if (oErr || !objekt) return new Response(JSON.stringify({ error: "Objekt nicht gefunden" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    /*
     * Die Objektunterlagen bewusst alle, nicht nur `sichtbar = true`: Was
     * hinausgeht, entscheidet die Ampel in `unterlagen.ts`, und die braucht
     * auch die Zeilen aus Investagon (dort `sichtbar = false`), um eine
     * Sperre von Admin oder Inhaber auf die Rohdateien zu übertragen.
     */
    const [bilder, dokumente, wohnungen, kundenlink] = await Promise.all([
      supabase.from("objekt_bilder").select("*").eq("objekt_id", objektId).order("reihenfolge"),
      supabase.from("objekt_dokumente").select("*").eq("objekt_id", objektId),
      supabase.from("wohnungen").select("*, wohnungs_bilder(*), wohnungs_dokumente(*)").eq("objekt_id", objektId),
      istExposeToken(token)
        ? pruefeKundenlink(supabase, token, objektId, wohnungParam).catch(() => OHNE)
        : Promise.resolve(OHNE),
    ]);

    /*
     * Abgelaufen oder zurückgezogen: Nichts vom Exposé geht hinaus, nur der
     * Hinweis und die vier Angaben des Partners (Positivliste in
     * `_shared/expose-oeffentlich.ts`). Die Seite zeigt daraus einen gestalteten Hinweis.
     */
    if (kundenlink.art === "abgelaufen") {
      return new Response(JSON.stringify({
        abgelaufen: true,
        ...(kundenlink.ansprechpartner ? { ansprechpartner: kundenlink.ansprechpartner } : {}),
        ...(kundenlink.sprache ? { sprache: kundenlink.sprache } : {}),
      }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      });
    }

    if (kundenlink.art === "gueltig" && zaehlen) {
      const { ersterAufruf } = await aufrufZaehlen(supabase as unknown as ZaehlClient, kundenlink.zeile, kundenlink.mitVersandSpalten);
      if (ersterAufruf) await glockeLaeuten(supabase, kundenlink, objekt as Record<string, unknown>, (wohnungen.data || []) as Array<Record<string, unknown>>);
    }
    const ansprechpartner = kundenlink.art === "gueltig" ? kundenlink.ansprechpartner : undefined;
    const sprache = kundenlink.art === "gueltig" ? kundenlink.sprache : undefined;

    /*
     * Ab hier geht nur noch heraus, was ausdruecklich erlaubt ist.
     *
     * Vorher lieferte diese Antwort die Zeilen unveraendert, also auch
     * `meta.investagonRaw` mit der eigenen Provision und den Adressen aller
     * Unterlagen bis hin zu Mietvertraegen, dazu `kunde_name` an reservierten
     * Einheiten. Die Investagon-Adressen sind ohne Anmeldung abrufbar, ein
     * Mietvertrag nennt den Mieter. Gefunden und abgedichtet am 16.09.2026.
     *
     * Die Listen stehen in `_shared/expose-oeffentlich.ts`. Positivliste, nicht Sperrliste:
     * Ein vergessenes Feld faellt dann auf, statt still hinauszugehen.
     *
     * Die Unterlagen gehen seit dem 23.09.2026 nur noch einzeln geprueft
     * hinaus, nach der Dokumenten-Ampel und nur mit oeffentlicher Adresse
     * (`unterlagen.ts`). Vorher liefen die Wohnungsunterlagen ungefiltert
     * durch, samt interner Namen und Ablagepfade (Befund 1 im Bauplan
     * Kundenansicht).
     *
     * Grundriss und Energieausweis aus Investagon gehen seit demselben Tag
     * nicht mehr als Originaladresse hinaus (`investagonRaw.files` faellt in
     * `_shared/expose-oeffentlich.ts` ganz weg). Die Grundrisse kommen nur zu einem gueltigen
     * Kundenlink, als Liste ohne Adresse; die Datei holt die Seite einzeln
     * ueber die Aktion „datei“. Ohne Schluessel gibt es keine.
     */
    const objektRoh = objekt as Record<string, unknown>;
    const objektZeilen = dokumente.data || [];
    const grundrisse = kundenlink.art === "gueltig"
      ? grundrisseZumLink({ link: kundenlink.bereich, objekt: objektRoh, objektZeilen, wohnungen: wohnungen.data || [] }).map(grundrissOhneAblage)
      : [];
    return new Response(JSON.stringify({
      objekt: oeffentlichesObjekt(objektRoh),
      bilder: bilder.data || [],
      dokumente: oeffentlicheUnterlagen({
        zeilen: objektZeilen,
        kategorie: "objektunterlagen",
        investagonRoh: (objektRoh.meta as Record<string, unknown> | null)?.investagonRaw,
      }),
      wohnungen: (wohnungen.data || []).map((w: any) => {
        // Images: prefer meta.bilder (where ObjektNeu stores them), fallback to wohnungs_bilder table
        const metaBilder = (w.meta?.bilder || []).filter((b: any) => b.url && !b.url.startsWith("data:"));
        const tableBilder = w.wohnungs_bilder || [];
        const allBilder = metaBilder.length > 0 ? metaBilder : tableBilder;

        return {
          ...oeffentlicheWohnung(w as Record<string, unknown>),
          bilder: allBilder,
          dokumente: oeffentlicheUnterlagen({
            zeilen: w.wohnungs_dokumente || [],
            metaEintraege: w.meta?.dokumente,
            kategorie: "wohnungsunterlagen",
            investagonRoh: w.meta?.investagonRaw,
          }),
        };
      }),
      // Nur mit gültigem Token eines Kunden-Exposés: Kennung, Bereich, Name, Bild ja oder nein. Keine Adresse.
      ...(grundrisse.length ? { grundrisse } : {}),
      // Nur mit gültigem Token eines Kunden-Exposés, nur die vier Felder.
      ...(ansprechpartner ? { ansprechpartner } : {}),
      // Nur mit gültigem Token: die Sprache des Kunden, sonst nichts über ihn.
      ...(sprache ? { sprache } : {}),
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Mit Token steht ein Partner darin, der zu diesem Link gehört. Eine
        // geteilte Zwischenablage (s-maxage) darf das nicht weiterreichen.
        "Cache-Control": token ? "private, no-store" : "public, max-age=60, s-maxage=120",
      },
    });

  } catch (e) {
    // Keine internen Fehlertexte nach außen, die Einzelheiten stehen im Protokoll.
    console.error("[get-expose]", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "Exposé konnte nicht geladen werden" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
