import { toast } from "sonner";
import { cacheGet, cacheInsert, cacheUpdate, cacheDelete, cacheFilter } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import { getUserSetting, setUserSetting } from "./userSettingsCache";
import { getCurrentUserId } from "./currentUser";
import { loadAllUsers } from "./loadAllUsers";
import { supabase } from "@/integrations/supabase/client";

function resolveCurrentUserName(): string {
  try {
    const id = getCurrentUserId();
    if (!id) return "System";
    const u = loadAllUsers().find((x) => x.id === id);
    return u?.name || "System";
  } catch {
    return "System";
  }
}

export interface AktivitaetEntry {
  id: string;
  kundeId: string;
  /**
   * `anruf_gestartet` vermerkt nur den Klick auf eine Kundennummer (siehe
   * `starteAnrufFuerKontakt`). Er ist weder Protokoll noch Aufgabe noch
   * Termin. Die Datenbank schränkt die Spalte nicht ein, eine Migration
   * braucht die Art deshalb nicht.
   */
  art: "notiz" | "anruf" | "email" | "aufgabe" | "meeting" | "anruf_protokoll" | "meeting_protokoll" | "anruf_gestartet";
  beschreibung: string;
  details?: string;
  von: string;
  datum: string;
  prioritaet?: "niedrig" | "mittel" | "hoch" | "dringend";
  faelligAm?: string;
  uhrzeit?: string;
  zugewiesenAn?: string;
  dauer?: string;
  ergebnis?: string;
  teilnehmer?: string;
  /**
   * Zugangslink des Termins, heute der Pfad zum eigenen Videoraum
   * ("/raum/…") oder eine vollständige Meeting-Adresse. Heisst wie die
   * Spalte `aktivitaeten.zoom_link` und wie der Schluessel, den
   * `meeting_anlegen` aus `_daten` liest; deshalb bleibt der Name.
   */
  zoomLink?: string;
  erledigtAm?: string;
  /**
   * Wer den Eintrag angelegt hat. Wird beim Anlegen automatisch gesetzt.
   * Die Buchungsseite braucht das, um zu erkennen, wessen Zeit ein Termin
   * belegt. Altbestand hat das Feld nicht, dort greift ersatzweise der
   * zustaendige Berater des Kontakts.
   */
  benutzerId?: string;
  meetingKommunikation?: { icsUid?: string };
  meetingRevision?: number;
  /** Verknuepfung in den eigenen Kalender des Mitarbeiters, siehe kalenderSync. */
  kalenderTyp?: "google" | "apple";
  kalenderEventId?: string;
  kalenderUrl?: string;
  /**
   * Favorit einer Notiz, gemeinsam fuer alle am Kunden, nicht je Nutzer.
   * Gesetzt heisst angepinnt. Spalten aus Migration 20260928210000; fehlen
   * sie noch, bleiben beide leer und niemand sieht einen Favoriten.
   */
  angepinntAm?: string;
  /** Kennung dessen, der angepinnt hat. */
  angepinntVon?: string;
}

const LS_KEY = "mi_aktivitaeten";

function toDbRow(a: AktivitaetEntry): Record<string, any> {
  return {
    id: a.id, kunde_id: a.kundeId, art: a.art, beschreibung: a.beschreibung,
    details: a.details || null, von: a.von, datum: a.datum,
    prioritaet: a.prioritaet || "mittel", faellig_am: a.faelligAm || null,
    uhrzeit: a.uhrzeit || null, zugewiesen_an: a.zugewiesenAn || null,
    dauer: a.dauer || null, ergebnis: a.ergebnis || null,
    teilnehmer: a.teilnehmer || null, zoom_link: a.zoomLink || null,
    erledigt_am: a.erledigtAm || null,
    benutzer_id: a.benutzerId || getCurrentUserId() || null,
    kalender_typ: a.kalenderTyp || null,
    kalender_event_id: a.kalenderEventId || null,
    kalender_url: a.kalenderUrl || null,
  };
}

function fromDbRow(r: any): AktivitaetEntry {
  return {
    id: r.id, kundeId: r.kunde_id, art: r.art, beschreibung: r.beschreibung || "",
    details: r.details || undefined, von: r.von || "", datum: r.datum || "",
    prioritaet: r.prioritaet || undefined, faelligAm: r.faellig_am || undefined,
    uhrzeit: r.uhrzeit || undefined, zugewiesenAn: r.zugewiesen_an || undefined,
    dauer: r.dauer || undefined, ergebnis: r.ergebnis || undefined,
    teilnehmer: r.teilnehmer || undefined, zoomLink: r.zoom_link || undefined,
    erledigtAm: r.erledigt_am || undefined,
    benutzerId: r.benutzer_id || undefined,
    meetingKommunikation: r.meeting_kommunikation || undefined,
    meetingRevision: r.meeting_revision || 0,
    kalenderTyp: r.kalender_typ || undefined,
    kalenderEventId: r.kalender_event_id || undefined,
    kalenderUrl: r.kalender_url || undefined,
    angepinntAm: r.angepinnt_am || undefined,
    angepinntVon: r.angepinnt_von || undefined,
  };
}

