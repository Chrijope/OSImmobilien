/**
 * Zielprüfung für Abrufe, deren Adresse von außen kommt (Audit-Befund F12).
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * `fetch-url-pdfs` nimmt eine beliebige Adresse aus dem Aufruf entgegen und
 * ruft sie ab. Ohne Prüfung ist der Server damit ein Sprungbrett: Wer die
 * Function aufruft, lässt sie Adressen abrufen, die nur von innen erreichbar
 * sind. Die klassischen Ziele sind der Metadatendienst der Cloud
 * (169.254.169.254, dort liegen Zugangsdaten), die Rückschleife 127.0.0.1 und
 * die privaten Netze 10.x, 172.16.x bis 172.31.x und 192.168.x. Der Inhalt
 * kommt bei diesem Dienst sogar zurück zum Aufrufer, denn die Function
 * liefert das Geladene als base64 aus. Das ist der schlimmste Fall: nicht nur
 * blind auslösen, sondern mitlesen.
 *
 * Die Prüfung liegt bewusst hier und nicht in `index.ts`, denn Edge Functions
 * laufen unter Deno und kommen im Vitest-Lauf nicht vor. Als eigenes Modul
 * lässt sie sich aus `src/lib/zielAdresse.test.ts` importieren und prüfen.
 * Das ist wichtig, weil der eigentliche Prüfstein die ungewöhnlichen
 * Schreibweisen einer Adresse sind, und die prüft man nicht von Hand durch.
 *
 * WAS DIESE PRÜFUNG NICHT KANN: NAMEN AUFLÖSEN
 *
 * Geprüft wird die Adresse, nicht das, was ein Name im DNS ergibt. Ein
 * Angreifer kann einen eigenen Namen auf 127.0.0.1 zeigen lassen, und dieser
 * Name sieht hier völlig harmlos aus. Sauber wäre: Namen selbst auflösen, die
 * erhaltene IP prüfen und genau diese IP verbinden. Das geht in der
 * Supabase-Laufzeit nicht. `Deno.resolveDns` steht dort nicht bereit, und
 * selbst mit Auflösung bliebe die Lücke bestehen, solange `fetch` den Namen
 * ein zweites Mal auflöst: Zwischen Prüfung und Verbindung kann sich die
 * Antwort ändern (DNS-Rebinding). Eine Auflösung, die man danach nicht
 * festnageln kann, ist Scheinsicherheit, deshalb steht sie hier nicht drin.
 *
 * Was bleibt, deckt den Angriff ab, der ohne eigene Vorbereitung funktioniert:
 * eine IP-Adresse oder ein bekannter interner Name direkt im Aufruf, in jeder
 * Schreibweise, und dasselbe nach jeder Weiterleitung.
 *
 * WEITERLEITUNGEN
 *
 * Eine erlaubte Adresse kann auf eine verbotene weiterleiten, und genau so
 * umgeht man eine Prüfung, die nur den Anfang ansieht. Deshalb folgt
 * `sichereAbfrage` den Weiterleitungen selbst (`redirect: "manual"`) und
 * prüft jedes Zwischenziel neu. Details stehen dort.
 */

/** Höchstgröße einer geladenen Datei. Entspricht der bisherigen Grenze. */
export const MAX_ANTWORT_BYTES = 20 * 1024 * 1024;

/** Höchstgröße einer HTML-Seite, die nach PDF-Links durchsucht wird. */
export const MAX_HTML_BYTES = 5 * 1024 * 1024;

/** Zeitgrenze für einen einzelnen Abruf. */
export const ZEITGRENZE_MS = 20_000;

/** Wie viele Weiterleitungen verfolgt werden, bevor abgebrochen wird. */
export const MAX_WEITERLEITUNGEN = 8;

/**
 * Was der Aufrufer zu sehen bekommt.
 *
 * Bewusst ohne jede Einzelheit: Der Text sagt nicht, ob die Adresse am Schema,
 * am Port oder an einem privaten Netz gescheitert ist. Sonst wäre die Function
 * ein bequemer Melder dafür, was intern erreichbar ist. Wer gezielt sucht,
 * bekommt bei jedem Versuch denselben Satz.
 */
