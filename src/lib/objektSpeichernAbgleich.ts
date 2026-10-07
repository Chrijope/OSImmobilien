/**
 * Abgleich für `saveObjekt` (src/lib/objekteStore.ts): was beim Speichern
 * eines Objekts wirklich geschrieben, angelegt oder gelöscht wird.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Bis zum 23.09.2026 löschte `saveObjekt` Einheiten, Objektunterlagen und
 * Objektbilder und legte sie neu an. Über ON DELETE CASCADE verschwanden
 * dabei gesendete Exposé-Links und die Einheitenunterlagen aus Investagon,
 * die Freigaben der Dokumenten-Ampel fielen weg, und Status und Kunde jeder
 * Einheit kamen aus einem womöglich veralteten Zwischenspeicher zurück. Jetzt
 * wird verglichen und nur geschrieben, was sich geändert hat.
 *
 * DREI STÄNDE
 *
 *   eingabe  was der Aufrufer speichern will
 *   basis    was der Aufrufer gesehen hat, also der Zwischenspeicher
 *   bestand  was jetzt in der Datenbank steht, unmittelbar vorher gelesen
 *
 * Ein Feld gilt nur dann als geändert, wenn die Eingabe von der Basis
 * abweicht. Sonst bleibt der Bestand stehen. So schreibt ein älterer Stand im
 * Browser keine Änderung zurück, die inzwischen der Investagon-Import oder
 * ein Kollege gemacht hat.
 *
 * Reine Funktionen ohne Datenbankzugriff, damit sie sich einzeln prüfen
 * lassen. Die Regeln der Vormerkung kommen aus `_shared`, wie im Store.
 */
import { kundeGesetzt, vormerkungAktiv } from "../../supabase/functions/_shared/einheit-vormerkung";

export type Zeile = Record<string, unknown>;

const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Die Kennungen aller Objekttabellen sind UUIDs; alles andere lehnt die Datenbank ab. */
export function istUuid(wert: unknown): wert is string {
  return typeof wert === "string" && UUID_MUSTER.test(wert);
}

function leer(wert: unknown): boolean {
  return wert === null || wert === undefined || wert === "";
}

/** JSON mit sortierten Schlüsseln, damit die Reihenfolge keinen Unterschied macht. */
function stabil(wert: unknown): string {
  return JSON.stringify(wert, (_schluessel, v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v;
    const obj = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
  }) ?? "";
}

/**
 * Sind zwei Werte aus Sicht der Datenbank gleich?
 *
 * Leer (null, undefined, "") ist gleich leer, sonst hielte jede leere Adresse
 * eine Unterlage für geändert. Zahlen dürfen als Text kommen. Objekte und
 * Listen zählen nach Inhalt.
 */
export function wertGleich(a: unknown, b: unknown): boolean {
  if (leer(a) && leer(b)) return true;
  if (leer(a) || leer(b)) return false;
  const zahlArt = (w: unknown) => typeof w === "number" || typeof w === "string";
  if ((typeof a === "number" || typeof b === "number") && zahlArt(a) && zahlArt(b)) {
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return x === y;
  }
  if (typeof a === "object" || typeof b === "object") return stabil(a) === stabil(b);
  return a === b;
}

function alsObjekt(wert: unknown): Zeile {
  return wert && typeof wert === "object" && !Array.isArray(wert) ? (wert as Zeile) : {};
}

function alsListe(wert: unknown): Zeile[] {
  return Array.isArray(wert) ? wert.filter((x): x is Zeile => !!x && typeof x === "object") : [];
}

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

// ── Einheiten ──

export type EinheitStatus = "frei" | "reserviert" | "verkauft";

/** Der Status einer Einheitenzeile in den drei Zuständen des CRM. */
export function einheitStatus(roh: unknown): EinheitStatus {
  const status = String(roh || "").trim().toLowerCase();
  if (status === "reserviert" || status === "gesetzt") return "reserviert";
  if (status === "verkauft") return "verkauft";
  // alles andere (frei, verfuegbar, verfügbar, available, leer, "" …) -> frei
  return "frei";
}

/** Einheitenspalten, die `saveObjekt` an einer vorhandenen Einheit pflegt. */
export const EINHEIT_PFLEGESPALTEN = [
  "we_nr", "etage", "lage", "groesse", "zimmer", "miete_gesamt", "vk_gesamt", "qm_preis", "rendite", "vermietet",
] as const;

