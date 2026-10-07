import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { meldeUnterschriebeneReservierung } from "../_shared/reservierung-unterschrieben-meldung.ts";
import {
  reserviereNachUnterschrift,
  reservierungNachUnterschrift,
  type EinheitDatenzugriff,
} from "../_shared/einheit-vormerkung.ts";
import {
  hausReservierungNachUnterschrift,
  reserviereObjektNachUnterschrift,
  type ObjektDatenzugriff,
} from "../_shared/objekt-belegung.ts";
import { reservierungWirksamAb } from "../_shared/widerrufsfrist.ts";
import { pruefeKontaktZugriff } from "../_shared/kontakt-signatur-zugriff.ts";
import {
  aktuelleRvAnfragen,
  erwarteteRvKaeufer,
  RV_AUFGEHOBEN,
  RV_UEBERHOLT_SCHLUESSEL,
  rundeVollstaendig,
  vorLetztemAufheben,
} from "../_shared/reservierung-anfragerunde.ts";
import { zustaendigOderLeitung } from "../_shared/glocke-zustaendiger.ts";
import { saGlockeLeitung } from "../_shared/sa-glocke.ts";
import { portalZugangFuer } from "../_shared/portal-verknuepfung.ts";

/**
 * Abschluss der Reservierungsvereinbarung nach einer Unterschrift.
 *
 * Gerufen von der Signaturseite nach jeder Unterschrift. Solange nicht alle
 * Kaeufer unterschrieben haben, meldet die Function nur den Stand. Mit der
 * letzten Unterschrift:
 *
 *   1. Das Datum der LETZTEN Unterschrift wird als Vertragsdatum vermerkt
 *      (`rvSignedAt`, `rvVertragsdatum`). Bei zwei Kaeufern gilt der Vertrag
 *      erst mit beiden Unterschriften (Punkt 8), und die Widerrufsfrist
 *      laeuft ab diesem Tag.
 *   2. Hat der Kunde in Abschnitt 7 gewaehlt, die Widerrufsfrist abzuwarten,
 *      bleibt die Wohnung frei. Im Investment steht dann `rvReservierungAb`
 *      (00:00 Uhr am 15. Tag nach der letzten Unterschrift); der taegliche Lauf in
 *      `send-reservierung-eskalation` stellt die Wohnung an diesem Tag auf
 *      reserviert, sofern sie noch frei ist. Entscheidung Christians vom
 *      15.09.2026. Bei „sofort" bleibt alles wie bisher.
 *   3. Die Vertragskopie: Die Signaturseite baut nach der letzten Unterschrift
 *      das vollstaendige PDF (nur der Browser hat Hausschrift und Logo) und
 *      reicht es hier als `pdfBase64` in einem zweiten Aufruf nach. Es wird
 *      im Bucket `unterlagen` abgelegt, im Kundenordner gespiegelt und an
 *      jeden Kaeufer gemailt (§ 312f Abs. 2 BGB). Genau einmal, der Riegel
 *      ist `rvKopieVersandtAm`.
 *   4. Seit dem 23.09.2026 (Christians Regeln zur Vormerkung): Reserviert
 *      wird nur, wenn die Einheit frei ist oder schon diesem Kunden gehoert,
 *      in einem Schritt ueber `reserviere_einheit_nach_unterschrift`. Eine
 *      laufende Vormerkung eines anderen Partners haelt die Unterschrift nicht
 *      auf, die erste Unterschrift gewinnt. Ist die Einheit inzwischen an
 *      einen anderen Kunden reserviert oder verkauft, gibt es KEINE
 *      Reservierung, sondern den Konfliktfall: Glocke an den Zustaendigen,
 *      ohne ihn an die Leitung („Einheit inzwischen vergeben"), Vermerk
 *      am Investment (`rvEinheitVergeben`, `rvReservierungEntfallenAm`) und in
 *      der Kundenakte. Die Vertragskopie geht trotzdem hinaus, denn
 *      unterschrieben ist unterschrieben (§ 312f Abs. 2 BGB), aber OHNE die
 *      Aufforderung, die Reservierungsgebuehr zu zahlen.
 *   5. Seit dem 23.09.2026 auch fuer ein ganzes Haus (Globalobjekt,
 *      `rvData.gesamtobjekt`). Dann wird nie eine Einheit reserviert, sondern
 *      das Haus ueber `reserviere_objekt_nach_unterschrift`, nach denselben
 *      Regeln: frei oder schon dieser Kunde, die erste Unterschrift gewinnt,
 *      sonst derselbe Konfliktfall mit Glocke, Vermerk und Kopie ohne
 *      Zahlungsaufforderung. Kauft eine Gesellschaft, gibt es keine
 *      Widerrufsfrist; die Reservierung wird sofort wirksam.
 *   6. Seit dem 24.09.2026 die interne Meldung mit Download: Sobald die PDF
 *      abgelegt ist, geht eine Mail an den zustaendigen Partner und an die
 *      Geschaeftsfuehrung (Empfaenger in `app_config`), mit einem Knopf, der
 *      die unterschriebene Vereinbarung herunterlaedt. Siehe
 *      `_shared/reservierung-unterschrieben-meldung.ts`. Sie ersetzt die
 *      fruehere Mail an den Partner ohne PDF. Kommt die PDF nicht an, holt
 *      `send-reservierung-eskalation` die Meldung am naechsten Morgen nach.
 *
 * Die Function verlangt keine Anmeldung, der Kunde ist beim Unterschreiben
 * nicht angemeldet. Alles, was ueber das Melden des Stands hinausgeht, haengt
 * deshalb am Token der Unterschriftsanfrage: Ort und PDF werden nur
 * angenommen, wenn der Token zu einer unterschriebenen Anfrage dieses
 * Kontakts gehoert.
 *
 * WARUM DIE HERAUSGABE GEPRUEFT WIRD (Audit-Befund F02 vom 15.09.2026):
 *
 * Bis zum 16.09.2026 hing die Herausgabe von `signatures` und `rvData` allein
 * an `allSigned`, also am Zustand des Vorgangs, und nicht daran, wer fragt.
 * Wer eine Kontakt-Id kannte, bekam damit die Unterschriftsbilder aller
 * Kaeufer und den vollstaendigen Inhalt der Reservierungsvereinbarung.
 * Gebraucht wurde dafuer nur der oeffentliche anon-Schluessel, und der steht
 * im ausgelieferten Frontend-Code.
 *
 * Seitdem gilt: Die Zaehlung (`allSigned`, `totalRequests`, `signedCount`)
 * bekommt weiterhin jeder, sie traegt keine personenbezogenen Daten und die
 * Fortschrittsanzeige im CRM kommt damit aus. Die Unterschriftsbilder und der
 * Vertragsinhalt gehen nur an zwei Gruppen, siehe `darfEinsehen`:
 *
 *   1. Wer den persoenlichen Unterschriftslink besitzt, also den Token einer
 *      Anfrage dieses Kontakts (`eigeneAnfrage`).
 *   2. Angemeldete Nutzer, die fuer diesen Kontakt handeln duerfen
 *      (`darfKontaktEinsehen`). Seit dem 05.10.2026 dieselbe Pruefung wie
 *      beim Versand (`pruefeKontaktZugriff`): Vertriebspartner nur eigene und
 *      vertretene Kunden, Rollen mit `darf_alle_kunden_sehen` alle. Vorher
 *      reichte jede interne Rolle, also auch ein fremder Vertriebspartner.
 *
 * Seit dem 05.10.2026 zaehlt nur die aktuelle Anfragerunde, siehe
 * `_shared/reservierung-anfragerunde.ts`. Eine Unterschrift aus einer
 * frueheren Runde zaehlt weder fuer den Abschluss noch als Nachweis des Links.
 *
 * Was bewusst NICHT geprueft wird: das Speichern, der Versand der
 * Vertragskopie, die Pipelinestufe und der ganze uebrige Ablauf. Die haengen
 * unveraendert an `eigeneAnfrage` beziehungsweise an `allSigned`. Geaendert
 * wurde ausschliesslich, WAS in der Antwort zurueckgeht.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Unterschrift = { signatureData: string; signedAt: string; name: string; ort?: string };

function antwort(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ZuBytes(b64: string): Uint8Array {
  const sauber = b64.replace(/^data:application\/pdf;base64,/, "").replace(/\s/g, "");
  const bin = atob(sauber);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** „30.09.2026" aus einem ISO-Zeitpunkt, fuer Mails und Meldungen. */