export const ABLEHNUNGSTEXT =
  "Diese Adresse ist nicht erlaubt. Bitte gib einen öffentlich erreichbaren Link über "
  + "http oder https an, zum Beispiel von OneDrive, SharePoint oder Google Drive.";

/** Grob, warum abgelehnt wurde. Nur fürs Protokoll, nie für den Aufrufer. */
export type Ablehnungsgrund =
  | "unlesbar"
  | "schema"
  | "zugangsdaten"
  | "port"
  | "name"
  | "ip";

export interface Zielpruefung {
  erlaubt: boolean;
  /** Nur gesetzt, wenn abgelehnt. */
  grund?: Ablehnungsgrund;
  /** Klartext fürs Serverprotokoll. Geht nie an den Aufrufer hinaus. */
  hinweis?: string;
  /** Die vereinheitlichte Adresse, wenn erlaubt. */
  adresse?: string;
}

/** Wird geworfen, wenn ein Abruf an der Zielprüfung scheitert. */
export class ZieladresseAbgelehnt extends Error {
  readonly grund: Ablehnungsgrund;
  readonly hinweis: string;

  constructor(pruefung: Zielpruefung) {
    super(ABLEHNUNGSTEXT);
    this.name = "ZieladresseAbgelehnt";
    this.grund = pruefung.grund ?? "unlesbar";
    this.hinweis = pruefung.hinweis ?? "";
  }
}

// ---------------------------------------------------------------------------
// IPv4
// ---------------------------------------------------------------------------

