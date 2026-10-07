import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export interface MieterDokument { id: string; name: string; url: string; typ: "mietvertrag" | "schufa" | "personalausweis" | "gehaltsnachweis" | "kaution" | "uebergabeprotokoll" | "kuendigung" | "sonstiges"; erstelltAm: string; }
export interface MieterZahlung { id: string; monat: string; kaltmiete: number; nebenkosten: number; gezahltAm: string; betragGezahlt: number; status: "bezahlt" | "teilweise" | "offen" | "ueberfaellig" | "gemahnt"; notiz: string; }

export interface Mieter {
  id: string; vorname: string; nachname: string; email: string; telefon: string;
  objektId: string; objektName?: string; wohneinheitId: string; wohneinheitName?: string;
  mietvertragBeginn: string; mietvertragEnde: string; kaltmiete: number; nebenkosten: number;
  kaution: number; kautionEingegangen: boolean; status: "aktiv" | "gekuendigt" | "ausgezogen" | "neu";
  dokumente: MieterDokument[]; zahlungen: MieterZahlung[]; notizen: string; erstelltAm: string;
  strasse?: string; plz?: string; ort?: string; geburtsdatum?: string;
  einzugsdatum?: string; auszugsdatum?: string; kuendigungsdatum?: string; kuendigungsfrist?: string;
  bankIban?: string; bankBic?: string;
}

const LS_KEY = "mi_mieter";

function toDb(m: Mieter): Record<string, any> {
  return {
    id: m.id, vorname: m.vorname, nachname: m.nachname, email: m.email, telefon: m.telefon,
    objekt: m.objektId, wohnung: m.wohneinheitId, einzug: m.mietvertragBeginn,
    miete: m.kaltmiete, nebenkosten: m.nebenkosten, kaution: m.kaution,
    status: m.status, dokumente: m.dokumente, notizen: m.notizen, erstellt_am: m.erstelltAm,
    meta: {
      objektName: m.objektName, wohneinheitName: m.wohneinheitName,
      mietvertragEnde: m.mietvertragEnde, kautionEingegangen: m.kautionEingegangen,
      zahlungen: m.zahlungen, strasse: m.strasse, plz: m.plz, ort: m.ort,
      geburtsdatum: m.geburtsdatum, einzugsdatum: m.einzugsdatum, auszugsdatum: m.auszugsdatum,
      kuendigungsdatum: m.kuendigungsdatum, kuendigungsfrist: m.kuendigungsfrist,
      bankIban: m.bankIban, bankBic: m.bankBic,
    },
  };
}

function fromDb(r: any): Mieter {
  const meta = r.meta || {};
  return {
    id: r.id, vorname: r.vorname, nachname: r.nachname, email: r.email || "", telefon: r.telefon || "",
    objektId: r.objekt || "", objektName: meta.objektName, wohneinheitId: r.wohnung || "", wohneinheitName: meta.wohneinheitName,
    mietvertragBeginn: r.einzug || "", mietvertragEnde: meta.mietvertragEnde || "",
    kaltmiete: Number(r.miete) || 0, nebenkosten: Number(r.nebenkosten) || 0, kaution: Number(r.kaution) || 0,
    kautionEingegangen: meta.kautionEingegangen || false, status: r.status || "neu",
    dokumente: r.dokumente || [], zahlungen: meta.zahlungen || [], notizen: r.notizen || "", erstelltAm: r.erstellt_am || "",
    strasse: meta.strasse, plz: meta.plz, ort: meta.ort, geburtsdatum: meta.geburtsdatum,
    einzugsdatum: meta.einzugsdatum, auszugsdatum: meta.auszugsdatum,
    kuendigungsdatum: meta.kuendigungsdatum, kuendigungsfrist: meta.kuendigungsfrist,
    bankIban: meta.bankIban, bankBic: meta.bankBic,
  };
}

