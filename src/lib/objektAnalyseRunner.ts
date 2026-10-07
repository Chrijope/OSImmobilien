import { supabase } from "@/integrations/supabase/client";
import {
  createEmptyUploadAnalyseRuntimeState,
  type ExtractedObjektData,
  type UploadAnalyseRuntimeState,
} from "@/lib/objektAnalyseShared";

type Listener = (state: UploadAnalyseRuntimeState) => void;

type UploadAnalyseTask = {
  draftKey: string;
  files: File[];
  slotFiles: Record<string, File[]>;
  state: UploadAnalyseRuntimeState;
  listeners: Set<Listener>;
  promise: Promise<void> | null;
};

/**
 * Höchstzahl der Dokumente je Lauf.
 *
 * Wird ausdrücklich nach außen gegeben, damit die Oberfläche schon vor dem
 * Start sagen kann, welche Dateien nicht mitkommen. Vorher schnitt diese
 * Zeile stillschweigend ab, und niemand erfuhr davon.
 */
export const MAX_ANALYSIS_FILES = 110;
const UPLOAD_CONCURRENCY = 8;
const tasks = new Map<string, UploadAnalyseTask>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cloneState = (state: UploadAnalyseRuntimeState) => structuredClone(state);
const getAllFiles = (files: File[], slotFiles: Record<string, File[]>) => [...files, ...Object.values(slotFiles).flat()];

/**
 * Das Ablagefach je Datei, in derselben Reihenfolge wie `getAllFiles`. Freie
 * Uploads haben kein Fach. Die Function führt Dateien aus den Fächern
 * „mietvertrag“ und „grundbuchauszug“ immer über den eingeschränkten Weg,
 * gleich wie sie heißen (seit dem 28.09.2026).
 */
const getAllFaecher = (files: File[], slotFiles: Record<string, File[]>): Array<string | undefined> => [
  ...files.map(() => undefined),
  ...Object.entries(slotFiles).flatMap(([fach, liste]) => liste.map(() => fach)),
];

const isPresentValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const mergeExtractedData = (base: ExtractedObjektData, incoming: ExtractedObjektData): ExtractedObjektData => {
  const merged: ExtractedObjektData = { ...base };
  const scalarKeys: Array<keyof ExtractedObjektData> = [
    "titel", "adresse", "plz", "ort", "baujahr", "objektart", "gesamtWohnflaeche", "grundstueckFlaeche",
    "anzahlWohneinheiten", "etagen", "zustand", "stellplaetze", "energieeffizienzklasse", "endenergiebedarf",
    "primaerenergiebedarf", "heizungsart", "energietraeger", "energieausweisGueltigBis",
    "energieausweisRegistriernummer", "grundbuchInfo", "flurstueck", "einwohner", "arbeitslosenquote", "leerstandsquote",
  ];

  for (const key of scalarKeys) {
    const currentValue = merged[key];
    const incomingValue = incoming[key];
    if (!isPresentValue(currentValue) && isPresentValue(incomingValue)) {
      (merged as Record<string, unknown>)[key] = incomingValue;
    }
  }

  const currentBeschreibung = merged.beschreibung?.trim() || "";
  const incomingBeschreibung = incoming.beschreibung?.trim() || "";
  if (!currentBeschreibung || incomingBeschreibung.length > currentBeschreibung.length) {
    merged.beschreibung = incomingBeschreibung || merged.beschreibung;
  }

  const mergedHighlights = [...(base.highlights ?? []), ...(incoming.highlights ?? [])]
    .map((item) => item.trim())
    .filter(Boolean);
  if (mergedHighlights.length > 0) {
    merged.highlights = Array.from(new Set(mergedHighlights)).slice(0, 10);
  }

  const sanierungMap = new Map<string, { bereich: string; status: string }>();
  [...(base.sanierungen ?? []), ...(incoming.sanierungen ?? [])].forEach((item) => {
    const bereich = item.bereich?.trim();
    const status = item.status?.trim();
    if (!bereich || !status) return;
    sanierungMap.set(`${bereich.toLowerCase()}|${status.toLowerCase()}`, { bereich, status });
  });
  if (sanierungMap.size > 0) {
    merged.sanierungen = Array.from(sanierungMap.values());
  }

  type Wohnung = NonNullable<ExtractedObjektData["wohnungen"]>[number];
  const wohnungMap = new Map<string, Wohnung>();

  const mergeWohnung = (target: Wohnung, source: Wohnung): Wohnung => {
    const combined = { ...target } as Wohnung;
    (Object.keys(source) as Array<keyof Wohnung>).forEach((key) => {
      if (!isPresentValue(combined[key]) && isPresentValue(source[key])) {
        (combined as Record<string, unknown>)[key] = source[key];
      }
    });

    const raeume = [...(target.raeume ?? []), ...(source.raeume ?? [])];
    if (raeume.length > 0) {
      const roomMap = new Map<string, { name: string; flaeche: number }>();
      raeume.forEach((room) => {
        const roomName = room.name?.trim();
        if (!roomName || room.flaeche == null) return;
        roomMap.set(`${roomName.toLowerCase()}|${room.flaeche}`, { name: roomName, flaeche: room.flaeche });
      });
      combined.raeume = Array.from(roomMap.values());
    }

    return combined;
  };

  [...(base.wohnungen ?? []), ...(incoming.wohnungen ?? [])].forEach((wohnung) => {
    const key = `${wohnung.weNr || "?"}|${wohnung.etage || "?"}|${wohnung.groesse ?? "?"}`;
    const existing = wohnungMap.get(key);
    wohnungMap.set(key, existing ? mergeWohnung(existing, wohnung) : wohnung);
  });

  if (wohnungMap.size > 0) {
    merged.wohnungen = Array.from(wohnungMap.values());
    if (!isPresentValue(merged.anzahlWohneinheiten)) {
      merged.anzahlWohneinheiten = merged.wohnungen.length;
    }
  }

  const dokumentMap = new Map<string, { dateiname: string; typ: string; zusammenfassung?: string }>();
  [...(base.erkannte_dokumente ?? []), ...(incoming.erkannte_dokumente ?? [])].forEach((doc) => {
    const dateiname = doc.dateiname?.trim();
    const typ = doc.typ?.trim();
    if (!dateiname || !typ) return;
    const key = `${dateiname.toLowerCase()}|${typ.toLowerCase()}`;
    const existing = dokumentMap.get(key);
    dokumentMap.set(key, { dateiname, typ, zusammenfassung: existing?.zusammenfassung || doc.zusammenfassung });
  });
  if (dokumentMap.size > 0) {
    merged.erkannte_dokumente = Array.from(dokumentMap.values());
  }

  return merged;
};

