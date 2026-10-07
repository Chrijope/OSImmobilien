/**
 * Eine Reservierung aufheben, ohne die Vereinbarung zu vernichten.
 *
 * Christian am 05.10.2026: Im Kasten „Reservierung“ ein klarer Knopf
 * „Reservierung aufheben“, und „Einheit wechseln“ in der Objektauswahl tut
 * genau dasselbe. Danach ist die Einheit frei, der Vorgang steht wieder auf
 * der Objektauswahl und es kann neu gewählt und reserviert werden.
 *
 * Warum archivieren statt löschen: Eine unterschriebene Vereinbarung ist ein
 * Beleg und sechs Jahre aufzubewahren. Bis jetzt nahm `clearRvSignatureData`
 * den Verweis auf das PDF, die Formulardaten und die Unterschriftsbilder aus
 * dem Investment. Die Datei selbst lag zwar weiter im Speicher, aber
 * `finalize-reservierung` legt die nächste Vereinbarung unter demselben
 * Dateinamen ab (Name und Vertragsdatum, `upsert`). Eine neue Reservierung am
 * selben Tag hätte die alte also überschrieben. Deshalb wird die Datei vorher
 * nach `…/aufgehoben/` kopiert und in `meta.rvHistorie` vermerkt.
 *
 * Entschieden wird weiter in der Datenbank: Einheit freigeben über
 * `einheit_reservierung_aufheben`, Haus über die Zeilensicherheit auf
 * `objekte`, die Vereinbarung über `merge_investment_meta`.
 */
import { cacheGet, cacheSet, gleicherWert, onCacheChange } from "@/lib/dataCache";
import { supabase } from "@/integrations/supabase/client";
import { removeReservierung, hebeHausReservierungAuf } from "@/lib/objekteStore";
import { updateInvestmentMetaZuerst, investmentGespeichert } from "@/lib/investmentsStore";
import { updateKontakt } from "@/lib/kundenStore";
import { objektVerlaufPatch } from "@/lib/objektDatenPflicht";

