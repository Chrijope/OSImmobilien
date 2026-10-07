import { dbRowToObjekt, getHausgeldNichtUmlegbarMonat, type ObjektData, type ObjektWohnung } from "./objekteStore";
import { baueExposeInhalt, grundrisseFuerExpose, hatWert, kennzahlSchluessel, kopfUeberschrift, mitSchluessel, ohneDoppelte, type EinheitZeile, type ExposeInhalt, type ExposeInhaltEingabe, type Kennzahl, type Person } from "./exposeInhalt";
import { EXPOSE_INHALT_TEXTE, exposeInhaltTexte } from "./exposeInhaltTexte";
import type { Sprache } from "./seitenSprache";
import { eur0, dez, prozent, kaltmieteVon, renditeProzent } from "./objektKennzahlen";
import { einheitenImHaus } from "./objektseiteDaten";

/** The public response is converted without consulting the signed-in user's cache. */
export function exposePayloadZuObjekt(payload: { objekt: any; bilder?: any[]; dokumente?: any[]; wohnungen?: any[] }): ObjektData {
  const docs = (items: any[], kategorie: string) => (Array.isArray(items) ? items : []).filter(d =>
    d && d.kategorie === kategorie && d.sichtbar !== false && typeof d.url === "string" && /^(https?:\/\/|\/[^/])/.test(d.url) && d.url !== "__gallery__");
  const wohnungen = (payload.wohnungen || []).map(w => ({ ...w, meta: { ...w.meta,
    bilder: [...(w.bilder || []), ...(w.meta?.bilder || [])],
    dokumente: docs([...(w.dokumente || []), ...(w.meta?.dokumente || [])], "wohnungsunterlagen"),
  } }));
  return dbRowToObjekt(payload.objekt, payload.bilder || [], docs(payload.dokumente || [], "objektunterlagen"), wohnungen, [], false);
}

/**
 * Summen über die Einheiten eines Hauses: Wohnfläche und Kaltmiete je Monat.
 *
 * Nur als Rückfall für ein Globalobjekt, dessen Gesamtfläche oder
 * Jahresnettomiete nicht gepflegt ist. Beides ist dann keine Schätzung,
 * sondern die Summe der gepflegten Einheiten, und das Exposé sagt das dazu.
 * Den Kaufpreis gibt es bewusst nicht als Summe: Ein Haus im Ganzen kostet
 * selten, was seine Einheiten einzeln kosten würden.
 */
function einheitenSummen(objekt: ObjektData, heute: string): { flaeche: number; mieteMonat: number } {
  const alle = [...objekt.wohnungen, ...(objekt.wohnungenNichtImAngebot ?? [])];
  return {
    flaeche: alle.reduce((s, w) => s + (w.groesse > 0 ? w.groesse : 0), 0),
    mieteMonat: alle.reduce((s, w) => s + Math.max(0, kaltmieteVon(w, heute)), 0),
  };
}

/** Kaufpreis, Fläche und Miete des ganzen Hauses, jeweils mit Herkunft. */
export interface GesamtobjektZahlen {
  kaufpreis: number;
  flaeche: number;
  flaecheAusEinheiten: boolean;
  mieteJahr: number;
  mieteAusEinheiten: boolean;
  hausgeldMonat: number;
}

export function gesamtobjektZahlen(objekt: ObjektData, heute = new Date().toISOString().slice(0, 10)): GesamtobjektZahlen {
  const g = objekt.globalDaten;
  const summen = einheitenSummen(objekt, heute);
  const flaecheGepflegt = g?.gesamtQm && g.gesamtQm > 0 ? g.gesamtQm : 0;
  const mieteGepflegt = g?.jahresnettomiete && g.jahresnettomiete > 0 ? g.jahresnettomiete : 0;
  return {
    kaufpreis: g?.verkaufspreis && g.verkaufspreis > 0 ? g.verkaufspreis : 0,
    flaeche: flaecheGepflegt || summen.flaeche,
    flaecheAusEinheiten: !flaecheGepflegt && summen.flaeche > 0,
    mieteJahr: mieteGepflegt || summen.mieteMonat * 12,
    mieteAusEinheiten: !mieteGepflegt && summen.mieteMonat > 0,
    hausgeldMonat: g?.hausgeldMonat && g.hausgeldMonat > 0 ? g.hausgeldMonat : 0,
  };
}

