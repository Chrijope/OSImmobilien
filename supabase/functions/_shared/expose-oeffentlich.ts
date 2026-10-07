/**
 * Was ein Exposé ohne Anmeldung herausgeben darf.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * `get-expose` hat bis zum 16.09.2026 `select("*")` gelesen und das Ergebnis
 * unverändert ausgeliefert. Damit stand im öffentlichen Datenstrom jedes
 * Exposés:
 *
 *   - `meta.investagonRaw.commission`, die eigene Provision
 *   - `meta.investagonRaw.files`, die Adressen SÄMTLICHER Unterlagen, darunter
 *     Mietverträge, Grundbuchauszüge und Betriebskostenabrechnungen. Diese
 *     Adressen liegen auf tool.investagon.com und sind ohne jede Anmeldung
 *     abrufbar (am 16.09.2026 nachgemessen: Status 200, 4 MB PDF).
 *   - `kunde_id` und `kunde_name` an reservierten Einheiten, also der Name des
 *     Käufers
 *
 * Ein Mietvertrag nennt den Mieter. Das sind personenbezogene Daten Dritter,
 * und sie hatten in einer öffentlichen Antwort nichts verloren.
 *
 * DIE ENTSCHEIDUNG: POSITIVLISTE, NICHT NEGATIVLISTE
 *
 * Eine Sperrliste muss bei jedem neuen Feld nachgezogen werden, und wer sie
 * vergisst, merkt nichts davon. Eine Positivliste fällt dagegen sofort auf:
 * Das Exposé zeigt ein Feld nicht mehr, jemand meldet es, es wird bewusst
 * aufgenommen. Der Fehler wird laut statt still. Genau deshalb ist hier alles
 * verboten, was nicht ausdrücklich erlaubt ist.
 *
 * Wer ein Feld ergänzt, prüft zuerst: Darf ein Fremder das sehen?
 */

import { koordinatenAus } from "./objekt-koordinaten.ts";
import { mitHausgeldMonat } from "./einheit-hausgeld.ts";

/** Spalten des Objekts, die ins öffentliche Exposé dürfen. */
const OBJEKT_SPALTEN = [
  "id", "titel", "adresse", "plz", "ort", "beschreibung", "bild_url", "badge",
  "status", "sichtbar", "highlights", "video_url", "video_sichtbar",
  "preis_von", "preis_bis", "groesse_von", "groesse_bis", "rendite_von", "rendite_bis",
  "afa_modell", "afa_satz", "restnutzungsdauer", "sanierungskosten",
  "erhaltungsaufwand", "erhaltungsaufwand_jahre", "bodenrichtwert", "grundstueck_anteil",
  "global_objekt", "global_baujahr", "global_etagen", "global_gesamt_qm",
  "global_grundstueck_qm", "global_rendite", "global_verkaufspreis",
  "global_jahresnettomiete", "global_hausgeld_monat", "global_kaufnebenkosten",
  "global_stellplaetze", "global_vermietungsstand", "global_zustand",
  "global_energieeffizienzklasse",
] as const;

/**
 * Spalten einer Einheit.
 *
 * Bewusst NICHT dabei: `kunde_id`, `kunde_name`, `gesetzt_am`, `gesetzt_bis`,
 * `reserviert_am`. Wer eine Wohnung gekauft hat, geht niemanden etwas an, der
 * zufällig einen Exposé-Link besitzt. Der Zustand „frei, reserviert, verkauft“
 * reicht dem Interessenten vollkommen.
 */
const WOHNUNG_SPALTEN = [
  "id", "objekt_id", "we_nr", "etage", "lage", "groesse", "zimmer",
  "miete_gesamt", "vk_gesamt", "qm_preis", "rendite", "vermietet", "status",
] as const;