/** Ein Eintrag in `meta.rvHistorie`: eine aufgehobene Reservierung. */
export interface RvHistorieEintrag {
  aufgehobenAm: string;
  aufgehobenVon: string;
  aufgehobenVonId?: string;
  grund?: string;
  anlass: "aufgehoben" | "einheit_gewechselt";
  /** Wie weit die Vereinbarung war, als sie aufgehoben wurde. */
  stand: "unterschrieben" | "versendet" | "ohne_vereinbarung";
  /** Wo das PDF jetzt liegt (Archivkopie, sonst der ursprüngliche Ort). */
  pdfPfad?: string;
  /** Der ursprüngliche Ablageort, falls die Archivkopie woanders liegt. */
  pdfPfadUrspruenglich?: string;
  pdfName?: string;
  unterschriebenAm?: string;
  versendetAm?: string;
  vertragsdatum?: string;
  objektTitel?: string;
  weNr?: string;
  objektId?: string;
  wohnungId?: string;
  /**
   * Formulardaten und Unterschriften, nur wenn unterschrieben wurde und keine
   * Datei abgelegt ist (Ablage in `finalize-reservierung` fehlgeschlagen).
   * Dann sind sie der einzige Beleg.
   */
  rvData?: unknown;
  rvSignatures?: unknown;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** `investments.meta`, so lose wie es in der Datenbank liegt. */
type Meta = Record<string, unknown>;
type OrdnerEintrag = Record<string, unknown>;

/** Wo das abgelegte PDF der laufenden Vereinbarung liegt, oder "". */
export function rvPdfPfad(meta: Meta): string {
  return text((meta?.docFileUrls as Meta | undefined)?.Reservierungsvertrag) || text(meta?.rvPdfPath);
}

/**
 * Besteht eine Reservierung, die man aufheben kann?
 *
 * Versendet, teilweise oder ganz unterschrieben (auch in der Widerrufsfrist)
 * oder eine für den Kunden reservierte Einheit beziehungsweise ein Haus.
 */
export function reservierungBesteht(m: {
  rvSigned?: unknown; rvSignaturePending?: unknown; rvPdf?: unknown; einheitReserviert?: boolean;
}): boolean {
  return m.rvSigned === true || m.rvSignaturePending === true || !!text(m.rvPdf) || !!m.einheitReserviert;
}

/**
 * Wer den Knopf sieht, nach der aktiven Rolle.
 *
 * Die Datenbank entscheidet ohnehin: Die Einheit geben nur Rollen aus
 * `darf_reservieren` frei (Admin, Inhaber, Vertriebsleitung, der zuständige
 * Partner samt Vertretung), das Backoffice also nicht. Ein Haus schreiben nur
 * Admin und Inhaber (`darf_objekt_schreiben`). Wo die Datenbank sicher
 * ablehnt, steht statt des Knopfs ein Hinweis, damit niemand auf einen Knopf
 * drückt, der nur scheitern kann.
 */
export function reservierungAufhebenRecht(a: {
  rolle: string;
  /** Zuständig oder heute als Vertretung eingetragen. */
  eigenerKunde: boolean;
  /** Eine Einheit aus `wohnungen` muss freigegeben werden. */
  mitEinheit: boolean;
  /** Ein ganzes Haus (Globalobjekt) muss freigegeben werden. */
  mitHaus: boolean;
}): { sichtbar: boolean; hinweis?: string } {
  const leitung = a.rolle === "admin" || a.rolle === "inhaber";
  if (leitung) return { sichtbar: true };
  const vertrieb = a.rolle === "vertriebsleiter" || (a.rolle === "vertriebspartner" && a.eigenerKunde);
  const backoffice = a.rolle === "backoffice";
  if (!vertrieb && !backoffice) return { sichtbar: false };
  if (a.mitHaus) {
    return { sichtbar: false, hinweis: "Die Reservierung des ganzen Hauses heben Admin oder Inhaber auf." };
  }
  if (backoffice && a.mitEinheit) {
    return { sichtbar: false, hinweis: "Die Einheit freigeben dürfen der zuständige Partner, die Vertriebsleitung, Admin und Inhaber." };
  }
  return { sichtbar: true };
}

/** Der Ort der Archivkopie. Liegt im Ordner des Kontakts, damit dieselben Rechte gelten. */
export function rvArchivPfad(kontaktId: string, investmentId: string, pfad: string, jetzt: string): string {
  const datei = pfad.split("/").pop() || "Reservierungsvereinbarung.pdf";
  return `reservierung/${kontaktId}/${investmentId}/aufgehoben/${jetzt.replace(/[:.]/g, "-")}_${datei}`;
}

/** Was von der laufenden Vereinbarung in den Verlauf gehört. */
export function rvHistorieEintrag(
  meta: Meta,
  a: Pick<RvHistorieEintrag, "aufgehobenAm" | "aufgehobenVon" | "aufgehobenVonId" | "grund" | "anlass">
    & { archivPfad?: string },
): RvHistorieEintrag {
  const urspruenglich = rvPdfPfad(meta);
  const unterschrieben = meta.rvSigned === true;
  const stand: RvHistorieEintrag["stand"] = unterschrieben
    ? "unterschrieben"
    : meta.rvSignaturePending === true || text(meta.rvSignatureSentAt) ? "versendet" : "ohne_vereinbarung";
  const pdfPfad = a.archivPfad || urspruenglich;
  const e: RvHistorieEintrag = {
    aufgehobenAm: a.aufgehobenAm,
    aufgehobenVon: a.aufgehobenVon,
    anlass: a.anlass,
    stand,
  };
  const setze = <K extends keyof RvHistorieEintrag>(k: K, v: RvHistorieEintrag[K] | "" | undefined) => {
    if (v) e[k] = v as RvHistorieEintrag[K];
  };
  setze("aufgehobenVonId", a.aufgehobenVonId);
  setze("grund", a.grund?.trim());
  setze("pdfPfad", pdfPfad);
  if (a.archivPfad && urspruenglich && a.archivPfad !== urspruenglich) e.pdfPfadUrspruenglich = urspruenglich;
  setze("pdfName", text(meta.rvPdf));
  setze("unterschriebenAm", text(meta.rvSignedAt));
  setze("versendetAm", text(meta.rvSignatureSentAt));
  setze("vertragsdatum", text(meta.rvVertragsdatum));
  setze("objektTitel", text(meta.objektTitel));
  setze("weNr", text(meta.weNr));
  setze("objektId", text(meta.objektId));
  setze("wohnungId", text(meta.wohnungId));
  if (unterschrieben && !pdfPfad) {
    if (meta.rvData) e.rvData = meta.rvData;
    if (meta.rvSignatures) e.rvSignatures = meta.rvSignatures;
  }
  return e;
}

/**
 * Der eine Schreibvorgang am Investment: Verlauf fortschreiben, das PDF im
 * Kundenordner als aufgehoben ablegen, die laufenden rv-Felder leeren.
 *
 * Die geleerten Schlüssel sind dieselben wie in `clearRvSignatureData`, damit
 * `merge_investment_meta` sie auch dem zuständigen Partner abnimmt. Geschützte
 * Schlüssel wie `rvPdfPath` oder `rvReservierungAb` bleiben stehen, die
 * schreibt die nächste Unterschrift neu.
 */
export function rvAufhebenPatch(meta: Meta, eintrag: RvHistorieEintrag): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    rvHistorie: [...(Array.isArray(meta.rvHistorie) ? meta.rvHistorie : []), eintrag],
    rvZuletztAufgehobenAm: eintrag.aufgehobenAm,
    rvPdf: "",
    rvData: null,
    rvSignatures: null,
    rvSigned: false,
    rvSignaturePending: false,
    rvSignatureSentAt: "",
    rvEditApproved: false,
    reserviertAm: null,
  };

  const urspruenglich = rvPdfPfad(meta);
  if (!urspruenglich) return patch;

  /*
   * Im Kundenordner bleibt das PDF, nur unter eigener Kategorie und nicht mehr
   * für den Kunden freigegeben. Unter „Reservierungsvertrag“ stünde sonst die
   * alte Fassung vor der neuen, die Liste zeigt je Kategorie das erste
   * Dokument.
   */
  const kategorie = `Reservierungsvertrag aufgehoben ${eintrag.aufgehobenAm.slice(0, 16).replace("T", " ")}`;
  const ordner: OrdnerEintrag[] = Array.isArray(meta.kundenordner) ? meta.kundenordner : [];
  let gefunden = false;
  const neuerOrdner = ordner.map((d) => {
    if (d?.fileUrl !== urspruenglich) return d;
    gefunden = true;
    return { ...d, kategorie, freigegeben: false, fileUrl: eintrag.pdfPfad || d.fileUrl };
  });
  if (!gefunden) {
    neuerOrdner.push({
      id: `ko-reservierung-aufgehoben-${Date.parse(eintrag.aufgehobenAm) || Date.now()}`,
      investmentId: text(meta.id) || undefined,
      kategorie,
      filename: eintrag.pdfName || (eintrag.pdfPfad || urspruenglich).split("/").pop(),
      uploadedBy: "System (Reservierung aufgehoben)",
      uploadedAt: eintrag.aufgehobenAm,
      fileUrl: eintrag.pdfPfad || urspruenglich,
      freigegeben: false,
    });
  }
  patch.kundenordner = neuerOrdner;
  const kats: string[] = Array.isArray(meta.kundenordnerCustomKat) ? (meta.kundenordnerCustomKat as string[]) : [];
  if (!kats.includes(kategorie)) patch.kundenordnerCustomKat = [...kats, kategorie];

  const urls = meta.docFileUrls && typeof meta.docFileUrls === "object" ? { ...(meta.docFileUrls as Meta) } : null;
  if (urls && "Reservierungsvertrag" in urls) {
    delete urls.Reservierungsvertrag;
    patch.docFileUrls = urls;
  }
  return patch;
}

