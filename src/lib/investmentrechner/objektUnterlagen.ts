/** Dokumentquellen einer konkreten Einheit. Keine Kundendokumente oder internen Dateien. */
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import type { Herkunft } from "./herkunft";
import type { InvestmentEingabe } from "./rechenkern";
import { abgleichListe, automatischUebernehmbar, kiHinweise, PERSOENLICHE_FELDER, vorschlagswertFormatiert, type KiAntwort, type KiFeldwert } from "./unterlagenKiFelder";
import { erkenneKategorie, pdfTextAuslesen, type UnterlagenDaten, type UnterlagenDokument } from "./unterlagenAuslesen";
import { dokumentAmpel } from "../../../supabase/functions/_shared/dokument-freigabe.ts";
import { investagonKategorieAusRohdaten } from "../../../supabase/functions/_shared/dokument-gruppen.ts";

export interface ObjektUnterlagenQuelle {
  objektId: string;
  wohnungId: string;
  weNr: string;
  adresse: string;
  dokumente: Array<{
    id: string;
    name: string;
    url: string;
    ebene: "objekt" | "einheit";
    /** Mietvertrag oder Grundbuch nach der Dokumenten-Ampel, samt Investagon-Kategorie. */
    rot?: boolean;
    investagonKategorie?: string;
  }>;
}

export function objektUnterlagenQuelle(objekt: ObjektData, wohnung: ObjektWohnung): ObjektUnterlagenQuelle {
  /*
   * Rot markieren, mit derselben Ampel wie Lotse und Kundenansicht. Die
   * Investagon-Kategorie zählt mit: Ein Mietvertrag, den der Verkäufer unter
   * einem harmlosen Titel abgelegt hat, bleibt rot (seit dem 28.09.2026).
   */
  const kategorieEinheit = investagonKategorieAusRohdaten(wohnung.investagonRaw);
  const kategorieObjekt = investagonKategorieAusRohdaten((objekt.meta as Record<string, unknown> | undefined)?.investagonRaw);
  const einordnen = (name: string, ebene: "objekt" | "einheit") => {
    const investagonKategorie = (ebene === "einheit" ? kategorieEinheit : kategorieObjekt)(name);
    return {
      rot: dokumentAmpel({ name, investagonKategorie: investagonKategorie ?? null }) === "rot",
      ...(investagonKategorie ? { investagonKategorie } : {}),
    };
  };
  const dokumente = [
    ...(wohnung.dokumente ?? []).filter(d => d.kategorie !== "intern").map(d => ({ ...d, ebene: "einheit" as const })),
    ...objekt.dokumente.filter(d => d.kategorie !== "intern").map(d => ({ ...d, ebene: "objekt" as const })),
  ].filter(d => d.url);
  return {
    objektId: objekt.id, wohnungId: wohnung.id, weNr: wohnung.weNr,
    adresse: [objekt.adresse, objekt.plz, objekt.ort].filter(Boolean).join(", "),
    dokumente: [...new Map(dokumente.map(d => [d.url, { id: `${d.ebene}:${d.id}`, name: d.name, url: d.url, ebene: d.ebene, ...einordnen(d.name, d.ebene) }])).values()],
  };
}