/**
 * Eine Aktivität nachträglich ändern.
 *
 * Notizen entstehen im Alltag oft in Eile, direkt im Gespräch. Bisher liessen
 * sie sich überhaupt nicht mehr korrigieren: Ein Tippfehler oder eine
 * unvollständige Notiz blieb dauerhaft so im Kundenprofil stehen. Neben den
 * Texten dürfen inzwischen auch Priorität, Fälligkeit, Uhrzeit und Empfänger
 * geändert werden, damit sich eine selbst angelegte Aufgabe verschieben lässt.
 * Autor, Zeitpunkt und Art bleiben unveränderlich, damit die Historie
 * nachvollziehbar bleibt.
 */
export async function updateAktivitaet(
  id: string,
  felder: Partial<
    Pick<
      AktivitaetEntry,
      "beschreibung" | "details" | "prioritaet" | "faelligAm" | "uhrzeit" | "zugewiesenAn"
    >
  >,
  /**
   * `still` unterdrueckt den Fehler-Toast des Zwischenspeichers. Gedacht fuer
   * Aenderungen, die der Nutzer gar nicht angestossen hat, etwa das
   * Fortschreiben der Gespraechsnotiz beim Auflegen: Dort waere die Meldung
   * nicht zuzuordnen. Der Aufrufer faengt den Fehler dann selbst ab.
   */
  optionen?: { still?: boolean },
): Promise<void> {
  if (isTestAccount()) {
    const alle = localGet<AktivitaetEntry[]>(LS_KEY, []);
    const idx = alle.findIndex((a) => a.id === id);
    if (idx >= 0) {
      alle[idx] = { ...alle[idx], ...felder };
      localSet(LS_KEY, alle);
    }
    return;
  }
  const patch: Record<string, any> = {};
  if (felder.beschreibung !== undefined) patch.beschreibung = felder.beschreibung;
  if (felder.details !== undefined) patch.details = felder.details || null;
  if (felder.prioritaet !== undefined) patch.prioritaet = felder.prioritaet;
  if (felder.faelligAm !== undefined) patch.faellig_am = felder.faelligAm || null;
  if (felder.uhrzeit !== undefined) patch.uhrzeit = felder.uhrzeit || null;
  if (felder.zugewiesenAn !== undefined) patch.zugewiesen_an = felder.zugewiesenAn || null;
  if (Object.keys(patch).length === 0) return;
  await cacheUpdate("aktivitaeten", id, patch, { silent: optionen?.still });
}

/**
 * Pinnt eine Notiz an oder loest sie wieder.
 *
 * Bewusst nicht in `toDbRow`: Neue Eintraege sollen auch ohne die Migration
 * 20260928210000 weiter gespeichert werden. Nur dieser Weg braucht die
 * Spalten. Fehlen sie, wirft die Datenbank, und der Aufrufer meldet es.
 */
export async function setzeNotizAngepinnt(id: string, angepinnt: boolean): Promise<void> {
  await cacheUpdate(
    "aktivitaeten",
    id,
    angepinnt
      ? { angepinnt_am: new Date().toISOString(), angepinnt_von: getCurrentUserId() || null }
      : { angepinnt_am: null, angepinnt_von: null },
    { silent: true },
  );
}

/**
 * Hakt einen Termin ab oder verschiebt ihn.
 *
 * Beides braucht das Ergebnis-Kaestchen im Kundenprofil fuer von Hand
 * angelegte Meetings: Erschienen und No-Show schliessen den Termin,
 * Verschieben traegt die neue Zeit ein. Bewusst getrennt von
 * updateAktivitaet, das nur Texte anfasst.
 */
export async function setzeAktivitaetErledigt(id: string, erledigtAm: string | null = new Date().toISOString()): Promise<void> {
  if (isTestAccount()) {
    const alle = localGet<AktivitaetEntry[]>(LS_KEY, []);
    const idx = alle.findIndex((a) => a.id === id);
    if (idx >= 0) {
      alle[idx] = { ...alle[idx], erledigtAm: erledigtAm || undefined };
      localSet(LS_KEY, alle);
    }
    return;
  }
  await cacheUpdate("aktivitaeten", id, { erledigt_am: erledigtAm });
}

