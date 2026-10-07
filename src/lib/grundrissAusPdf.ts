/**
 * „Grundriss aus PDF übernehmen“ (Christian, 23.09.2026, Vorschlag A).
 *
 * Viele Grundrisse stecken als Seite in einer größeren PDF: im Exposé des
 * Bauträgers, in der Teilungserklärung mit Aufteilungsplan. Die Erkennung
 * (`supabase/functions/_shared/grundriss-erkennung.ts`) kann eine Seite darin
 * nicht finden. Deshalb wählt Admin oder Inhaber die Seite einmal von Hand,
 * sie wird als Bild gespeichert und steht danach als eigene Unterlage da.
 *
 * WIE ES GESPEICHERT WIRD
 *
 *   Einheit  Bild wie ein von Hand hochgeladener Grundriss unter
 *            `objekte/<id>/wohnungen/<wid>/wd2_…` (Eimer `objekt-medien`,
 *            die Ausnahme in `eimerFuerObjektDatei`). Die Zeile kommt in
 *            `wohnungs_dokumente`, nicht in `meta.dokumente`: Die Liste in
 *            `meta` setzt die Objektanlage beim Speichern neu zusammen, die
 *            Tabelle fasst `saveObjekt` nie an. Nur dort greifen Freigabe-
 *            Schalter und Auslöser der Dokumenten-Ampel.
 *   Haus     Bild wie jede Objektunterlage unter `objekte/<id>/dokumente/…`
 *            (Eimer `objekt-dokumente`, geschützt), Zeile über `addDokument`.
 *
 * Der Name „Grundriss WE 7“ beziehungsweise „Grundriss Haus“ ist das, woran
 * die Erkennung den Plan sicher erkennt und der Einheit zuordnet; „Haus“
 * macht ihn zum Plan des ganzen Hauses. Die Originalunterlage bleibt, wie sie
 * ist. Das Kürzel `grundriss-aus-pdf` im Dateinamen zeigt, welche Pläne so
 * entstanden sind, damit ein zweiter Durchgang fragen kann, ob er ersetzt.
 */
import {
  addDokument, addWohnungTabellenDokument, getObjektById, removeDokument, removeWohnungTabellenDokument, type ObjektData,
} from "@/lib/objekteStore";
import { objektDateiAblegen } from "@/lib/storage";
import { eigeneEinheitNummer, UEBERNAHME_KENNZEICHEN } from "../../supabase/functions/_shared/grundriss-erkennung.ts";

/** Steht im Dateinamen jedes so übernommenen Plans, gemeinsam mit dem Server. */
export { UEBERNAHME_KENNZEICHEN };

/** Längste Kante des gespeicherten Bildes in Bildpunkten. Genug, um Maße im Plan zu lesen. */
export const GRUNDRISS_KANTE = 2000;

/** Ab dieser Größe wird das PNG als JPEG gespeichert. Ein gescannter Plan wäre als PNG oft über 5 MB. */
const PNG_HOECHSTENS_BYTES = 1_500_000;

export type GrundrissZiel =
  | { art: "einheit"; wohnungId: string; weNr: string }
  | { art: "haus" };

/** Was der Reiter „Dokumente“ für die Übernahme wissen muss. */
export interface GrundrissUebernahme {
  objektId: string;
  /** Die Einheiten des Objekts, zur Auswahl bei einer Unterlage am Objekt. */
  einheiten: Array<{ id: string; weNr: string }>;
  /**
   * Auf der Einheitsseite die Einheit der Seite. Unterlagen im Bereich
   * „Dokumente zur Wohnung“ gehören ihr, bei Objektunterlagen ist sie vorgewählt.
   */
  wohnungId?: string;
}

/** Die Angaben für Objekt- und Einheitsseite: alle Einheiten des Hauses, auch die nicht im Angebot. */
export function grundrissUebernahmeFuer(objekt: Pick<ObjektData, "id" | "wohnungen" | "wohnungenNichtImAngebot">, wohnungId?: string): GrundrissUebernahme {
  const einheiten = [...objekt.wohnungen, ...(objekt.wohnungenNichtImAngebot ?? [])]
    .filter((w, i, alle) => alle.findIndex((a) => a.id === w.id) === i)
    .map((w) => ({ id: w.id, weNr: w.weNr || "" }))
    .sort((a, b) => a.weNr.localeCompare(b.weNr, "de", { numeric: true, sensitivity: "base" }));
  return { objektId: objekt.id, einheiten, ...(wohnungId ? { wohnungId } : {}) };
}