/**
 * Die Recheneinheit für den Rechner in der Objektansicht.
 *
 * Beim Globalobjekt ist das das ganze Haus: Kaufpreis, Fläche, Miete und
 * Hausgeld des Hauses. Der nicht umlegbare Hausgeldanteil wird hier direkt
 * gesetzt, sonst teilte `getHausgeldNichtUmlegbarForWohnung` ihn wie für eine
 * einzelne Wohnung nach Fläche auf. Eine Projektübersicht ohne Globalverkauf
 * leiht sich nie die Zahlen einer beliebigen Einheit.
 */
export function objektExposeRecheneinheit(objekt: ObjektData): ObjektWohnung {
  const global = !!objekt.globalObjekt;
  const z = gesamtobjektZahlen(objekt);
  const nichtUmlegbar = global ? getHausgeldNichtUmlegbarMonat(objekt) : 0;
  return { id: objekt.id, weNr: "", etage: "", lage: "", zimmer: 0, groesse: global ? z.flaeche : objekt.globalDaten?.gesamtQm || 0,
    vkGesamt: global ? z.kaufpreis : 0,
    mieteGesamt: global ? z.mieteJahr / 12 : 0,
    hausgeldMonat: global ? z.hausgeldMonat : objekt.globalDaten?.hausgeldMonat,
    ...(nichtUmlegbar > 0 ? { hausgeldNichtUmlagefaehigEuro: nichtUmlegbar } : {}),
    qmPreis: 0, rendite: 0, vermietet: false, status: "frei",
    bilder: [], dokumente: [],
  };
}

const flaecheText = (n: number, sprache?: Sprache) => `${dez(n, 1, sprache)} m²`;

/** Die deutschen Beschriftungen, über die Zeilen unabhängig von der Sprache gefunden werden. */
const DE = EXPOSE_INHALT_TEXTE.de.labels;

/** Die Objektdaten des ganzen Hauses beim Globalobjekt. */
function gesamtobjektZeilen(objekt: ObjektData, inhalt: ExposeInhalt, z: GesamtobjektZahlen, sprache?: Sprache): Kennzahl[] {
  const g = objekt.globalDaten;
  const t = exposeInhaltTexte(sprache);
  const L = t.labels;
  const keine = t.keineAngabe;
  const aus = (label: string) => inhalt.objektdaten.zeilen.find((x) => kennzahlSchluessel(x) === label);
  // Nur die gepflegte Zahl (`meta.einheitenImHaus`), nie die im CRM angelegten Einheiten.
  const einheiten = einheitenImHaus(objekt) ?? 0;
  const vermietet = [...objekt.wohnungen, ...(objekt.wohnungenNichtImAngebot ?? [])].filter((w) => w.vermietet).length;
  const zeilen: Array<Kennzahl | undefined> = [
    { label: L.kaufpreisGesamtobjekt, wert: z.kaufpreis > 0 ? eur0(z.kaufpreis, sprache) : keine },
    { label: L.kaufpreisJeQm, wert: z.kaufpreis > 0 && z.flaeche > 0 ? eur0(z.kaufpreis / z.flaeche, sprache) : keine },
    { label: L.wohnflaecheGesamt, wert: z.flaeche > 0 ? flaecheText(z.flaeche, sprache) : keine, unter: z.flaecheAusEinheiten ? t.summeDerEinheiten : undefined },
    { label: L.jahresnettokaltmiete, wert: z.mieteJahr > 0 ? eur0(z.mieteJahr, sprache) : keine, unter: z.mieteJahr > 0 ? t.mieteJeMonat(eur0(z.mieteJahr / 12, sprache), z.mieteAusEinheiten) : undefined },
    { label: L.einheiten, wert: einheiten > 0 ? String(einheiten) : keine, unter: einheiten > 0 && vermietet > 0 ? t.davonVermietet(vermietet) : undefined },
    { label: L.vermietungsstand, wert: g?.vermietungsstand && g.vermietungsstand > 0 ? prozent(g.vermietungsstand, 0, sprache) : keine },
    { label: L.grundstueck, wert: g?.grundstueckQm && g.grundstueckQm > 0 ? flaecheText(g.grundstueckQm, sprache) : keine },
    { label: L.stellplaetze, wert: g?.stellplaetze && g.stellplaetze > 0 ? String(g.stellplaetze) : keine },
    { label: L.hausgeldMonat, wert: z.hausgeldMonat > 0 ? eur0(z.hausgeldMonat, sprache) : keine, unter: z.hausgeldMonat > 0 ? t.ganzesHaus : undefined },
    { label: L.zustand, wert: g?.zustand?.trim() || keine },
    aus(DE.baujahr),
    aus(DE.etagen),
    aus(DE.energietraeger),
    aus(DE.endenergie),
    aus(DE.abschreibung),
  ];
  return mitSchluessel(zeilen.filter((k): k is Kennzahl => !!k), sprache);
}