export async function verschiebeAktivitaetTermin(id: string, faelligAm: string, uhrzeit: string): Promise<void> {
  if (isTestAccount()) {
    const alle = localGet<AktivitaetEntry[]>(LS_KEY, []);
    const idx = alle.findIndex((a) => a.id === id);
    if (idx >= 0) {
      alle[idx] = { ...alle[idx], faelligAm, uhrzeit, erledigtAm: undefined };
      localSet(LS_KEY, alle);
    }
    return;
  }
  await cacheUpdate("aktivitaeten", id, { faellig_am: faelligAm, uhrzeit, erledigt_am: null });
}

/**
 * Loescht eine Aktivitaet endgueltig.
 *
 * Gedacht fuer geplante Termine, die wieder entfernt werden (Papierkorb auf
 * der Termin-Karte und in Meine Gespraeche). Die Loeschung selbst wird von
 * den Aufrufern als Notiz im Verlauf vermerkt, damit die Historie
 * nachvollziehbar bleibt.
 */
export async function loescheAktivitaet(id: string): Promise<boolean> {
  if (isTestAccount()) {
    const alle = localGet<AktivitaetEntry[]>(LS_KEY, []).filter((a) => a.id !== id);
    localSet(LS_KEY, alle);
    return true;
  }
  try {
    await cacheDelete("aktivitaeten", id);
    return true;
  } catch (e) {
    console.error("loescheAktivitaet:", e);
    return false;
  }
}

/**
 * Gibt es diese Aktivitaet noch?
 *
 * Gefragt wird die Datenbank, nicht der Zwischenspeicher: Von den grossen
 * Tabellen haelt der nur einen Ausschnitt, ein fehlender Treffer dort hiesse
 * also nicht, dass die Zeile weg ist. Gebraucht wird das, wo ein vorhandener
 * Eintrag fortgeschrieben statt neu angelegt werden soll, siehe
 * `videoraumNotizAkte`.
 *
 * Bei einem Fehler lautet die Antwort bewusst "ja". Ein zweiter Eintrag im
 * Verlauf ist laestiger als ein ausgefallenes Fortschreiben.
 */
export async function aktivitaetExistiert(id: string): Promise<boolean> {
  if (!id) return false;
  if (isTestAccount()) {
    return localGet<AktivitaetEntry[]>(LS_KEY, []).some((a) => a.id === id);
  }
  try {
    const { data, error } = await supabase
      .from("aktivitaeten").select("id").eq("id", id).maybeSingle();
    if (error) { console.warn("aktivitaetExistiert:", error.message); return true; }
    return !!data;
  } catch (e) {
    console.warn("aktivitaetExistiert:", e);
    return true;
  }
}

export function getAktivitaeten(kundeId: string): AktivitaetEntry[] {
  if (isTestAccount()) {
    return localGet<AktivitaetEntry[]>(LS_KEY, []).filter(a => a.kundeId === kundeId).sort((a, b) => b.datum.localeCompare(a.datum));
  }
  return cacheFilter("aktivitaeten", (r: any) => r.kunde_id === kundeId).map(fromDbRow).sort((a, b) => b.datum.localeCompare(a.datum));
}

/**
 * Alle Termine, ueber alle Kunden hinweg.
 *
 * Die Inbox braucht die Termine vieler Kunden auf einmal. `getAktivitaeten`
 * je Kunde aufzurufen hiesse, die ganze Tabelle einmal pro Kunde zu
 * durchsuchen. Gefiltert wird vor dem Umwandeln, weil die Liste bei jedem
 * Rendern der Inbox entsteht. Welche Zeilen ein Nutzer ueberhaupt sieht,
 * regelt die Zugriffskontrolle in der Datenbank; die Einschraenkung auf die
 * eigenen Kontakte passiert zusaetzlich beim Aufrufer.
 */
export function getAlleTermine(): AktivitaetEntry[] {
  if (isTestAccount()) {
    return localGet<AktivitaetEntry[]>(LS_KEY, []).filter((a) => a.art === "meeting");
  }
  return cacheFilter("aktivitaeten", (r: any) => r.art === "meeting").map(fromDbRow);
}

/**
 * Einen angelegten Termin zusaetzlich in den eigenen Kalender des
 * Mitarbeiters schreiben, sofern er Google oder iCloud verbunden hat.
 *
 * Bewusst nebenher und ohne Warten: Ein hakeliger Kalenderdienst darf das
 * Anlegen im CRM nicht aufhalten und erst recht nicht scheitern lassen. Klappt
 * es, wird die Kennung nachgetragen, damit ein spaeteres Verschieben oder
 * Loeschen denselben Eintrag wiederfindet.
 */