export interface AufhebenEingabe {
  investmentId: string;
  kontaktId: string;
  /** Objekt und Einheit, soweit bekannt. Ohne Einheit und ohne Haus wird nur die Vereinbarung aufgehoben. */
  objektId?: string;
  wohnungId?: string;
  /** Das ganze Haus (Globalobjekt) ist für diesen Kunden reserviert. */
  hausFreigeben?: boolean;
  anlass: RvHistorieEintrag["anlass"];
  vonName: string;
  vonId?: string;
  grund?: string;
  /** Admin und Inhaber dürfen offene Unterschriftsanfragen löschen (Zeilensicherheit). */
  darfOffeneLinksLoeschen: boolean;
}

export type AufhebenErgebnis =
  | { ok: false; schritt: "einheit" | "vereinbarung"; text: string }
  | {
      ok: true;
      /** true: offene Links gelöscht; false: es gab keine; null: nicht möglich oder gescheitert. */
      linksUngueltig: boolean | null;
      /** true: Archivkopie angelegt; false: kein PDF da; null: Kopie gescheitert, Original bleibt Verweis. */
      pdfArchiviert: boolean | null;
      /** Gesetzt, wenn Objekt-Spalten am Investment oder die Stufe am Kontakt nicht bestätigt gespeichert wurden. */
      zuruecksetzenUnsicher?: boolean;
    };