/**
 * Schlüssel aus `meta`, die mitdürfen.
 *
 * Das sind die Angaben aus der Objektpflege, also genau die, die das Exposé
 * zeigen soll, plus die Bilder.
 *
 * Bewusst NICHT dabei (seit dem 23.09.2026, Befund 1 im Bauplan
 * Kundenansicht): `dokumente` und `unterlagenLink`. `meta.dokumente` trug
 * die Wohnungsunterlagen ungefiltert samt interner Namen und Ablagepfade
 * hinaus, `unterlagenLink` ist der Sammelordner mit allem. Die Unterlagen
 * gehen nur noch einzeln geprüft hinaus, siehe `unterlagen.ts`.
 */
const META_SCHLUESSEL = [
  "kurzbeschreibung", "standortargumente",
  "gemeinschaftseigentum", "sanierungen", "verwaltung", "objektart",
  "bilder", "zeitplan", "kalkulation", "kalk",
  "einzelwohnung", "vermietungsStatus", "stadtteil", "einheitenImHaus",
  "nebenkostenMonat", "mietgarantieKalt", "mietgarantieMonate",
  "hausgeldMonat", "hausgeldNichtUmlagefaehigEuro", "hausgeldNichtUmlagefaehigP",
  "ruecklageWohnung", "stellplatzPreis", "stellplatzMiete",
  "neueMiete", "mieterhoehungAb", "vermietetSeit",
  "sanierungsjahr", "sanierungAnteilProzent", "sanierungAnteilBetrag",
  "verwaltungWegMonat", "verwaltungSevMonat", "sevErstesJahrInklusive",
] as const;

/**
 * Felder aus `investagonRaw`, die mitdürfen.
 *
 * Alles, was ein Interessent im Exposé sehen soll, und keines mehr. Nicht
 * dabei sind unter anderem `commission`, `selling_price_commission`,
 * `transaction_broker_rate`, sämtliche Finanzierungsparameter und
 * `pricehubble_stats_json`.
 */
const ROHDATEN_FELDER = [
  "extras", "tags",
  "object_building_year", "object_renovation_year", "object_floor",
  "object_balcony", "object_apartment_type", "object_rooms", "object_size",
  "object_share_owner", "share_land", "transaction_tax_rate",
  "heating_type", "energy_certificate_type", "energy_efficiency_class",
  "property_kind", "property_usage", "rent_status", "rented_since",
  "statusName", "active",
] as const;

/**
 * Die Angaben des Energieausweises, die mitdürfen. Nur schlichte Werte, keine
 * Datei und keine Adresse: Das Exposé zeigt daraus Art, Kennwert, Klasse,
 * Energieträger und Gültigkeit.
 */
const ENERGIEAUSWEIS_FELDER = ["art", "kennwert", "klasse", "energietraeger", "gueltigBis"] as const;

function nurErlaubte<T extends Record<string, unknown>>(
  quelle: T | null | undefined,
  erlaubt: readonly string[],
): Record<string, unknown> {
  if (!quelle || typeof quelle !== "object") return {};
  const ziel: Record<string, unknown> = {};
  for (const schluessel of erlaubt) {
    if (schluessel in quelle) ziel[schluessel] = (quelle as Record<string, unknown>)[schluessel];
  }
  return ziel;
}

/**
 * Die Rohdaten auf das Erlaubte zusammenstreichen.
 *
 * `files` geht seit dem 23.09.2026 gar nicht mehr hinaus, auch nicht Grundriss
 * und Energieausweis (Entscheidung Christian, wie in der Kundenansicht). Dort
 * stehen die Originaladressen bei Investagon, und die sind ohne Anmeldung
 * abrufbar. Den Grundriss bekommt der Kundenlink stattdessen als Kopie aus dem
 * eigenen Speicher, befristet und einzeln geprüft (`unterlagen.ts`,
 * Aktion „datei“ in `index.ts`).
 */
export function oeffentlicheRohdaten(roh: unknown): Record<string, unknown> | undefined {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return undefined;
  const gefiltert = nurErlaubte(roh as Record<string, unknown>, ROHDATEN_FELDER);
  return Object.keys(gefiltert).length ? gefiltert : undefined;
}