export function getMieter(): Mieter[] {
  if (isTestAccount()) return localGet<Mieter[]>(LS_KEY, []);
  return cacheGet("mieter").map(fromDb);
}

export function getMieterById(id: string): Mieter | undefined {
  if (isTestAccount()) return localGet<Mieter[]>(LS_KEY, []).find(m => m.id === id);
  const row = cacheGet("mieter").find((r: any) => r.id === id);
  return row ? fromDb(row) : undefined;
}

export function addMieter(m: Omit<Mieter, "id" | "erstelltAm">): Mieter {
  const neu: Mieter = { ...m, id: crypto.randomUUID(), erstelltAm: new Date().toISOString().split("T")[0] };
  if (isTestAccount()) { const all = localGet<Mieter[]>(LS_KEY, []); all.push(neu); localSet(LS_KEY, all); }
  else { cacheInsert("mieter", toDb(neu)); }
  return neu;
}

export function updateMieter(id: string, updates: Partial<Mieter>) {
  if (isTestAccount()) {
    const all = localGet<Mieter[]>(LS_KEY, []); const idx = all.findIndex(m => m.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; localSet(LS_KEY, all); }
  } else {
    const existing = getMieterById(id); if (!existing) return;
    const merged = { ...existing, ...updates }; const { id: _id, ...dbUpdates } = toDb(merged);
    cacheUpdate("mieter", id, dbUpdates);
  }
}

export function deleteMieter(id: string) {
  if (isTestAccount()) { localSet(LS_KEY, localGet<Mieter[]>(LS_KEY, []).filter(m => m.id !== id)); }
  else { cacheDelete("mieter", id); }
}

export function addMieterDokument(mieterId: string, doc: Omit<MieterDokument, "id" | "erstelltAm">) {
  const m = getMieterById(mieterId); if (!m) return;
  m.dokumente.push({ ...doc, id: `doc-${Date.now()}`, erstelltAm: new Date().toISOString().split("T")[0] });
  updateMieter(mieterId, { dokumente: m.dokumente });
}

export function removeMieterDokument(mieterId: string, docId: string) {
  const m = getMieterById(mieterId); if (!m) return;
  updateMieter(mieterId, { dokumente: m.dokumente.filter(d => d.id !== docId) });
}

export function updateMieterZahlung(mieterId: string, zahlungId: string, updates: Partial<MieterZahlung>) {
  const m = getMieterById(mieterId); if (!m) return;
  const zIdx = m.zahlungen.findIndex(z => z.id === zahlungId);
  if (zIdx >= 0) { m.zahlungen[zIdx] = { ...m.zahlungen[zIdx], ...updates }; updateMieter(mieterId, { zahlungen: m.zahlungen }); }
}

export function addMieterZahlung(mieterId: string, zahlung: Omit<MieterZahlung, "id">) {
  const m = getMieterById(mieterId); if (!m) return;
  m.zahlungen.push({ ...zahlung, id: `z-${Date.now()}` });
  updateMieter(mieterId, { zahlungen: m.zahlungen });
}

export function deleteMieterZahlung(mieterId: string, zahlungId: string) {
  const m = getMieterById(mieterId); if (!m) return;
  updateMieter(mieterId, { zahlungen: m.zahlungen.filter(z => z.id !== zahlungId) });
}

export const DOKUMENT_TYPEN: { value: MieterDokument["typ"]; label: string }[] = [
  { value: "mietvertrag", label: "Mietvertrag" }, { value: "schufa", label: "Schufa-Auskunft" },
  { value: "personalausweis", label: "Personalausweis" }, { value: "gehaltsnachweis", label: "Gehaltsnachweis" },
  { value: "kaution", label: "Kautionsnachweis" }, { value: "uebergabeprotokoll", label: "Übergabeprotokoll" },
  { value: "kuendigung", label: "Kündigung" }, { value: "sonstiges", label: "Sonstiges" },
];
