import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  abgelaufenAntwort, alleUnterlagen, auswahlLesen, baueAntwort, DATEI_GUELTIG_SEKUNDEN, findeDokument, INVESTMENT_KUNDE_SPALTE, kundeAusInvestment,
  kundenPartner, kundenStruktur, KUNDENLINK_SPALTEN, KUNDENLINK_SPALTEN_MIT_AUSWAHL, linkPruefen, pruefeAnfrage, vorschauErlaubt, wohnungsAuswahl,
  type Anfrage, type KundenlinkZeile, type KundenPartner, type Zugang,
} from "./antwort.ts";
import { aufrufZaehlen, glockenEmpfaenger, type ZaehlClient } from "../_shared/expose-kundenlink.ts";
import { exposeBezeichnung, kundenlinkGlockenText, kundenlinkGlockenTitel, versandSpalteFehlt } from "../_shared/kunden-expose.ts";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { spracheAusMeta, type Sprache } from "../_shared/kunden-sprache.ts";
import { ohneFremdePartner } from "../_shared/glocke-zustaendiger.ts";
import { pruefeKontaktZugriff } from "../_shared/kontakt-signatur-zugriff.ts";
import { ausgeschlosseneEinheiten, objektFuerBetrachter, objektSichtAusZeile, type ObjektBetrachter } from "../_shared/objekt-zugang.ts";

/**
 * Die Kundenansicht („Objektübersicht“), Bauplan vom 23.09.2026.
 *
 * Eine Function, zwei Zugänge, eine Antwort:
 *
 *   Kundenlink   `{ token }`, ohne Anmeldung. Der Schlüssel muss zu einer
 *                Zeile der Art `objektuebersicht` gehören, gültig und nicht
 *                zurückgezogen. Das erste Laden zählt (`aufruf: true`), beim
 *                allerersten Aufruf läutet die Glocke.
 *   Vorschau     `{ objektId, wohnungId?, investmentId? }` mit der Anmeldung
 *                von Admin, Inhaber, Vertriebsleitung oder Vertriebspartner
 *                (seit dem 05.10.2026). Zählt nichts, läutet nichts.
 *
 * Aktionen:
 *
 *   laden   Objekt, Bilder, freie Wohnungen, Einstieg, Unterlagen ohne
 *           Adressen, Partner. Alles läuft durch die Positivliste in
 *           `antwort.ts`.
 *   datei   eine befristete Adresse (15 Minuten) für genau eine Unterlage,
 *           erst nach erneuter Prüfung von Schlüssel, Wohnung und Ampel.
 *
 * Abgelaufen oder zurückgezogen: 410, und nur die vier Angaben des Partners.
 * Nach außen gehen nie interne Fehlertexte, die stehen im Protokoll.
 *
 * `verify_jwt = false` (config.toml), weil der Kundenlink ohne Anmeldung
 * kommt. Die Vorschau prüft die Anmeldung deshalb hier im Code.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // Die Antwort gehört zu genau diesem Link oder dieser Anmeldung. Keine
    // geteilte Zwischenablage darf sie weiterreichen.
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

const NICHT_GEFUNDEN = { error: "Diese Seite ist nicht verfügbar." };
const FEHLER = { error: "Die Seite konnte gerade nicht geladen werden." };

/**
 * Mengenbremse je Adresse des Aufrufers. Großzügig für einen Kunden, der
 * Wohnung für Wohnung durchklickt (das lädt ohnehin nichts nach), eng genug
 * gegen jemanden, der Schlüssel durchprobiert.
 */
const BREMSE = {
  laden: { perHour: 120, perDay: 600 },
  datei: { perHour: 300, perDay: 1500 },
} as const;

interface KontaktKurz {
  vorname: string | null;
  nachname: string | null;
  zustaendig_id: string | null;
  meta?: unknown;
  geloescht?: boolean | null;
}

/**
 * Wer die Seite gerade sieht, mit allem, was die Antwort über ihn braucht.
 * `auswahl`: die Wohnungen, die er sehen darf, `null` für alle freien.
 */
