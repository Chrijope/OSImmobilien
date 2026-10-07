/**
 * Mehrere Unterlagen als ZIP bündeln.
 *
 * Zwei Wege führen hier hinein:
 *
 * 1. Der Reiter „Dokumente“ auf Objekt- und Einheitsseite (seit dem
 *    24.09.2026, Christian). Er übergibt die gespeicherten Werte, also Zeiger
 *    wie `/objekt-dokument/…` oder `/investagon-dokument/…`, und jede Datei
 *    bekommt ihre befristete Adresse erst direkt vor dem Laden, über
 *    `resolveUnterlagenUrl`. Das ist genau der Weg des Einzeldownloads: Wer
 *    eine Datei einzeln nicht bekommt, bekommt sie hier auch nicht. Die
 *    Grenze ziehen weiterhin die Leseregeln auf `objekt_dokumente`,
 *    `wohnungs_dokumente` und den Eimern, nicht dieser Code.
 *
 * 2. `ladeAlsZip` für die alte Wohnungsansicht, die ihre Adressen schon selbst
 *    befristet hat.
 *
 * Gemeinsam gilt: Die Dateien werden nacheinander geladen, nicht alle auf
 * einmal. Dreißig gleichzeitige Abrufe legen auf dem Handy die Verbindung
 * lahm, und eine Stunde gültige Adressen laufen bei einem großen Haus sonst
 * ab, bevor die letzte Datei an der Reihe ist. Was nicht lädt, bricht den
 * Rest nicht ab, sondern steht mit Grund in „Nicht enthalten.txt“.
 */

import { dateiEndung, liegtAufFremdemServer } from "@/lib/dokumentGruppen";
import { resolveUnterlagenUrl } from "@/lib/storage";

export interface ZipDatei {
  name: string;
  /** Der gespeicherte Wert (Zeiger) oder eine fertige Adresse, je nach Lader. */
  url: string;
  /** Unterordner in der ZIP-Datei, etwa „Objekt“. Ohne Angabe liegt die Datei oben. */
  ordner?: string;
}

export interface NichtEnthalten {
  /** Der Anzeigename, wie er im CRM steht. */
  name: string;
  ordner?: string;
  grund: string;
}

export interface ZipPaket {
  /** Die fertige ZIP-Datei, oder null, wenn keine einzige Datei hineinkam. */
  blob: Blob | null;
  gepackt: number;
  gesamt: number;
  nichtEnthalten: NichtEnthalten[];
}

export interface ZipFortschritt {
  fertig: number;
  gesamt: number;
}

/** Holt den Inhalt einer Datei. Wirft mit einem lesbaren Grund, wenn es nicht geht. */
export type DateiLader = (url: string, signal?: AbortSignal) => Promise<Blob>;

/** Der Name der Liste mit allem, was fehlt. */
export const NICHT_ENTHALTEN_DATEI = "Nicht enthalten.txt";

/* =============================================================
 * Wer darf
 * ============================================================= */

/**
 * Die Rollen, die Unterlagen als ZIP herunterladen dürfen.
 *
 * Ein Spiegel von `is_internal_role` in der Datenbank (Stand Migration
 * 20260403110042), denn genau diese Rollen dürfen Objekt- und
 * Wohnungsunterlagen heute schon einzeln lesen. Kunde, Tippgeber und Bewerber
 * stehen bewusst nicht darin. Die Liste ist keine Zugriffskontrolle, sie
 * blendet nur den Knopf aus; hielte sie sich nicht an die Datenbank, gäbe der
 * Speicher einer fremden Rolle trotzdem keine Adresse heraus.
 */
export const ZIP_ROLLEN: readonly string[] = [
  "admin", "inhaber", "vertriebspartner", "hausverwaltung", "buchhaltung",
  "setterin", "objektpartner", "finanzierungspartner", "individuell", "testaccount",
  "marketing", "hr", "backoffice", "vertriebsleiter", "versicherungsexperte",
];

export function darfUnterlagenAlsZip(rolle: string | null | undefined): boolean {
  return !!rolle && ZIP_ROLLEN.includes(rolle);
}

/** Ein Eintrag ohne Datei: leerer Platzhalter oder der Galerie-Knopf der alten Objektansicht. */
export function istPlatzhalter(url: string | null | undefined): boolean {
  const wert = (url || "").trim();
  return wert === "" || wert === "__gallery__";
}

