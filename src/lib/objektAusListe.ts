/**
 * Ein Objekt aus einer Excel-Liste anlegen (17.10.2026, Stufe 3 der
 * Objektdaten). Christian: Neue Objekte wie Cottbus sollen im CRM entstehen,
 * nicht mehr über Investagon. Aus der Liste kommen die Einheiten mit allem,
 * was sie hergibt; Adresse, Texte, Bilder und AfA ergänzt man danach im
 * Objektformular.
 *
 * Das Objekt entsteht als Entwurf und unsichtbar, bis es im Formular
 * freigegeben wird. Mieter, Garagen und Listendaten trägt danach derselbe
 * Import ein wie bei bestehenden Objekten (`listenImport.ts`).
 */
import type { Blatt, Zelle } from "./excelLesen";
import { kopfErkennen, weNummer } from "./listenImport";
import { listenWertLesen, LISTEN_FELDER } from "./listendaten";
import { DEFAULT_WOHNUNG_DOCS, defaultDokumente, type ObjektData, type ObjektWohnung } from "./objekteStore";

export interface ObjektAngaben {
  titel: string;
  adresse: string;
  plz: string;
  ort: string;
  /** Mit welcher Miete der Vertrieb rechnet: der Ist-Miete oder der Sollmiete laut Liste. */
  mieteAus: "ist" | "soll";
}

const zahl = (z: Zelle | undefined): number => {
  if (typeof z === "number") return Number.isFinite(z) ? z : 0;
  const t = String(z ?? "").replace(/[€\s]/g, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
};

/** Die Einheiten der Liste; leer, wenn das Blatt keine WE-Spalte hat. */
export function einheitenAusBlatt(blatt: Blatt, mieteAus: ObjektAngaben["mieteAus"]): ObjektWohnung[] {
  const kopf = kopfErkennen(blatt);
  if (!kopf) return [];
  const s = kopf.spalten;
  const soll = LISTEN_FELDER.find((f) => f.schluessel === "sollMiete")!;
  const zimmerFeld = LISTEN_FELDER.find((f) => f.schluessel === "zimmer")!;
  const gesehen = new Set<number>();
  const einheiten: ObjektWohnung[] = [];
  for (const z of blatt.zeilen.slice(kopf.zeile + 1)) {
    const nr = weNummer(z[s.we!]);
    // Doppelte Nummern (etwa eine zweite Garage) legen keine zweite Einheit an.
    if (nr === null || gesehen.has(nr)) continue;
    gesehen.add(nr);
    const groesse = s.flaeche !== undefined ? zahl(z[s.flaeche]) : 0;
    const vk = s.kaufpreis !== undefined ? zahl(z[s.kaufpreis]) : 0;
    const ist = s.istKaltmiete !== undefined ? zahl(z[s.istKaltmiete]) : 0;
    const sollWert = kopf.listen.sollMiete !== undefined ? listenWertLesen(soll, z[kopf.listen.sollMiete]) : null;
    const miete = mieteAus === "soll" && typeof sollWert === "number" ? sollWert : ist;
    const zimmerText = kopf.listen.zimmer !== undefined ? String(listenWertLesen(zimmerFeld, z[kopf.listen.zimmer]) ?? "") : "";
    const zimmer = Number((/\d+(?:[.,]\d+)?/.exec(zimmerText)?.[0] ?? "0").replace(",", "."));
    const text = String(z[s.we!] ?? "").trim();
    einheiten.push({
      id: crypto.randomUUID(),
      weNr: /^\d+$/.test(text) ? `WE ${text}` : text,
      etage: "",
      lage: s.lage !== undefined ? String(z[s.lage] ?? "").trim() : "",
      groesse, zimmer, mieteGesamt: miete, vkGesamt: vk,
      qmPreis: groesse > 0 && vk > 0 ? Math.round((vk / groesse) * 100) / 100 : 0,
      rendite: vk > 0 && miete > 0 ? Math.round(((miete * 12) / vk) * 10000) / 100 : 0,
      vermietet: ist > 0,
      vermietungsStatus: ist > 0 ? "vermietet" : "leerstand",
      status: "frei",
      dokumente: DEFAULT_WOHNUNG_DOCS.map((d) => ({ ...d, id: crypto.randomUUID() })),
      bilder: [],
    });
  }
  return einheiten;
}

/** Das neue Objekt als Entwurf, bereit für `saveObjekt`. */
export function objektAusListe(angaben: ObjektAngaben, einheiten: ObjektWohnung[], erstelltVon?: string): ObjektData {
  const groessen = einheiten.map((w) => w.groesse).filter((n) => n > 0);
  const preise = einheiten.map((w) => w.vkGesamt).filter((n) => n > 0);
  const renditen = einheiten.map((w) => w.rendite).filter((n) => n > 0);
  const spanne = (werte: number[]) => (werte.length ? [Math.min(...werte), Math.max(...werte)] : [0, 0]);
  const [groesseVon, groesseBis] = spanne(groessen);
  const [preisVon, preisBis] = spanne(preise);
  const [renditeVon, renditeBis] = spanne(renditen);
  return {
    id: crypto.randomUUID(),
    titel: angaben.titel.trim(), adresse: angaben.adresse.trim(), plz: angaben.plz.trim(), ort: angaben.ort.trim(),
    beschreibung: "", bildUrl: "", bilder: [], dokumente: defaultDokumente(), wohnungen: einheiten,
    videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon, groesseBis, preisVon, preisBis, renditeVon, renditeBis,
    sichtbar: false, status: "entwurf",
    erstellt_am: new Date().toISOString(), erstellt_von: erstelltVon,
    meta: { angelegtAusListe: true },
  };
}