type Betrachter =
  | { art: "link"; zeile: KundenlinkZeile; kontakt: KontaktKurz | null; objektId: string; kontaktId: string | null; einstiegId: string | null; auswahl: string[] | null; partner: KundenPartner | undefined; sprache?: Sprache }
  | { art: "vorschau"; objektId: string; kontaktId: string | null; einstiegId: string | null; auswahl: string[] | null; partner: KundenPartner | undefined; sprache?: Sprache; zugang: ObjektBetrachter };

type Ergebnis<T> = { ok: true; wert: T } | { ok: false; antwort: Response };

async function partnerAus(db: SupabaseClient, partnerId: string | null | undefined): Promise<KundenPartner | undefined> {
  if (!partnerId) return undefined;
  const { data } = await db.from("profiles").select("name, telefon, email, avatar_url").eq("id", partnerId).maybeSingle();
  return kundenPartner(data);
}

/** Den Schlüssel prüfen. Jeder Lesefehler, auch eine fehlende Spalte, heißt „nicht gefunden“. */
async function betrachterAusLink(db: SupabaseClient, token: string): Promise<Ergebnis<Betrachter>> {
  const lesen = (spalten: string) => db.from("objekt_exposes").select(spalten).eq("token", token).maybeSingle();
  // Ohne die Spalte der Wohnungsauswahl (Migration 20261005100000) trägt
  // noch kein Link eine Auswahl, dann gilt wie bisher: alle freien. Nur bei
  // genau diesem Fehler, jeder andere bleibt „nicht gefunden“.
  let { data, error } = await lesen(KUNDENLINK_SPALTEN_MIT_AUSWAHL);
  if (error && versandSpalteFehlt(error)) ({ data, error } = await lesen(KUNDENLINK_SPALTEN));
  if (error) {
    console.warn("[get-kundenansicht] Linkzeile nicht lesbar (Migration 20260923171000?):", error.message);
    return { ok: false, antwort: json(NICHT_GEFUNDEN, 404) };
  }
  const zeile = (data as KundenlinkZeile | null) ?? null;
  const pruefung = linkPruefen(zeile);
  if (!zeile || pruefung === "unbekannt") return { ok: false, antwort: json(NICHT_GEFUNDEN, 404) };

  let kontakt: KontaktKurz | null = null;
  if (zeile.kontakt_id) {
    const { data: k } = await db.from("kontakte").select("vorname, nachname, zustaendig_id, meta, geloescht").eq("id", zeile.kontakt_id).maybeSingle();
    kontakt = (k as KontaktKurz | null) ?? null;
  }
  // Die Sprache des Kunden (Plan Kundensprache, Etappe 3). Ohne Kontakt schickt die Antwort keine, die Seite bleibt deutsch.
  const sprache = kontakt ? spracheAusMeta(kontakt.meta) : undefined;
  // Dieselbe Reihenfolge wie im Exposé: der zuständige Partner, sonst der Ersteller.
  const partner = await partnerAus(db, kontakt?.zustaendig_id || zeile.erstellt_von);
  if (pruefung === "abgelaufen") return { ok: false, antwort: json(abgelaufenAntwort(partner, sprache), 410) };

  return {
    ok: true,
    wert: {
      art: "link", zeile, kontakt, objektId: zeile.objekt_id, kontaktId: zeile.kontakt_id || null,
      einstiegId: zeile.einstieg_wohnung_id || null, auswahl: auswahlLesen(zeile.wohnung_auswahl), partner, sprache,
    },
  };
}

/**
 * Die Vorschau: nur mit Anmeldung einer Rolle mit Kundenaktionen. Kommt sie
 * aus der Objektauswahl eines Kunden (`investmentId`), für den der Aufrufer
 * handeln darf, steht dessen zuständiger Partner im Kasten und „für dich
 * reserviert“ gilt für diesen Kunden. Sonst steht der Angemeldete selbst im
 * Kasten.
 */