/** Nur Text, Zahl oder Wahrheitswert. Ein Objekt oder eine Liste unter einem erlaubten Namen bleibt drin. */
function istSchlicht(v: unknown): boolean {
  return typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
}

/**
 * Der Energieausweis, nur mit seinen fünf Angaben und nur schlichten Werten.
 * Vorher ging `meta.energieausweis` unverändert hinaus, samt allem, was
 * jemand dort ablegt, etwa einer Dateiadresse.
 */
export function oeffentlicherEnergieausweis(v: unknown): Record<string, unknown> | undefined {
  const quelle = alsObjekt(v);
  if (!quelle) return undefined;
  const ziel: Record<string, unknown> = {};
  for (const feld of ENERGIEAUSWEIS_FELDER) {
    if (istSchlicht(quelle[feld])) ziel[feld] = quelle[feld];
  }
  return Object.keys(ziel).length ? ziel : undefined;
}

function alsObjekt(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

/**
 * Die automatisch herausgelesenen Sanierungen, gekürzt.
 *
 * `meta.objekttexteKi` enthält den ganzen Lauf der Textautomatik: Belege,
 * Quellen, Beanstandungen, Modell. Hinaus geht davon genau eine Liste, und
 * je Eintrag nur Jahr und Maßnahme. Der `beleg` bleibt drin, er ist die
 * zitierte Zeile aus den Unterlagen und kann Dinge nennen, die kein Fremder
 * lesen soll. Freigegeben am 23.09.2026.
 */
export function oeffentlicheSanierungenKi(ki: unknown): { sanierungen: Array<{ jahr: string; massnahme: string }> } | undefined {
  const liste = alsObjekt(ki)?.sanierungen;
  if (!Array.isArray(liste)) return undefined;
  const sanierungen = liste
    .map((e) => {
      const eintrag = alsObjekt(e);
      const massnahme = text(eintrag?.massnahme);
      return massnahme ? { jahr: text(eintrag?.jahr), massnahme } : null;
    })
    .filter((e): e is { jahr: string; massnahme: string } => e !== null);
  return sanierungen.length ? { sanierungen } : undefined;
}

/**
 * Die sieben Listen der gemessenen Mikrolage, dazu Hochschulen und
 * Krankenhäuser für die Makrolage neben der Karte (seit dem 24.09.2026, siehe
 * `src/lib/makrolage.ts`). Gewerbeflächen bleiben draußen: Benannte Flächen sind
 * oft einzelne Betriebe und läsen sich wie eine Arbeitgeberliste.
 *
 * Seit der Messfassung 3 (24.09.2026) dazu `parks` und `behoerden` für die
 * Umgebungspunkte auf Karte und Liste (`src/lib/umgebungspunkte.ts`): Parks,
 * Grünanlagen, Rathaus, Ämter, Polizei, Post und Bibliothek. Das sind
 * öffentliche Orte mit Namen am Gebäude, keine Personen.
 *
 * `aerzte` gehört dazu: Christian hat am 24.09.2026 abends entschieden, dass
 * die Arztpraxen als Teil der Mikrolage auch an Kunden gehen. Es sind die
 * öffentlich ausgeschilderten Praxisnamen aus OpenStreetMap.
 */
const MIKROLAGE_LISTEN = [
  "kindergaerten", "schulen", "einkaufen", "apotheken", "aerzte", "oepnv", "freizeit", "parks", "behoerden",
  "hochschulen", "kliniken",
] as const;

/** Höchstens so viele Orte je Liste, so viele misst `standort-messung.ts` auch höchstens. */
const ORTE_JE_LISTE = 10;

/** Ab wo gemessen wurde, nur einer dieser vier Werte geht hinaus. */
const GENAUIGKEITEN = ["adresse", "strasse", "plz", "ort"] as const;

const endlich = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Die gemessene Standortanalyse für Mikro- und Makrolage, gekürzt.
 *
 * Nur die gemessene Fassung (`schema: 2`) geht hinaus: Die alten Datensätze
 * hat ein Sprachmodell geschrieben. Und davon nur, was Karte und Liste im
 * Exposé brauchen: Lage des Objekts, je Einrichtung Name, Art, Entfernung und
 * Lage, Zeitpunkt, Genauigkeit und Herkunftssatz der Messung. Das sind öffentliche Daten
 * aus OpenStreetMap über eine Adresse, die im Exposé ohnehin steht.
 */
export function oeffentlicheStandortanalyse(analyse: unknown): Record<string, unknown> | undefined {
  const a = alsObjekt(analyse);
  if (!a || a.schema !== 2) return undefined;
  const k = alsObjekt(a.objekt_koordinaten);
  if (!k || !endlich(k.lat) || !endlich(k.lng)) return undefined;
  const mikro = alsObjekt(a.mikrolage) ?? {};
  const mikrolage: Record<string, unknown[]> = {};
  for (const schluessel of MIKROLAGE_LISTEN) {
    const orte = Array.isArray(mikro[schluessel]) ? (mikro[schluessel] as unknown[]) : [];
    const sauber = orte
      .map((o) => {
        const ort = alsObjekt(o);
        const name = text(ort?.name);
        if (!ort || !name || !endlich(ort.entfernung_m)) return null;
        return {
          name,
          ...(text(ort.typ) ? { typ: text(ort.typ) } : {}),
          entfernung_m: ort.entfernung_m,
          ...(endlich(ort.lat) && endlich(ort.lng) ? { lat: ort.lat, lng: ort.lng } : {}),
        };
      })
      .filter((o) => o !== null)
      .slice(0, ORTE_JE_LISTE);
    if (sauber.length) mikrolage[schluessel] = sauber;
  }
  return {
    schema: 2,
    ...(text(a.gemessen_am) ? { gemessen_am: text(a.gemessen_am) } : {}),
    // Nur die Fassungsnummer: Sie sagt der Seite, ob Hochschulen und Krankenhäuser überhaupt gemessen wurden.
    ...(endlich(a.messfassung) ? { messfassung: a.messfassung } : {}),
    objekt_koordinaten: { lat: k.lat, lng: k.lng },
    // Nur der Wert, ab wo gemessen wurde (seit dem 24.09.2026): Die Karte
    // beschriftet damit die Nadel, wenn ab der Ortsmitte gemessen wurde.
    ...(GENAUIGKEITEN.includes(a.genauigkeit as (typeof GENAUIGKEITEN)[number]) ? { genauigkeit: a.genauigkeit } : {}),
    mikrolage,
    ...(text(a.mikrolage_hinweis) ? { mikrolage_hinweis: text(a.mikrolage_hinweis) } : {}),
  };
}

/**
 * Die gespeicherte Lage des Objekts (`meta.koordinaten`), nur Breite, Länge
 * und Quelle. Die Karte im Exposé setzt damit die Nadel, wenn die gemessene
 * Analyse fehlt; ohne sie müsste der Browser des Besuchers die Adresse bei
 * einem fremden Dienst suchen. Der Zeitpunkt bleibt drin, er sagt dem Kunden
 * nichts. Freigegeben am 23.09.2026.
 */
export function oeffentlicheKoordinaten(wert: unknown): { lat: number; lng: number; quelle: string } | undefined {
  const k = koordinatenAus(wert);
  return k ? { lat: k.lat, lng: k.lng, quelle: k.quelle } : undefined;
}

/**
 * Die Marktargumente aus `meta.marktargumente`, nur als Texte.
 *
 * Seit dem 23.09.2026 schreibt `objekt-texte-ki` bis zu drei Marktargumente
 * in dieses Feld, sofern dort nichts von Hand steht. Hinaus geht nur der
 * Wortlaut, der Quelle und Stand schon im Satz nennt. Der `beleg` aus
 * `meta.objekttexteKi.marktargumente` bleibt drin, ebenso alles, was kein Text
 * ist: Ein Objekt, das jemand in die Liste schiebt, fällt heraus.
 */
export function oeffentlicheMarktargumente(v: unknown): string[] | undefined {
  const liste = (Array.isArray(v) ? v : [])
    .map((a) => (typeof a === "string" ? a.trim() : ""))
    .filter(Boolean);
  return liste.length ? liste : undefined;
}

/**
 * Ob Beschreibung, Standort- und Marktargumente automatisch entstanden sind.
 *
 * Das Exposé vermerkt das sichtbar (Entscheidung vom 22.09.2026). Intern
 * sieht die Seite es am Vergleich mit `meta.objekttexteKi`; der geht nicht
 * hinaus. Deshalb rechnet die Function den Vergleich hier und gibt nur das
 * Ergebnis weiter, Wahrheitswerte, nichts vom Text selbst.
 */
export function texteAutomatisch(
  meta: Record<string, unknown>,
): { kurzbeschreibung: boolean; standortargumente: boolean; marktargumente: boolean } | undefined {
  const ki = alsObjekt(meta.objekttexteKi);
  if (!ki) return undefined;
  const argument = (a: unknown) => (typeof a === "string" ? a.trim() : text(alsObjekt(a)?.argument));
  const gleich = (feld: string[], auto: string[]) =>
    feld.length > 0 && feld.length === auto.length && feld.every((x, i) => x === auto[i]);
  const autoKurz = text(ki.kurzbeschreibung);
  const autoArgumente = (Array.isArray(ki.standortargumente) ? ki.standortargumente : []).map(argument).filter(Boolean);
  const autoMarkt = (Array.isArray(ki.marktargumente) ? ki.marktargumente : []).map(argument).filter(Boolean);
  const kurz = text(meta.kurzbeschreibung);
  const argumente = (Array.isArray(meta.standortargumente) ? meta.standortargumente : []).map(argument).filter(Boolean);
  const ergebnis = {
    kurzbeschreibung: !!kurz && kurz === autoKurz,
    standortargumente: gleich(argumente, autoArgumente),
    marktargumente: gleich(oeffentlicheMarktargumente(meta.marktargumente) ?? [], autoMarkt),
  };
  return ergebnis.kurzbeschreibung || ergebnis.standortargumente || ergebnis.marktargumente ? ergebnis : undefined;
}

/** Die englischen Objekttexte, soweit sie hinausdürfen. */
export interface ObjekttexteEn {
  kurzbeschreibung?: string;
  standortargumente?: string[];
  marktargumente?: string[];
}

/**
 * Die englische Fassung der Objekttexte aus `meta.objekttexteKiEn`.
 *
 * Plan Kundensprache vom 25.09.2026, Entscheidung 12: `objekt-texte-ki` soll
 * in Etappe 5 zusätzlich eine englische Fassung erzeugen. Bis dahin fehlt das
 * Feld, und die Seiten zeigen den deutschen Text mit dem Vermerk
 * „Description available in German only“.
 *
 * Hinaus geht nur der Wortlaut, wie bei den deutschen Texten: Beschreibung
 * als Text, Standort- und Marktargumente als Liste von Texten. Ein Argument
 * darf als Text oder als Objekt mit `argument` kommen, Belege und Quellen
 * bleiben drin. Fehlt alles, gibt es `undefined`.
 */
export function oeffentlicheObjekttexteEn(v: unknown): ObjekttexteEn | undefined {
  const quelle = alsObjekt(v);
  if (!quelle) return undefined;
  const argument = (a: unknown) => (typeof a === "string" ? a.trim() : text(alsObjekt(a)?.argument));
  const liste = (w: unknown) => (Array.isArray(w) ? w : []).map(argument).filter(Boolean);
  const ziel: ObjekttexteEn = {};
  const kurz = text(quelle.kurzbeschreibung);
  if (kurz) ziel.kurzbeschreibung = kurz;
  const standort = liste(quelle.standortargumente);
  if (standort.length) ziel.standortargumente = standort;
  const markt = liste(quelle.marktargumente);
  if (markt.length) ziel.marktargumente = markt;
  return Object.keys(ziel).length ? ziel : undefined;
}

/** `meta` auf das Erlaubte zusammenstreichen. */
export function oeffentlichesMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const quelle = meta as Record<string, unknown>;
  const gefiltert = nurErlaubte(quelle, META_SCHLUESSEL);
  const energie = oeffentlicherEnergieausweis(quelle.energieausweis);
  if (energie) gefiltert.energieausweis = energie;
  const markt = oeffentlicheMarktargumente(quelle.marktargumente);
  if (markt) gefiltert.marktargumente = markt;
  const roh = oeffentlicheRohdaten(quelle.investagonRaw);
  if (roh) gefiltert.investagonRaw = roh;
  const ki = oeffentlicheSanierungenKi(quelle.objekttexteKi);
  if (ki) gefiltert.objekttexteKi = ki;
  const analyse = oeffentlicheStandortanalyse(quelle.standortanalyse);
  if (analyse) gefiltert.standortanalyse = analyse;
  const lage = oeffentlicheKoordinaten(quelle.koordinaten);
  if (lage) gefiltert.koordinaten = lage;
  const automatisch = texteAutomatisch(quelle);
  if (automatisch) gefiltert.texteAutomatisch = automatisch;
  const englisch = oeffentlicheObjekttexteEn(quelle.objekttexteKiEn);
  if (englisch) gefiltert.objekttexteKiEn = englisch;
  return gefiltert;
}

