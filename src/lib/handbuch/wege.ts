/**
 * Die Adressen der öffentlichen Handbuch-Seite, an einer Stelle.
 *
 * Mit Kürzel die Seiten eines Partners, ohne die des Hauses. Die festen
 * Unterseiten (`konfigurator`, `selbstauskunft`, `ergebnis`) stehen im Router
 * vor dem Kürzel und dürfen kein Partnerkürzel sein (`vp-slug.ts`).
 */
import type { KampagnenKennung } from "@/lib/kampagnenKennung";

function mitKuerzel(slug?: string | null): string {
  const k = (slug || "").trim();
  return `/handbuch${k ? `/${encodeURIComponent(k)}` : ""}`;
}

/** Die Landingpage. */
export function handbuchStartseite(slug?: string | null): string {
  return mitKuerzel(slug);
}

/**
 * Der Wizard. `suche` ist die Adresszeile der aktuellen Seite, etwa
 * `?utm_source=meta&utm_campaign=steuer`: Sie wandert mit, damit die
 * Kampagnenkennung auch nach einem Neuladen des Wizards noch gilt.
 */
export function konfiguratorPfad(slug?: string | null, suche = ""): string {
  const s = suche && suche !== "?" ? (suche.startsWith("?") ? suche : `?${suche}`) : "";
  return `${mitKuerzel(slug)}/konfigurator${s}`;
}

/**
 * Die offene Selbstauskunft ohne Token, für alle ohne bekannten Lead
 * (weitergeleitetes PDF ohne Handbuch-Token, abgelaufener Link).
 */
export function offeneSelbstauskunftPfad(slug?: string | null): string {
  return `${mitKuerzel(slug)}/selbstauskunft`;
}

/**
 * Der persönliche Link zur Selbstauskunft aus dem Handbuch. Seit dem
 * 26.09.2026 dieselbe Seite wie beim Versand aus dem Kundenprofil („An Kunde
 * senden“, `send-sa-invitation`): `/sa/:token`. Alte Links unter
 * `/handbuch/selbstauskunft/:token` öffnen weiter dasselbe Formular.
 */
export function saTokenPfad(token: string): string {
  return `/sa/${token}`;
}

/**
 * Der Einstieg in die Selbstauskunft über das Handbuch-Token (seit dem
 * 28.09.2026). Die Seite holt sich über `handbuch_sa_starten` einen frischen
 * Ausfüll-Link für den Lead dieses Handbuchs und springt hinein, ohne
 * Kontaktformular. Der Link liest nichts Gespeichertes, deshalb darf er ins PDF.
 */
export function saStartPfad(handbuchToken: string): string {
  return `/handbuch/ergebnis/${handbuchToken}/selbstauskunft`;
}

/**
 * Wohin „Selbstauskunft ausfüllen“ auf der Ergebnisseite und im PDF führt.
 *
 * Bildschirm: der eigene Link dieser Sitzung (`saToken`, behält den
 * Zwischenstand), sonst der Einstieg über das Handbuch-Token. Ohne beides
 * (Dublette: der Browser bekommt bewusst kein Token) kein Knopf; den Link
 * schickt der Server an die gespeicherte Adresse. Ein Kontaktformular brächte
 * dort nichts Neues, es löste nur dieselbe Mail noch einmal aus.
 *
 * PDF: nie der eigene Link, denn das PDF wird weitergegeben und der eigene
 * Link öffnet den angefangenen Stand. Stattdessen der Einstieg über das
 * Handbuch-Token, ohne Handbuch-Token die offene Selbstauskunft, die den Lead
 * selbst anlegt oder per Dublettenprüfung zuordnet.
 *
 * Liegt die Selbstauskunft schon vor, gibt es an beiden Stellen keinen Link.
 */
export function saWege(a: {
  saToken: string | null;
  handbuchToken: string | null;
  saStatus: "offen" | "ausgefuellt" | "abgelaufen" | null;
  beraterSlug: string | null;
}): { bildschirm: string | null; pdf: string | null } {
  if (a.saStatus === "ausgefuellt") return { bildschirm: null, pdf: null };
  const start = a.handbuchToken ? saStartPfad(a.handbuchToken) : null;
  return {
    bildschirm: a.saToken ? saTokenPfad(a.saToken) : start,
    pdf: start ?? offeneSelbstauskunftPfad(a.beraterSlug),
  };
}

/**
 * Der Kanal eines Leads in Klartext, für die Lead-Verwaltung: „Meta, Kampagne
 * steuer_herbst“, „Google“, ohne Kennung „direkt“.
 */
export function kanalText(kennung: KampagnenKennung | null | undefined): string {
  if (!kennung) return "direkt";
  const quelle = (kennung.utmSource || "").trim().toLowerCase();
  const namen: Record<string, string> = {
    meta: "Meta",
    facebook: "Meta",
    fb: "Meta",
    instagram: "Meta",
    ig: "Meta",
    google: "Google",
    linkedin: "LinkedIn",
    newsletter: "Newsletter",
    tiktok: "TikTok",
  };
  const kanal =
    namen[quelle] ||
    (kennung.utmSource ? kennung.utmSource.trim() : "") ||
    (kennung.fbclid ? "Meta" : kennung.gclid ? "Google" : "");
  const kampagne = (kennung.utmCampaign || "").trim();
  if (!kanal && !kampagne) return "direkt";
  if (!kampagne) return kanal;
  if (!kanal) return `Kampagne ${kampagne}`;
  return `${kanal}, Kampagne ${kampagne}`;
}