/** Baut aus vier Bytes die 32-Bit-Zahl einer IPv4-Adresse. */
function ipv4(a: number, b: number, c: number, d: number): number {
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/**
 * Ein einzelner Teil zwischen den Punkten.
 *
 * Die Schreibweise stammt von `inet_aton` und ist der Grund, warum eine reine
 * Textprüfung auf "127." nichts taugt: `0177` ist oktal, `0x7f` hexadezimal,
 * beides ergibt 127. Browser und Betriebssysteme akzeptieren das bis heute.
 */
function zahlAusTeil(teil: string): number | null {
  if (teil.length === 0) return null;

  let basis = 10;
  let ziffern = teil;
  if (teil.length > 2 && (teil.startsWith("0x") || teil.startsWith("0X"))) {
    basis = 16;
    ziffern = teil.slice(2);
  } else if (teil.length > 1 && teil[0] === "0") {
    basis = 8;
    ziffern = teil.slice(1);
  } else if (teil === "0x" || teil === "0X") {
    // "0x" ohne Ziffern ist keine Zahl.
    return null;
  }

  const erlaubt = basis === 16
    ? /^[0-9a-fA-F]+$/
    : basis === 8
      ? /^[0-7]+$/
      : /^[0-9]+$/;
  if (!erlaubt.test(ziffern)) return null;

  const wert = parseInt(ziffern, basis);
  if (!Number.isFinite(wert) || wert < 0 || wert > 0xFFFFFFFF) return null;
  return wert;
}

/**
 * Liest eine IPv4-Adresse in allen gebräuchlichen Schreibweisen.
 *
 * Erlaubt sind ein bis vier Teile. Der letzte Teil füllt die übrigen Bytes
 * auf, deshalb sind `127.0.0.1`, `127.1` und `2130706433` dieselbe Adresse.
 * Gibt die Adresse als 32-Bit-Zahl zurück, sonst `null`.
 */
export function alsIPv4(text: string): number | null {
  let rest = text.trim();
  if (rest.length === 0) return null;
  // Der abschließende Wurzelpunkt aus dem DNS gehört nicht zur Zahl.
  if (rest.endsWith(".")) rest = rest.slice(0, -1);
  if (rest.length === 0) return null;

  const teile = rest.split(".");
  if (teile.length > 4) return null;

  const zahlen: number[] = [];
  for (const teil of teile) {
    const zahl = zahlAusTeil(teil);
    if (zahl === null) return null;
    zahlen.push(zahl);
  }

  const vordere = zahlen.slice(0, -1);
  const letzte = zahlen[zahlen.length - 1];
  if (vordere.some((zahl) => zahl > 255)) return null;

  // Der letzte Teil darf genau die noch offenen Bytes füllen.
  const grenze = Math.pow(256, 4 - vordere.length);
  if (letzte >= grenze) return null;

  let wert = letzte;
  for (let i = 0; i < vordere.length; i++) {
    wert += vordere[i] * Math.pow(256, 3 - i);
  }
  return wert >>> 0;
}

/** Strenge Punktschreibweise, wie sie am Ende einer IPv6-Adresse stehen darf. */
function alsIPv4Streng(text: string): number | null {
  const teile = text.split(".");
  if (teile.length !== 4) return null;
  const zahlen: number[] = [];
  for (const teil of teile) {
    if (!/^[0-9]{1,3}$/.test(teil)) return null;
    const zahl = parseInt(teil, 10);
    if (zahl > 255) return null;
    zahlen.push(zahl);
  }
  return ipv4(zahlen[0], zahlen[1], zahlen[2], zahlen[3]);
}

/**
 * IPv4-Bereiche, die nie abgerufen werden dürfen.
 *
 * Nicht nur die drei bekannten privaten Netze: Auch der Metadatendienst
 * (169.254.169.254 liegt im Link-lokalen Netz), die Rückschleife, das
 * Trägernetz der Provider und die Bereiche, die im Netz nichts zu suchen
 * haben, stehen hier. Lieber ein Bereich zu viel gesperrt als der eine, an den
 * niemand gedacht hat.
 */
const IPV4_SPERREN: Array<{ netz: number; bits: number; name: string }> = [
  { netz: ipv4(0, 0, 0, 0), bits: 8, name: "dieses Netz" },
  { netz: ipv4(10, 0, 0, 0), bits: 8, name: "privates Netz 10.x" },
  { netz: ipv4(100, 64, 0, 0), bits: 10, name: "Trägernetz der Provider" },
  { netz: ipv4(127, 0, 0, 0), bits: 8, name: "Rückschleife" },
  { netz: ipv4(169, 254, 0, 0), bits: 16, name: "link-lokal und Metadatendienst" },
  { netz: ipv4(172, 16, 0, 0), bits: 12, name: "privates Netz 172.16 bis 172.31" },
  { netz: ipv4(192, 0, 0, 0), bits: 24, name: "IETF-Sonderbereich" },
  { netz: ipv4(192, 0, 2, 0), bits: 24, name: "Beispielnetz 1" },
  { netz: ipv4(192, 88, 99, 0), bits: 24, name: "6to4-Relais" },
  { netz: ipv4(192, 168, 0, 0), bits: 16, name: "privates Netz 192.168.x" },
  { netz: ipv4(198, 18, 0, 0), bits: 15, name: "Messnetz" },
  { netz: ipv4(198, 51, 100, 0), bits: 24, name: "Beispielnetz 2" },
  { netz: ipv4(203, 0, 113, 0), bits: 24, name: "Beispielnetz 3" },
  { netz: ipv4(224, 0, 0, 0), bits: 4, name: "Mehrfachempfang" },
  { netz: ipv4(240, 0, 0, 0), bits: 4, name: "reserviert und Rundruf" },
];

function imNetz(wert: number, netz: number, bits: number): boolean {
  if (bits === 0) return true;
  const maske = (0xFFFFFFFF << (32 - bits)) >>> 0;
  return ((wert & maske) >>> 0) === ((netz & maske) >>> 0);
}

/** Liegt die IPv4-Adresse in einem gesperrten Bereich? Gibt den Namen zurück. */
export function ipv4Gesperrt(wert: number): string | null {
  for (const sperre of IPV4_SPERREN) {
    if (imNetz(wert, sperre.netz, sperre.bits)) return sperre.name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// IPv6
// ---------------------------------------------------------------------------

function hexGruppe(text: string): number | null {
  if (!/^[0-9a-fA-F]{1,4}$/.test(text)) return null;
  return parseInt(text, 16);
}

/**
 * Liest eine IPv6-Adresse und gibt sie als acht 16-Bit-Gruppen zurück.
 *
 * Eckige Klammern und eine Zonenkennung (`%eth0`) werden abgeschnitten. Eine
 * am Ende eingebettete IPv4-Adresse (`::ffff:127.0.0.1`) wird in zwei Gruppen
 * umgerechnet, damit sie anschließend mitgeprüft wird.
 */
export function alsIPv6(text: string): number[] | null {
  let rest = text.trim();
  if (rest.startsWith("[") && rest.endsWith("]")) rest = rest.slice(1, -1);

  const prozent = rest.indexOf("%");
  if (prozent >= 0) rest = rest.slice(0, prozent);
  if (!rest.includes(":")) return null;

  // Eingebettete IPv4-Adresse am Ende in Hexgruppen umschreiben.
  const letzterDoppelpunkt = rest.lastIndexOf(":");
  const schwanz = rest.slice(letzterDoppelpunkt + 1);
  if (schwanz.includes(".")) {
    const eingebettet = alsIPv4Streng(schwanz);
    if (eingebettet === null) return null;
    const oben = ((eingebettet >>> 16) & 0xFFFF).toString(16);
    const unten = (eingebettet & 0xFFFF).toString(16);
    rest = rest.slice(0, letzterDoppelpunkt + 1) + oben + ":" + unten;
  }

  const stuecke = rest.split("::");
  if (stuecke.length > 2) return null;

  const links = stuecke[0].length > 0 ? stuecke[0].split(":") : [];
  const rechts = stuecke.length === 2 && stuecke[1].length > 0 ? stuecke[1].split(":") : [];

  if (stuecke.length === 1) {
    if (links.length !== 8) return null;
  } else if (links.length + rechts.length > 7) {
    // "::" steht für mindestens eine Nullgruppe.
    return null;
  }

  const gruppen: number[] = [];
  for (const teil of links) {
    const wert = hexGruppe(teil);
    if (wert === null) return null;
    gruppen.push(wert);
  }
  if (stuecke.length === 2) {
    const fehlend = 8 - links.length - rechts.length;
    for (let i = 0; i < fehlend; i++) gruppen.push(0);
  }
  for (const teil of rechts) {
    const wert = hexGruppe(teil);
    if (wert === null) return null;
    gruppen.push(wert);
  }

  return gruppen.length === 8 ? gruppen : null;
}

/**
 * Liegt die IPv6-Adresse in einem gesperrten Bereich?
 *
 * Umgekehrte Logik als bei IPv4: Erlaubt ist nur der weltweite Bereich
 * 2000::/3, alles andere fällt durch. Das ist die sichere Richtung, denn
 * Rückschleife (::1), eindeutig lokale Adressen (fc00::/7), link-lokale
 * (fe80::/10) und Mehrfachempfang (ff00::/8) liegen sämtlich außerhalb.
 *
 * Innerhalb von 2000::/3 fallen drei Bereiche wieder heraus, weil sie eine
 * IPv4-Adresse in sich tragen und damit ein Umweg auf interne Ziele wären:
 * Teredo (2001::/32) und 6to4 (2002::/16). Dazu das Dokumentationsnetz
 * 2001:db8::/32.
 *
 * Die IPv4-Abbildung (::ffff:a.b.c.d) liegt ohnehin außerhalb von 2000::/3 und
 * ist damit in jeder Schreibweise gesperrt, auch für öffentliche Adressen. Das
 * ist Absicht: Für einen Abruf aus dem Netz gibt es keinen Grund, eine
 * IPv4-Adresse in IPv6-Schreibweise zu verpacken.
 */
export function ipv6Gesperrt(gruppen: number[]): string | null {
  if (gruppen.length !== 8) return "unlesbar";

  const erste = gruppen[0];

  // Weltweiter Bereich 2000::/3 ist der einzige erlaubte.
  if ((erste & 0xE000) !== 0x2000) {
    if (gruppen.every((g, i) => g === (i === 7 ? 1 : 0))) return "Rückschleife";
    if (gruppen.every((g) => g === 0)) return "unbestimmte Adresse";
    if (gruppen[0] === 0 && gruppen[1] === 0 && gruppen[2] === 0
      && gruppen[3] === 0 && gruppen[4] === 0 && gruppen[5] === 0xFFFF) {
      return "IPv4 in IPv6 eingebettet";
    }
    if ((erste & 0xFE00) === 0xFC00) return "eindeutig lokal";
    if ((erste & 0xFFC0) === 0xFE80) return "link-lokal";
    if ((erste & 0xFF00) === 0xFF00) return "Mehrfachempfang";
    return "außerhalb des weltweiten Bereichs";
  }

  if (erste === 0x2001 && gruppen[1] === 0x0000) return "Teredo";
  if (erste === 0x2001 && gruppen[1] === 0x0DB8) return "Dokumentationsnetz";
  if (erste === 0x2002) return "6to4";

  return null;
}

// ---------------------------------------------------------------------------
// Namen
// ---------------------------------------------------------------------------

/** Namen, die nie außerhalb des eigenen Rechners oder Netzes liegen. */
const NAMEN_GESPERRT = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.goog",
  "instance-data",
]);

/**
 * Endungen, die in ein internes Netz zeigen.
 *
 * `.local` ist der Namensdienst im eigenen Netz (mDNS/Bonjour), `.internal`
 * benutzen die Cloudanbieter für ihre eigenen Dienste, darunter
 * `metadata.google.internal`. Die übrigen sind die üblichen Hausnamen.
 */
const ENDUNGEN_GESPERRT = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".home.arpa",
  ".lan",
  ".corp",
  ".private",
];