/**
 * Status, Kunde, Reservierung und Vormerkung einer Einheit.
 *
 * Die gehören allein den Reservierungswegen: `reserveWohnung`,
 * `updateWohnung`, den Datenbankfunktionen und dem Auslöser
 * `wohnung_reservierung_pruefen`. `saveObjekt` schreibt sie an einer
 * vorhandenen Einheit nie und legt eine neue Einheit ohne Kunden an.
 */
export const EINHEIT_RESERVIERUNGSSPALTEN = [
  "status", "kunde_id", "kunde_name", "reserviert_am", "gesetzt_am", "gesetzt_bis", "reserviert_von",
  "vorgemerkt_bis", "vorgemerkt_kunde_id", "vorgemerkt_kunde_name", "vorgemerkt_berater_name", "vorgemerkt_von",
] as const;

/**
 * Schlüssel in `wohnungen.meta`, die `saveObjekt` nie schreibt. Der Berater
 * gehört zur Reservierung, Kennung und Originaldatensatz führt Investagon.
 */
export const EINHEIT_META_FREMD = ["beraterName", "investagonId", "investagonRaw"] as const;

/** Unterlagen und Bilder in `meta` nach Inhalt vergleichen; der Assistent vergibt bei jedem Speichern neue Kennungen. */
function metaWertGleich(schluessel: string, a: unknown, b: unknown): boolean {
  if (schluessel === "dokumente") {
    const inhalt = (w: unknown) => alsListe(w).map((d) => ({ name: d.name ?? "", url: d.url ?? "", kategorie: d.kategorie ?? "" }));
    return wertGleich(inhalt(a), inhalt(b));
  }
  if (schluessel === "bilder") {
    const inhalt = (w: unknown) => alsListe(w).map((x) => ({ url: x.url ?? "", alt: x.alt ?? "", reihenfolge: Number(x.reihenfolge) || 0 }));
    return wertGleich(inhalt(a), inhalt(b));
  }
  return wertGleich(a, b);
}

export interface EinheitAenderung {
  /** Was per UPDATE geschrieben wird. Leer heißt: an dieser Einheit ist nichts zu tun. */
  werte: Zeile;
  /** Die Eingabe wollte den Verkaufsstatus ändern. Das geht hier nicht, der Aufrufer sagt es. */
  statusVerlangt: EinheitStatus | null;
}

/**
 * Was an einer vorhandenen Einheit geschrieben wird.
 *
 * `eingabe` und `basis` sind Zeilen aus `wohnungToDbRow`, `bestand` ist die
 * frisch gelesene Zeile. `ohneMeta` nennt meta-Schlüssel, die die Eingabe gar
 * nicht mitbringt (etwa `bilder`, wenn der Aufrufer keine Bilder kennt).
 *
 * `meta` wird zusammengeführt wie in `updateWohnung`: Der Bestand bleibt,
 * nur die geänderten Schlüssel kommen darüber.
 */
export function einheitAenderung(e: {
  eingabe: Zeile;
  basis: Zeile;
  bestand: Zeile;
  ohneMeta?: readonly string[];
}): EinheitAenderung {
  const { eingabe, basis, bestand } = e;
  const werte: Zeile = {};
  for (const spalte of EINHEIT_PFLEGESPALTEN) {
    if (wertGleich(eingabe[spalte], basis[spalte])) continue;
    if (wertGleich(eingabe[spalte], bestand[spalte])) continue;
    werte[spalte] = eingabe[spalte];
  }

  const eingabeMeta = alsObjekt(eingabe.meta);
  const basisMeta = alsObjekt(basis.meta);
  const bestandMeta = alsObjekt(bestand.meta);
  const ausgelassen = new Set<string>([...EINHEIT_META_FREMD, ...(e.ohneMeta ?? [])]);
  const metaNeu: Zeile = {};
  for (const [schluessel, wert] of Object.entries(eingabeMeta)) {
    if (ausgelassen.has(schluessel)) continue;
    if (metaWertGleich(schluessel, wert, basisMeta[schluessel])) continue;
    if (metaWertGleich(schluessel, wert, bestandMeta[schluessel])) continue;
    metaNeu[schluessel] = wert;
  }
  if (Object.keys(metaNeu).length > 0) werte.meta = { ...bestandMeta, ...metaNeu };

  const gewuenscht = einheitStatus(eingabe.status);
  const statusVerlangt = gewuenscht !== einheitStatus(basis.status) && gewuenscht !== einheitStatus(bestand.status)
    ? gewuenscht
    : null;
  return { werte, statusVerlangt };
}