/** Was der Ablauf braucht. Austauschbar für den Test, wie in `reservierungsvereinbarungKunde.ts`. */
export interface AufhebenMittel {
  metaLesen: (investmentId: string) => Meta;
  einheitFreigeben: (objektId: string, wohnungId: string) => Promise<{ ok: boolean; fehlerText?: string }>;
  hausFreigeben: (objektId: string) => Promise<{ ok: boolean; fehlerText?: string }>;
  pdfKopieren: (von: string, nach: string) => Promise<boolean>;
  /**
   * Das Investment: erst meta (`patch` und dazu die Stufe Objektauswahl ohne
   * Objekt) in einem Schreibvorgang, dann die Spalten. Wirft, wenn meta
   * scheitert; dann ist nichts geändert. `false`: meta steht, die Spalten nicht.
   */
  metaSchreiben: (investmentId: string, patch: Record<string, unknown>) => Promise<boolean | void>;
  offeneLinksLoeschen: (kontaktId: string, investmentId: string) => Promise<number | null>;
  /** Was vom Objekt in den Verlauf gehört und was abgeräumt wird, als meta-Patch. Schreibt nichts. */
  objektInVerlauf: (investmentId: string, o: { gewechseltVon: string; objektId?: string; wohnungId?: string }) => Record<string, unknown>;
  /** Der Kontakt zurück auf die Objektauswahl. */
  zuruecksetzen: (kontaktId: string) => Promise<boolean>;
}

export const AUFHEBEN_STANDARD: AufhebenMittel = {
  metaLesen: (investmentId) =>
    ((cacheGet("investments") as Array<{ id: string; meta?: Meta }>).find((r) => r.id === investmentId)?.meta || {}),
  einheitFreigeben: removeReservierung,
  hausFreigeben: hebeHausReservierungAuf,
  pdfKopieren: async (von, nach) => {
    try {
      const { error } = await supabase.storage.from("unterlagen").copy(von, nach);
      if (error) console.warn("[Reservierung aufheben] Archivkopie fehlgeschlagen:", error.message);
      return !error;
    } catch (e) {
      console.warn("[Reservierung aufheben] Archivkopie fehlgeschlagen:", e);
      return false;
    }
  },
  metaSchreiben: async (investmentId, patch) => {
    // Erst die offenen Hintergrund-Schreibvorgänge, sonst überholt einer davon den Patch.
    await investmentGespeichert(investmentId);
    let loesen = () => {};
    try {
      const stand = await updateInvestmentMetaZuerst(
        investmentId,
        { pipelineStufe: "objektauswahl", objektId: undefined, objektTitel: undefined, wohnungId: undefined, weNr: undefined },
        patch,
        (dbMeta, gesendet) => { loesen = endstandHalten(investmentId, dbMeta, gesendet); },
      );
      if (stand === "meta") throw new Error();
      // Alle Schreibvorgänge sind zurück: einmal die Zeile frisch holen. Die
      // Sperre fällt vorher, damit der Stand der Datenbank gilt.
      const zeile = await investmentZeileLesen(investmentId);
      loesen();
      if (zeile) investmentZeileEinsetzen(zeile);
      return stand === "ok";
    } finally {
      loesen();
    }
  },
  offeneLinksLoeschen: async (kontaktId, investmentId) => {
    // Dasselbe, was `send-reservation-signature` vor einem Neuversand tut:
    // nur offene rv-Anfragen, Unterschriebenes bleibt als Beleg.
    try {
      const { data, error } = await supabase
        .from("signature_requests")
        .delete()
        .eq("kontakt_id", kontaktId)
        .eq("investment_id", investmentId)
        .eq("status", "pending")
        .like("person_type", "rv_%")
        .select("id");
      if (error) {
        console.warn("[Reservierung aufheben] offene Links nicht entfernt:", error.message);
        return null;
      }
      return (data || []).length;
    } catch (e) {
      console.warn("[Reservierung aufheben] offene Links nicht entfernt:", e);
      return null;
    }
  },
  objektInVerlauf: (investmentId, o) => objektVerlaufPatch(investmentId, o),
  zuruecksetzen: (kontaktId) => updateKontakt(kontaktId, { pipelineStufe: "objektauswahl", objekt: "", kaufpreis: 0 }),
};

