/**
 * Die Cookie-Einwilligung der Besucher auf den oeffentlichen Seiten.
 *
 * WOZU DAS DA IST
 *
 * Nach § 25 TDDDG (frueher TTDSG) darf eine Seite nur dann etwas im Browser
 * ablegen oder von dort lesen, wenn das fuer den ausdruecklich gewuenschten
 * Dienst unbedingt noetig ist, oder wenn der Besucher eingewilligt hat. Das
 * gilt fuer Cookies genauso wie fuer localStorage und sessionStorage.
 *
 * Drei Stufen, wie im Banner:
 *   notwendig   immer an: Anmeldung, Formularentwurf, Sprachwahl und diese
 *               Einwilligung selbst. Dafuer braucht es keine Einwilligung.
 *   statistik   die Kampagnenkennung darf ueber den Besuch hinaus im Browser
 *               bleiben (30 Tage), siehe `kampagnenKennung.ts`.
 *   marketing   die allgemeine Marketingwahl. Sie allein laedt KEIN
 *               Partner-Pixel (seit Fassung 2, 27.09.2026).
 *
 * Dazu je Partner eine eigene Marketingwahl (`partner`, Liste mit Kennung
 * und Zeitpunkt). Nur sie erlaubt das Meta Pixel eines Partners und die
 * serverseitige Meldung an Meta. Gefragt wird auf der Seite des Partners,
 * mit Name und Anschrift des Partners als gemeinsam Verantwortlichem. Wer auf
 * einer allgemeinen Seite "Alle akzeptieren" klickt, hat damit keinem
 * Partner-Pixel zugestimmt.
 *
 * WARUM AUCH DAS STORAGE-EREIGNIS
 *
 * Wer in einem zweiten Tab widerruft, aendert denselben Speicher. Der erste
 * Tab erfaehrt das nur ueber das `storage`-Ereignis des Browsers. Ohne es
 * behielte er ein geladenes Pixel und meldete den naechsten Lead an Meta.
 *
 * WARUM MIT VERSIONSNUMMER
 *
 * Kommt eine neue Kategorie oder ein neuer Dienst dazu, muss neu gefragt
 * werden. Dann steigt `EINWILLIGUNG_VERSION`, und jede gespeicherte Wahl mit
 * einer anderen Nummer gilt als nicht getroffen. Der Banner erscheint wieder.
 *
 * WARUM EIN EIGENES EREIGNIS
 *
 * Banner, Pixel und Kampagnenkennung leben an verschiedenen Stellen der Seite.
 * Sie erfahren von einer geaenderten Wahl ueber das Fensterereignis
 * `EINWILLIGUNG_EREIGNIS`, ohne voneinander zu wissen.
 */

import {
  COOKIE_EINWILLIGUNG_FASSUNG,
  einwilligungsZeitpunktGueltig,
} from "../../supabase/functions/_shared/cookie-einwilligung.ts";

/**
 * Steigt, sobald sich Kategorien, Dienste oder der Text des Hinweises
 * aendern. Dieselbe Zahl prueft der Server (`_shared/cookie-einwilligung.ts`).
 */
export const EINWILLIGUNG_VERSION = COOKIE_EINWILLIGUNG_FASSUNG;

/** Hoechstens so viele Partner merkt sich der Browser, die aeltesten fallen weg. */
const MAX_PARTNER = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Schluessel im localStorage. */
export const EINWILLIGUNG_SPEICHER = "moreimmo.cookie-einwilligung";

/** Fensterereignis bei jeder gespeicherten Wahl. */
export const EINWILLIGUNG_EREIGNIS = "moreimmo:cookie-einwilligung";

/** Fensterereignis, das den Banner in der Einstellungsansicht oeffnet. */
export const EINSTELLUNGEN_OEFFNEN_EREIGNIS = "moreimmo:cookie-einstellungen";

/** Die Marketingwahl fuer das Pixel genau eines Partners. */
export interface PartnerEntscheidung {
  partnerId: string;
  marketing: boolean;
  zeitpunkt: string;
}