export function baueObjektExposeInhalt(e: Omit<ExposeInhaltEingabe, "wohnung">): ExposeInhalt {
  const { objekt } = e;
  const sprache: Sprache = e.sprache === "en" ? "en" : "de";
  const t = exposeInhaltTexte(sprache);
  const L = t.labels;
  const keine = t.keineAngabe;
  const heute = (e.heute ?? new Date()).toISOString().slice(0, 10);
  const inhalt = baueExposeInhalt({ ...e, wohnung: objektExposeRecheneinheit(objekt) });
  const global = !!objekt.globalObjekt;
  inhalt.ansicht = "objekt";
  // Die Pläne des ganzen Objekts, nicht die einer Einheit ohne Nummer.
  inhalt.grundriss = { dokumente: grundrisseFuerExpose(objekt, null) };
  inhalt.kopf.titel = objekt.titel;
  inhalt.kopf.untertitel = global ? t.gesamtobjekt : t.objektMitEinheiten;
  inhalt.kopf.weNr = "";
  // Im Kopf die Adresse des Hauses ohne Wohneinheit; der Objektname steht
  // darunter, sofern er nicht schon die Adresse ist.
  inhalt.kopf.ueberschrift = kopfUeberschrift(objekt, undefined, sprache);
  const name = (objekt.titel || "").trim();
  inhalt.kopf.ortszeile = ohneDoppelte([
    objekt.ort,
    name && !inhalt.kopf.ueberschrift.toLowerCase().includes(name.toLowerCase()) ? name : "",
    inhalt.kopf.untertitel,
  ]);
  inhalt.start.chips = inhalt.start.chips.filter(c => !/vermietet|Stellplatz inklusive|let since|Parking space included/i.test(c));
  const spanne = (values: number[], format: (n: number) => string) => {
    const v = values.filter(n => Number.isFinite(n) && n > 0);
    if (!v.length) return keine;
    const min = Math.min(...v), max = Math.max(...v);
    return min === max ? format(min) : t.spanne(format(min), format(max));
  };
  const euro = (n: number) => eur0(n, sprache);
  const flaeche = (n: number) => flaecheText(n, sprache);
  if (global) {
    const z = gesamtobjektZahlen(objekt, heute);
    const rendite = renditeProzent(z.mieteJahr / 12, z.kaufpreis);
    inhalt.start.kennzahlen = mitSchluessel([
      { label: L.kaufpreisGesamtobjekt, wert: z.kaufpreis > 0 ? euro(z.kaufpreis) : keine },
      { label: L.wohnflaecheGesamt, wert: z.flaeche > 0 ? flaeche(z.flaeche) : keine },
      { label: L.jahresnettokaltmiete, wert: z.mieteJahr > 0 ? euro(z.mieteJahr) : keine },
      { label: L.mietrendite, wert: rendite > 0 ? prozent(rendite, 2, sprache) : keine, unter: t.jahreskaltmieteDurchKaufpreis },
      { label: L.einheiten, wert: einheitenImHaus(objekt) ? String(einheitenImHaus(objekt)) : keine },
    ].filter(hatWert), sprache);
    inhalt.objektdaten.zeilen = gesamtobjektZeilen(objekt, inhalt, z, sprache);
    inhalt.wirtschaftlichkeit.verfuegbar = z.kaufpreis > 0;
  } else {
    inhalt.start.kennzahlen = mitSchluessel([
      { label: L.kaufpreiseDerEinheiten, wert: spanne(objekt.wohnungen.map(w => w.vkGesamt + (w.stellplatzPreis || 0)), euro) },
      { label: L.wohnflaechen, wert: spanne(objekt.wohnungen.map(w => w.groesse), flaeche) },
      // „Im Angebot“ statt „Einheiten“: Die Liste kennt nur die angebotenen
      // Wohnungen, nicht das ganze Haus. Das steht unter „Einheiten im Haus“.
      { label: L.imAngebot, wert: String(objekt.wohnungen.length) },
      { label: L.verfuegbar, wert: String(objekt.wohnungen.filter(w => w.status === "frei").length) },
    ].filter(hatWert), sprache);
    inhalt.objektdaten.zeilen = inhalt.objektdaten.zeilen.filter(z => [DE.baujahr, DE.einheitenImHaus, DE.etagen, DE.energietraeger, DE.endenergie, DE.abschreibung].includes(kennzahlSchluessel(z)));
    inhalt.wirtschaftlichkeit.verfuegbar = false;
  }
  /*
   * Beim Globalobjekt wird nur das Haus verkauft, nie eine Einheit einzeln
   * (Entscheidung vom 10.09.2026). Die Tabelle ist dort deshalb ein
   * Mietenspiegel: Fläche, Zimmer, Miete, Vermietung, ohne Einzelpreis und
   * ohne Link auf ein Einheitsexposé.
   */
  inhalt.einheiten = objekt.wohnungen.map((w): EinheitZeile => ({
    id: w.id, nummer: w.weNr, flaeche: w.groesse, zimmer: w.zimmer,
    preis: w.vkGesamt + (w.stellplatzPreis || 0), status: w.status,
    miete: kaltmieteVon(w, heute), lage: [w.etage, w.lage].filter(Boolean).join(" ") || undefined, vermietet: w.vermietet,
  }));
  return inhalt;
}