/**
 * Prüft einen Namen, der keine IP-Adresse ist.
 *
 * Auch ein Name ohne Punkt wird abgelehnt. Ein einteiliger Name wie `router`
 * oder `instance-data` wird über die Suchliste des Netzes vervollständigt und
 * landet damit fast sicher im eigenen Haus. Eine öffentliche Seite hat immer
 * mindestens einen Punkt im Namen.
 */
function nameGesperrt(name: string): string | null {
  const klein = name.toLowerCase().replace(/\.+$/, "");
  if (klein.length === 0) return "leerer Name";
  if (NAMEN_GESPERRT.has(klein)) return "interner Name";
  for (const endung of ENDUNGEN_GESPERRT) {
    if (klein.endsWith(endung)) return `interne Endung ${endung}`;
  }
  if (!klein.includes(".")) return "Name ohne Punkt";
  return null;
}

// ---------------------------------------------------------------------------
// Die eigentliche Prüfung
// ---------------------------------------------------------------------------

/** Nur diese Ports. Alles andere ist kein normaler Webabruf. */
const PORTS_ERLAUBT = new Set(["", "80", "443"]);

/**
 * Darf diese Adresse abgerufen werden?
 *
 * Wird vor dem ersten Abruf und noch einmal nach jeder Weiterleitung
 * aufgerufen. Gibt nie eine Einzelheit an den Aufrufer zurück, der Grund steht
 * nur in `hinweis` fürs Serverprotokoll.
 */