async function betrachterAusVorschau(
  req: Request,
  db: SupabaseClient,
  zugang: Extract<Zugang, { art: "vorschau" }>,
  einstiegId: string | null,
): Promise<Ergebnis<Betrachter>> {
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return { ok: false, antwort: json({ error: "Bitte melde dich an." }, 401) };
  const alsNutzer = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await alsNutzer.auth.getUser();
  if (!user) return { ok: false, antwort: json({ error: "Bitte melde dich an." }, 401) };
  const { data: rollen, error } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const rollenListe = ((rollen || []) as Array<{ role?: unknown }>).map((r) => r.role);
  if (error || !vorschauErlaubt(rollenListe)) {
    return { ok: false, antwort: json({ error: "Die Kundenansicht ist Admin, Inhaber, Vertriebsleitung und Vertriebspartnern vorbehalten." }, 403) };
  }

  let kontaktId: string | null = null;
  let zustaendig: string | null = null;
  // Mit Kunde: seine Sprache aus dem Kundenprofil, sonst bleibt die Seite deutsch (05.10.2026).
  let sprache: Sprache | undefined;
  if (zugang.investmentId) {
    const { data: inv } = await db.from("investments").select(INVESTMENT_KUNDE_SPALTE).eq("id", zugang.investmentId).maybeSingle();
    kontaktId = kundeAusInvestment(inv);
    /*
     * Den Kundenbezug (Partner im Kasten, „für dich reserviert“) gibt es nur
     * für einen Kunden, für den der Aufrufer handeln darf: dieselbe Regel
     * wie beim Kundenlink, ein Vertriebspartner also nur für eigene und
     * vertretene Kunden. Sonst bleibt die Vorschau neutral, wie ohne
     * Investment.
     */
    if (kontaktId) {
      const { erlaubt, kontakt } = await pruefeKontaktZugriff(
        db as unknown as Parameters<typeof pruefeKontaktZugriff>[0],
        alsNutzer as unknown as Parameters<typeof pruefeKontaktZugriff>[1],
        kontaktId,
        user.id,
      );
      if (erlaubt && kontakt) {
        zustaendig = kontakt.zustaendig_id || null;
        sprache = spracheAusMeta(kontakt.meta);
      } else kontaktId = null;
    }
  }
  const partner = await partnerAus(db, zustaendig || user.id);
  // Für ausgeblendete und fremde Exklusivobjekte (`ladeObjekt`).
  const { data: profil } = await db.from("profiles").select("name").eq("id", user.id).maybeSingle();
  const objektZugang: ObjektBetrachter = { rollen: rollenListe, benutzerId: user.id, name: (profil?.name as string | null) ?? null };
  return { ok: true, wert: { art: "vorschau", objektId: zugang.objektId, kontaktId, einstiegId, auswahl: zugang.auswahl, partner, sprache, zugang: objektZugang } };
}

/**
 * Für wen der Kundenlink fremd-exklusive Einheiten ausblendet: Ersteller,
 * Absender und der Zuständige des Kunden, je mit seinen Rollen. Eine Einheit
 * bleibt, wenn einer von ihnen sie sehen darf.
 */
async function linkBetrachter(db: SupabaseClient, b: Extract<Betrachter, { art: "link" }>): Promise<ObjektBetrachter[]> {
  const ids = [...new Set([b.zeile.erstellt_von, b.zeile.gesendet_von, b.kontakt?.zustaendig_id].filter((x): x is string => typeof x === "string" && x !== ""))];
  if (ids.length === 0) return [];
  const { data, error } = await db.from("user_roles").select("user_id, role").in("user_id", ids);
  if (error) throw new Error(`user_roles: ${error.message}`);
  const zeilen = (data || []) as Array<{ user_id: string; role: string }>;
  return ids.map((id) => ({ benutzerId: id, rollen: zeilen.filter((z) => z.user_id === id).map((z) => z.role) }));
}