/** Die Einheit in Kurzform: „WE 7“, sonst die gepflegte Bezeichnung, sonst „Wohnung“. */
export function einheitKurz(weNr: string): string {
  const nummer = eigeneEinheitNummer(weNr);
  if (nummer) return `WE ${nummer}`;
  return weNr.trim() || "Wohnung";
}

/**
 * Der Name des neuen Plans. `nummer` ab 2, wenn schon einer da ist und
 * zusätzlich gespeichert wird: Zwei gleichnamige Pläne zeigte das Exposé nur
 * einmal.
 */
export function grundrissName(ziel: GrundrissZiel, nummer = 1): string {
  const basis = ziel.art === "haus" ? "Grundriss Haus" : `Grundriss ${einheitKurz(ziel.weNr)}`;
  return nummer > 1 ? `${basis} (${nummer})` : basis;
}

/** Ein schon übernommener Plan am Ziel. */
export interface UebernommenerGrundriss {
  id: string;
  name: string;
}

/** Die Pläne, die für dieses Ziel schon aus einer PDF übernommen wurden. */
export function uebernommeneGrundrisse(objekt: Pick<ObjektData, "dokumente" | "wohnungen">, ziel: GrundrissZiel): UebernommenerGrundriss[] {
  const liste = ziel.art === "haus"
    ? (objekt.dokumente ?? [])
    : (objekt.wohnungen.find((w) => w.id === ziel.wohnungId)?.dokumente ?? []).filter((d) => d.ausTabelle === true);
  return liste.filter((d) => (d.url || "").includes(UEBERNAHME_KENNZEICHEN)).map((d) => ({ id: d.id, name: d.name }));
}

/** Dasselbe für ein Objekt aus dem Zwischenspeicher, für den Dialog. */
export function uebernommeneGrundrisseFuer(objektId: string, ziel: GrundrissZiel): UebernommenerGrundriss[] {
  const objekt = getObjektById(objektId);
  return objekt ? uebernommeneGrundrisse(objekt, ziel) : [];
}

/** Die kleinste freie Nummer für einen zusätzlichen Plan, damit kein Name doppelt vorkommt. */
export function naechsteNummer(ziel: GrundrissZiel, vorhandene: UebernommenerGrundriss[]): number {
  const namen = new Set(vorhandene.map((v) => v.name));
  let nummer = 2;
  while (namen.has(grundrissName(ziel, nummer))) nummer += 1;
  return nummer;
}

/** Wohin das Bild kommt. Der Eimer ergibt sich daraus in `eimerFuerObjektDatei`. */
export function grundrissAblagePfad(objektId: string, ziel: GrundrissZiel, endung: "png" | "jpg", stempel: number): string {
  return ziel.art === "haus"
    ? `objekte/${objektId}/dokumente/${UEBERNAHME_KENNZEICHEN}-haus-${stempel}.${endung}`
    : `objekte/${objektId}/wohnungen/${ziel.wohnungId}/wd2_${UEBERNAHME_KENNZEICHEN}-${stempel}.${endung}`;
}

export type SpeicherErgebnis = { ok: true; name: string } | { ok: false; text: string };

/**
 * Das Bild ablegen, die Unterlage anlegen und, wenn gewünscht, die früher
 * übernommenen Pläne dieses Ziels entfernen. Erst wenn der neue Plan steht,
 * fällt der alte weg; scheitert das Entfernen, bleiben eben beide.
 */