export function uebertrageInKalender(eintrag: AktivitaetEntry): void {
  if (eintrag.art !== "meeting" || !eintrag.faelligAm) return;
  if (isTestAccount()) return;

  void (async () => {
    try {
      const { legeTerminAn, terminZeitpunkt, dauerInMinuten } = await import("./kalenderSync");
      const start = terminZeitpunkt(eintrag.faelligAm, eintrag.uhrzeit);
      if (!start) return;

      // Der Nachtrag auf der Kalenderseite holt Termine ohne Verknuepfung
      // nach. Ohne diese Notiz koennte er denselben Termin ein zweites Mal
      // eintragen, solange die Kennung hier noch unterwegs ist.
      const { merkeUebertragung } = await import("./kalenderNachtrag");
      merkeUebertragung(eintrag.id);

      const verknuepfung = await legeTerminAn({
        titel: eintrag.beschreibung || "Termin",
        beschreibung: [eintrag.details, eintrag.zoomLink].filter(Boolean).join("\n\n") || undefined,
        start,
        dauerMinuten: dauerInMinuten(eintrag.dauer),
      });
      if (!verknuepfung) return;

      eintrag.kalenderTyp = verknuepfung.typ;
      eintrag.kalenderEventId = verknuepfung.eventId;
      await cacheUpdate("aktivitaeten", eintrag.id, {
        kalender_typ: verknuepfung.typ,
        kalender_event_id: verknuepfung.eventId,
      }, { silent: true });
    } catch (e) {
      console.warn("Termin nicht in den Kalender uebertragen:", e);
    }
  })();
}

export function addAktivitaet(entry: Omit<AktivitaetEntry, "id" | "datum" | "von"> & { von?: string }): AktivitaetEntry {
  const newEntry: AktivitaetEntry = {
    ...entry, id: crypto.randomUUID(), von: entry.von || resolveCurrentUserName(), datum: new Date().toISOString(),
  };
  if (isTestAccount()) {
    const all = localGet<AktivitaetEntry[]>(LS_KEY, []);
    all.push(newEntry);
    localSet(LS_KEY, all);
  } else {
    void cacheInsert("aktivitaeten", toDbRow(newEntry), { silent: true })
      .then(() => uebertrageInKalender(newEntry))
      .catch((e) => {
        console.error("addAktivitaet:", e);
        // Ein still verlorener Verlaufseintrag ist schlimmer als ein Toast:
        // Der Nutzer glaubt, sein Protokoll sei gespeichert, und es fehlt.
        toast.error("Eintrag nicht im Verlauf gespeichert.", {
          description: `„${newEntry.beschreibung.slice(0, 80)}" ist nicht angekommen. Bitte erneut erfassen.`,
          duration: 10000,
        });
      });
  }
  return newEntry;
}

/**
 * Wie addAktivitaet, wartet aber auf die Datenbank.
 *
 * Der Unterschied ist im Alltag sichtbar geworden: Wer direkt nach dem
 * Anlegen die Kundenseite neu lädt, überholt sonst den Schreibvorgang. Der
 * Eintrag erscheint kurz und verschwindet wieder, weil das Neuladen den
 * Zwischenspeicher mit dem Stand ohne ihn überschreibt.
 */
export async function addAktivitaetSicher(
  entry: Omit<AktivitaetEntry, "id" | "datum" | "von"> & { von?: string },
): Promise<AktivitaetEntry | null> {
  const newEntry: AktivitaetEntry = {
    ...entry, id: crypto.randomUUID(), von: entry.von || resolveCurrentUserName(), datum: new Date().toISOString(),
  };
  if (isTestAccount()) {
    const all = localGet<AktivitaetEntry[]>(LS_KEY, []);
    all.push(newEntry);
    localSet(LS_KEY, all);
    return newEntry;
  }
  try {
    await cacheInsert("aktivitaeten", toDbRow(newEntry), { silent: true });
    uebertrageInKalender(newEntry);
    return newEntry;
  } catch (e) {
    console.error("addAktivitaetSicher:", e);
    return null;
  }
}

// Inbox tasks – now persisted in user_settings
export interface InboxTask {
  id: string; titel: string; beschreibung: string;
  prioritaet: "niedrig" | "mittel" | "hoch" | "dringend";
  typ: "anruf" | "meeting" | "follow_up" | "aufgabe" | "deadline";
  faellig_am: string; uhrzeit: string; kundeId: string; kundeName: string;
}