export function pruefeZieladresse(eingabe: unknown): Zielpruefung {
  if (typeof eingabe !== "string" || eingabe.trim().length === 0) {
    return { erlaubt: false, grund: "unlesbar", hinweis: "keine Zeichenkette" };
  }

  let adresse: URL;
  try {
    adresse = new URL(eingabe.trim());
  } catch {
    return { erlaubt: false, grund: "unlesbar", hinweis: "keine gültige Adresse" };
  }

  // Nur http und https. Damit fallen file:, gopher:, ftp:, data: und alles
  // weitere weg, womit sich sonst lokale Dateien lesen ließen.
  if (adresse.protocol !== "http:" && adresse.protocol !== "https:") {
    return { erlaubt: false, grund: "schema", hinweis: `Schema ${adresse.protocol}` };
  }

  // Zugangsdaten in der Adresse sind der älteste Trick, um über das Auge des
  // Lesers hinwegzutäuschen: In http://drive.google.com@127.0.0.1/ ist
  // 127.0.0.1 der Rechner. Die Prüfung unten erkennt das zwar, aber ein
  // solcher Link hat hier ohnehin nichts zu suchen.
  if (adresse.username.length > 0 || adresse.password.length > 0) {
    return { erlaubt: false, grund: "zugangsdaten", hinweis: "Zugangsdaten in der Adresse" };
  }

  if (!PORTS_ERLAUBT.has(adresse.port)) {
    return { erlaubt: false, grund: "port", hinweis: `Port ${adresse.port}` };
  }

  const rechner = adresse.hostname;
  if (rechner.length === 0) {
    return { erlaubt: false, grund: "unlesbar", hinweis: "kein Rechnername" };
  }

  // IPv6 steht in eckigen Klammern. Ein Doppelpunkt im Rechnernamen kann nichts
  // anderes sein, deshalb wird alles, was sich nicht als IPv6 lesen lässt,
  // ebenfalls abgelehnt statt als Name durchgereicht.
  if (rechner.includes(":") || (rechner.startsWith("[") && rechner.endsWith("]"))) {
    const gruppen = alsIPv6(rechner);
    if (gruppen === null) {
      return { erlaubt: false, grund: "ip", hinweis: "unlesbare IPv6-Adresse" };
    }
    const gesperrt = ipv6Gesperrt(gruppen);
    if (gesperrt) {
      return { erlaubt: false, grund: "ip", hinweis: `IPv6 ${gesperrt}` };
    }
    return { erlaubt: true, adresse: adresse.href };
  }

  const vier = alsIPv4(rechner);
  if (vier !== null) {
    const gesperrt = ipv4Gesperrt(vier);
    if (gesperrt) {
      return { erlaubt: false, grund: "ip", hinweis: `IPv4 ${gesperrt}` };
    }
    return { erlaubt: true, adresse: adresse.href };
  }

  const nameFehler = nameGesperrt(rechner);
  if (nameFehler) {
    return { erlaubt: false, grund: "name", hinweis: nameFehler };
  }

  return { erlaubt: true, adresse: adresse.href };
}