/**
 * Was in die ZIP-Datei gehört, für diese Rolle.
 *
 * Genau die Einträge, die die Liste zeigt und einzeln herunterladen lässt,
 * ohne Platzhalter. Eine Rolle ohne Zugang bekommt eine leere Liste.
 * `ordner` gibt je Bereich den Unterordner an; ohne Angabe liegt alles oben.
 */
export function zipDateienAusBereichen(
  bereiche: Array<{ schluessel: string; eintraege: Array<{ name: string; url: string }> }>,
  rolle: string | null | undefined,
  ordner?: (schluessel: string) => string | undefined,
): ZipDatei[] {
  if (!darfUnterlagenAlsZip(rolle)) return [];
  return bereiche.flatMap((b) =>
    b.eintraege
      .filter((e) => !istPlatzhalter(e.url))
      .map((e) => ({ name: e.name, url: e.url, ordner: ordner?.(b.schluessel) })),
  );
}

/* =============================================================
 * Namen
 * ============================================================= */

/** Zeichen, die im Dateinamen nichts verloren haben: Steuerzeichen und Richtungsumschalter. */
function istUnsichtbaresZeichen(zeichen: string): boolean {
  const n = zeichen.codePointAt(0) ?? 0;
  return n < 0x20 || (n >= 0x7f && n <= 0x9f)
    // Nullbreite und Richtungsmarken. Ein umgedrehter Name täuscht sonst eine andere Endung vor.
    || (n >= 0x200b && n <= 0x200f) || (n >= 0x202a && n <= 0x202e) || (n >= 0x2066 && n <= 0x2069)
    || n === 0xfeff;
}

/**
 * Ein Name, den jedes Dateisystem annimmt.
 *
 * Ohne Steuerzeichen, ohne Schrägstriche und die übrigen unter Windows
 * verbotenen Zeichen, ohne Punkte am Anfang und Ende. Ein Name wie
 * „../../x“ kann damit nie aus dem Ordner der ZIP-Datei herausführen.
 */
export function sichererDateiname(roh: string | null | undefined, rueckfall = "Dokument", hoechstens = 120): string {
  const ohneSteuerzeichen = Array.from((roh || "").normalize("NFC")).filter((z) => !istUnsichtbaresZeichen(z)).join("");
  const sauber = ohneSteuerzeichen
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "");
  const gekuerzt = Array.from(sauber).slice(0, hoechstens).join("").replace(/[.\s]+$/, "");
  if (!gekuerzt) return rueckfall;
  // Namen, die Windows für Geräte hält, ließen sich dort nicht entpacken.
  return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(gekuerzt) ? `_${gekuerzt}` : gekuerzt;
}

/**
 * Der Name einer Datei in der ZIP-Datei, noch ohne Nummer.
 *
 * Die Endung kommt aus dem Anzeigenamen, sonst aus dem Ablagepfad. Der
 * Anzeigename trägt oft keine („Teilungserklärung“), der Pfad schon.
 */
export function zipEintragName(name: string, gespeichert: string): { basis: string; endung: string } {
  const ausName = dateiEndung(name);
  const endung = ausName || dateiEndung(gespeichert);
  const ohneEndung = ausName ? name.slice(0, name.length - ausName.length - 1) : name;
  return { basis: sichererDateiname(ohneEndung), endung };
}

