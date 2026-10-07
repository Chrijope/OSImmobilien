import { z } from "zod";
import { PipelineStufeZodEnum } from "@/lib/pipelineStufen";

/**
 * Zod-Schemas für kontakte.meta und investments.meta
 * Dienen als "lebende Dokumentation" der erlaubten Struktur.
 * Unbekannte Felder werden erlaubt (passthrough), damit das System
 * nicht bei neuen Meta-Keys blockiert.
 */

// ── Shared primitives ──
const emptyStringToNull = z.preprocess((val) => (val === "" ? null : val), z.string().nullable());
const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const germanDateString = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/);

// ── Kontakt-Meta Sub-Schemas ──
const kampagneFelder = {
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
  erfasstAm: z.string().optional(),
};
const kampagneSchema = z.object({
  ...kampagneFelder,
  zuletzt: z.object(kampagneFelder).passthrough().optional(),
}).passthrough();

const person2Schema = z.object({
  authUserId: z.string().uuid().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  telefon: z.string().optional(),
  geburtsdatum: z.string().optional(),
}).passthrough();

const einkuenfteSchema = z.object({
  nettoeinkommen: z.number().optional(),
  nebenEinkuenfte: z.number().optional(),
  mieteinnahmen: z.number().optional(),
  gewerbe: z.number().optional(),
  gesamt: z.number().optional(),
}).passthrough();

const ausgabenSchema = z.object({
  miete: z.number().optional(),
  kredite: z.number().optional(),
  lebenshaltung: z.number().optional(),
  versicherungen: z.number().optional(),
  gesamt: z.number().optional(),
}).passthrough();

const analyseErgebnisSchema = z.object({
  empfohleneAssetklasse: z.string().optional(),
  monatlicheRate: z.number().optional(),
  zielrendite: z.number().optional(),
  score: z.number().optional(),
}).passthrough();

const saTokenSchema = z.object({
  token: z.string().optional(),
  erstelltAm: z.string().optional(),
  gueltigBis: z.string().optional(),
}).passthrough();

// ── Kontakt-Meta Root Schema ──
export const KontaktMetaSchema = z.object({
  // Pipeline & Qualifizierung
  pipelineStufe: PipelineStufeZodEnum.optional(),
  setter_id: z.string().uuid().optional(),
  leadQuality: z.string().optional(),
  qualifiziertAm: z.string().optional(),
  qualifiziertVon: z.string().optional(),
  gespraechAm: z.string().optional(),
  gespraechVon: z.string().optional(),

  // Status & Archivierung
  archived: z.union([z.boolean(), z.string()]).optional(),
  archiviertAm: z.string().optional(),
  archiviertVon: z.string().optional(),
  deleteRequested: z.boolean().optional(),
  deleteRequestedBy: z.string().optional(),
  deleteRequestedAt: z.string().optional(),
  deleteGrund: z.string().optional(),
  deleteDsgvo: z.boolean().optional(),

  // Verlust (Katalog in src/lib/verlustgruende.ts, Altbestand kann Freitext sein)
  verlorenGrund: z.string().optional(),
  verlorenAm: z.string().optional(),
  verlorenVon: z.string().optional(),
  archivGrund: z.string().optional(),

  // Portal & Auth
  authUserId: z.string().uuid().optional(),
  person2: person2Schema.optional(),
  portalAktiviert: z.boolean().optional(),
  portalAktiviertAm: z.string().optional(),

  // Tippgeber
  tippgeberBenutzerId: z.string().uuid().optional(),
  tippgeberName: z.string().optional(),

  // Finanzen (Selbstauskunft)
  geburtstag: z.string().optional(),
  einkuenfte: einkuenfteSchema.optional(),
  ausgaben: ausgabenSchema.optional(),
  familienstand: z.string().optional(),
  beruf: z.string().optional(),
  arbeitgeber: z.string().optional(),
  beschaeftigtSeit: z.string().optional(),

  // Analysetool
  analyseErgebnis: analyseErgebnisSchema.optional(),
  analysetoolBesucht: z.boolean().optional(),
  analysetoolAbgeschlossen: z.boolean().optional(),

  // Beratungsgespräch
  beratungsgespraechGebucht: z.boolean().optional(),
  beratungsgespraechAm: z.string().optional(),
  beratungsgespraechVon: z.string().optional(),

  // Kampagnen. `kampagne` ist seit den Werbelinks ein Objekt mit den
  // UTM-Feldern (`kampagnenKennung.ts`); ältere Kontakte tragen einen Text.
  kampagne: z.union([z.string(), kampagneSchema]).optional(),
  kampagneQuelle: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),

  // SA & Dokumente
  saToken: saTokenSchema.optional(),
  saUnterschriebenAm: z.string().optional(),
  saVersendetAm: z.string().optional(),
  unterlagenFreigabe: z.union([z.boolean(), z.object({}).passthrough()]).optional(),

  // Sonstiges
  notizenIntern: z.string().optional(),
  crmPhase: z.string().optional(),
  letzteAktivitaet: z.string().optional(),

  // Kundensprache (Plan Kundensprache vom 25.09.2026). Fehlt der Wert, gilt
  // Deutsch. Bewusst gewählt ist die Sprache erst mit `kundenSpracheGesetztAm`.
  // Lesen und Schreiben über `src/lib/kundenSprache.ts`, serverseitig über
  // `supabase/functions/_shared/kunden-sprache.ts`.
  kundenSprache: z.enum(["de", "en"]).optional(),
  kundenSpracheGesetztAm: z.string().optional(),
  kundenSpracheGesetztVon: z.string().optional(),

  // Kontakttyp & Herkunft (für Unterscheidung Eigenkontakte / Team / Lead)
  // "gesellschaft" seit 29.09.2026 für Kontakte, die nicht der Partner für
  // sich selbst anlegt; "team" und "lead" bleiben für den Altbestand gültig.
  kontaktTyp: z.enum(["eigen", "team", "lead", "gesellschaft"]).optional(),
  herkunftKanal: z.string().optional(),
  importBatchId: z.string().optional(),
}).passthrough();