/** Objekt und Einheiten, dazu die Bilder und Unterlagen der Einheiten. */
async function ladeObjekt(db: SupabaseClient, objektId: string, vorschau: ObjektBetrachter | null): Promise<Ergebnis<{
  objekt: Record<string, unknown>;
  wohnungen: Array<Record<string, unknown>>;
}>> {
  const { data: objekt, error } = await db.from("objekte").select("*").eq("id", objektId).maybeSingle();
  if (error) throw new Error(`objekte: ${error.message}`);
  if (!objekt) return { ok: false, antwort: json(NICHT_GEFUNDEN, 404) };
  /*
   * Vorschau eines Vertriebspartners: ausgeblendete und fremde
   * Exklusivobjekte gibt es für ihn nicht (05.10.2026). Wer Objekte pflegt,
   * bekommt unten weiter den Hinweis „ausgeblendet“.
   */
  if (vorschau && !objektFuerBetrachter(objektSichtAusZeile(objekt as Record<string, unknown>), vorschau)) {
    return { ok: false, antwort: json(NICHT_GEFUNDEN, 404) };
  }
  // Ein ausgeblendetes Objekt sieht kein Kunde. Die Vorschau sagt dem Admin, warum.
  if ((objekt as Record<string, unknown>).sichtbar === false) {
    return {
      ok: false,
      antwort: vorschau
        ? json({ error: "Das Objekt ist ausgeblendet. Kunden sehen es erst, wenn es wieder sichtbar ist.", ausgeblendet: true }, 409)
        : json(NICHT_GEFUNDEN, 404),
    };
  }
  const { data: wohnungen, error: wErr } = await db.from("wohnungen")
    .select("*, wohnungs_bilder(*), wohnungs_dokumente(*)")
    .eq("objekt_id", objektId);
  if (wErr) throw new Error(`wohnungen: ${wErr.message}`);
  return { ok: true, wert: { objekt: objekt as Record<string, unknown>, wohnungen: (wohnungen || []) as Array<Record<string, unknown>> } };
}

/** Die Glocke beim ersten Aufruf. Wirft nie, die Seite geht auch ohne sie hinaus. */
async function glockeLaeuten(
  db: SupabaseClient,
  b: Extract<Betrachter, { art: "link" }>,
  objekt: Record<string, unknown>,
  wohnungen: Array<Record<string, unknown>>,
): Promise<void> {
  const { zeile, kontakt } = b;
  if (!zeile.kontakt_id) return;
  try {
    // Regel vom 29.09.2026: Der Absender des Links bekommt die Glocke nur,
    // wenn ihm der Kunde noch gehoert oder er kein Vertriebspartner ist. Ohne
    // Zustaendigen erfaehrt es die Leitung, bei geloeschtem Kontakt nicht.
    const empfaenger = await ohneFremdePartner(
      db,
      glockenEmpfaenger(kontakt?.zustaendig_id, zeile.gesendet_von, zeile.erstellt_von),
      kontakt?.zustaendig_id,
      !!kontakt && kontakt.geloescht !== true,
    );
    if (empfaenger.length === 0) return;
    const einstieg = b.einstiegId ? wohnungen.find((w) => w.id === b.einstiegId) : undefined;
    const bezeichnung = exposeBezeichnung({
      mitEinheit: !!einstieg,
      weNr: typeof einstieg?.we_nr === "string" ? einstieg.we_nr : null,
      objektTitel: typeof objekt.titel === "string" ? objekt.titel : null,
      adresse: typeof objekt.adresse === "string" ? objekt.adresse : null,
      ort: typeof objekt.ort === "string" ? objekt.ort : null,
    });
    const { error } = await db.from("benachrichtigungen").insert(empfaenger.map((benutzerId) => ({
      benutzer_id: benutzerId,
      titel: kundenlinkGlockenTitel("objektuebersicht", kontakt?.vorname, kontakt?.nachname),
      nachricht: kundenlinkGlockenText("objektuebersicht", bezeichnung),
      link: `/kunden/${zeile.kontakt_id}`,
      gelesen: false,
    })));
    if (error) console.error("[get-kundenansicht] Glocke nicht gesetzt:", error.message);
  } catch (fehler) {
    console.error("[get-kundenansicht] Glocke nicht gesetzt:", fehler instanceof Error ? fehler.message : fehler);
  }
}

