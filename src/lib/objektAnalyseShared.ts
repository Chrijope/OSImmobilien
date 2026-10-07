export interface ExtractedObjektData {
  titel?: string;
  adresse?: string;
  plz?: string;
  ort?: string;
  baujahr?: number;
  beschreibung?: string;
  objektart?: string;
  gesamtWohnflaeche?: number;
  grundstueckFlaeche?: number;
  anzahlWohneinheiten?: number;
  etagen?: number;
  zustand?: string;
  stellplaetze?: number;
  energieeffizienzklasse?: string;
  endenergiebedarf?: number;
  primaerenergiebedarf?: number;
  heizungsart?: string;
  energietraeger?: string;
  energieausweisGueltigBis?: string;
  energieausweisRegistriernummer?: string;
  highlights?: string[];
  sanierungen?: Array<{ bereich: string; status: string }>;
  grundbuchInfo?: string;
  flurstueck?: string;
  einwohner?: number;
  arbeitslosenquote?: number;
  leerstandsquote?: number;
  wohnungen?: Array<{
    weNr: string;
    hauseingang?: string;
    etage: string;
    zimmer?: number;
    groesse: number;
    kaufpreis?: number;
    kaltmiete?: number;
    hausgeld?: number;
    vermietet?: boolean;
    raeume?: Array<{ name: string; flaeche: number }>;
    keller?: boolean;
    balkon?: boolean;
  }>;
  erkannte_dokumente?: Array<{
    dateiname: string;
    typ: string;
    zusammenfassung?: string;
  }>;
}

export type UploadAnalyseStatus = "idle" | "running" | "completed" | "error";
export type UploadAnalysePhase = "idle" | "uploading" | "analyzing" | "merging" | "completed" | "error";

export interface UploadAnalyseRef {
  name: string;
  storagePath: string;
  index: number;
}

export interface UploadAnalyseFailure {
  name: string;
  reason: string;
  stage: "upload" | "analysis";
}

export interface UploadAnalysePartialResult {
  storagePath: string;
  data: ExtractedObjektData;
}

export interface UploadAnalyseRuntimeState {
  runId: string | null;
  status: UploadAnalyseStatus;
  phase: UploadAnalysePhase;
  progress: number;
  progressText: string;
  error: string | null;
  batchId: string | null;
  userId: string | null;
  totalFiles: number;
  uploadedRefs: UploadAnalyseRef[];
  uploadedPaths: string[];
  partialResults: UploadAnalysePartialResult[];
  failedItems: UploadAnalyseFailure[];
  result: ExtractedObjektData | null;
  updatedAt: string;
}

export const createEmptyUploadAnalyseRuntimeState = (
  overrides: Partial<UploadAnalyseRuntimeState> = {},
): UploadAnalyseRuntimeState => ({
  runId: null,
  status: "idle",
  phase: "idle",
  progress: 0,
  progressText: "",
  error: null,
  batchId: null,
  userId: null,
  totalFiles: 0,
  uploadedRefs: [],
  uploadedPaths: [],
  partialResults: [],
  failedItems: [],
  result: null,
  updatedAt: new Date().toISOString(),
  ...overrides,
});