export interface CookieEinwilligung {
  version: number;
  statistik: boolean;
  marketing: boolean;
  /** Zeitpunkt der Entscheidung, als Nachweis im Browser. */
  zeitpunkt: string;
  /** Die Wahl je Partner-Pixel. */
  partner: PartnerEntscheidung[];
}

export type EinwilligungsWahl = Pick<CookieEinwilligung, "statistik" | "marketing">;

export const NUR_NOTWENDIGE: EinwilligungsWahl = { statistik: false, marketing: false };
export const ALLE: EinwilligungsWahl = { statistik: true, marketing: true };

/**
 * Die gespeicherte Wahl, oder `null`, wenn keine gueltige vorliegt.
 *
 * Der Speicher liegt beim Besucher und ist dort veraenderbar. Deshalb wird
 * jedes Feld einzeln geprueft; alles Unklare heisst "nicht eingewilligt".
 */
export function leseCookieEinwilligung(): CookieEinwilligung | null {
  if (typeof window === "undefined") return null;
  try {
    const roh = window.localStorage.getItem(EINWILLIGUNG_SPEICHER);
    if (!roh) return null;
    const gelesen = JSON.parse(roh) as Partial<CookieEinwilligung> | null;
    if (!gelesen || typeof gelesen !== "object") return null;
    if (gelesen.version !== EINWILLIGUNG_VERSION) return null;
    const partner = (Array.isArray(gelesen.partner) ? gelesen.partner : [])
      .filter(
        (p): p is PartnerEntscheidung =>
          !!p &&
          typeof p === "object" &&
          typeof p.partnerId === "string" &&
          UUID.test(p.partnerId) &&
          typeof p.zeitpunkt === "string",
      )
      .map((p) => ({ partnerId: p.partnerId.toLowerCase(), marketing: p.marketing === true, zeitpunkt: p.zeitpunkt.slice(0, 40) }))
      .slice(-MAX_PARTNER);
    return {
      version: EINWILLIGUNG_VERSION,
      statistik: gelesen.statistik === true,
      marketing: gelesen.marketing === true,
      zeitpunkt: typeof gelesen.zeitpunkt === "string" ? gelesen.zeitpunkt.slice(0, 40) : "",
      partner,
    };
  } catch {
    // Privates Fenster oder gesperrter Speicher: keine Wahl, der Banner fragt.
    return null;
  }
}

/**
 * Ist diese Wahl ein allgemeiner Widerruf? Dann sind ALLE
 * Partner-Einwilligungen zurueckgenommen, auch die des Partners der Seite.
 *
 * Ein allgemeiner Widerruf ist "Nur notwendige" oder das Abschalten von
 * Marketing, das vorher an war. Bleibt Marketing einfach aus, ist es keiner:
 * So bleibt die Freigabe nur fuer einen einzelnen Partner moeglich.
 * Auf einer allgemeinen Seite (ohne Partner) gilt wie bisher jede Wahl mit
 * Marketing aus als Widerruf.
 */
export function istAllgemeinerWiderruf(
  wahl: EinwilligungsWahl,
  vorher: Pick<CookieEinwilligung, "marketing"> | null,
  aufPartnerSeite: boolean,
  nurNotwendige = false,
): boolean {
  if (nurNotwendige) return true;
  if (wahl.marketing === true) return false;
  return !aufPartnerSeite || vorher?.marketing === true;
}

/**
 * Speichert die Wahl und sagt allen Zuhoerern Bescheid.
 *
 * `partnerWahl` ist die Wahl fuer das Pixel des Partners, auf dessen Seite
 * der Besucher gerade ist. `nurNotwendige` sagt, dass der Knopf "Nur
 * notwendige" gedrueckt wurde. Bei einem allgemeinen Widerruf
 * (`istAllgemeinerWiderruf`) werden alle Partner-Einwilligungen
 * zurueckgenommen, auch die des Partners dieser Seite (Codex-Pruefung
 * 27.09.2026, PIXEL-001). Vorher gewann die Wahl fuer den Partner der Seite
 * immer, und sein Pixel lief nach "Marketing aus" weiter, auch in anderen
 * Tabs; die Freigaben anderer Partner blieben ebenfalls stehen.
 */