const INBOX_KEY = "mi_inbox_tasks";

export function getInboxTasks(): InboxTask[] {
  if (isTestAccount()) { try { const raw = localStorage.getItem(INBOX_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; } }
  return getUserSetting<InboxTask[]>("inbox_tasks", []);
}

export function addInboxTask(task: Omit<InboxTask, "id">): InboxTask {
  const tasks = getInboxTasks();
  const newTask: InboxTask = { ...task, id: crypto.randomUUID() };
  tasks.push(newTask);
  if (isTestAccount()) { localStorage.setItem(INBOX_KEY, JSON.stringify(tasks)); }
  else { setUserSetting("inbox_tasks", tasks); }
  window.dispatchEvent(new CustomEvent("inbox-updated"));
  return newTask;
}

/**
 * Legt eine Aufgabe am Kunden an, die alle sehen.
 *
 * Der Unterschied zu `addInboxTask`: Diese Aufgabe geht in die Tabelle
 * `aufgaben`, hängt damit am Kunden und kann einem anderen Nutzer zugewiesen
 * werden. Sie erscheint in der Pipeline als nächster geplanter Kontakt, auch
 * für Kollegen. Genau das war vorher nicht möglich, weil eine Aufgabe nur in
 * den persönlichen Einstellungen ihres Erstellers lag.
 *
 * Für automatisch erzeugte Erinnerungen bleibt `addInboxTask`, die haben ihre
 * eigene Entdopplung und Bereinigung.
 */
export function addGeteilteAufgabe(
  task: Omit<InboxTask, "id"> & {
    zugewiesenAn?: string;
    erstelltVonName?: string;
    /** Investment, zu dem die Aufgabe gehört. Bestimmt die Pipeline-Kachel. */
    investmentId?: string;
    /** Grund, aus dem die Aufgabe automatisch entstanden ist. */
    ausloeserSchluessel?: string;
  },
): Promise<boolean> {
  if (isTestAccount() || !task.kundeId) {
    addInboxTask(task);
    return Promise.resolve(true);
  }
  return import("./aufgabenStore")
    .then(({ addAufgabe }) =>
      addAufgabe({
        kontaktId: task.kundeId,
        investmentId: task.investmentId,
        typ: task.typ,
        prioritaet: task.prioritaet,
        titel: task.titel,
        beschreibung: task.beschreibung,
        faelligAm: task.faellig_am,
        uhrzeit: task.uhrzeit,
        ausloeserSchluessel: task.ausloeserSchluessel,
        zugewiesenAn: task.zugewiesenAn,
        erstelltVonName: task.erstelltVonName,
      }),
    )
    .then((erzeugt) => {
      window.dispatchEvent(new CustomEvent("inbox-updated"));
      return !!erzeugt;
    })
    .catch((e) => {
      console.error("addGeteilteAufgabe:", e);
      return false;
    });
}

export function removeInboxTask(id: string) {
  const tasks = getInboxTasks().filter(t => t.id !== id);
  if (isTestAccount()) { localStorage.setItem(INBOX_KEY, JSON.stringify(tasks)); }
  else { setUserSetting("inbox_tasks", tasks); }
}

/**
 * Bulk-Replace der Inbox-Liste (z.B. zum Bereinigen von Tasks, die nicht
 * mehr zum aktuellen Nutzer gehören). Triggert dasselbe Update-Event wie addInboxTask.
 */
export function setInboxTasks(tasks: InboxTask[]) {
  if (isTestAccount()) { localStorage.setItem(INBOX_KEY, JSON.stringify(tasks)); }
  else { setUserSetting("inbox_tasks", tasks); }
  window.dispatchEvent(new CustomEvent("inbox-updated"));
}

export const ART_LABELS: Record<AktivitaetEntry["art"], string> = {
  notiz: "📝 Notiz", anruf: "📞 Anruf", email: "✉️ E-Mail", aufgabe: "☑️ Aufgabe",
  meeting: "📅 Meeting", anruf_protokoll: "📋 Anruf-Protokoll", meeting_protokoll: "👥 Meeting-Protokoll",
  anruf_gestartet: "📲 Anruf gestartet",
};

export const ART_LABELS_SHORT: Record<AktivitaetEntry["art"], string> = {
  notiz: "Notiz", anruf: "Anruf", email: "E-Mail", aufgabe: "Aufgabe",
  meeting: "Meeting", anruf_protokoll: "Anruf-Protokoll", meeting_protokoll: "Meeting-Protokoll",
  anruf_gestartet: "Anruf gestartet",
};