/**
 * Der Ansprechpartner aus der Antwort von `get-expose`.
 *
 * Die Function gibt ihn nur zu einem gültigen Token eines Kunden-Exposés
 * heraus, und nur Bild, Name, Telefon und E-Mail (Positivliste in
 * `supabase/functions/_shared/expose-oeffentlich.ts`). Gelesen wird trotzdem wie
 * Fremddaten.
 */
export function ansprechpartnerAusAntwort(roh: unknown): Person | undefined {
  if (!roh || typeof roh !== "object") return undefined;
  const r = roh as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const name = text(r.name);
  if (!name) return undefined;
  const bild = text(r.bild);
  return {
    name,
    rolle: "Dein Ansprechpartner",
    telefon: text(r.telefon),
    email: text(r.email),
    avatarUrl: bild && /^https:\/\//i.test(bild) ? bild : undefined,
  };
}

/**
 * Ein Grundriss aus Investagon im Kundenlink: Kennung, Bereich, Name und ob
 * er sich als Bild zeigen lässt. Eine Adresse gibt es bewusst nicht, die holt
 * die Seite je Plan einzeln über die Aktion „datei“ von `get-expose`, als
 * befristete Adresse auf die Kopie im eigenen Speicher.
 */
export interface KundenlinkGrundriss {
  id: string;
  bereich: "objekt" | "wohnung";
  wohnungId: string | null;
  name: string;
  istBild: boolean;
  /** Ersatzplan statt des eigenen Grundrisses, siehe `ersatzArt`. */
  ersatz?: "geschossplan" | "hausplan";
}

/** Dieselbe Form einer Kennung, die `get-expose` für die Aktion „datei“ annimmt. */
const KENNUNG = /^[A-Za-z0-9_.:-]{1,100}$/;

/**
 * Die Grundrisse aus der Antwort von `get-expose`. Die Function nennt sie nur
 * zu einem gültigen Token eines Kunden-Exposés. Gelesen wird trotzdem wie
 * Fremddaten: nur Einträge mit Kennung, bekanntem Bereich und Namen, und nur
 * diese fünf Angaben. Eine Adresse, die jemand hineinschreibt, fällt weg.
 */
export function grundrisseAusAntwort(roh: unknown): KundenlinkGrundriss[] {
  if (!Array.isArray(roh)) return [];
  const liste: KundenlinkGrundriss[] = [];
  for (const eintrag of roh) {
    if (!eintrag || typeof eintrag !== "object") continue;
    const e = eintrag as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (typeof e.id !== "string" || !KENNUNG.test(e.id) || (e.bereich !== "objekt" && e.bereich !== "wohnung") || !name) continue;
    const wohnungId = e.bereich === "wohnung" && typeof e.wohnungId === "string" && KENNUNG.test(e.wohnungId) ? e.wohnungId : null;
    if (liste.some((g) => g.id === e.id && g.bereich === e.bereich)) continue;
    const ersatz = e.ersatz === "geschossplan" || e.ersatz === "hausplan" ? e.ersatz : undefined;
    liste.push({ id: e.id, bereich: e.bereich, wohnungId, name, istBild: e.istBild === true, ...(ersatz ? { ersatz } : {}) });
  }
  return liste;
}

/**
 * Der Partner so, wie der Kundenlink ihn zeigt: nur Bild, Name, Telefon und
 * E-Mail, dieselbe Auswahl wie oben. Die Vorschau aus „Exposé für Kunden“
 * nimmt ihn so, damit sie nicht mehr zeigt als der Link beim Kunden, also
 * auch keine Rolle und keinen Buchungslink.
 */
export function wieImKundenlink(person: Person): Person {
  return ansprechpartnerAusAntwort({ name: person.name, telefon: person.telefon, email: person.email, bild: person.avatarUrl }) ?? person;
}