const createTask = (draftKey: string, files: File[], slotFiles: Record<string, File[]>, state: UploadAnalyseRuntimeState): UploadAnalyseTask => ({
  draftKey,
  files,
  slotFiles,
  state,
  listeners: new Set<Listener>(),
  promise: null,
});

const emit = (task: UploadAnalyseTask) => {
  const snapshot = cloneState(task.state);
  task.listeners.forEach((listener) => listener(snapshot));
};

const ensureTask = (
  draftKey: string,
  files: File[] = [],
  slotFiles: Record<string, File[]> = {},
  state = createEmptyUploadAnalyseRuntimeState(),
) => {
  const existing = tasks.get(draftKey);
  if (existing) {
    existing.files = files;
    existing.slotFiles = slotFiles;
    existing.state = cloneState(state);
    return existing;
  }

  const task = createTask(draftKey, files, slotFiles, state);
  tasks.set(draftKey, task);
  return task;
};

const updateTaskState = (task: UploadAnalyseTask, updater: (state: UploadAnalyseRuntimeState) => void) => {
  const next = cloneState(task.state);
  updater(next);
  next.updatedAt = new Date().toISOString();
  task.state = next;
  emit(task);
};

const buildAnalysisErrorMessage = (error: unknown) => {
  const rawMessage = String((error as Error | undefined)?.message || "");
  const lowerMessage = rawMessage.toLowerCase();
  const isResourceLimitError = lowerMessage.includes("non-2xx") || lowerMessage.includes("worker_limit") || lowerMessage.includes("compute resources");
  const isTimeout = rawMessage === "" || error instanceof TypeError || (typeof error === "object" && error !== null && "isTrusted" in error);

  if (isResourceLimitError) return "Server-Limit erreicht. Der Fortschritt bleibt erhalten und kann fortgesetzt werden.";
  if (isTimeout) return "Zeitüberschreitung bei der Analyse. Der Fortschritt bleibt erhalten und wird beim Zurückkehren fortgesetzt.";
  return rawMessage || "Unbekannter Fehler bei der Analyse";
};

/**
 * Denselben Fehlschlag nicht zweimal in die Liste schreiben.
 *
 * Ein fortgesetzter Lauf versucht gescheiterte Dateien erneut. Ohne diese
 * Prüfung stünde dieselbe Datei nach dem dritten Anlauf dreimal da.
 */
const merkeFehlschlag = (
  state: UploadAnalyseRuntimeState,
  eintrag: UploadAnalyseRuntimeState["failedItems"][number],
) => {
  const schonDa = state.failedItems.some(
    (vorhanden) => vorhanden.name === eintrag.name && vorhanden.stage === eintrag.stage,
  );
  if (!schonDa) state.failedItems.push(eintrag);
};