export async function grundrissAusPdfSpeichern(e: {
  objektId: string;
  ziel: GrundrissZiel;
  bild: { blob: Blob; endung: "png" | "jpg" };
  name: string;
  ersetzen?: UebernommenerGrundriss[];
  stempel?: number;
}): Promise<SpeicherErgebnis> {
  const pfad = grundrissAblagePfad(e.objektId, e.ziel, e.bild.endung, e.stempel ?? Date.now());
  const url = await objektDateiAblegen(pfad, e.bild.blob, e.bild.endung === "png" ? "image/png" : "image/jpeg");
  if (!url) return { ok: false, text: "Das Bild ließ sich nicht speichern. Versuch es bitte gleich noch einmal." };
  const id = crypto.randomUUID();
  const angelegt = e.ziel.art === "haus"
    ? await addDokument(e.objektId, { id, name: e.name, url, typ: "custom", kategorie: "objektunterlagen", sichtbar: true })
    : await addWohnungTabellenDokument(e.ziel.wohnungId, { id, name: e.name, url, kategorie: "wohnungsunterlagen" });
  if (!angelegt) return { ok: false, text: "Der Grundriss ließ sich nicht bei den Unterlagen eintragen. Versuch es bitte gleich noch einmal." };
  for (const alt of e.ersetzen ?? []) {
    const weg = e.ziel.art === "haus" ? await removeDokument(e.objektId, alt.id) : await removeWohnungTabellenDokument(alt.id);
    if (!weg) return { ok: false, text: `Der neue Grundriss ist gespeichert, „${alt.name}“ ließ sich aber nicht entfernen. Beide stehen jetzt bei den Unterlagen.` };
  }
  return { ok: true, name: e.name };
}

/* ────────────────────────────────────────────────────────────────────────
 * Die PDF lesen und eine Seite zeichnen, mit dem vorhandenen pdf.js
 * ──────────────────────────────────────────────────────────────────────── */

/** Eine geöffnete PDF. Seiten werden erst gezeichnet, wenn sie gebraucht werden. */
export interface PdfQuelle {
  seiten: number;
  /** Eine Seite (ab 1) als Zeichenfläche mit dieser längsten Kante. */
  zeichnen: (seite: number, kante: number) => Promise<HTMLCanvasElement>;
  schliessen: () => void;
}

/**
 * Die PDF öffnen. Die Adresse muss eine sein, die der Browser laden darf,
 * also die befristete aus dem eigenen Speicher (`resolveUnterlagenUrl`).
 */
export async function pdfOeffnen(url: string): Promise<PdfQuelle> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const auftrag = pdfjs.getDocument(url);
  const pdf = await auftrag.promise;
  return {
    seiten: pdf.numPages,
    zeichnen: async (nummer, kante) => {
      const seite = await pdf.getPage(nummer);
      const roh = seite.getViewport({ scale: 1 });
      const feld = seite.getViewport({ scale: kante / (Math.max(roh.width, roh.height) || kante) });
      const flaeche = document.createElement("canvas");
      flaeche.width = Math.max(1, Math.round(feld.width));
      flaeche.height = Math.max(1, Math.round(feld.height));
      const stift = flaeche.getContext("2d");
      if (!stift) throw new Error("Zeichenfläche nicht verfügbar");
      // Eine PDF-Seite hat keinen eigenen Grund, ohne Weiß würde er im JPEG schwarz.
      stift.fillStyle = "#ffffff";
      stift.fillRect(0, 0, flaeche.width, flaeche.height);
      await seite.render({ canvasContext: stift, viewport: feld }).promise;
      seite.cleanup();
      return flaeche;
    },
    schliessen: () => { void auftrag.destroy(); },
  };
}

function alsBlob(flaeche: HTMLCanvasElement, typ: string, qualitaet?: number): Promise<Blob | null> {
  return new Promise((fertig) => flaeche.toBlob(fertig, typ, qualitaet));
}

/**
 * Die gewählte Seite als Bild zum Speichern: als PNG, solange es klein
 * bleibt (Pläne sind meist Linien, dort ist PNG scharf und klein), sonst als
 * JPEG, etwa bei einem gescannten Plan.
 */
export async function seiteAlsBild(quelle: PdfQuelle, seite: number, kante = GRUNDRISS_KANTE): Promise<{ blob: Blob; endung: "png" | "jpg" }> {
  const flaeche = await quelle.zeichnen(seite, kante);
  try {
    const png = await alsBlob(flaeche, "image/png");
    if (png && png.size <= PNG_HOECHSTENS_BYTES) return { blob: png, endung: "png" };
    const jpg = await alsBlob(flaeche, "image/jpeg", 0.88);
    if (jpg) return { blob: jpg, endung: "jpg" };
    if (png) return { blob: png, endung: "png" };
    throw new Error("Die Seite ließ sich nicht als Bild speichern.");
  } finally {
    flaeche.width = 0;
    flaeche.height = 0;
  }
}