async function bearbeite(req: Request, anfrage: Anfrage, db: SupabaseClient): Promise<Response> {
  // ── Mengenbremse vor jeder Prüfung, auch vor der Anmeldung der Vorschau ──
  const bremse = await checkEdgeRateLimit({ scope: `get-kundenansicht-${anfrage.aktion}`, key: `ip:${clientIp(req)}`, ...BREMSE[anfrage.aktion] });
  if (!bremse.ok) return json({ error: "Zu viele Aufrufe, bitte versuche es später noch einmal." }, 429);

  // ── Wer schaut? ──
  const e = anfrage.zugang.art === "link"
    ? await betrachterAusLink(db, anfrage.zugang.token)
    : await betrachterAusVorschau(req, db, anfrage.zugang, anfrage.wohnungId);
  if (!e.ok) return e.antwort;
  const betrachter: Betrachter = e.wert;

  const geladen = await ladeObjekt(db, betrachter.objektId, betrachter.art === "vorschau" ? betrachter.zugang : null);
  if (!geladen.ok) return geladen.antwort;
  const { objekt, wohnungen } = geladen.wert;
  // Fremd-exklusive Einheiten: in der Vorschau für den Angemeldeten, beim Link
  // für Ersteller, Absender und Zuständigen des Kunden (05.10.2026).
  const ausgeschlossen = ausgeschlosseneEinheiten(
    wohnungen,
    betrachter.art === "vorschau" ? [betrachter.zugang] : await linkBetrachter(db, betrachter),
  );

  const objektDokumente = await db.from("objekt_dokumente").select("*").eq("objekt_id", betrachter.objektId);
  if (objektDokumente.error) throw new Error(`objekt_dokumente: ${objektDokumente.error.message}`);

  // ── laden ──
  if (anfrage.aktion === "laden") {
    const objektBilder = await db.from("objekt_bilder").select("*").eq("objekt_id", betrachter.objektId).order("reihenfolge");
    if (betrachter.art === "link" && anfrage.aufruf) {
      const { ersterAufruf } = await aufrufZaehlen(db as unknown as ZaehlClient, betrachter.zeile, true);
      if (ersterAufruf) await glockeLaeuten(db, betrachter, objekt, wohnungen);
    }
    const antwort = baueAntwort({
      objekt,
      objektBilder: objektBilder.data || [],
      wohnungen,
      objektDokumente: objektDokumente.data || [],
      kontaktId: betrachter.kontaktId,
      einstiegId: betrachter.einstiegId,
      auswahl: betrachter.auswahl,
      ausgeschlossen,
      partner: betrachter.partner,
      sprache: betrachter.sprache,
    });
    return json(antwort);
  }

  // ── datei: dieselbe Prüfung wie beim Laden, dann genau diese eine Datei ──
  const struktur = kundenStruktur(objekt, wohnungen.length);
  const auswahl = wohnungsAuswahl({
    struktur, objekt, wohnungen, kontaktId: betrachter.kontaktId, einstiegId: betrachter.einstiegId, auswahl: betrachter.auswahl,
    ausgeschlossen,
  });
  if (auswahl.nichtsMehrDa) return json(NICHT_GEFUNDEN, 404);
  const { dokumente } = alleUnterlagen({ struktur, objekt, objektDokumente: objektDokumente.data || [], sichtbar: auswahl.sichtbar.map((s) => s.zeile) });
  const dokument = findeDokument(dokumente, anfrage.dokument);
  if (!dokument) return json(NICHT_GEFUNDEN, 404);
  const { data: signiert, error } = await db.storage.from(dokument.ablage.eimer).createSignedUrl(dokument.ablage.pfad, DATEI_GUELTIG_SEKUNDEN);
  if (error || !signiert?.signedUrl) {
    console.error("[get-kundenansicht] Datei nicht signiert:", dokument.ablage.eimer, error?.message);
    return json(NICHT_GEFUNDEN, 404);
  }
  return json({ url: signiert.signedUrl, name: dokument.name });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Die Anfrage ist ungültig." }, 400);
  }
  const anfrage = pruefeAnfrage(body);
  if (!anfrage) return json({ error: "Die Anfrage ist ungültig." }, 400);

  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    return await bearbeite(req, anfrage, db);
  } catch (e) {
    // Keine internen Fehlertexte nach außen, die Einzelheiten stehen im Protokoll.
    console.error("[get-kundenansicht]", e instanceof Error ? e.message : e);
    return json(FEHLER, 500);
  }
});