/**
 * Der Grund eines Fehlschlags in Klartext.
 *
 * `supabase.functions.invoke` meldet jeden Status ab 400 nur als „Edge
 * Function returned a non-2xx status code“. Die eigentliche Meldung steht im
 * Rumpf der Antwort, den `error.context` mitführt. Ohne dieses Auslesen sieht
 * der Nutzer nie, dass etwa ein PDF nicht geladen werden konnte.
 */
const analyseFehlerText = async (error: any, data: any): Promise<string> => {
  if (data?.error) return String(data.error);
  const rumpf = error?.context;
  if (rumpf && typeof rumpf.json === "function") {
    try {
      const inhalt = await rumpf.clone().json();
      if (inhalt?.error) return String(inhalt.error);
    } catch { /* Antwort ohne lesbaren Rumpf, dann bleibt die Kurzmeldung */ }
  }
  return error?.message || "Analyse fehlgeschlagen";
};

const uploadPdfWithRetry = async (file: File, storagePath: string) => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const payload = attempt === 1 ? file : new Blob([await file.arrayBuffer()], { type: "application/pdf" });
    const { error } = await supabase.storage.from("unterlagen").upload(storagePath, payload, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (!error) return;
    lastError = error;
    if (attempt < 3) await sleep(350 * attempt);
  }

  throw new Error((lastError as { message?: string } | null)?.message || "Unbekannter Upload-Fehler");
};

const runTask = async (task: UploadAnalyseTask) => {
  try {
    const allFiles = getAllFiles(task.files, task.slotFiles);
    const faecher = getAllFaecher(task.files, task.slotFiles);
    let selectedFiles = [...allFiles];
    if (selectedFiles.length > MAX_ANALYSIS_FILES) {
      selectedFiles = selectedFiles.slice(0, MAX_ANALYSIS_FILES);
    }
    if (selectedFiles.length === 0) {
      throw new Error("Keine Dateien für die Analyse vorhanden.");
    }

    updateTaskState(task, (state) => {
      state.status = "running";
      state.phase = state.uploadedRefs.length > 0 ? "analyzing" : "uploading";
      state.progress = Math.max(state.progress, 5);
      state.progressText = state.progressText || "PDFs werden vorbereitet...";
      state.error = null;
      state.totalFiles = selectedFiles.length;
      if (!state.batchId) state.batchId = crypto.randomUUID();
      if (!state.runId) state.runId = crypto.randomUUID();
    });

    if (!task.state.userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Nicht angemeldet – bitte erneut einloggen.");
      updateTaskState(task, (state) => {
        state.userId = user.id;
      });
    }

    const userId = task.state.userId!;
    const batchId = task.state.batchId!;
    const uploadedRefMap = new Map(task.state.uploadedRefs.map((ref) => [ref.index, ref]));
    const uploadTasks = selectedFiles.map((file, index) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 100);
      return {
        file,
        index,
        storagePath: uploadedRefMap.get(index)?.storagePath || `${userId}/analyse-temp/${batchId}/${index}_${safeName}`,
      };
    });

    for (let i = 0; i < uploadTasks.length; i += UPLOAD_CONCURRENCY) {
      const chunk = uploadTasks.slice(i, i + UPLOAD_CONCURRENCY);
      await Promise.all(chunk.map(async ({ file, index, storagePath }) => {
        if (uploadedRefMap.has(index)) return;

        try {
          updateTaskState(task, (state) => {
            state.phase = "uploading";
            state.progressText = `Lade ${selectedFiles.length} Dateien hoch...`;
          });
          await uploadPdfWithRetry(file, storagePath);
          uploadedRefMap.set(index, { name: file.name, storagePath, index });
          updateTaskState(task, (state) => {
            if (!state.uploadedPaths.includes(storagePath)) state.uploadedPaths.push(storagePath);
            state.uploadedRefs = Array.from(uploadedRefMap.values()).sort((a, b) => a.index - b.index);
            state.progress = 5 + (state.uploadedRefs.length / selectedFiles.length) * 30;
          });
        } catch (error) {
          updateTaskState(task, (state) => {
            merkeFehlschlag(state, {
              name: file.name,
              reason: (error as Error)?.message || "Unbekannter Fehler",
              stage: "upload",
            });
          });
        }
      }));
    }

    const uploadedRefs = Array.from(uploadedRefMap.values()).sort((a, b) => a.index - b.index);
    if (uploadedRefs.length === 0) {
      throw new Error("Keines der Dokumente konnte hochgeladen werden. Bitte Datei(en) prüfen und erneut starten.");
    }

    const partialResultMap = new Map(task.state.partialResults.map((entry) => [entry.storagePath, entry.data]));
    for (let index = 0; index < uploadedRefs.length; index++) {
      const ref = uploadedRefs[index];
      if (partialResultMap.has(ref.storagePath)) continue;

      updateTaskState(task, (state) => {
        state.phase = "analyzing";
        state.progressText = `KI analysiert Dokument ${index + 1}/${uploadedRefs.length}: ${ref.name}...`;
        state.progress = 40 + (index / uploadedRefs.length) * 45;
      });

      const { data, error } = await supabase.functions.invoke("analyze-objekt-pdfs", {
        body: { pdfRefs: [{ name: ref.name, storagePath: ref.storagePath, kategorie: faecher[ref.index] }], bucket: "unterlagen" },
      });

      if (error || data?.error || !data?.data) {
        const grund = await analyseFehlerText(error, data);
        updateTaskState(task, (state) => {
          merkeFehlschlag(state, {
            name: ref.name,
            reason: grund,
            stage: "analysis",
          });
        });
        continue;
      }

      partialResultMap.set(ref.storagePath, data.data as ExtractedObjektData);
      updateTaskState(task, (state) => {
        state.partialResults = Array.from(partialResultMap.entries()).map(([storagePath, result]) => ({ storagePath, data: result }));
      });
    }

    const partialResults = Array.from(partialResultMap.values());
    if (partialResults.length === 0) {
      throw new Error("KI-Analyse für alle Dokumente fehlgeschlagen. Bitte erneut versuchen.");
    }

    updateTaskState(task, (state) => {
      state.phase = "merging";
      state.progress = 88;
      state.progressText = "Ergebnisse werden zusammengeführt...";
    });

    const aggregatedResult = partialResults.reduce<ExtractedObjektData>((merged, part) => mergeExtractedData(merged, part), {});

    updateTaskState(task, (state) => {
      state.status = "completed";
      state.phase = "completed";
      state.progress = 100;
      /*
       * Ehrliche Abschlussmeldung.
       *
       * Vorher stand hier immer „Analyse abgeschlossen ✓“, auch wenn die
       * Hälfte der Dokumente nicht gelesen werden konnte. Der Nutzer übernahm
       * dann Daten, in denen still etwas fehlte.
       */
      const gelesen = partialResults.length;
      const gescheitert = state.failedItems.length;
      state.progressText = gescheitert > 0
        ? `${gelesen} von ${gelesen + gescheitert} Dokumenten gelesen, ${gescheitert} nicht`
        : "Analyse abgeschlossen ✓";
      state.result = aggregatedResult;
      state.error = null;
      state.uploadedRefs = uploadedRefs;
      state.partialResults = Array.from(partialResultMap.entries()).map(([storagePath, result]) => ({ storagePath, data: result }));
    });
  } catch (error) {
    updateTaskState(task, (state) => {
      state.status = "error";
      state.phase = "error";
      state.error = buildAnalysisErrorMessage(error);
      state.progressText = state.error;
    });
  } finally {
    task.promise = null;
  }
};