/**
 * Der Vertriebspartner eines Kunden-Exposés, genau vier Angaben.
 *
 * Ausschließlich Bild, Name, Telefon und E-Mail, und nur die, die gefüllt
 * sind. Kein Nutzerkennzeichen, keine Rolle, kein Buchungslink, nichts über
 * den Kunden. Das Bild nur als https-Adresse, ein Speicherpfad bliebe im
 * Browser ohnehin ohne Bild.
 */
export function oeffentlicherAnsprechpartner(profil: unknown): { name: string; telefon?: string; email?: string; bild?: string } | undefined {
  const p = alsObjekt(profil);
  const name = text(p?.name);
  if (!p || !name) return undefined;
  const telefon = text(p.telefon);
  const email = text(p.email);
  const bild = text(p.avatar_url);
  return {
    name,
    ...(telefon ? { telefon } : {}),
    ...(email ? { email } : {}),
    ...(/^https:\/\//i.test(bild) ? { bild } : {}),
  };
}

/** So sieht ein Token eines Kunden-Exposés aus: 32 Byte als Hex. */
export function istExposeToken(token: unknown): token is string {
  return typeof token === "string" && /^[0-9a-f]{64}$/i.test(token);
}

/** Eine Objektzeile für die öffentliche Antwort. */
export function oeffentlichesObjekt(row: Record<string, unknown>): Record<string, unknown> {
  const ziel = nurErlaubte(row, OBJEKT_SPALTEN);
  ziel.meta = oeffentlichesMeta(row.meta);
  return ziel;
}

/** Eine Einheitenzeile für die öffentliche Antwort. */
export function oeffentlicheWohnung(row: Record<string, unknown>): Record<string, unknown> {
  const ziel = nurErlaubte(row, WOHNUNG_SPALTEN);
  // Nur die Summe, die Investagon-Teile selbst bleiben draußen (einheit-hausgeld.ts).
  ziel.meta = mitHausgeldMonat(oeffentlichesMeta(row.meta), row.meta);
  return ziel;
}