export function speichereCookieEinwilligung(
  wahl: EinwilligungsWahl,
  partnerWahl?: { partnerId: string; marketing: boolean },
  optionen: { nurNotwendige?: boolean } = {},
): CookieEinwilligung {
  const jetzt = new Date().toISOString();
  const vorher = aktuelleCookieEinwilligung();
  let partner = vorher?.partner ?? [];
  const mitPartner = !!partnerWahl && UUID.test(partnerWahl.partnerId);
  const widerruf = istAllgemeinerWiderruf(wahl, vorher, mitPartner, optionen.nurNotwendige === true);
  if (widerruf) {
    partner = partner.map((p) => (p.marketing ? { ...p, marketing: false, zeitpunkt: jetzt } : p));
  }
  if (mitPartner && partnerWahl) {
    const id = partnerWahl.partnerId.toLowerCase();
    // Beim Widerruf wird auch fuer diesen Partner "nein" festgehalten.
    const marketing = !widerruf && partnerWahl.marketing === true;
    partner = [...partner.filter((p) => p.partnerId !== id), { partnerId: id, marketing, zeitpunkt: jetzt }];
  }
  const einwilligung: CookieEinwilligung = {
    version: EINWILLIGUNG_VERSION,
    statistik: wahl.statistik === true,
    marketing: wahl.marketing === true,
    zeitpunkt: jetzt,
    partner: partner.slice(-MAX_PARTNER),
  };
  if (typeof window === "undefined") return einwilligung;
  try {
    window.localStorage.setItem(EINWILLIGUNG_SPEICHER, JSON.stringify(einwilligung));
    nurImArbeitsspeicher = null;
  } catch {
    // Ohne Speicher gilt die Wahl bis zum Neuladen. Danach fragt der Banner
    // wieder, geladen wird trotzdem nur, was jetzt erlaubt ist.
    nurImArbeitsspeicher = einwilligung;
  }
  window.dispatchEvent(new CustomEvent(EINWILLIGUNG_EREIGNIS, { detail: einwilligung }));
  return einwilligung;
}

/**
 * Die Wahl dieses Seitenbesuchs, NUR wenn der Speicher gesperrt ist.
 * `leseCookieEinwilligung` allein wuerde dann nach dem Klick weiter `null`
 * liefern, und das Pixel luede trotz Zustimmung nicht. Bei funktionierendem
 * Speicher bleibt er leer, damit ein Widerruf aus einem anderen Tab nicht von
 * einer alten Kopie hier ueberdeckt wird.
 */
let nurImArbeitsspeicher: CookieEinwilligung | null = null;

export function aktuelleCookieEinwilligung(): CookieEinwilligung | null {
  return leseCookieEinwilligung() ?? nurImArbeitsspeicher;
}

/**
 * Die Wahl fuer das Pixel dieses Partners, frisch aus dem Speicher gelesen.
 * `null` heisst: noch nicht gefragt, oder die Wahl ist aelter als 13 Monate.
 */
export function partnerMarketingEntscheidung(partnerId: string | null | undefined): PartnerEntscheidung | null {
  if (!partnerId) return null;
  const id = partnerId.toLowerCase();
  const eintrag = aktuelleCookieEinwilligung()?.partner.find((p) => p.partnerId === id) ?? null;
  if (!eintrag || !einwilligungsZeitpunktGueltig(eintrag.zeitpunkt)) return null;
  return eintrag;
}

/** Darf das Pixel DIESES Partners laden und sein Lead an Meta gehen? */
export function hatPartnerMarketingEinwilligung(partnerId: string | null | undefined): boolean {
  return partnerMarketingEntscheidung(partnerId)?.marketing === true;
}

/** Darf die Kampagnenkennung im Browser bleiben? */
export function hatStatistikEinwilligung(): boolean {
  return aktuelleCookieEinwilligung()?.statistik === true;
}