/** Das Datum für Dateinamen, nach Tagen sortierbar: 2026-09-24. */
function datumFuerDateiname(datum: Date): string {
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${datum.getFullYear()}-${zwei(datum.getMonth() + 1)}-${zwei(datum.getDate())}`;
}

/** „WE 12“ und „12“ meinen dieselbe Wohnung. */
export function wohnungsNummer(weNr: string | number | null | undefined): string {
  return String(weNr ?? "").replace(/^WE\s*/i, "").trim();
}

/**
 * Der Name der ZIP-Datei, etwa „Unterlagen Friesenstraße 5 WE 12 2026-09-24.zip“.
 *
 * `zusatz` unterscheidet die Knöpfe auf der Einheitsseite, etwa „Objekt“.
 */
export function zipDateiname(angaben: {
  objektTitel?: string | null;
  weNr?: string | number | null;
  zusatz?: string;
  datum?: Date;
}): string {
  const nr = wohnungsNummer(angaben.weNr);
  const teile = [
    "Unterlagen",
    (angaben.objektTitel || "").trim() || "Objekt",
    nr ? `WE ${nr}` : "",
    angaben.zusatz || "",
    datumFuerDateiname(angaben.datum ?? new Date()),
  ].filter(Boolean);
  return `${sichererDateiname(teile.join(" "), "Unterlagen", 150)}.zip`;
}

/* =============================================================
 * Laden
 * ============================================================= */

const GRUND_FREMD = "liegt auf einem fremden Server (etwa bei Investagon) und lässt sich nur einzeln im CRM öffnen.";
const GRUND_KEINE_ADRESSE = "kein Zugriff, oder die Datei liegt nicht mehr im Speicher.";
const GRUND_VERBINDUNG = "ließ sich nicht laden, vielleicht war die Verbindung kurz weg.";

function abbruchFehler(): Error {
  return typeof DOMException === "function"
    ? new DOMException("Abgebrochen", "AbortError")
    : Object.assign(new Error("Abgebrochen"), { name: "AbortError" });
}

export function istAbbruch(fehler: unknown): boolean {
  return !!fehler && typeof fehler === "object" && (fehler as { name?: string }).name === "AbortError";
}

async function holen(url: string, signal?: AbortSignal): Promise<Blob> {
  let antwort: Response;
  try {
    antwort = await fetch(url, { signal });
  } catch (e) {
    if (istAbbruch(e) || signal?.aborted) throw abbruchFehler();
    throw new Error(GRUND_VERBINDUNG);
  }
  if (!antwort.ok) throw new Error(`ließ sich nicht laden (Fehler ${antwort.status}).`);
  return antwort.blob();
}

/**
 * Der Lader für den Reiter „Dokumente“: derselbe Weg wie der Einzeldownload.
 *
 * Aus dem gespeicherten Wert wird über `resolveUnterlagenUrl` die befristete
 * Adresse, mit der Anmeldung des Betrachters. Eine Datei auf einem fremden
 * Server gibt ihren Inhalt dem Browser nicht heraus; der Einzeldownload öffnet
 * sie deshalb im neuen Tab. In der ZIP-Datei fehlt sie und steht in der Liste.
 */
export const ladeUnterlageFuerZip: DateiLader = async (gespeichert, signal) => {
  if (liegtAufFremdemServer(gespeichert)) throw new Error(GRUND_FREMD);
  const url = await resolveUnterlagenUrl(gespeichert);
  if (signal?.aborted) throw abbruchFehler();
  if (!url) throw new Error(GRUND_KEINE_ADRESSE);
  if (liegtAufFremdemServer(url)) throw new Error(GRUND_FREMD);
  return holen(url, signal);
};

/** Der Lader für schon fertige Adressen, wie sie die alte Wohnungsansicht übergibt. */
const ladeAdresse: DateiLader = (url, signal) => holen(url, signal);

/* =============================================================
 * Packen
 * ============================================================= */

/** Der Text in „Nicht enthalten.txt“. Mit Windows-Zeilenenden, damit auch der alte Editor ihn lesen kann. */
export function nichtEnthaltenText(liste: NichtEnthalten[]): string {
  const zeilen = [
    "Diese Dateien sind nicht in der ZIP-Datei enthalten:",
    "",
    ...liste.map((n) => `${n.ordner ? `${n.ordner}/` : ""}${n.name}: ${n.grund}`),
    "",
    "Einzeln lassen sie sich im CRM im Reiter „Dokumente“ öffnen.",
  ];
  return zeilen.join("\r\n") + "\r\n";
}

/**
 * Lädt die Dateien nacheinander und packt sie.
 *
 * Platzhalter ohne Datei fallen still weg, sie sind keine Unterlage. Gleiche
 * Namen im selben Ordner werden nummeriert („Grundriss (2).pdf“), sonst
 * überschriebe die zweite Datei die erste. Groß und klein zählen dabei als
 * gleich, weil Windows und macOS sie nicht unterscheiden.
 *
 * Wird `signal` abgebrochen, wirft die Funktion einen `AbortError` und liefert
 * nichts; ein halbes Archiv wird nie gespeichert.
 */
export async function packeZip(
  dateien: ZipDatei[],
  optionen: { laden: DateiLader; signal?: AbortSignal; onFortschritt?: (f: ZipFortschritt) => void },
): Promise<ZipPaket> {
  const { laden, signal, onFortschritt } = optionen;
  const brauchbar = dateien.filter((d) => !istPlatzhalter(d.url));
  const gesamt = brauchbar.length;
  const nichtEnthalten: NichtEnthalten[] = [];
  const vergeben = new Set<string>([NICHT_ENTHALTEN_DATEI.toLowerCase()]);

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let gepackt = 0;

  onFortschritt?.({ fertig: 0, gesamt });
  for (let i = 0; i < brauchbar.length; i++) {
    if (signal?.aborted) throw abbruchFehler();
    const dok = brauchbar[i];
    const ordner = dok.ordner ? sichererDateiname(dok.ordner, "Ordner") : undefined;
    try {
      const inhalt = await laden(dok.url, signal);
      const { basis, endung } = zipEintragName(dok.name, dok.url);
      const vorne = ordner ? `${ordner}/` : "";
      let pfad = `${vorne}${basis}${endung ? `.${endung}` : ""}`;
      for (let nr = 2; vergeben.has(pfad.toLowerCase()); nr++) {
        pfad = `${vorne}${basis} (${nr})${endung ? `.${endung}` : ""}`;
      }
      vergeben.add(pfad.toLowerCase());
      zip.file(pfad, inhalt);
      gepackt++;
    } catch (e) {
      if (istAbbruch(e) || signal?.aborted) throw abbruchFehler();
      const grund = e instanceof Error && e.message ? e.message : GRUND_VERBINDUNG;
      nichtEnthalten.push({ name: dok.name, ordner: dok.ordner, grund });
    }
    onFortschritt?.({ fertig: i + 1, gesamt });
  }

  if (gepackt === 0) return { blob: null, gepackt, gesamt, nichtEnthalten };
  if (nichtEnthalten.length > 0) zip.file(NICHT_ENTHALTEN_DATEI, nichtEnthaltenText(nichtEnthalten));
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/zip" });
  if (signal?.aborted) throw abbruchFehler();
  return { blob, gepackt, gesamt, nichtEnthalten };
}

/** Die Rückmeldung nach dem Packen, als Toast gedacht. */
export function zipMeldung(paket: Pick<ZipPaket, "gepackt" | "gesamt" | "nichtEnthalten">): {
  art: "erfolg" | "teilweise" | "nichts";
  text: string;
} {
  const fehlen = paket.nichtEnthalten.length;
  if (paket.gepackt === 0) {
    return { art: "nichts", text: "Keine der Dateien ließ sich laden. Versuch es bitte gleich noch einmal." };
  }
  if (fehlen === 0) {
    return { art: "erfolg", text: `${paket.gepackt} ${paket.gepackt === 1 ? "Datei" : "Dateien"} als ZIP heruntergeladen.` };
  }
  return {
    art: "teilweise",
    text: `${paket.gepackt} von ${paket.gesamt} Dateien in der ZIP-Datei. ${fehlen} ${fehlen === 1 ? "fehlt" : "fehlen"}, die Gründe stehen in „${NICHT_ENTHALTEN_DATEI}“.`,
  };
}

/** Die fertige Datei im Browser speichern. */
export function speichereZip(blob: Blob, dateiname: string): void {
  const objektUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objektUrl;
  link.download = dateiname;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Erst später freigeben: Manche Browser lesen die Datei nach dem Klick noch.
  setTimeout(() => URL.revokeObjectURL(objektUrl), 60_000);
}

/* =============================================================
 * Alte Wohnungsansicht
 * ============================================================= */

export interface ZipErgebnis {
  /** Wie viele Dateien im Archiv gelandet sind. */
  gepackt: number;
  /** Namen der Dateien, die nicht geladen werden konnten. */
  fehlgeschlagen: string[];
}

/**
 * Lädt schon befristete Adressen und stößt den Download an.
 *
 * Für `WohnungDetail`. Wirft nur, wenn gar nichts geladen werden konnte oder
 * das Packen selbst scheitert. Ein leeres Archiv wird nicht heruntergeladen.
 */
export async function ladeAlsZip(dateien: ZipDatei[], archivName: string): Promise<ZipErgebnis> {
  if (!dateien.some((d) => !istPlatzhalter(d.url))) throw new Error("Keine Dateien vorhanden.");
  const paket = await packeZip(dateien, { laden: ladeAdresse });
  if (!paket.blob) throw new Error("Keine der Dateien konnte geladen werden.");
  speichereZip(paket.blob, `${sichererDateiname(archivName, "Unterlagen")}.zip`);
  return { gepackt: paket.gepackt, fehlgeschlagen: paket.nichtEnthalten.map((n) => n.name) };
}