export async function ladeObjektUnterlage(quelle: ObjektUnterlagenQuelle["dokumente"][number], signal: AbortSignal): Promise<UnterlagenDokument> {
  const basis: UnterlagenDokument = {
    id: quelle.id, name: quelle.name, category: quelle.ebene === "einheit" ? "Einheitsunterlage" : "Objektunterlage", pages: 0, status: "reading", detail: "", text: "",
    ablage: { url: quelle.url, ebene: quelle.ebene, rot: quelle.rot === true, ...(quelle.investagonKategorie ? { investagonKategorie: quelle.investagonKategorie } : {}) },
  };
  try {
    let url = quelle.url;
    // Geschuetzte Objektunterlagen und Kopien aus Investagon stehen als Zeiger
    // in der Datenbank und brauchen erst hier eine befristete Adresse. Seit
    // dem 24.09.2026 legt der Import sie nicht mehr als „intern“ ab, damit
    // kommen sie hier an.
    if (url.startsWith("/objekt-dokument/") || url.startsWith("/investagon-dokument/")) {
      const { resolveUnterlagenUrl } = await import("@/lib/storage");
      url = await resolveUnterlagenUrl(url) ?? "";
    } else if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) {
      const { resolveUnterlagenUrl } = await import("@/lib/storage");
      url = await resolveUnterlagenUrl(url) ?? "";
    } else if (/\/storage\/v1\/object\/(public|sign|authenticated)\/unterlagen\//.test(url)) {
      const { resolveUnterlagenUrl } = await import("@/lib/storage");
      url = await resolveUnterlagenUrl(url) ?? "";
    }
    if (!url) throw new Error("Dateizugriff nicht verfügbar");
    const res = await fetch(url, { signal, credentials: "omit" });
    if (!res.ok) throw new Error(`Datei nicht erreichbar (${res.status})`);
    if (Number(res.headers.get("content-length")) > 25 * 1024 * 1024) throw new Error("Datei größer als 25 MB");
    const blob = await res.blob();
    if (blob.size > 25 * 1024 * 1024) throw new Error("Datei größer als 25 MB");
    const istPdf = blob.type.includes("pdf") || /\.pdf(?:[?#]|$)/i.test(quelle.url) || (await blob.slice(0, 5).text()) === "%PDF-";
    if (!istPdf && !blob.type.startsWith("text/plain")) throw new Error("Bitte als PDF oder Textdatei hinterlegen; Ordnerlinks und andere Formate können nicht ausgelesen werden");
    const datei = new File([blob], quelle.name, { type: istPdf ? "application/pdf" : "text/plain" });
    const gelesen = istPdf ? await pdfTextAuslesen(datei) : { text: await blob.text(), pages: 1, seiten: [await blob.text()] };
    if (signal.aborted) throw new DOMException("Auslesung abgebrochen", "AbortError");
    const lesbar = gelesen.text.trim().length >= 80;
    return { ...basis, ...gelesen, datei, category: `${basis.category} · ${erkenneKategorie(quelle.name, gelesen.text)}`, status: lesbar ? "done" : "manual", detail: lesbar ? `${gelesen.pages} Seiten aus der Objektablage` : "Scan wird direkt ausgelesen" };
  } catch (e) {
    if (signal.aborted) throw e;
    return { ...basis, status: "error", detail: e instanceof Error ? e.message : "Datei nicht lesbar" };
  }
}

/** Widersprüche über mehrere Auslesepakete werden nie durch „letzter Wert gewinnt“ aufgelöst. */
export function vereinigeAuslesungen(antworten: KiAntwort[]): KiAntwort {
  const felder: Record<string, KiFeldwert> = {};
  const widerspruch = new Set<string>();
  const hinweise = antworten.flatMap(kiHinweise);
  for (const antwort of antworten) for (const [feld, wert] of Object.entries(antwort.felder ?? {})) {
    if (!wert || widerspruch.has(feld)) continue;
    if (felder[feld] && felder[feld].wert !== wert.wert) {
      hinweise.push(`Widersprüchliche Dokumentwerte für ${feld}: ${felder[feld].quelle} / ${wert.quelle}. Bitte prüfen.`);
      delete felder[feld]; widerspruch.add(feld);
    } else if (!felder[feld] || wert.sicherheit === "hoch") felder[feld] = wert;
  }
  return { felder, hinweise: [...new Set(hinweise)] } as KiAntwort;
}

/**
 * Der automatische Weg beim Öffnen, mit derselben Abgleichslogik wie der
 * manuelle (`abgleichListe`, seit dem 28.09.2026):
 *   - leeres Feld (keine Herkunft) und sicherer Wert: wird gesetzt und in der
 *     Herkunft als automatisch markiert, samt Wert davor zum Zurücknehmen;
 *   - Bestätigung: nur der Hinweis „stimmt mit den hinterlegten Daten überein“;
 *   - Abweichung: nie gesetzt, Hinweis mit beiden Werten, die Übernahmeliste
 *     zeigt sie nicht ausgewählt.
 * Kunden-Eigenkapital und Musterfinanzierung setzt er nie.
 */
export function automatischeObjektwerte(antwort: KiAntwort, eingabe: InvestmentEingabe, herkunft: Herkunft) {
  const aenderung: Partial<InvestmentEingabe> = {};
  const quellen: Herkunft = {};
  const hinweise = kiHinweise(antwort);
  for (const v of abgleichListe(antwort, eingabe, herkunft)) {
    if (v.automatisch) {
      hinweise.push(`${v.label}: automatisch übernommen, laut ${v.quelle || "Unterlagen"}. Zurücknehmen unter Objektunterlagen.`);
      continue;
    }
    if (v.abgleich === "bestaetigt") {
      hinweise.push(`${v.label}: stimmt mit den hinterlegten Daten überein.`);
      continue;
    }
    if (v.abgleich === "abweichend") {
      hinweise.push(`${v.label}: Hinterlegt ${vorschlagswertFormatiert(v.einheit, v.aktuell)}, laut ${v.quelle || "Unterlagen"} ${vorschlagswertFormatiert(v.einheit, v.wert)}. Die hinterlegte Angabe bleibt, bitte prüfen.`);
      continue;
    }
    if (v.unveraendert) continue;
    if (!automatischUebernehmbar(v)) {
      if (!PERSOENLICHE_FELDER.has(v.feld)) {
        hinweise.push(`${v.label}: Dokumentwert ist nicht eindeutig. Bitte unter Objektunterlagen prüfen.`);
      }
      continue;
    }
    Object.assign(aenderung, { [v.feld]: v.wert });
    quellen[v.feld] = { quelle: "unterlagen", text: `Aus ${v.quelle}`, automatisch: true, vorher: v.aktuell };
  }
  return { aenderung, herkunft: quellen, hinweise };
}

const UNTERLAGEN_FELDER = ["energyClass", "energyValue", "certificateType", "energyCarrier", "certificateValidUntil", "reserveAmount", "reserveUnitShare", "reserveAsOf", "renovations"] as const;
/** Energie-/WEG-Felder aus derselben kontextgebundenen Auslesung, auch für Scans. */
export function automatischeUnterlagenwerte(antwort: KiAntwort, bisher: UnterlagenDaten) {
  const daten = { ...bisher };
  const hinweise: string[] = [];
  const felder = antwort.felder as Record<string, KiFeldwert | undefined>;
  for (const feld of UNTERLAGEN_FELDER) {
    const v = felder?.[feld];
    if (!v) continue;
    if (v.sicherheit !== "hoch" || !v.quelle) { hinweise.push(`${feld}: Dokumentangabe bitte manuell prüfen.`); continue; }
    let wert: string | number | string[] = v.wert;
    if (["energyValue", "reserveAmount", "reserveUnitShare"].includes(feld)) {
      if (typeof wert !== "number" || !Number.isFinite(wert) || wert < 0) continue;
    } else {
      if (typeof wert !== "string" || !wert.trim()) continue;
      wert = wert.trim();
      if (feld === "energyClass" && !/^(A\+|[A-H])$/.test(wert)) continue;
      if (feld === "renovations") wert = wert.split("\n").filter(Boolean).slice(0, 10);
    }
    const alt = bisher[feld];
    if ((Array.isArray(alt) ? alt.length > 0 : !!alt) && JSON.stringify(alt) !== JSON.stringify(wert)) {
      hinweise.push(`${feld}: Abweichende Angabe in ${v.quelle}; vorhandener Wert bleibt erhalten.`);
      continue;
    }
    Object.assign(daten, { [feld]: wert });
  }
  return { daten, hinweise };
}

/** Neue Texttreffer dürfen bereits gepflegte Unterlagenangaben nicht löschen. */
export function ergaenzeUnterlagen(bisher: UnterlagenDaten, neu: UnterlagenDaten): UnterlagenDaten {
  return Object.fromEntries(Object.entries(bisher).map(([feld, alt]) => [feld, (Array.isArray(alt) ? alt.length > 0 : !!alt) ? alt : neu[feld as keyof UnterlagenDaten]])) as unknown as UnterlagenDaten;
}

/** Alle Dateien in kleinen Paketen auswerten; ein defektes Dokument blockiert die übrigen nicht. */
export async function leseObjektUnterlagen(quelle: ObjektUnterlagenQuelle) {
  const { felderAusUnterlagenAuslesen, anfrageZusammenstellen } = await import("./unterlagenKiAufruf");
  const documents: UnterlagenDokument[] = [];
  for (const d of quelle.dokumente) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try { documents.push(await ladeObjektUnterlage(d, controller.signal)); }
    catch { documents.push({ id: d.id, name: d.name, category: "Objektunterlage", pages: 0, status: "error", detail: "Zeitüberschreitung beim Lesen der Datei. Bitte erneut prüfen.", text: "" }); }
    finally { clearTimeout(timer); }
  }
  const antworten: KiAntwort[] = [];
  const hinweise = documents.filter(d => d.status === "error").map(d => `${d.name}: ${d.detail}`);
  const lesbar = documents.filter(d => d.status !== "error");
  for (let i = 0; i < lesbar.length; i += 2) {
    const paket = lesbar.slice(i, i + 2);
    try {
      const versendbar = await anfrageZusammenstellen(paket);
      for (const d of paket) {
        if (!versendbar.some(v => v.name === d.name)) hinweise.push(`${d.name}: Scan nicht auslesbar (höchstens 4 MB). Bitte Text-PDF hinterlegen oder Werte manuell ergänzen.`);
        if (d.text.length > 60_000) hinweise.push(`${d.name}: Nur die ersten 60.000 Zeichen konnten ausgewertet werden. Weitere Angaben bitte prüfen.`);
      }
      if (versendbar.length) {
        const antwort = await felderAusUnterlagenAuslesen(paket, quelle);
        // Ab Version 2 ordnet die Function die Einheit zu. Version 3 (25.09.2026)
        // fragt zusätzlich den Gesamtkaufpreis samt Möbeln ab, siehe
        // kiAntwortAufGesamtkaufpreis.
        if ((antwort.ausleseVersion ?? 0) < 2) {
          hinweise.push("Die automatische Auslesung mit Einheitszuordnung ist auf dem Server noch nicht freigeschaltet. Bitte die aktualisierte Auslesefunktion veröffentlichen. Gepflegte Objektangaben bleiben nutzbar.");
          break;
        }
        antworten.push(antwort);
      }
    } catch (e) { hinweise.push(`${paket.map(d => d.name).join(", ")}: ${e instanceof Error ? e.message : "Auslesung fehlgeschlagen"}`); }
  }
  const antwort = vereinigeAuslesungen(antworten);
  antwort.hinweise = [...hinweise, ...antwort.hinweise];
  return { documents, antwort };
}