/**
 * Hält den bestätigten Endstand der geschriebenen meta-Schlüssel im Speicher,
 * bis `loesen` gerufen wird (06.10.2026).
 *
 * `investments` hat keinen Zeitstempel, an dem sich ein veraltetes
 * Live-Update erkennen ließe. Kommt während des Aufhebens das verspätete
 * Echo eines früheren Schreibvorgangs, brächte es das alte Objekt zurück in
 * die Objektauswahl. Solange der Ablauf läuft, wird es deshalb sofort wieder
 * mit dem Stand überdeckt, den die Datenbank eben bestätigt hat. Danach wird
 * die Zeile einmal frisch geholt. Nur diese eine Zeile, nur die eigenen
 * Schlüssel, nur für die Dauer des Ablaufs.
 */
function endstandHalten(investmentId: string, dbMeta: Meta, schluessel: string[]): () => void {
  const endstand: Meta = Object.fromEntries(schluessel.map((k) => [k, dbMeta[k] ?? null]));
  const pruefen = () => {
    const zeilen = cacheGet("investments") as Array<{ id: string; meta?: Meta }>;
    const i = zeilen.findIndex((r) => r.id === investmentId);
    if (i < 0) return;
    const meta = zeilen[i].meta || {};
    if (schluessel.every((k) => gleicherWert(meta[k] ?? null, endstand[k]))) return;
    const neu = [...zeilen];
    neu[i] = { ...zeilen[i], meta: { ...meta, ...endstand } };
    cacheSet("investments", neu);
  };
  const abmelden = onCacheChange((table) => { if (table === "investments") pruefen(); });
  return abmelden;
}

async function investmentZeileLesen(investmentId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.from("investments").select("*").eq("id", investmentId).maybeSingle();
    if (error) console.warn("[Reservierung aufheben] Nachladen fehlgeschlagen:", error.message);
    return (data as Record<string, unknown> | null) ?? null;
  } catch (e) {
    console.warn("[Reservierung aufheben] Nachladen fehlgeschlagen:", e);
    return null;
  }
}

function investmentZeileEinsetzen(zeile: Record<string, unknown>): void {
  const zeilen = cacheGet("investments") as Array<{ id: string }>;
  cacheSet("investments", zeilen.map((r) => (r.id === zeile.id ? zeile as { id: string } : r)));
}

