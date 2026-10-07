/**
 * Kampagnenkennungen, serverseitig geprueft.
 *
 * Das Gegenstueck zu `src/lib/kampagnenKennung.ts`. Der Browser saeubert die
 * Werte schon, aber `submit-lead` ist eine oeffentliche Adresse: Wer will,
 * schickt ihr ein eigenes `meta` mit einem Kampagnenobjekt beliebiger Groesse.
 * Ungeprueft landete das in der Spalte `meta` des Kontakts.
 *
 * Deshalb hier noch einmal dasselbe: nur die sieben bekannten Felder, nur
 * erlaubte Zeichen, feste Hoechstlaenge. Was nichts uebrig laesst, faellt
 * ganz weg. Die Regeln stehen bewusst zweimal, einmal im Browser und einmal
 * hier, weil eine geteilte Datei zwischen Vite und Deno nicht ohne Umbau
 * moeglich ist.
 */

/** Hoechstlaenge eines UTM-Werts. */
const MAX_UTM = 120;

/** Klickkennungen sind laenger, ein gekappter `fbclid` waere wertlos. */
const MAX_KLICK_ID = 255;

const VERBOTEN_UTM = /[^\p{L}\p{N} ._\-:+|/()@&,#]/gu;
const VERBOTEN_KLICK_ID = /[^A-Za-z0-9._-]/g;

const FELDER: { feld: string; klickId: boolean }[] = [
  { feld: "utmSource", klickId: false },
  { feld: "utmMedium", klickId: false },
  { feld: "utmCampaign", klickId: false },
  { feld: "utmContent", klickId: false },
  { feld: "utmTerm", klickId: false },
  { feld: "gclid", klickId: true },
  { feld: "fbclid", klickId: true },
];

function saeubere(roh: string, klickId: boolean): string {
  return roh
    .replace(klickId ? VERBOTEN_KLICK_ID : VERBOTEN_UTM, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, klickId ? MAX_KLICK_ID : MAX_UTM);
}

/**
 * Gibt die geprueften Kennungen zurueck, oder `null`, wenn keine brauchbare
 * uebrig bleibt. `null` heisst fuer den Aufrufer: das Feld gar nicht setzen.
 */
export function saeubereKampagne(roh: unknown): Record<string, unknown> | null {
  const erster = saeubereEbene(roh);
  if (!erster) return null;
  // Der letzte Kontakt (last touch), wenn der Browser einen abweichenden
  // mitschickt. Dieselben Regeln, aber nur eine Ebene tief: ein `zuletzt` im
  // `zuletzt` faellt weg.
  const zuletzt = saeubereEbene((roh as Record<string, unknown>).zuletzt);
  return zuletzt ? { ...erster, zuletzt } : erster;
}

function saeubereEbene(roh: unknown): Record<string, string> | null {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const quelle = roh as Record<string, unknown>;
  const ergebnis: Record<string, string> = {};
  for (const { feld, klickId } of FELDER) {
    const wert = quelle[feld];
    if (typeof wert !== "string") continue;
    const sauber = saeubere(wert, klickId);
    if (sauber) ergebnis[feld] = sauber;
  }
  if (Object.keys(ergebnis).length === 0) return null;
  // Der Zeitpunkt des ersten Aufrufs, sofern der Browser einen mitgeschickt
  // hat. Kein gueltiges Datum, kein Feld.
  const erfasstAm = quelle.erfasstAm;
  if (typeof erfasstAm === "string" && !Number.isNaN(Date.parse(erfasstAm))) {
    ergebnis.erfasstAm = new Date(erfasstAm).toISOString();
  }
  return ergebnis;
}

/**
 * So heisst die Kampagne in Auswertungen und Meldungen. Gruppiert wird nach
 * `utm_campaign`, weil auf dieser Ebene das Budget verteilt wird.
 */
export function kampagnenName(kennung: Record<string, unknown> | null): string {
  if (!kennung) return "Ohne Kampagne";
  if (typeof kennung.utmCampaign === "string" && kennung.utmCampaign) return kennung.utmCampaign;
  const teile = [kennung.utmSource, kennung.utmMedium].filter((t) => typeof t === "string" && t);
  if (teile.length) return teile.join(" / ");
  if (kennung.gclid) return "Google Ads (ohne utm_campaign)";
  if (kennung.fbclid) return "Meta Ads (ohne utm_campaign)";
  return "Ohne Kampagne";
}

/**
 * Kampagnenangaben aus einem Formularlead von Meta, der ueber Zapier kommt.
 *
 * Meta Lead Ads haben keine Adresse, also auch keine UTM-Parameter. Zapier
 * kann aber die Namen von Kampagne, Anzeigengruppe und Anzeige mitliefern,
 * wenn sie in der Zap-Zuordnung stehen. Uebernommen wird nur, was tatsaechlich
 * geliefert wird, in derselben Aufteilung wie beim Werbelink:
 *   campaign_name  -> utmCampaign   (die Kampagne)
 *   adset_name     -> utmTerm       (die Anzeigengruppe, wie in der
 *                                    URL-Vorlage utm_term={{adset.name}})
 *   ad_name        -> utmContent    (die einzelne Anzeige)
 *   platform       -> utmSource     (fb, ig, ...)
 * Auch `utm_*` direkt im Koerper werden gelesen, falls ein Zap sie so
 * schickt. Geraten wird nichts: Fehlt alles, kommt `null` zurueck.
 */
const LEAD_FELDER: { feld: string; schluessel: string[] }[] = [
  { feld: "utmSource", schluessel: ["utm_source", "platform", "Platform"] },
  { feld: "utmMedium", schluessel: ["utm_medium"] },
  { feld: "utmCampaign", schluessel: ["utm_campaign", "campaign_name", "campaignName", "Campaign Name", "campaign"] },
  { feld: "utmContent", schluessel: ["utm_content", "ad_name", "adName", "Ad Name"] },
  { feld: "utmTerm", schluessel: ["utm_term", "adset_name", "adsetName", "Ad Set Name", "Adset Name"] },
  { feld: "gclid", schluessel: ["gclid"] },
  { feld: "fbclid", schluessel: ["fbclid"] },
];

export function kampagneAusLeadFeldern(koerper: unknown): Record<string, unknown> | null {
  if (!koerper || typeof koerper !== "object" || Array.isArray(koerper)) return null;
  const quelle = koerper as Record<string, unknown>;
  const roh: Record<string, string> = {};
  for (const { feld, schluessel } of LEAD_FELDER) {
    for (const s of schluessel) {
      const wert = quelle[s];
      if (typeof wert === "string" && wert.trim()) {
        roh[feld] = wert;
        break;
      }
    }
  }
  return saeubereKampagne(roh);
}