/**
 * Die Zeile einer neuen Einheit, ohne Kunde, Reservierung und Vormerkung.
 * Der Status kommt aus der Eingabe, Standard frei.
 */
export function neueEinheitZeile(zeile: Zeile): Zeile {
  const neu: Zeile = { ...zeile };
  for (const spalte of EINHEIT_RESERVIERUNGSSPALTEN) delete neu[spalte];
  neu.status = einheitStatus(zeile.status);
  const meta = { ...alsObjekt(zeile.meta) };
  delete meta.beraterName;
  neu.meta = meta;
  return neu;
}

/**
 * Was außerhalb der Einheitenzeile an einer Einheit hängt. Beim Löschen ginge
 * es verloren oder zeigte ins Leere, deshalb gehört es zur Löschsperre.
 */
export interface EinheitBezuege {
  /** Investments, deren `meta.wohnungId` auf die Einheit zeigt. */
  investments: number;
  /**
   * Gesendete, nicht zurückgezogene Kundenlinks an der Einheit
   * (`objekt_exposes`). `wohnung_id` hängt mit ON DELETE CASCADE an
   * `wohnungen`, das Löschen nähme den Link samt Verlauf im Kundenprofil mit.
   */
  offeneLinks: number;
}

export const KEINE_BEZUEGE: EinheitBezuege = { investments: 0, offeneLinks: 0 };

/** Die Einheit, auf die ein Investment zeigt (`meta.wohnungId`), sonst leer. */
export function investmentEinheit(investment: Zeile): string {
  return text(alsObjekt(investment.meta).wohnungId);
}

/**
 * Warum eine Einheit nicht gelöscht werden darf, oder null. Der Grund ist
 * ein Nebensatz für „…, weil <Grund>.“
 *
 * Christians Regel vom 23.09.2026, nie löschen: keine Einheit mit Kunde,
 * Reservierung, Vormerkung oder Verkauf, und keine aus Investagon. Die führt
 * Investagon, und der Import löscht nie. Seit demselben Tag auch keine, auf
 * die ein Investment verweist oder an der ein gesendeter Kundenlink hängt.
 *
 * Die eine Regel für beide Wege: das Entfernen beim Speichern des Objekts
 * (`saveObjekt`) und den Mülleimer an der Einheit (`deleteWohnung`). Geprüft
 * wird die frisch gelesene Zeile, nicht der Zwischenspeicher. Die Bezüge sind
 * Pflicht, damit kein Aufrufer sie vergisst.
 */
export function einheitLoeschSperre(zeile: Zeile, bezuege: EinheitBezuege, jetzt: Date = new Date()): string | null {
  const status = einheitStatus(zeile.status);
  if (status === "verkauft") return "sie verkauft ist";
  if (status === "reserviert") return "sie reserviert ist";
  if (kundeGesetzt(text(zeile.kunde_id)) || text(zeile.kunde_name)) return "an ihr ein Kunde hängt";
  if (text(zeile.reserviert_von)) return "sie reserviert ist";
  if (vormerkungAktiv({ vorgemerktBis: text(zeile.vorgemerkt_bis) || null }, jetzt)) {
    return "sie gerade für einen Kunden vorgemerkt ist";
  }
  if (text(alsObjekt(zeile.meta).investagonId)) return "sie aus Investagon kommt und dort gepflegt wird";
  if (bezuege.investments === 1) return "ein Investment auf sie verweist";
  if (bezuege.investments > 1) return `${bezuege.investments} Investments auf sie verweisen`;
  if (bezuege.offeneLinks === 1) return "an ihr ein gesendeter Kundenlink hängt, der nicht zurückgezogen ist";
  if (bezuege.offeneLinks > 1) {
    return `an ihr ${bezuege.offeneLinks} gesendete Kundenlinks hängen, die nicht zurückgezogen sind`;
  }
  return null;
}

// ── Unterlagen und Bilder ──

export interface ZeilenAbgleich {
  /** Neue und geänderte Zeilen, in einem gemeinsamen Upsert zu schreiben. */
  schreiben: Zeile[];
  /** Zeilen des Bestands, die in der Eingabe fehlen. */
  loeschen: Zeile[];
  /** Eingaben, die anderswo schon gelöscht wurden und deshalb nicht neu entstehen. */
  anderswoGeloescht: Zeile[];
}