export const subscribeUploadAnalyseTask = (draftKey: string, listener: Listener) => {
  const task = ensureTask(draftKey);
  task.listeners.add(listener);
  listener(cloneState(task.state));

  return () => {
    task.listeners.delete(listener);
  };
};

export const startUploadAnalyseTask = (params: {
  draftKey: string;
  files: File[];
  slotFiles: Record<string, File[]>;
}) => {
  const task = ensureTask(
    params.draftKey,
    params.files,
    params.slotFiles,
    createEmptyUploadAnalyseRuntimeState({
      runId: crypto.randomUUID(),
      status: "running",
      phase: "uploading",
      progress: 5,
      progressText: "PDFs werden vorbereitet...",
      batchId: crypto.randomUUID(),
      totalFiles: Math.min(getAllFiles(params.files, params.slotFiles).length, MAX_ANALYSIS_FILES),
    }),
  );

  if (!task.promise) task.promise = runTask(task);
  emit(task);
  return cloneState(task.state);
};

export const resumeUploadAnalyseTask = (params: {
  draftKey: string;
  files: File[];
  slotFiles: Record<string, File[]>;
  runtime: UploadAnalyseRuntimeState;
}) => {
  const task = ensureTask(params.draftKey, params.files, params.slotFiles, params.runtime);
  if (task.state.status === "running" && !task.promise) task.promise = runTask(task);
  emit(task);
  return cloneState(task.state);
};

export const clearUploadAnalyseTask = async (draftKey: string, cleanupStorage = true) => {
  const task = ensureTask(draftKey);
  const uploadedPaths = [...task.state.uploadedPaths];
  task.files = [];
  task.slotFiles = {};
  task.promise = null;
  task.state = createEmptyUploadAnalyseRuntimeState();
  emit(task);

  if (cleanupStorage && uploadedPaths.length > 0) {
    await supabase.storage.from("unterlagen").remove(uploadedPaths).catch(() => undefined);
  }
};