/**
 * Die allgemeine Marketingwahl. Fuer ein Partner-Pixel reicht sie nicht,
 * dafuer zaehlt `hatPartnerMarketingEinwilligung`.
 */
export function hatMarketingEinwilligung(): boolean {
  return aktuelleCookieEinwilligung()?.marketing === true;
}

/**
 * Meldet sich bei jeder neuen Wahl, in diesem Tab und in jedem anderen Tab
 * derselben Seite. `null` heisst: Die Wahl wurde anderswo geloescht.
 * Gibt die Abmeldung zurueck.
 */
export function aufEinwilligungHoeren(rueckruf: (e: CookieEinwilligung | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const hoerer = (ereignis: Event) => {
    const detail = (ereignis as CustomEvent<CookieEinwilligung>).detail;
    if (detail) rueckruf(detail);
  };
  // Ein anderer Tab hat den Speicher geaendert. `key === null` heisst, er
  // wurde ganz geleert.
  const anderesFenster = (ereignis: StorageEvent) => {
    if (ereignis.key !== null && ereignis.key !== EINWILLIGUNG_SPEICHER) return;
    nurImArbeitsspeicher = null;
    rueckruf(leseCookieEinwilligung());
  };
  window.addEventListener(EINWILLIGUNG_EREIGNIS, hoerer);
  window.addEventListener("storage", anderesFenster);
  return () => {
    window.removeEventListener(EINWILLIGUNG_EREIGNIS, hoerer);
    window.removeEventListener("storage", anderesFenster);
  };
}

/**
 * Der Partner, dessen Pixel auf der gerade offenen Seite laden duerfte.
 *
 * Die Partnerseite meldet ihn an (`useMetaPixelMitEinwilligung`) und beim
 * Verlassen wieder ab. Der Banner fragt dann gezielt fuer diesen Partner, der
 * Fuss nennt ihn als gemeinsam Verantwortlichen. Das ist KEINE Freigabe: Ob
 * geladen oder gemeldet werden darf, entscheidet jedes Mal frisch
 * `hatPartnerMarketingEinwilligung`.
 */
export interface PartnerPixelKontext {
  partnerId: string;
  pixelId: string;
  name: string;
  anschrift: string;
}

let partnerKontext: PartnerPixelKontext | null = null;
const kontextHoerer = new Set<() => void>();

/** Meldet den Partner der Seite an. Gibt die Abmeldung zurueck. */
export function setzePartnerPixelKontext(kontext: PartnerPixelKontext): () => void {
  const eigener = { ...kontext, partnerId: kontext.partnerId.toLowerCase() };
  partnerKontext = eigener;
  kontextHoerer.forEach((h) => h());
  return () => {
    // Nur den eigenen Eintrag entfernen, nicht den der naechsten Seite.
    if (partnerKontext !== eigener) return;
    partnerKontext = null;
    kontextHoerer.forEach((h) => h());
  };
}

export function aktuellerPartnerPixelKontext(): PartnerPixelKontext | null {
  return partnerKontext;
}

export function aufPartnerPixelKontextHoeren(hoerer: () => void): () => void {
  kontextHoerer.add(hoerer);
  return () => {
    kontextHoerer.delete(hoerer);
  };
}

/** Oeffnet den Banner in der Einstellungsansicht, fuer den Link im Fuss. */
export function oeffneCookieEinstellungen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EINSTELLUNGEN_OEFFNEN_EREIGNIS));
}

export interface EinwilligungFuerServer {
  version: number;
  statistik: boolean;
  marketing: boolean;
  zeitpunkt: string | null;
  /** Nur mit Einwilligung fuer den Partner dieser Seite. */
  partnerMarketing: { partnerId: string; zeitpunkt: string } | null;
}

/**
 * Was an `submit-lead` mitgeht. Der Server meldet einen Lead nur dann an die
 * Meta Conversion-API, wenn `partnerMarketing` fuer genau den Partner gilt,
 * dem der Lead zugeordnet wird, und Fassung und Zeitpunkt passen
 * (`_shared/cookie-einwilligung.ts`).
 */