/**
 * Abgleich einer Kindtabelle (Objektbilder, Objektunterlagen, Einheitenbilder).
 *
 * Eine Eingabezeile gehört zu einer Bestandszeile mit derselben Kennung,
 * sonst zu einer mit demselben Inhalt (`inhalt`, etwa die Adresse). Das
 * zweite ist wichtig: Der Objektassistent vergibt für manche Unterlagen bei
 * jedem Speichern neue Kennungen. Ohne den Abgleich nach Inhalt entstünde
 * jedes Mal eine neue Zeile, und die alte samt Freigabe fiele weg.
 *
 * Geschrieben wird eine Zeile nur, wenn sich eines der `felder` geändert hat,
 * und zwar im Dreischritt von oben: Nur Felder, die von der `basis`
 * abweichen, kommen aus der Eingabe, alle anderen aus dem Bestand.
 *
 * `bekannt` sagt, ob der Zwischenspeicher eine Kennung kennt. Kennt er sie,
 * die Datenbank aber nicht mehr, hat jemand die Zeile inzwischen gelöscht; sie
 * entsteht dann nicht neu. Nur bei vorhandenen Objekten sinnvoll.
 */
export function zeilenAbgleich(e: {
  eingabe: Zeile[];
  bestand: Zeile[];
  felder: readonly string[];
  inhalt: (zeile: Zeile) => string;
  basis?: (id: string) => Zeile | undefined;
  bekannt?: (id: string) => boolean;
  neueKennung?: () => string;
}): ZeilenAbgleich {
  const neueKennung = e.neueKennung ?? (() => crypto.randomUUID());
  const bestandNachId = new Map(e.bestand.map((z) => [String(z.id), z]));
  const vergeben = new Set<string>();
  const genutzteIds = new Set<string>();
  const inhalte = new Set<string>();
  const schreiben: Zeile[] = [];
  const anderswoGeloescht: Zeile[] = [];

  for (const eingabe of e.eingabe) {
    const eigeneId = String(eingabe.id ?? "");
    const inhalt = e.inhalt(eingabe);
    const perId = bestandNachId.get(eigeneId);
    let ziel: Zeile | undefined;
    if (perId && !vergeben.has(eigeneId)) ziel = perId;
    else if (!perId) ziel = e.bestand.find((z) => !vergeben.has(String(z.id)) && e.inhalt(z) === inhalt);

    if (!ziel) {
      // Dieselbe Unterlage zweimal in der Eingabe: einmal reicht.
      if (inhalte.has(inhalt)) continue;
      if (!perId && e.bekannt && eigeneId && e.bekannt(eigeneId)) {
        anderswoGeloescht.push(eingabe);
        continue;
      }
    }
    inhalte.add(inhalt);

    if (ziel) {
      const id = String(ziel.id);
      vergeben.add(id);
      genutzteIds.add(id);
      const basis = e.basis?.(id) ?? ziel;
      const zeile: Zeile = { ...eingabe, id };
      let geaendert = false;
      for (const feld of e.felder) {
        const vomNutzer = !wertGleich(eingabe[feld], basis[feld]);
        zeile[feld] = vomNutzer ? eingabe[feld] : ziel[feld];
        if (!wertGleich(zeile[feld], ziel[feld])) geaendert = true;
      }
      if (geaendert) schreiben.push(zeile);
      continue;
    }

    const id = istUuid(eigeneId) && !genutzteIds.has(eigeneId) && !bestandNachId.has(eigeneId) ? eigeneId : neueKennung();
    genutzteIds.add(id);
    schreiben.push({ ...eingabe, id });
  }

  const loeschen = e.bestand.filter((z) => !vergeben.has(String(z.id)));
  return { schreiben, loeschen, anderswoGeloescht };
}

/**
 * Kennt der Zwischenspeicher alle Zeilen des Bestands?
 *
 * Große Tabellen kommen blockweise in den Zwischenspeicher, und eine Tabelle
 * gilt schon nach dem ersten Block als geladen. Fehlt dort eine Zeile, hat
 * der Aufrufer sie nie gesehen; ihr Fehlen in der Eingabe ist dann kein
 * Löschwunsch. Solange das so ist, wird in dieser Tabelle nichts gelöscht.
 */
export function zwischenspeicherVollstaendig(bestand: Zeile[], bekannt: (id: string) => boolean): boolean {
  return bestand.every((z) => bekannt(String(z.id)));
}