/** Kurzform für Stellen, die nur ja oder nein brauchen. */
export function istErlaubteZieladresse(eingabe: unknown): boolean {
  return pruefeZieladresse(eingabe).erlaubt;
}

/** Wirft, wenn die Adresse nicht erlaubt ist. Sonst gibt sie sie zurück. */
export function verlangeErlaubteZieladresse(eingabe: unknown): string {
  const pruefung = pruefeZieladresse(eingabe);
  if (!pruefung.erlaubt || !pruefung.adresse) {
    throw new ZieladresseAbgelehnt(pruefung);
  }
  return pruefung.adresse;
}

// ---------------------------------------------------------------------------
// Abruf mit Prüfung nach jeder Weiterleitung
// ---------------------------------------------------------------------------

export interface AbrufErgebnis {
  antwort: Response;
  /** Die Adresse, bei der die Kette geendet hat. Basis für relative Links. */
  endgueltigeUrl: string;
}

export interface AbrufOptionen {
  headers?: Record<string, string>;
  zeitgrenzeMs?: number;
  maxWeiterleitungen?: number;
}

const STANDARD_KOPF: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (compatible; LovableBot/1.0)",
};

function istWeiterleitung(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Ruft eine Adresse ab und prüft dabei jedes einzelne Ziel.
 *
 * WARUM SELBST WEITERLEITEN
 *
 * Der frühere `fetchWithRedirects` benutzte `redirect: "follow"`. Damit folgt
 * die Laufzeit der Kette allein, und der Aufrufer sieht nur den Anfang und das
 * Ende. Eine Prüfung vor dem Abruf wäre damit wertlos: Ein Angreifer hinterlegt
 * eine harmlose öffentliche Adresse, die mit 302 auf 169.254.169.254
 * weiterleitet, und der Abruf landet trotzdem dort.
 *
 * Deshalb `redirect: "manual"`. Deno gibt die 3xx-Antwort dann samt
 * `Location`-Kopf zurück, statt ihr zu folgen. Diese Schleife löst die Adresse
 * relativ zum aktuellen Schritt auf, schickt sie durch dieselbe Prüfung wie die
 * erste Adresse und macht erst dann weiter. Jedes Zwischenziel wird geprüft,
 * nicht nur das erste.
 *
 * Der Körper einer Weiterleitungsantwort wird verworfen, sonst bliebe die
 * Verbindung offen.
 */
export async function sichereAbfrage(
  start: unknown,
  optionen: AbrufOptionen = {},
): Promise<AbrufErgebnis> {
  const zeitgrenze = optionen.zeitgrenzeMs ?? ZEITGRENZE_MS;
  const maxSchritte = optionen.maxWeiterleitungen ?? MAX_WEITERLEITUNGEN;
  const kopf = { ...STANDARD_KOPF, ...(optionen.headers ?? {}) };

  let aktuell = verlangeErlaubteZieladresse(start);

  for (let schritt = 0; schritt <= maxSchritte; schritt++) {
    const abbruch = new AbortController();
    const wecker = setTimeout(() => abbruch.abort(), zeitgrenze);

    let antwort: Response;
    try {
      antwort = await fetch(aktuell, {
        redirect: "manual",
        headers: kopf,
        signal: abbruch.signal,
      });
    } finally {
      clearTimeout(wecker);
    }

    if (!istWeiterleitung(antwort.status)) {
      return { antwort, endgueltigeUrl: aktuell };
    }

    const ziel = antwort.headers.get("location");
    // Körper verwerfen, sonst bleibt die Verbindung hängen.
    try {
      await antwort.body?.cancel();
    } catch {
      // Ein bereits geschlossener Körper ist kein Fehler.
    }

    if (!ziel) {
      // Weiterleitung ohne Ziel. Nichts mehr zu holen.
      return { antwort, endgueltigeUrl: aktuell };
    }

    let naechste: string;
    try {
      naechste = new URL(ziel, aktuell).href;
    } catch {
      throw new ZieladresseAbgelehnt({
        erlaubt: false,
        grund: "unlesbar",
        hinweis: "unlesbares Weiterleitungsziel",
      });
    }

    // Der Kern der Sache: Das neue Ziel geht durch dieselbe Prüfung.
    aktuell = verlangeErlaubteZieladresse(naechste);
  }

  throw new Error("Zu viele Weiterleitungen");
}

// ---------------------------------------------------------------------------
// Begrenztes Lesen
// ---------------------------------------------------------------------------

/**
 * Liest den Körper einer Antwort, höchstens `maxBytes` weit.
 *
 * Die bisherige Prüfung stand hinter `arrayBuffer()`: Erst wurde alles in den
 * Speicher geladen, danach wurde die Größe angesehen und die Datei verworfen.
 * Eine sehr große Antwort hätte die Function also trotzdem umgebracht. Hier
 * wird stückweise gelesen und beim Überschreiten sofort abgebrochen.
 *
 * Gibt `null` zurück, wenn die Grenze überschritten wurde.
 */
export async function leseBegrenzt(
  antwort: Response,
  maxBytes: number = MAX_ANTWORT_BYTES,
): Promise<Uint8Array | null> {
  const angekuendigt = Number(antwort.headers.get("content-length"));
  if (Number.isFinite(angekuendigt) && angekuendigt > maxBytes) {
    try {
      await antwort.body?.cancel();
    } catch {
      // egal
    }
    return null;
  }

  if (!antwort.body) {
    const puffer = new Uint8Array(await antwort.arrayBuffer());
    return puffer.byteLength > maxBytes ? null : puffer;
  }

  const leser = antwort.body.getReader();
  const stuecke: Uint8Array[] = [];
  let gesamt = 0;

  while (true) {
    const { done, value } = await leser.read();
    if (done) break;
    if (!value) continue;
    gesamt += value.byteLength;
    if (gesamt > maxBytes) {
      try {
        await leser.cancel();
      } catch {
        // egal
      }
      return null;
    }
    stuecke.push(value);
  }

  const ergebnis = new Uint8Array(gesamt);
  let pos = 0;
  for (const stueck of stuecke) {
    ergebnis.set(stueck, pos);
    pos += stueck.byteLength;
  }
  return ergebnis;
}

/** Wie `leseBegrenzt`, gibt aber Text zurück. Leerer Text heißt: zu groß. */
export async function leseTextBegrenzt(
  antwort: Response,
  maxBytes: number = MAX_HTML_BYTES,
): Promise<string> {
  const rohdaten = await leseBegrenzt(antwort, maxBytes);
  if (!rohdaten) return "";
  return new TextDecoder("utf-8", { fatal: false }).decode(rohdaten);
}