export function einwilligungFuerServer(): EinwilligungFuerServer {
  const e = aktuelleCookieEinwilligung();
  const partner = partnerMarketingEntscheidung(partnerKontext?.partnerId);
  return {
    version: EINWILLIGUNG_VERSION,
    statistik: e?.statistik === true,
    marketing: e?.marketing === true,
    zeitpunkt: e?.zeitpunkt || null,
    partnerMarketing: partner?.marketing ? { partnerId: partner.partnerId, zeitpunkt: partner.zeitpunkt } : null,
  };
}

/**
 * Die oeffentlichen Seiten, auf denen der Banner erscheint.
 *
 * Bewusst NICHT dabei:
 *   - das angemeldete CRM und das Kundenportal (alles unter der AppShell),
 *     dort gibt es nur technisch Notwendiges: Anmeldung und Arbeitsstand;
 *   - Anmeldung, Passwort und Kontoaktivierung, sie gehoeren zum CRM-Zugang;
 *   - der Videoraum fuer Gaeste (`/raum/`) und der Handy-Scan
 *     (`/mobile-scan/`): dort laeuft nur der gewuenschte Dienst, und ein
 *     Banner laege ueber den Bedienknoepfen;
 *   - die internen Praesentations- und Exposé-Seiten ausserhalb der AppShell,
 *     die eine Anmeldung verlangen.
 *
 * `/steuer` und `/steuer/...` sind oeffentlich, `/steuerrechner` ist das CRM.
 * Deshalb wird nach ganzen Pfadabschnitten verglichen, nicht nach Anfang.
 */
const OEFFENTLICHE_PFADE = [
  "/karriere",
  "/partner-werden",
  "/kundenansicht/objekt",
  "/bewerben",
  "/analyse",
  "/steuer",
  "/expats-calculator",
  "/links",
  "/selbstauskunft",
  "/sa",
  "/bewerberfragen",
  "/kennenlernen",
  "/kennenlerngespraech",
  "/kooperationsgespraech",
  "/deine-bewerbung",
  "/bewerbung/kein-interesse",
  "/signatur",
  "/sa-mobile-sign",
  "/expose",
  "/objektvorstellung",
  "/immobilie",
  "/impressum",
  "/datenschutz",
  "/objekt-akquise",
  "/unsubscribe",
  "/vp",
  // Die Handbuch-Seite mit Ergebnis und Selbstauskunft (26.09.2026). Die
  // Verwaltung im CRM heisst `/handbuch-seite` und faellt nicht darunter,
  // verglichen wird nach ganzen Pfadabschnitten.
  "/handbuch",
  // Der persönliche Handbuch-Link aus der Willkommensmail (30.09.2026).
  "/handbuch-einladung",
  "/termin",
  "/terminwahl",
];

export function istOeffentlicheSeite(pfad: string | null | undefined): boolean {
  if (!pfad) return false;
  const sauber = pfad.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return OEFFENTLICHE_PFADE.some((p) => sauber === p || sauber.startsWith(`${p}/`));
}

/**
 * Meta legt mit dem Pixel die Cookies `_fbp` und `_fbc` auf unserer Domain
 * ab. Wer die Einwilligung zuruecknimmt, soll sie nicht behalten.
 */
export function entferneMetaCookies(): void {
  if (typeof document === "undefined") return;
  const ablauf = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const teile = host.split(".");
  // Meta setzt die Cookies auf die Hauptdomain (".more.immo"), manchmal auf
  // den Host selbst. Beide Varianten und ohne Domain werden geloescht.
  const domains = ["", host, teile.length > 2 ? `.${teile.slice(-2).join(".")}` : `.${host}`];
  for (const name of ["_fbp", "_fbc"]) {
    for (const domain of domains) {
      document.cookie = `${name}=; ${ablauf}; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

/** Nur fuer Tests. */
export function _einwilligungVergessen(): void {
  nurImArbeitsspeicher = null;
  partnerKontext = null;
  try {
    window.localStorage.removeItem(EINWILLIGUNG_SPEICHER);
  } catch {
    // egal
  }
}