/**
 * Der ganze Ablauf, für „Reservierung aufheben“ und „Einheit wechseln“.
 *
 * Reihenfolge mit Absicht: Zuerst die Einheit, denn dort entscheidet die
 * Datenbank, ob es überhaupt der eigene Kunde ist. Lehnt sie ab, bleibt alles
 * stehen. Dann das Investment, meta in einem einzigen Schreibvorgang:
 * Vereinbarung archiviert, Objekt in den Verlauf, Hinweis „Einheit
 * gewechselt“, Stufe Objektauswahl (Stufe, Objekt- und Einheitskennung liegen
 * in meta). Scheitert er, ist nichts geändert. Erst danach die Spalten
 * `objekt` und `wohnung`, die Links und der Kontakt. Wirft nicht.
 *
 * Warum ein Schreibvorgang (06.10.2026): Bis dahin gingen Vereinbarung,
 * Objekt und Stufe nacheinander hinaus. Die Antwort der Datenbank auf den
 * Stufenwechsel ersetzte das lokale meta, bevor das entprellte Abräumen des
 * Objekts angekommen war, und jedes Zwischenergebnis kam als Live-Update
 * zurück. Die Objektauswahl zeigte deshalb kurz wieder das alte Objekt, ehe
 * die Empfehlungen erschienen.
 */
export async function reservierungAufheben(e: AufhebenEingabe, mittel: AufhebenMittel = AUFHEBEN_STANDARD): Promise<AufhebenErgebnis> {
  if (e.objektId && e.wohnungId) {
    const r = await mittel.einheitFreigeben(e.objektId, e.wohnungId);
    if (!r.ok) return { ok: false, schritt: "einheit", text: r.fehlerText || "Die Reservierung der Einheit ließ sich nicht aufheben." };
  } else if (e.objektId && e.hausFreigeben) {
    const r = await mittel.hausFreigeben(e.objektId);
    if (!r.ok) return { ok: false, schritt: "einheit", text: r.fehlerText || "Die Reservierung des Hauses ließ sich nicht aufheben." };
  }

  const jetzt = new Date().toISOString();
  const urspruenglich = rvPdfPfad(mittel.metaLesen(e.investmentId));
  let archivPfad: string | undefined;
  let pdfArchiviert: boolean | null = false;
  if (urspruenglich) {
    const ziel = rvArchivPfad(e.kontaktId, e.investmentId, urspruenglich, jetzt);
    if (await mittel.pdfKopieren(urspruenglich, ziel)) {
      archivPfad = ziel;
      pdfArchiviert = true;
    } else {
      pdfArchiviert = null;
    }
  }

  // Erst nach der Kopie lesen: Listen wie `rvHistorie` und `kundenordner`
  // gehen ganz hinaus und sollen den Stand unmittelbar vor dem Schreiben tragen.
  const meta = mittel.metaLesen(e.investmentId);
  const eintrag = rvHistorieEintrag(meta, {
    aufgehobenAm: jetzt, aufgehobenVon: e.vonName, aufgehobenVonId: e.vonId, grund: e.grund, anlass: e.anlass, archivPfad,
  });
  const verlauf = mittel.objektInVerlauf(e.investmentId, { gewechseltVon: e.vonName, objektId: e.objektId, wohnungId: e.wohnungId });
  let investmentVollstaendig = true;
  try {
    investmentVollstaendig = (await mittel.metaSchreiben(e.investmentId, {
      ...rvAufhebenPatch({ ...meta, id: e.investmentId }, eintrag),
      ...verlauf,
      // Der Hinweis in der Objektauswahl; die nächste Reservierung räumt ihn ab.
      einheitGewechseltAm: jetzt,
      einheitGewechseltVon: e.vonName,
    })) !== false;
  } catch (fehler) {
    const grund = fehler instanceof Error && fehler.message ? ` (${fehler.message})` : "";
    return {
      ok: false,
      schritt: "vereinbarung",
      text: `Die Einheit ist frei, aber die Vereinbarung wurde nicht archiviert${grund}. Bitte noch einmal versuchen, sonst Admin oder Inhaber Bescheid geben.`,
    };
  }

  let linksUngueltig: boolean | null = null;
  if (e.darfOffeneLinksLoeschen) {
    const anzahl = await mittel.offeneLinksLoeschen(e.kontaktId, e.investmentId);
    linksUngueltig = anzahl === null ? null : anzahl > 0;
  }

  const zurueck = await mittel.zuruecksetzen(e.kontaktId);
  return { ok: true, linksUngueltig, pdfArchiviert, ...(zurueck && investmentVollstaendig ? {} : { zuruecksetzenUnsicher: true }) };
}