// ── Investment-Meta Sub-Schemas ──
const notarDataSchema = z.object({
  datum: z.string().optional(),
  uhrzeit: z.string().optional(),
  name: z.string().optional(),
  adresse: z.string().optional(),
  telefon: z.string().optional(),
  email: z.string().optional(),
}).passthrough();

const notarTerminBestaetigtSchema = z.object({
  datum: z.string().optional(),
  uhrzeit: z.string().optional(),
  bestaetigtAm: z.string().optional(),
}).passthrough();

const finanzierungsrahmenSchema = z.object({
  kaufpreis: z.number().optional(),
  eigenkapital: z.number().optional(),
  darlehen: z.number().optional(),
  zinsbindung: z.number().optional(),
  sollzins: z.number().optional(),
  tilgung: z.number().optional(),
  rate: z.number().optional(),
}).passthrough();

const kaufnebenkostenSchema = z.object({
  grunderwerbsteuer: z.number().optional(),
  notar: z.number().optional(),
  makler: z.number().optional(),
  gesamt: z.number().optional(),
}).passthrough();

const afaSchema = z.object({
  jahresafa: z.number().optional(),
  monatlicheAfa: z.number().optional(),
  gesamtlaufzeit: z.number().optional(),
}).passthrough();

const steuervorteileSchema = z.object({
  abschreibung: z.number().optional(),
  werbungskosten: z.number().optional(),
  sonderausgaben: z.number().optional(),
  gesamt: z.number().optional(),
}).passthrough();

// ── Investment-Meta Root Schema ──
export const InvestmentMetaSchema = z.object({
  // Notar
  notarTermin: z.string().optional(),
  notarUhrzeit: z.string().optional(),
  notarName: z.string().optional(),
  notarData: notarDataSchema.optional(),
  notarTerminBestaetigt: notarTerminBestaetigtSchema.optional(),
  notarTerminPortalFreigabe: z.string().optional(),
  notarTerminModus: z.enum(["gesetzt", "vorschlaege"]).optional(),

  // Kauf
  kaufdatum: z.string().optional(),
  finanzierungsrahmen: finanzierungsrahmenSchema.optional(),
  kaufnebenkosten: kaufnebenkostenSchema.optional(),
  afa: afaSchema.optional(),
  steuervorteile: steuervorteileSchema.optional(),

  // Status
  unterlagenFreigabe: z.union([z.boolean(), z.object({}).passthrough()]).optional(),
  portalFreigabe: z.boolean().optional(),
  mietgarantie: z.object({ aktiv: z.boolean(), bis: z.string().optional() }).passthrough().optional(),
  nachmieter: z.object({ aktiv: z.boolean(), name: z.string().optional() }).passthrough().optional(),

  // Objekt
  objektId: z.string().uuid().optional(),
  wohnungId: z.string().uuid().optional(),
  einheit: z.string().optional(),
}).passthrough();

// ── Validierungs-Helper ──
export type KontaktMeta = z.infer<typeof KontaktMetaSchema>;
export type InvestmentMeta = z.infer<typeof InvestmentMetaSchema>;

/**
 * Validiert ein Meta-Patch vor dem Schreiben via merge_kontakt_meta.
 * Bei unbekannten Feldern wird gewarnt, aber nicht blockiert (passthrough).
 * Bei offensichtlich falschen Typen (z. B. pipelineStufe als number)
 * wird ein Fehler zurückgegeben.
 */
export function validateKontaktMetaPatch(patch: unknown): { success: true; data: Record<string, unknown> } | { success: false; errors: string[] } {
  const result = KontaktMetaSchema.safeParse(patch);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`) };
}

export function validateInvestmentMetaPatch(patch: unknown): { success: true; data: Record<string, unknown> } | { success: false; errors: string[] } {
  const result = InvestmentMetaSchema.safeParse(patch);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`) };
}

/**
 * Strikt-Validierung für sensible Pfade (z. B. DSGVO-Flags, Auth-IDs).
 * Wirft einen Fehler bei ungültigen Typen, statt stillschweigend zu akzeptieren.
 */
export function strictValidateKontaktMetaPatch(patch: unknown): Record<string, unknown> {
  const result = KontaktMetaSchema.safeParse(patch);
  if (!result.success) {
    throw new Error(`Kontakt-Meta-Validierung fehlgeschlagen: ${result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`);
  }
  return result.data;
}