function datumDe(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Der spaeteste Unterschriftszeitpunkt, oder jetzt, falls keiner lesbar ist. */
function letzteUnterschrift(requests: any[]): string {
  let spaetester = 0;
  for (const r of requests) {
    const t = r?.signed_at ? new Date(r.signed_at).getTime() : NaN;
    if (!isNaN(t) && t > spaetester) spaetester = t;
  }
  return spaetester > 0 ? new Date(spaetester).toISOString() : new Date().toISOString();
}

/**
 * Darf der angemeldete Aufrufer fuer diesen Kontakt handeln?
 *
 * Dieselbe Regel wie beim Versand (`pruefeKontaktZugriff`). Ein Client mit
 * dem anon-Schluessel und dem fremden Header beantwortet ueber
 * `auth.getUser()`, wer fragt; die Rollenabfragen laufen mit diesem Client,
 * also als `authenticated`.
 *
 * Der anon-Schluessel ist selbst ein gueltiges JWT, gehoert aber zu keinem
 * Nutzer. Er wird zusaetzlich direkt verglichen, damit diese Unterscheidung
 * nicht still von der Fassung der Client-Bibliothek abhaengt.
 *
 * Wirft nicht: Wer hier nicht durchkommt, bekommt die Zaehlung ohne die
 * Unterschriften. Eine Stoerung darf den Abschluss nicht verhindern.
 */
async function darfKontaktEinsehen(
  req: Request,
  supabaseUrl: string,
  // deno-lint-ignore no-explicit-any
  admin: any,
  kontaktId: string,
): Promise<boolean> {
  try {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return false;
    if (anonKey && jwt === anonKey) return false;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return false;

    const { erlaubt } = await pruefeKontaktZugriff(admin, userClient as unknown as Parameters<typeof pruefeKontaktZugriff>[1], kontaktId, uid);
    return erlaubt === true;
  } catch (e) {
    console.error("Zugriffspruefung fehlgeschlagen:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Dateiname ohne Zeichen, die im Storage-Pfad stoeren. */
function sichererName(name: string): string {
  return name.replace(/[^\wäöüÄÖÜß\- ]+/g, "").trim().replace(/\s+/g, "_") || "Kunde";
}

/**
 * Das PDF ablegen, im Kundenordner spiegeln und an jeden Kaeufer mailen.
 *
 * Gibt das fortgeschriebene Meta zurueck; der Aufrufer schreibt es. Wirft
 * nicht: Eine Kopie, die nicht hinausgeht, darf die Unterschrift nicht
 * ungeschehen machen. Was schiefging, steht im Rueckgabewert.
 */
async function kopieAblegenUndVerschicken(
  // Der Typ des Clients haengt an der esm.sh-Fassung und ergibt als
  // Parametertyp nur `never`-Tabellen. Gebraucht wird er hier so lose, dass
  // jede Fassung passt, wie in transactional-versand.ts.
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: { investmentId: string; kontaktId: string; meta: Record<string, any>; pdfBase64: string; kundeName: string },
): Promise<{ meta: Record<string, any>; abgelegt: boolean; versendet: string[]; fehler: string[] }> {
  const { investmentId, kontaktId, meta, pdfBase64, kundeName } = args;
  const fehler: string[] = [];
  const versendet: string[] = [];
  const rvData = (meta.rvData ?? {}) as Record<string, any>;

  // 1. Ablegen, nach dem Muster der Aftersales-Beratung.
  const datum = datumDe(meta.rvVertragsdatum || meta.rvSignedAt || new Date().toISOString()).replace(/\./g, "-");
  const filename = `Reservierungsvereinbarung_${sichererName(kundeName)}_${datum}.pdf`;
  const pfad = `reservierung/${kontaktId}/${investmentId}/${filename}`;
  let abgelegt = false;
  try {
    const { error: upErr } = await supabase.storage.from("unterlagen").upload(pfad, base64ZuBytes(pdfBase64), {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) fehler.push(`Ablage: ${upErr.message}`);
    else abgelegt = true;
  } catch (e) {
    fehler.push(`Ablage: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Mail an jeden Kaeufer, mit dem PDF im Anhang.
  const empfaenger: { personType: string; name: string; email: string }[] = [];
  if (rvData.email) {
    empfaenger.push({ personType: "kaeufer1", name: `${rvData.vorname || ""} ${rvData.nachname || ""}`.trim(), email: String(rvData.email) });
  }
  if (rvData.hatPerson2 && rvData.p2Email) {
    empfaenger.push({ personType: "kaeufer2", name: `${rvData.p2Vorname || ""} ${rvData.p2Nachname || ""}`.trim(), email: String(rvData.p2Email) });
  }
  const berater = await zustaendigerAnsprechpartner(supabase as any, kontaktId);
  // Fuer den Portalabsatz der Mail: Knopf, "Zugangsdaten folgen" oder nichts.
  // Scheitert das Lesen, steht der Absatz einfach nicht da.
  const { data: kontaktZeile } = await supabase.from("kontakte").select("meta").eq("id", kontaktId).maybeSingle();
  for (const e of empfaenger) {
    const portalZugang = kontaktZeile ? portalZugangFuer(kontaktZeile.meta, e.personType) : undefined;
    const versand = await sendeVorlage(supabase as any, {
      templateName: "reservierung-kopie",
      recipientEmail: e.email,
      // Genau eine Kopie je Kaeufer und Investment, auch bei einem zweiten Aufruf.
      // Je Runde eine eigene Kopie (05.10.2026): nach Aufheben und neuer
      // Unterschrift geht wieder eine hinaus, wie bei der internen Meldung.
      idempotencyKey: `rv-kopie-${investmentId}-${meta.rvSignedAt || meta.rvSignatureSentAt || "erste"}-${e.personType}`,
      templateData: {
        name: e.name,
        objektTitel: meta.objektTitel || meta.objekt || undefined,
        widerrufWahl: rvData.widerrufWahl || undefined,
        reservierungAb: meta.rvReservierungAb ? datumDe(meta.rvReservierungAb) : undefined,
        // Ohne Gebuehr darf die Kopie weder eine Zahlung noch eine
        // Widerrufsbelehrung ankuendigen, die im PDF gar nicht steht.
        ohneGebuehr: rvData.gebuehrEntfaellt === true,
        // Einheit bei der Unterschrift schon vergeben: keine
        // Zahlungsaufforderung, stattdessen der Hinweis, nicht zu zahlen.
        ...(meta.rvEinheitVergeben ? { einheitVergeben: true } : {}),
        // Das ganze Haus: Die Mail sagt dann „das Objekt“ statt „die Wohnung“.
        ...(rvData.gesamtobjekt === true ? { gesamtobjekt: true } : {}),
        // Eine Gesellschaft bekommt keine Widerrufsbelehrung, die Mail darf keine ankuendigen.
        ...(rvData.gesamtobjekt === true && rvData.kaeuferArt === "gesellschaft" ? { ohneWiderruf: true } : {}),
        ...(portalZugang !== undefined ? { portalZugang } : {}),
        ...(berater ? { berater } : {}),
      },
      metadata: { kontakt_id: kontaktId, investment_id: investmentId, person_type: e.personType },
      attachments: [{ filename, content: pdfBase64, type: "application/pdf" }],
    });
    if (versand.ok) versendet.push(e.email);
    else fehler.push(`Mail an ${e.email}: ${versand.grund || "Versand fehlgeschlagen"}`);
  }

  // 3. Meta fortschreiben: Ablageort, Kundenordner, Riegel fuer den Versand.
  const kundenordner: any[] = Array.isArray(meta.kundenordner) ? [...meta.kundenordner] : [];
  if (abgelegt && !kundenordner.some((d) => d?.fileUrl === pfad)) {
    kundenordner.push({
      id: `ko-reservierung-${Date.now()}`,
      investmentId,
      kategorie: "Reservierungsvertrag",
      filename,
      uploadedBy: "System (Reservierungsvereinbarung)",
      uploadedAt: new Date().toISOString(),
      fileUrl: pfad,
      freigegeben: true,
    });
  }
  const nextMeta: Record<string, any> = {
    ...meta,
    ...(abgelegt
      ? {
        rvPdf: filename,
        rvPdfPath: pfad,
        docFileUrls: { ...((meta.docFileUrls as Record<string, string>) || {}), Reservierungsvertrag: pfad },
        kundenordner,
      }
      : {}),
    ...(versendet.length > 0 ? { rvKopieVersandtAm: new Date().toISOString(), rvKopieEmpfaenger: versendet } : {}),
  };
  return { meta: nextMeta, abgelegt, versendet, fehler };
}

/**
 * Die nachgereichte PDF verarbeiten: ablegen, Kopie an die Kaeufer, dann die
 * interne Meldung mit Download an Partner und Geschaeftsfuehrung. Beides
 * zusammen landet in EINEM Schreibvorgang am Investment.
 *
 * Die Meldung kommt nach der Ablage, weil erst dann `rvPdfPath` im Meta
 * steht und der Knopf etwas herunterzuladen hat. Wirft nicht.
 */
async function pdfNachgereicht(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: { investmentId: string; kontaktId: string; meta: Record<string, any>; pdfBase64: string; kundeName: string },
): Promise<{ abgelegt: boolean; versendet: string[]; fehler: string[]; gemeldet: string[] }> {
  const { investmentId, kontaktId, kundeName } = args;
  const ergebnis = await kopieAblegenUndVerschicken(supabase, args);
  let meta = ergebnis.meta;

  const meldung = await meldeUnterschriebeneReservierung(supabase, { investmentId, kontaktId, meta, kundeName });
  if (!meldung.bereitsGemeldet) {
    meta = { ...meta, ...meldung.metaPatch };
    if (meldung.hinweise.length > 0) console.warn(`Reservierungsmeldung ${investmentId}:`, meldung.hinweise);
    if (meldung.fehler.length > 0) console.error(`Reservierungsmeldung ${investmentId}:`, meldung.fehler);
  }

  const { error: metaFehler } = await supabase.from("investments").update({ meta }).eq("id", investmentId);
  if (metaFehler) ergebnis.fehler.push(`Meta: ${metaFehler.message}`);
  if (ergebnis.fehler.length > 0) console.error("Vertragskopie:", ergebnis.fehler);
  return { abgelegt: ergebnis.abgelegt, versendet: ergebnis.versendet, fehler: ergebnis.fehler, gemeldet: meldung.versendet };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { investmentId, kontaktId, signatureToken, ort, pdfBase64, widerrufWahl: widerrufWahlRoh } = await req.json();

    /*
     * Die Pflichtwahl aus Abschnitt 7 trifft der Kunde auf der
     * Unterschriftsseite; sie wird hier entgegengenommen und an der eigenen
     * Anfrage vermerkt. Nur die zwei erlaubten Werte zaehlen.
     */
    const wahlAusBody = widerrufWahlRoh === "abwarten" ? "abwarten" : widerrufWahlRoh === "sofort" ? "sofort" : null;

    if (!kontaktId) {
      return antwort({ error: "kontaktId ist Pflichtfeld" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get reservation signature requests (person_type starts with rv_)
    let query = supabase
      .from("signature_requests")
      .select("*")
      .eq("kontakt_id", kontaktId)
      .like("person_type", "rv_%");

    if (investmentId) {
      query = query.eq("investment_id", investmentId);
    }

    const { data: rawRequests, error: fetchError } = await query;

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return antwort({ error: "Fehler beim Laden der Signaturanfragen" }, 500);
    }

    if (!rawRequests || rawRequests.length === 0) {
      return antwort({ allSigned: false, reason: "Keine Reservierungs-Signaturanfragen gefunden" });
    }

    /*
     * Die Anfrage, die zum mitgeschickten Token gehoert. Nur eine
     * unterschriebene Anfrage dieses Kontakts zaehlt; damit haengt alles,
     * was ueber das Melden des Stands hinausgeht, am Besitz des Links.
     */
    /*
     * Reservierung aufgehoben (05.10.2026): Anfragen von vor dem letzten
     * Aufheben (`meta.rvZuletztAufgehobenAm`) zaehlen nicht mehr und werden
     * als ueberholt markiert. Gehoert der mitgeschickte Link dazu, lehnt die
     * Function ab.
     */
    const investmentIds = [...new Set((rawRequests as any[]).map((r) => String(r.investment_id ?? "")))]
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const metaJeInvestment = new Map<string, unknown>();
    if (investmentIds.length > 0) {
      const { data: invMetas, error: invMetaFehler } = await supabase.from("investments").select("id, meta").in("id", investmentIds);
      if (invMetaFehler) {
        console.error("Investments nicht lesbar:", invMetaFehler);
        return antwort({ error: "Investment konnte nicht geladen werden" }, 500);
      }
      for (const i of invMetas ?? []) metaJeInvestment.set(String(i.id), i.meta);
    }
    const aufgehoben = (r: any) => vorLetztemAufheben(r, metaJeInvestment.get(String(r.investment_id ?? "")));
    for (const r of (rawRequests as any[]).filter(aufgehoben)) {
      const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
      if (r.status !== "pending" && meta[RV_UEBERHOLT_SCHLUESSEL]) continue;
      const { error: markFehler } = await supabase.from("signature_requests").update({
        ...(r.status === "pending" ? { status: "ueberholt" } : {}),
        meta: { ...meta, [RV_UEBERHOLT_SCHLUESSEL]: meta[RV_UEBERHOLT_SCHLUESSEL] || new Date().toISOString() },
      }).eq("id", r.id);
      if (markFehler) console.error("Aufgehobene Anfrage nicht markiert:", markFehler);
    }
    if (signatureToken && (rawRequests as any[]).some((r) => r.token === signatureToken && aufgehoben(r))) {
      return antwort({ allSigned: false, aufgehoben: true, error: RV_AUFGEHOBEN.de, errorEn: RV_AUFGEHOBEN.en }, 410);
    }

    // Nur die aktuelle Runde: je Kaeufer die juengste, nicht ueberholte Anfrage.
    const requests = aktuelleRvAnfragen((rawRequests as any[]).filter((r) => !aufgehoben(r)));
    if (requests.length === 0) {
      return antwort({ allSigned: false, reason: "Keine Reservierungs-Signaturanfragen gefunden" });
    }
    const eigeneAnfrage = signatureToken
      ? requests.find((r: any) => r.token === signatureToken && r.status === "signed")
      : undefined;

    /*
     * Wer die Unterschriftsbilder und den Vertragsinhalt zu sehen bekommt.
     * Zum Warum siehe den Kopf der Datei (Audit-Befund F02).
     *
     * Zur ersten Bedingung: Es bleibt bewusst bei `eigeneAnfrage`, also bei
     * einer bereits UNTERSCHRIEBENEN Anfrage, und nicht bei jedem Token.
     * Zwei Gruende. Erstens braucht niemand sonst die Daten: Herausgegeben
     * wird ohnehin nur, wenn alle unterschrieben haben, und die einzige
     * Stelle, die ruft, ist die Signaturseite unmittelbar nach der eigenen
     * Unterschrift (`src/pages/SignaturSeite.tsx`). Wer den Link nur geoeffnet
     * und noch nicht unterschrieben hat, baut kein PDF und braucht die
     * Unterschrift des anderen Kaeufers nicht. Zweitens ist ein noch offener
     * Token ein Token, der unterwegs sein kann, etwa in einer weitergeleiteten
     * Mail; die geleistete Unterschrift ist der staerkere Nachweis. Der engere
     * Weg kostet hier also nichts und wird deshalb genommen.
     *
     * Der Rollencheck laeuft nur, wenn der Token nicht schon reicht. Das spart
     * dem Kunden, der den Normalfall ist, zwei Anfragen an die Datenbank.
     */
    const darfEinsehen = Boolean(eigeneAnfrage) ||
      await darfKontaktEinsehen(req, supabaseUrl, supabase, kontaktId);

    /*
     * Der Ort der Unterschrift, freiwillig, an der eigenen Anfrage vermerkt.
     * Er steht in `sa_data`, weil die Tabelle keine Spalte dafuer hat und
     * eine Migration fuer ein freiwilliges Feld nicht lohnt. Jeder Kaeufer
     * hat seine eigene Zeile, der Ort bleibt also je Unterschrift erhalten.
     */
    const ortText = typeof ort === "string" ? ort.trim().slice(0, 80) : "";
    if (eigeneAnfrage && (ortText || wahlAusBody)) {
      const saData = {
        ...((eigeneAnfrage.sa_data as Record<string, unknown>) ?? {}),
        ...(ortText ? { unterschriftOrt: ortText } : {}),
        // Die Widerrufs-Wahl des Unterzeichners, ebenfalls ohne eigene Spalte.
        ...(wahlAusBody ? { widerrufWahl: wahlAusBody } : {}),
      };
      const { error: ortFehler } = await supabase
        .from("signature_requests")
        .update({ sa_data: saData })
        .eq("id", eigeneAnfrage.id);
      if (ortFehler) console.error("Ort der Unterschrift konnte nicht vermerkt werden:", ortFehler);
      else eigeneAnfrage.sa_data = saData;
    }

    // Vollstaendig erst, wenn alle erwarteten Kaeufer dieser Runde unterschrieben haben.
    const allSigned = rundeVollstaendig(requests, requests[0]?.sa_data);
    const signatures: Record<string, Unterschrift> = {};

    for (const r of requests) {
      if (r.status === "signed") {
        const ortDerUnterschrift = (r.sa_data as Record<string, unknown> | null)?.unterschriftOrt;
        signatures[r.person_type] = {
          signatureData: r.signature_data,
          signedAt: r.signed_at,
          name: r.name,
          ...(typeof ortDerUnterschrift === "string" && ortDerUnterschrift ? { ort: ortDerUnterschrift } : {}),
        };
      }
    }

    if (allSigned && investmentId) {
      const { data: inv, error: invError } = await supabase
        .from("investments")
        .select("meta, kunde_id, kaufpreis")
        .eq("id", investmentId)
        .maybeSingle();

      if (invError) {
        console.error("Failed to load investment:", invError);
        return antwort({ error: "Investment konnte nicht geladen werden" }, 500);
      }

      if (!inv) {
        return antwort({ error: "Investment nicht gefunden" }, 404);
      }

      const currentMeta = (inv.meta as Record<string, any>) || {};

      // Build a human-readable filename using the customer's name
      const { data: kontaktForName } = await supabase
        .from("kontakte")
        .select("vorname, nachname")
        .eq("id", kontaktId)
        .single();

      const kundeVorname = kontaktForName?.vorname || "Kunde";
      const kundeNachname = kontaktForName?.nachname || "";
      const kundeName = `${kundeVorname} ${kundeNachname}`.trim() || requests[0]?.name || "Kunde";

      /*
       * IDEMPOTENZ: Wenn die RV bereits als signiert markiert ist, KEINE
       * Side-Effects (Benachrichtigungen, Aktivitaet, Email) erneut erzeugen.
       * Einzige Ausnahme ist die nachgereichte Kopie, und die genau einmal.
       */
      if (currentMeta.rvSigned === true && currentMeta.rvSignedAt) {
        let kopie: { abgelegt: boolean; versendet: string[]; fehler: string[] } | undefined;
        if (typeof pdfBase64 === "string" && pdfBase64 && eigeneAnfrage && !currentMeta.rvKopieVersandtAm) {
          const ergebnis = await pdfNachgereicht(supabase, {
            investmentId, kontaktId, meta: currentMeta, pdfBase64, kundeName,
          });
          // Nur die Kopie geht an den Browser zurueck, die Empfaenger der
          // internen Meldung gehen ihn nichts an.
          kopie = { abgelegt: ergebnis.abgelegt, versendet: ergebnis.versendet, fehler: ergebnis.fehler };
        }
        return antwort({
          allSigned: true,
          alreadyFinalized: true,
          totalRequests: requests.length,
          signedCount: requests.filter((r: any) => r.status === "signed").length,
          // Nur mit Nachweis, siehe `darfEinsehen`. `kopie` haengt ohnehin an
          // `eigeneAnfrage` und braucht deshalb keine eigene Bedingung.
          signatures: darfEinsehen ? signatures : undefined,
          rvData: darfEinsehen ? currentMeta.rvData : undefined,
          ...(kopie ? { kopie } : {}),
        });
      }

      /*
       * Das Vertragsdatum ist die letzte Unterschrift, nicht der Zeitpunkt
       * dieses Aufrufs. Bei zwei Kaeufern liegt zwischen beiden oft ein Tag;
       * die Widerrufsfrist laeuft ab dem Vertragsabschluss, also ab der
       * zweiten Unterschrift.
       */
      const signedAt = letzteUnterschrift(requests);
      const rvData = (requests[0]?.sa_data || currentMeta.rvData || {}) as Record<string, any>;
      /*
       * Massgeblich ist die Wahl, die der Kunde auf der Unterschriftsseite
       * getroffen hat: zuerst der mitgeschickte Wert dieses Aufrufs, sonst
       * der an einer unterschriebenen Anfrage vermerkte (die zuletzt
       * unterschriebene zuerst), sonst der Stand aus dem Formular.
       */
      let wahlVonAnfrage: string | null = null;
      const nachUnterschrift = [...requests].sort(
        (a, b) => new Date(b.signed_at ?? 0).getTime() - new Date(a.signed_at ?? 0).getTime(),
      );
      for (const r of nachUnterschrift) {
        const w = (r.sa_data as Record<string, unknown> | null)?.widerrufWahl;
        if (w === "abwarten" || w === "sofort") {
          wahlVonAnfrage = w;
          break;
        }
      }
      /*
       * Ohne Reservierungsgebuehr gibt es keine Widerrufsfrist.
       *
       * Seit dem 22.09.2026 kann eine Reservierung ohne Gebuehr angelegt
       * werden (`gebuehrEntfaellt`); dann entfaellt die Widerrufsthematik im
       * Dokument, siehe `WIDERRUF_ENTFAELLT_OHNE_GEBUEHR` in
       * `src/lib/reservierungErklaerung.ts`. Eine Wahl, die aus einem aelteren
       * Entwurf noch im Datensatz liegt, darf dann nicht dazu fuehren, dass
       * die Wohnung vierzehn Tage lang frei bleibt. Nur ein ausdrueckliches
       * `true` zaehlt, jede aeltere Reservierung verhaelt sich unveraendert.
       */
      const ohneGebuehr = rvData.gebuehrEntfaellt === true;
      /*
       * Das ganze Haus (Globalobjekt), seit dem 23.09.2026. Kauft dort eine
       * Gesellschaft, ist sie kein Verbraucher; die Vereinbarung enthaelt dann
       * keine Widerrufsbelehrung und keine Wahl, siehe `vertragsAufbau` in
       * `src/lib/reservierungErklaerung.ts`.
       */
      const gesamtobjekt = rvData.gesamtobjekt === true;
      const ohneWiderruf = ohneGebuehr || (gesamtobjekt && rvData.kaeuferArt === "gesellschaft");
      const widerrufWahl = ohneWiderruf
        ? "sofort"
        // Die Wahl aus dem Aufruf nur mit eigener, aktueller Anfrage (Token).
        // Ohne erkennbare Wahl wird die Frist abgewartet: das schuetzt den Kunden.
        : (eigeneAnfrage ? wahlAusBody : null) ?? wahlVonAnfrage ?? (rvData.widerrufWahl === "sofort" ? "sofort" : "abwarten");
      // Die getroffene Wahl gehoert in den Datensatz, der ins PDF und Meta geht.
      rvData.widerrufWahl = widerrufWahl;
      // 00:00 Uhr deutscher Zeit am 15. Tag nach der letzten Unterschrift,
      // siehe `_shared/widerrufsfrist.ts`.
      const reservierungAb = widerrufWahl === "abwarten" ? reservierungWirksamAb(signedAt) : null;
      const rvPdfFilename = `Reservierung (${kundeVorname} ${kundeNachname}).pdf`;

      /*
       * Der Ablageort gehoert zur Unterschrift, die ihn geschrieben hat. Nach
       * „Reservierung aufheben“ bleibt `rvPdfPath` der alten Fassung stehen
       * (geschuetzter Schluessel). Ab hier ist rvSigned wieder true, und bis
       * das neue PDF nachgereicht ist, oeffnete das Portal sonst die
       * aufgehobene Datei und die interne Meldung verlinkte sie. Die Ablage
       * weiter unten schreibt beides neu. Ein Verweis in docFileUrls zaehlt
       * nur dann als alt, wenn er derselbe Pfad ist (kein Upload von Hand).
       */
      const alterPfad = typeof currentMeta.rvPdfPath === "string" ? currentMeta.rvPdfPath : "";
      const docFileUrlsOhneAlt = { ...((currentMeta.docFileUrls as Record<string, string>) || {}) };
      if (alterPfad && docFileUrlsOhneAlt.Reservierungsvertrag === alterPfad) delete docFileUrlsOhneAlt.Reservierungsvertrag;

      const nextMeta: Record<string, any> = {
        ...currentMeta,
        ...(alterPfad ? { rvPdfPath: null, docFileUrls: docFileUrlsOhneAlt } : {}),
        rvSigned: true,
        rvSignedAt: signedAt,
        rvVertragsdatum: signedAt,
        rvSignatures: signatures,
        rvPdf: currentMeta.rvPdf || rvPdfFilename,
        rvData,
        rvSignaturePending: false,
        rvWiderrufWahl: widerrufWahl,
        // Beim Abwarten: ab wann die Reservierung wirksam wird. Der taegliche
        // Lauf traegt dann `rvReservierungWirksamAm` nach oder, wenn die
        // Wohnung inzwischen weg ist, `rvReservierungEntfallenAm`.
        rvReservierungAb: reservierungAb,
        rvReservierungWirksamAm: widerrufWahl === "sofort" ? signedAt : null,
        // Eine neue Unterschrift beginnt sauber. Stand hier noch der Vermerk
        // einer frueheren, entfallenen Reservierung, zeigten Kundenprofil und
        // Portal sonst auch die neue als entfallen.
        rvReservierungEntfallenAm: null,
        rvReservierungEntfallenGrund: null,
        rvEinheitVergeben: null,
        // Die interne Meldung mit Download steht aus, bis die PDF da ist.
        // Das Merkmal ist zugleich der Auftrag an den taeglichen Lauf, falls
        // die PDF nie ankommt. Eine fruehere Meldung am selben Investment
        // gehoert zu einer frueheren Unterschrift.
        rvUnterschriebenMeldungOffen: true,
        rvUnterschriebenGemeldetAm: null,
        rvUnterschriebenGemeldetAn: null,
        rvUnterschriebenMeldungFehler: null,
        pipelineStufe: currentMeta.pipelineStufe || "reservierung",
      };

      const { error: updateError } = await supabase
        .from("investments")
        .update({ meta: nextMeta })
        .eq("id", investmentId);

      if (updateError) {
        console.error("Failed to persist signed state:", updateError);
        return antwort({ error: "Unterschrift konnte nicht gespeichert werden" }, 500);
      }

      // Beim ganzen Haus gibt es keine Einheit, die reserviert wuerde.
      let resolvedWohnungId = gesamtobjekt ? null : (nextMeta.wohnungId || null);
      if (!gesamtobjekt && !resolvedWohnungId && nextMeta.objektId && nextMeta.weNr) {
        const { data: wohnungByMeta } = await supabase
          .from("wohnungen")
          .select("id")
          .eq("objekt_id", nextMeta.objektId)
          .eq("we_nr", nextMeta.weNr)
          .maybeSingle();
        resolvedWohnungId = wohnungByMeta?.id || null;
      }

      // Der Kontakt vorab: sein Partner steht als Ausloeser der Reservierung da,
      // wenn die Vormerkung des Absenders nicht mehr an der Einheit steht.
      const { data: kontakt } = await supabase
        .from("kontakte")
        .select("vorname, nachname, zustaendig_id")
        .eq("id", kontaktId)
        .single();

      /*
       * Der Konfliktfall (Regel 4): Die Einheit ist inzwischen an einen
       * anderen Kunden reserviert oder verkauft, oder sie gehoert zu einem
       * Globalobjekt. Dann wird nichts reserviert.
       */
      let konflikt: {
        ergebnis: "vergeben" | "globalobjekt" | "kein_globalobjekt";
        status?: string | null;
        kundeId?: string | null;
        kundeName?: string | null;
      } | null = null;
      let metaGeaendert = false;
      /** Beim ganzen Haus: warum es technisch nicht eingetragen werden konnte. */
      let hausFehler: string | null = null;
      const hausObjektId: string | null = gesamtobjekt ? (nextMeta.objektId || null) : null;

      if (gesamtobjekt) {
        /*
         * Das ganze Haus. Nach denselben Regeln wie die Einheit: beim
         * Abwarten bleibt es frei, ist es aber JETZT schon an einen anderen
         * Kunden vergeben, greift der Konfliktfall sofort. Sonst reserviert
         * die Datenbank in einem Schritt, frei oder schon dieser Kunde.
         */
        if (!hausObjektId) {
          hausFehler = "kein Objekt am Vorgang";
          console.warn(`Reservierung ${investmentId}: Gesamtobjekt ohne objektId, nichts reserviert.`);
        } else if (widerrufWahl === "abwarten") {
          console.log(`Reservierung ${investmentId}: Widerrufsfrist wird abgewartet, das Haus bleibt bis ${reservierungAb} frei.`);
          const { data: haus } = await supabase
            .from("objekte").select("belegung, belegung_kunde_id, belegung_kunde_name").eq("id", hausObjektId).maybeSingle();
          if (haus && hausReservierungNachUnterschrift({ belegung: haus.belegung, kundeId: haus.belegung_kunde_id }, kontaktId) === "vergeben") {
            konflikt = { ergebnis: "vergeben", status: haus.belegung, kundeId: haus.belegung_kunde_id, kundeName: haus.belegung_kunde_name };
          }
        } else {
          const haus = await reserviereObjektNachUnterschrift(supabase as unknown as ObjektDatenzugriff, {
            objektId: hausObjektId,
            kontaktId,
            // Bei einer Gesellschaft steht die Firma vorn, der Kontakt ist ihr Vertreter.
            kundeName: rvData.kaeuferArt === "gesellschaft" && rvData.firma
              ? `${String(rvData.firma).trim()} (${kundeName})`
              : kundeName,
            reserviertAm: signedAt,
            reserviertVon: kontakt?.zustaendig_id || null,
          });
          if (haus.ergebnis === "vergeben") {
            konflikt = { ergebnis: "vergeben", status: haus.belegung, kundeId: haus.kundeId, kundeName: haus.kundeName };
          } else if (haus.ergebnis === "kein_globalobjekt") {
            konflikt = { ergebnis: "kein_globalobjekt" };
          } else if (haus.ergebnis === "fehler" || haus.ergebnis === "nicht_gefunden") {
            hausFehler = haus.fehler || "Objekt nicht gefunden";
            console.error(`Reservierung ${investmentId}: Haus ${hausObjektId} nicht eingetragen:`, hausFehler);
          }
        }
      } else if (resolvedWohnungId && widerrufWahl === "abwarten") {
        /*
         * Die Wohnung bleibt frei, so steht es in Abschnitt 7. Der taegliche
         * Lauf in send-reservierung-eskalation stellt sie am Tag
         * `rvReservierungAb` auf reserviert, sofern sie dann noch frei ist.
         * Ist sie schon JETZT an einen anderen Kunden vergeben, soll der
         * Kunde nicht vierzehn Tage auf eine Absage warten: Der Konfliktfall
         * greift sofort.
         */
        console.log(`Reservierung ${investmentId}: Widerrufsfrist wird abgewartet, Wohnung bleibt bis ${reservierungAb} frei.`);
        const { data: stand } = await supabase
          .from("wohnungen").select("status, kunde_id, kunde_name").eq("id", resolvedWohnungId).maybeSingle();
        if (stand && reservierungNachUnterschrift({ status: stand.status, kundeId: stand.kunde_id }, kontaktId) === "vergeben") {
          konflikt = { ergebnis: "vergeben", status: stand.status, kundeId: stand.kunde_id, kundeName: stand.kunde_name };
        }
      } else if (resolvedWohnungId) {
        // Bedingt reservieren: frei oder schon dieser Kunde, sonst Konflikt.
        const ergebnis = await reserviereNachUnterschrift(supabase as unknown as EinheitDatenzugriff, {
          wohnungId: resolvedWohnungId,
          kontaktId,
          kundeName,
          reserviertAm: signedAt,
          reserviertVon: kontakt?.zustaendig_id || null,
        });
        if (ergebnis.ergebnis === "vergeben" || ergebnis.ergebnis === "globalobjekt") {
          konflikt = { ergebnis: ergebnis.ergebnis, status: ergebnis.status, kundeId: ergebnis.kundeId, kundeName: ergebnis.kundeName };
        } else if (ergebnis.ergebnis === "fehler") {
          console.error("Failed to sync reserved wohnung:", ergebnis.fehler);
        } else if (ergebnis.ergebnis === "nicht_gefunden") {
          console.warn(`Wohnung ${resolvedWohnungId} zur Reservierung ${investmentId} nicht gefunden`);
        }
      } else {
        console.warn(`No wohnungId available for signed reservation ${investmentId}`);
      }

      if (resolvedWohnungId && nextMeta.wohnungId !== resolvedWohnungId) {
        nextMeta.wohnungId = resolvedWohnungId;
        metaGeaendert = true;
      }
      if (konflikt) {
        const jetzt = new Date().toISOString();
        nextMeta.rvReservierungWirksamAm = null;
        nextMeta.rvReservierungEntfallenAm = jetzt;
        nextMeta.rvReservierungEntfallenGrund = konflikt.ergebnis === "globalobjekt"
          ? "Einheit eines Globalobjekts, sie wird nicht einzeln reserviert"
          : konflikt.ergebnis === "kein_globalobjekt"
          ? "Das Objekt ist kein Globalobjekt mehr und wird nicht als Ganzes reserviert"
          // Ohne den Namen des anderen Kunden: Das Investment liest auch
          // dieser Kunde ueber sein Portal.
          : `${gesamtobjekt ? "Haus" : "Einheit"} bei der Unterschrift schon anderweitig ${konflikt.status === "verkauft" ? "verkauft" : "reserviert"}`;
        nextMeta.rvEinheitVergeben = {
          am: jetzt,
          wohnungId: resolvedWohnungId,
          ...(gesamtobjekt ? { objektId: hausObjektId, gesamtobjekt: true } : {}),
          grund: konflikt.ergebnis,
          status: konflikt.status ?? null,
        };
        metaGeaendert = true;
        console.warn(`Reservierung ${investmentId}: ${gesamtobjekt ? `Haus ${hausObjektId}` : `Einheit ${resolvedWohnungId}`} inzwischen vergeben (${konflikt.ergebnis}), keine Reservierung.`);
      }
      if (metaGeaendert) {
        const { error: vermerkFehler } = await supabase.from("investments").update({ meta: nextMeta }).eq("id", investmentId);
        if (vermerkFehler) console.error("Vermerk am Investment nicht gespeichert:", vermerkFehler);
      }

      const notifKundeName = kontakt
        ? `${kontakt.vorname} ${kontakt.nachname}`
        : kundeName;

      const wirksamHinweis = reservierungAb
        ? ` Der Kunde wartet die Widerrufsfrist ab, die Reservierung wird ab ${datumDe(reservierungAb)} wirksam; bis dahin bleibt ${gesamtobjekt ? "das Haus" : "die Wohnung"} frei.`
        : "";
      /*
       * Unterschrieben, aber das Haus liess sich nicht eintragen, etwa weil
       * die Migration fehlt. Dann haelt niemand das Haus fest, obwohl der
       * Vertrag es verspricht; das muss sofort jemand sehen.
       */
      const hausFehlerHinweis = hausFehler
        ? ` Achtung: Das Haus konnte nicht als reserviert eingetragen werden (${hausFehler}). Bitte sofort pruefen lassen, sonst haelt niemand das Haus fest.`
        : "";
      const objektName = currentMeta.objektTitel || currentMeta.objekt || "";
      /*
       * Im Konfliktfall ersetzt die Glocke „Einheit inzwischen vergeben" die
       * gewohnte Meldung. Eine zweite Glocke „unterschrieben" daneben laese
       * sich wie ein Erfolg.
       */
      const notifTitle = konflikt
        ? (gesamtobjekt ? `Haus inzwischen vergeben: ${notifKundeName}` : `Einheit inzwischen vergeben: ${notifKundeName}`)
        : `Reservierungsvereinbarung unterschrieben: ${notifKundeName}`;
      const notifMsg = konflikt && gesamtobjekt
        ? `${notifKundeName} hat die Reservierungsvereinbarung fuer das ganze Haus${objektName ? ` (${objektName})` : ""} unterschrieben, das Haus ist aber ` +
          (konflikt.ergebnis === "kein_globalobjekt"
            ? "kein Globalobjekt mehr und wird nicht als Ganzes reserviert. "
            : konflikt.status === "verkauft"
            ? "inzwischen verkauft. "
            : "inzwischen an einen anderen Kunden reserviert. ") +
          "Es wurde nichts reserviert, und an den Kunden ging keine Zahlungsaufforderung. Bitte den Kunden informieren."
        : konflikt
        ? `${notifKundeName} hat die Reservierungsvereinbarung unterschrieben, die Einheit${objektName ? ` (${objektName})` : ""} ist aber ` +
          (konflikt.ergebnis === "globalobjekt"
            ? "Teil eines Globalobjekts und wird nicht einzeln reserviert. "
            : konflikt.status === "verkauft"
            ? "inzwischen verkauft. "
            : konflikt.kundeId
            ? "inzwischen an einen anderen Kunden reserviert. "
            // Status reserviert ohne Kunden im CRM setzt der Investagon-Abgleich.
            : "inzwischen reserviert, ohne Kunden im CRM (Stand aus Investagon). ") +
          "Es wurde nichts reserviert, und an den Kunden ging keine Zahlungsaufforderung. Bitte den Kunden informieren und eine andere Einheit anbieten."
        : `Die Reservierungsvereinbarung von ${notifKundeName} wurde unterschrieben.${wirksamHinweis}${hausFehlerHinweis} Das PDF ist unter Reservierung verfügbar.`;

      // Idempotenter Insert: pro Benutzer darf diese Benachrichtigung nur EINMAL
      // existieren (auch bei mehrfachen Trigger-Aufrufen der Edge Function).
      const insertNotifOnce = async (userId: string) => {
        const { data: existing } = await supabase
          .from("benachrichtigungen")
          .select("id")
          .eq("benutzer_id", userId)
          .eq("titel", notifTitle)
          .eq("link", `/kunden/${kontaktId}`)
          .limit(1)
          .maybeSingle();
        if (existing) return;
        await supabase.from("benachrichtigungen").insert({
          benutzer_id: userId,
          titel: notifTitle,
          nachricht: notifMsg,
          link: `/kunden/${kontaktId}`,
          gelesen: false,
        });
      };

      /*
       * Die Glocke (Regel vom 29.09.2026, hier seit dem 05.10.2026): nur an
       * den aktuell Zustaendigen, ohne ihn an Admin, Inhaber und
       * Vertriebsleitung. Die Kopie an eine Vertretung legt der Trigger
       * `trg_benachrichtigung_an_vertretung` an. Bis zum 05.10.2026 bekam die
       * Leitung die Glocke immer zusaetzlich. Ausnahme: Liess sich das Haus
       * technisch nicht eintragen, erfaehrt es die Leitung immer, denn das
       * kann der Partner nicht beheben.
       */
      let glockenEmpfaenger: string[] = [];
      try {
        glockenEmpfaenger = (await zustaendigOderLeitung(supabase, kontaktId)) ?? await saGlockeLeitung(supabase);
        if (hausFehler) glockenEmpfaenger = [...new Set([...glockenEmpfaenger, ...await saGlockeLeitung(supabase)])];
      } catch (e) {
        console.error("Glockenempfaenger nicht ermittelbar:", e instanceof Error ? e.message : String(e));
      }
      for (const uid of glockenEmpfaenger) {
        await insertNotifOnce(uid);
      }

      /*
       * Die Mail an den Partner stand bis zum 24.09.2026 hier und ging ohne
       * PDF hinaus. Jetzt geht sie erst mit der abgelegten PDF, an Partner
       * und Geschaeftsfuehrung, siehe `pdfNachgereicht`. Im Konfliktfall
       * geht keine Mail hinaus (keine Reservierung, keine Meldung), der
       * Partner erfaehrt es ueber die Glocke.
       */

      /*
        Hier stand bis zum 11.09.2026 die Meldung an den Finanzierungspartner,
        ausgeloest von der unterschriebenen Reservierungsvereinbarung. Das war
        eine Stufe zu frueh.

        Der Ablauf lautet: Objektauswahl, Reservierung, Bonitaetsunterlagen,
        Finanzierung, Notar. Zwischen Unterschrift und Finanzierung liegen die
        Bonitaetsunterlagen, und die koennen Wochen dauern. Der
        Finanzierungspartner bekam also eine Aufgabe, an der er noch gar nicht
        arbeiten konnte, weil ihm die Unterlagen fehlten, und musste sie
        liegen lassen oder nachfragen.

        Gerufen wird er jetzt an der richtigen Stelle, naemlich wenn alle
        Bonitaetsunterlagen hochgeladen und freigegeben sind. Das erledigt
        `meldeBonitaetFreigabe` (`src/lib/bonitaetFreigabeMeldung.ts`), gerufen
        aus der Unterlagenpruefung im Kundenprofil, zusammen mit der Mail aus
        `bonitaet-freigabe-mail`. Dieselbe Meldung geht dort genau einmal je
        Investment hinaus, der Riegel dafuer ist das Merkmal
        `bonitaetFreigabeGemeldetAm` am Investment.

        Entscheidung Christians vom 11.09.2026.
      */

      // Create activity entry. Im Konfliktfall ist das zugleich der Vermerk
      // in der Kundenakte.
      await supabase.from("aktivitaeten").insert({
        kunde_id: kontaktId,
        art: "reservierung",
        beschreibung: konflikt
          ? `Reservierungsvereinbarung von ${notifKundeName} unterschrieben, ${gesamtobjekt ? "Haus" : "Einheit"}${objektName ? ` ${objektName}` : ""} inzwischen vergeben: keine Reservierung, keine Zahlungsaufforderung`
          : `Reservierungsvereinbarung von ${notifKundeName} unterschrieben${reservierungAb ? ` (Reservierung wirksam ab ${datumDe(reservierungAb)})` : ""}`,
        datum: new Date().toISOString(),
      });

      /*
       * Falls das PDF schon mit diesem Aufruf kam. In der Regel reicht die
       * Signaturseite es erst im zweiten Aufruf nach, weil sie die anderen
       * Unterschriften erst aus dieser Antwort erfaehrt.
       */
      let kopie: { abgelegt: boolean; versendet: string[]; fehler: string[] } | undefined;
      if (typeof pdfBase64 === "string" && pdfBase64 && eigeneAnfrage) {
        const ergebnis = await pdfNachgereicht(supabase, {
          investmentId, kontaktId, meta: nextMeta, pdfBase64, kundeName,
        });
        kopie = { abgelegt: ergebnis.abgelegt, versendet: ergebnis.versendet, fehler: ergebnis.fehler };
      }

      console.log(`Reservierung signed for kontakt ${kontaktId}, investment ${investmentId}. Kunde: ${notifKundeName}. Wahl: ${widerrufWahl}.`);

      return antwort({
        allSigned: true,
        totalRequests: requests.length,
        signedCount: requests.length,
        // Nur mit Nachweis, siehe `darfEinsehen`.
        signatures: darfEinsehen ? signatures : undefined,
        rvData: darfEinsehen ? rvData : undefined,
        widerrufWahl,
        reservierungAb,
        ...(konflikt ? { einheitVergeben: true } : {}),
        ...(kopie ? { kopie } : {}),
      });
    }

    return antwort({
      allSigned,
      // Ein erwarteter Kaeufer ohne Anfrage zaehlt als offen.
      totalRequests: Math.max(requests.length, erwarteteRvKaeufer(requests[0]?.sa_data).length),
      signedCount: requests.filter((r: any) => r.status === "signed").length,
      // Nur mit Nachweis, siehe `darfEinsehen`. `allSigned` bleibt zusaetzlich
      // Bedingung: Solange nicht alle unterschrieben haben, gibt es nichts
      // Vollstaendiges herauszugeben.
      signatures: allSigned && darfEinsehen ? signatures : undefined,
      rvData: allSigned && darfEinsehen ? requests[0]?.sa_data : undefined,
    });
  } catch (error) {
    console.error("Error:", error);
    return antwort({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, 500);
  }
});
