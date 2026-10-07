/**
 * Zentrale Echtzeit-Benachrichtigungs-Utility (Glocken-Benachrichtigungen)
 * Schreibt in die `benachrichtigungen`-Tabelle, damit sie in der HeaderBar angezeigt werden.
 */
import { cacheGet, cacheInsert } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import { showPushNotification, type PushCategory } from "./pushNotifications";
import { getUserSetting } from "./userSettingsCache";
import { getCurrentUserId } from "./currentUser";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
// Direkt aus der reinen Regeldatei: `@/lib/kundenSprache` zöge Kundenstore und
// Dialoge mit, die diese Datei nicht braucht.
import { spracheAusMeta, type Sprache } from "../../supabase/functions/_shared/kunden-sprache.ts";
import { KUNDEN_GLOCKE, pipelineStufeText } from "./kundenGlocke";

/**
 * Schedule a notification server-side via the `scheduled_notifications` queue.
 * pg_cron runs every minute and dispatches due entries into `benachrichtigungen`.
 * This replaces the fragile client-side setTimeout approach that lost reminders
 * when the browser tab was closed.
 */
async function scheduleServerNotification(params: {
  // Bewusst keine Rolle: Eine Rolle hiess hier "alle Partner", und mit dem
  // Kundennamen im Text war das ein Datenleck (bis 28.09.2026). Empfaenger
  // sind immer einzelne Kennungen, siehe `zustaendigOderLeitung`.
  targetUserId: string;
  titel: string;
  nachricht: string;
  link?: string;
  category?: PushCategory;
  triggerAt: Date;
  kontaktId?: string;
  investmentId?: string;
  skipCondition?: "sa_signed";
  dedupeKey?: string;
}) {
  if (isTestAccount()) return; // Test accounts skip persistence
  if (isNaN(params.triggerAt.getTime())) return;

  try {
    await supabase.from("scheduled_notifications").insert({
      target_user_id: params.targetUserId,
      titel: params.titel,
      nachricht: params.nachricht || "",
      link: params.link || null,
      category: params.category || null,
      trigger_at: params.triggerAt.toISOString(),
      kontakt_id: params.kontaktId || null,
      investment_id: params.investmentId || null,
      skip_condition: params.skipCondition || null,
      dedupe_key: params.dedupeKey || null,
    });
  } catch (err: any) {
    // Unique-Violation bei Dedupe-Key = still already scheduled, no-op
    if (err?.code === "23505") return;
    console.warn("[bellNotifications] scheduleServerNotification failed:", err?.message || err);
  }
}

const LS_KEY = "mi_bell_notifications";

/** Get notification preferences for a specific user from cache */
function getUserNotifPrefs(userId: string): { kanaele: Record<string, boolean>; themen: Record<string, boolean> } | null {
  const currentUserId = getCurrentUserId();
  if (currentUserId === userId) {
    return getUserSetting<any>("benachrichtigungen", null);
  }
  try {
    const rows = cacheGet("user_settings");
    const row = rows.find((r: any) => r.user_id === userId);
    return row?.einstellungen?.benachrichtigungen || null;
  } catch {
    return null;
  }
}

function isThemeEnabled(userId: string, category?: PushCategory): boolean {
  const prefs = getUserNotifPrefs(userId);
  if (!prefs) return true;
  if (!category) return true;
  const themeKey = category === "bug" ? "system" : category;
  return prefs.themen?.[themeKey] !== false;
}

function isChannelEnabled(userId: string, channel: "email" | "feed" | "browser" | "popup"): boolean {
  const prefs = getUserNotifPrefs(userId);
  if (!prefs) return true;
  return prefs.kanaele?.[channel] !== false;
}

function triggerPopupForCurrentUser(targetUserId: string, params: NotifyParams) {
  try {
    const currentUserId = getCurrentUserId();
    if (currentUserId !== targetUserId) return;
    if (!isChannelEnabled(targetUserId, "popup")) return;
    toast(params.titel, { description: params.nachricht || undefined, duration: 6000 });
  } catch { /* silently ignore */ }
}

function triggerPushForCurrentUser(targetUserId: string, params: NotifyParams) {
  try {
    // Only the user themselves can trigger their own browser push (other tabs/sessions do their own)
    // We check via supabase client if active session matches
    const sessionRaw = typeof localStorage !== "undefined" ? localStorage.getItem("sb-irwdgutegmivbtgmftyc-auth-token") : null;
    if (!sessionRaw) return;
    const session = JSON.parse(sessionRaw);
    const currentUserId = session?.user?.id || session?.currentSession?.user?.id;
    if (currentUserId !== targetUserId) return;

    showPushNotification(params.titel, {
      body: params.nachricht || "",
      tag: `mi-${params.titel}`,
      category: params.category,
      onClick: () => {
        if (params.link && typeof window !== "undefined") {
          window.location.href = params.link;
        }
      },
    });
  } catch {
    // silently ignore push errors – glocke notification is the primary channel
  }
}

interface NotifyParams {
  titel: string;
  nachricht: string;
  link?: string;
  category?: PushCategory;
}

/** Notify a specific user by ID – skips if an identical notification (same user + title + message) already exists within the last 60 seconds */
export function notifyUser(userId: string, params: NotifyParams) {
  // ── Check theme preference: skip if user disabled this topic ──
  if (params.category && !isThemeEnabled(userId, params.category)) return;

  // ── Deduplicate: prevent identical notifications within 60s ──
  const now = Date.now();
  const recentWindow = 60_000; // 60 seconds
  const existing = isTestAccount()
    ? localGet<any[]>(LS_KEY, [])
    : cacheGet("benachrichtigungen");

  const isDuplicate = existing.some((n: any) => {
    if (n.benutzer_id !== userId) return false;
    if (n.titel !== params.titel) return false;
    if ((n.nachricht || "") !== (params.nachricht || "")) return false;
    const created = n.erstellt_am ? new Date(n.erstellt_am).getTime() : (n._ts || 0);
    return (now - created) < recentWindow;
  });

  if (isDuplicate) return;

  /*
   * `_ts` ist ein Hilfsfeld fuer die Testkonto-Variante im Browserspeicher,
   * die Tabelle `benachrichtigungen` kennt die Spalte nicht.
   *
   * Bis zum 15.09.2026 ging das Feld unveraendert an die Datenbank mit.
   * PostgREST lehnte jeden Einfuegevorgang ab ("Could not find the '_ts'
   * column"), und weil der Fehler bewusst verschluckt wird, ist seit dem
   * ersten Tag des Projekts keine einzige Glocken-Benachrichtigung
   * gespeichert worden. Aufgefallen ist es nie, weil Toast und Browser-Push
   * daneben weiterliefen. Deshalb jetzt getrennt: `eintrag` fuer die
   * Datenbank, `eintragLokal` mit Zeitstempel fuer den Browserspeicher.
   */
  const entry = {
    id: crypto.randomUUID(),
    benutzer_id: userId,
    titel: params.titel,
    nachricht: params.nachricht || "",
    link: params.link || "",
    gelesen: false,
    erstellt_am: new Date().toISOString(),
  };
  const entryLokal = { ...entry, _ts: now };

  // ── Write to bell feed only if feed channel is enabled ──
  if (isChannelEnabled(userId, "feed")) {
    if (isTestAccount()) {
      const all = localGet<any[]>(LS_KEY, []);
      all.unshift(entryLokal);
      localSet(LS_KEY, all);
    } else {
      // Fire-and-forget: a failure here (e.g. RLS for cross-user notify) must not
      // surface a misleading "Speichern fehlgeschlagen"-Toast für die eigentliche Nutzeraktion.
      Promise.resolve(cacheInsert("benachrichtigungen", entry, { silent: true })).catch((err) => {
        console.warn("[bellNotifications] insert failed (silenced):", err?.message || err);
      });
    }
  }
  window.dispatchEvent(new CustomEvent("bell-notification"));

  // ── Trigger browser push (respects kanaele.browser via isPushCategoryEnabled) ──
  triggerPushForCurrentUser(userId, params);

  // ── Trigger in-app toast popup ──
  triggerPopupForCurrentUser(userId, params);
}

/** Notify all users with a specific role */
export function notifyByRole(role: string | string[], params: NotifyParams) {
  const roles = Array.isArray(role) ? role : [role];
  const userRoles = cacheGet("user_roles");
  const targetUserIds = new Set<string>();

  for (const r of roles) {
    userRoles
      .filter((ur: any) => ur.role === r)
      .forEach((ur: any) => targetUserIds.add(ur.user_id));
  }

  targetUserIds.forEach(uid => notifyUser(uid, params));
}

/** Notify all admins (admin + inhaber) */
export function notifyAdmins(params: NotifyParams) {
  notifyByRole(["admin", "inhaber"], params);
}

/**
 * Die Leitung: Admin, Inhaber und Vertriebsleitung.
 *
 * Christians Entscheidung vom 28.09.2026: Hat ein Kunde keinen Zustaendigen,
 * geht eine Prozess-Glocke an die Leitung, nie an alle Vertriebspartner.
 * Bis dahin ging sie an Admin, Inhaber und Backoffice (`ZENTRALE_ROLLEN`).
 * Serverseitig gilt dieselbe Liste in `process-scheduled-notifications`,
 * `_shared/sa-glocke.ts` und in den Rueckfaellen von
 * `create_empfehlung_kontakt` und `create_tippgeber_lead`.
 */
export const LEITUNG_ROLLEN = ["admin", "inhaber", "vertriebsleiter"] as const;

/** Notify Vertriebsleitung (admin + inhaber + vertriebsleiter) */
export function notifyVertriebsleitung(params: NotifyParams) {
  notifyByRole([...LEITUNG_ROLLEN], params);
}

/**
 * Notify HR.
 *
 * Bewusst nur die HR-Rolle. Admin und Inhaber standen hier früher mit drin,
 * damit ging jede Meldung aus dem Bewerbermanagement auch an die
 * Geschäftsführung. Dieselbe Regel gilt serverseitig in
 * `supabase/functions/_shared/hr-benachrichtigung.ts`.
 */
export function notifyHR(params: NotifyParams) {
  notifyByRole(["hr"], params);
}

/**
 * Die Zentrale: Admin, Inhaber und Backoffice.
 *
 * Empfaenger der festen Backoffice-Meldungen (`notifyBackoffice`). Die
 * Rueckgabe an die Zentrale meldet seit dem 29.09.2026 an die Leitung
 * (`LEITUNG_ROLLEN`), nicht mehr ans Backoffice. Prozess-Glocken ohne
 * Zustaendigen gehen seit dem 28.09.2026 an die Leitung (`LEITUNG_ROLLEN`),
 * nie an alle Vertriebspartner. Der Waechter
 * `glockeKeinPartnerRundruf.test.ts` schlaegt an, wenn so eine Stelle
 * wieder auftaucht.
 */
export const ZENTRALE_ROLLEN = ["admin", "inhaber", "backoffice"] as const;

/** Notify Backoffice (admin + inhaber + backoffice) */
export function notifyBackoffice(params: NotifyParams) {
  notifyByRole([...ZENTRALE_ROLLEN], params);
}

/** Kennungen aller Nutzer mit einer dieser Rollen, jede Person einmal. */
function kennungenMitRolle(rollen: readonly string[]): string[] {
  return [
    ...new Set(
      cacheGet("user_roles")
        .filter((ur: any) => rollen.includes(ur.role))
        .map((ur: any) => ur.user_id as string)
        .filter(Boolean),
    ),
  ];
}

/**
 * Der Zustaendige des Kontakts zum Sendezeitpunkt.
 *
 * Regel vom 29.09.2026: Eine Glocke zu einem Kunden bekommt nur, wem er JETZT
 * zugewiesen ist (`kontakte.zustaendig_id`). Die Aufrufer reichen eine
 * Kennung mit, die aus einem Kundenobjekt der Seite stammt; wurde der Kunde
 * inzwischen umgehaengt oder an die Zentrale zurueckgegeben, ist sie veraltet.
 * Massgeblich ist deshalb die Zeile im Zwischenspeicher, den die Datenbank
 * laufend nachfuehrt. Nur wenn der Kontakt dort fehlt, gilt die mitgereichte
 * Kennung.
 */
export function aktuellerZustaendiger(kundeId: string | undefined, beraterId?: string): string | undefined {
  const kontakt = kundeId ? cacheGet("kontakte").find((k: any) => k.id === kundeId) : undefined;
  if (!kontakt) return beraterId || undefined;
  return (kontakt.zustaendig_id as string | null) || undefined;
}

/** Wer eine Prozess-Glocke bekommt: der aktuelle Zustaendige, ohne ihn die Leitung. */
function zustaendigOderLeitung(kundeId: string, beraterId?: string): string[] {
  const zustaendig = aktuellerZustaendiger(kundeId, beraterId);
  return zustaendig ? [zustaendig] : kennungenMitRolle(LEITUNG_ROLLEN);
}

/** Glocke an den aktuellen Zustaendigen, ohne ihn an die Leitung. */
function notifyZustaendigen(kundeId: string, beraterId: string | undefined, params: NotifyParams) {
  for (const uid of zustaendigOderLeitung(kundeId, beraterId)) notifyUser(uid, params);
}

/** Notify all internal users (all roles except kunde/bewerber) */
export function notifyAllInternal(params: NotifyParams) {
  const internalRoles = [
    "admin", "inhaber", "vertriebspartner", "hausverwaltung",
    "buchhaltung", "setterin", "objektpartner", "finanzierungspartner",
    "individuell", "testaccount", "marketing", "hr", "backoffice", "vertriebsleiter",
  ];
  notifyByRole(internalRoles, params);
}

/**
 * Notify the customer (Kunde) via their authUserId stored in kontakte.meta.
 *
 * Kundentexte in der Sprache aus dem Kundenprofil (Plan Kundensprache, P18):
 * Wer statt fester Texte eine Funktion übergibt, bekommt die Profilsprache
 * und liefert Titel und Text in dieser Sprache. Die Texte selbst stehen in
 * `kundenGlocke.ts`. Person 2 bekommt dieselbe Sprache (Entscheidung 11).
 */
export function notifyKunde(kundeId: string, params: NotifyParams | ((sprache: Sprache) => NotifyParams)) {
  const kontakte = cacheGet("kontakte");
  const kontakt = kontakte.find((k: any) => k.id === kundeId);
  if (!kontakt) {
    // Frueher still: Mit einer falschen Kennung (etwa der eines Investments)
    // ging die Glocke an niemanden, und niemand merkte es. Jetzt steht es
    // wenigstens in der Konsole.
    console.warn("[bellNotifications] notifyKunde: kein Kontakt zu dieser Kennung, Glocke entfaellt", kundeId);
    return;
  }
  const inhalt = typeof params === "function" ? params(spracheAusMeta(kontakt?.meta)) : params;
  const authUserId = kontakt?.meta?.authUserId;
  if (authUserId) {
    notifyUser(authUserId, inhalt);
  }
  // Also notify person 2 if they have an auth account
  const p2AuthUserId = kontakt?.meta?.person2?.authUserId;
  if (p2AuthUserId) {
    notifyUser(p2AuthUserId, inhalt);
  }
}

/*
 * Wohin eine Kunden-Glocke führt.
 *
 * Bis zum 25.09.2026 zeigten drei Kunden-Glocken auf `/profil`. Diese Adresse
 * gibt es im Portal nicht, ein Klick landete auf der Startseite. Jetzt führt
 * jede Glocke auf die Portalseite, um die es geht. Der Wächter
 * `kundenGlockeLinks.test.ts` prüft alle Links gegen die Routen in `App.tsx`
 * und gegen die Freigaben der Rolle Kunde.
 */

/** Bonitätsunterlagen im Portal, mit Sprung zum Abschnitt. Die Selbstauskunft liegt im selben Abschnitt. */
function bonitaetLink(investmentId?: string): string {
  const params = new URLSearchParams({ tab: "moreimmo" });
  if (investmentId) params.set("inv", investmentId);
  params.set("highlight", "bonitaetsunterlagen");
  return `/kunde/investments?${params.toString()}`;
}

/** Notify customer: Empfehlungsprogramm freigeschaltet */
export function notifyKundeEmpfehlungsprogramm(kundeId: string) {
  notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.empfehlungsprogramm[sprache](), link: "/kunde/empfehlungen" }));
}

/** Notify customer: Bonitätsunterlagen geprüft & freigegeben */
export function notifyKundeBonitaetFreigegeben(kundeId: string, investmentId?: string) {
  notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.bonitaetFreigegeben[sprache](), link: bonitaetLink(investmentId) }));
}

/** Notify customer: Reservierungsvereinbarung abgelegt */
export function notifyKundeReservierung(kundeId: string) {
  notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.reservierungAbgelegt[sprache](), link: "/kunde/investments" }));
}

/** Notify customer: Finanzierungsunterlagen freigegeben */
export function notifyKundeFinanzierungFreigegeben(kundeId: string, docName: string) {
  notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.finanzierungDokument[sprache](docName), link: "/kunde/kundenordner" }));
}

/** Notify customer: Notartermin freigegeben */
export function notifyKundeNotartermin(kundeId: string, datum: string, uhrzeit: string) {
  notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.notartermin[sprache](datum, uhrzeit), link: "/kunde/investments" }));
}

/** Notify customer: Kundenordner-Dokument freigegeben */
export function notifyKundeKundenordnerDokument(kundeId: string, docName: string) {
  notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.kundenordnerDokument[sprache](docName), link: "/kunde/kundenordner" }));
}

/** Notify customer: Pipeline-Stufe hat sich geändert. Die Texte stehen in `kundenGlocke.ts`. */
export function notifyKundePipelineStufe(kundeId: string, neueStufe: string) {
  if (!pipelineStufeText(neueStufe, "de")) return;
  notifyKunde(kundeId, (sprache) => ({ ...pipelineStufeText(neueStufe, sprache)!, link: "/kunde/investments" }));
}

/** Notify customer: Selbstauskunft freigegeben */
export function notifyKundeSelbstauskunft(kundeId: string, investmentId?: string) {
  notifyKunde(kundeId, (sprache) => ({ ...KUNDEN_GLOCKE.selbstauskunftFreigegeben[sprache](), link: bonitaetLink(investmentId) }));
}



export function notifyFinanzAngebotGesendet(_kundeName: string, _anzahl: number, _kundeId: string, _beraterId?: string) {
  // Removed – not needed
}

export function notifyFinanzAngebotAkzeptiert(_kundeName: string, _kundeId: string) {
  // Removed – not needed
}

export function notifyFinanzFinalBestaetigt(_kundeName: string, _kundeId: string, _beraterId?: string) {
  // Removed – not needed
}

/*
 * Ausgeloest wird diese Meldung durch die UNTERSCHRIFT des Kunden.
 *
 * Bis zum 22.09.2026 stand hier „Eine Reservierungsvereinbarung wurde angelegt
 * und wartet auf Freigabe" beziehungsweise „liegt zur Freigabe vor". Beides war
 * falsch: Angelegt wurde sie beim Versand, nicht hier, und eine Freigabe der
 * Reservierung gibt es im Ablauf ueberhaupt nicht. Wer die Glocke las, suchte
 * einen Knopf, den es nicht gibt.
 */
export function notifyReservierungEingegangen(kundeName: string, kundeId: string, beraterId?: string) {
  const params = {
    titel: "Reservierung eingegangen 📄",
    nachricht: `${kundeName} hat die Reservierungsvereinbarung unterschrieben.`,
    link: `/kunden/${kundeId}`,
    category: "leads" as PushCategory,
  };
  // Der Zustaendige, ohne ihn die Leitung (28.09.2026).
  const erreicht = zustaendigOderLeitung(kundeId, beraterId);
  for (const uid of erreicht) notifyUser(uid, params);
  // Das Backoffice erfaehrt es immer, mit und ohne Zustaendigen. Wer oben
  // schon eine Glocke bekam, bekommt keine zweite.
  const zentrale = {
    ...params,
    nachricht: `Die Reservierungsvereinbarung von ${kundeName} ist unterschrieben eingegangen.`,
  };
  for (const uid of kennungenMitRolle(ZENTRALE_ROLLEN)) {
    if (!erreicht.includes(uid)) notifyUser(uid, zentrale);
  }
}

export function notifyDokumenteVollstaendig(kundeName: string, kundeId: string, beraterId?: string) {
  // Only notify the zuständiger VP (not admins, not finanzierungspartner)
  const params = {
    titel: "Dokumente vollständig",
    nachricht: `${kundeName}: Alle Bonitätsunterlagen wurden hochgeladen.`,
    link: `/kunden/${kundeId}`,
    category: "leads" as PushCategory,
  };
  notifyZustaendigen(kundeId, beraterId, params);
}

/**
 * Eine Reservierung wurde aufgehoben (Kundenprofil, seit 05.10.2026).
 *
 * An den aktuellen Zuständigen, ohne ihn an die Leitung. Wer selbst
 * aufgehoben hat, bekommt keine Glocke, denn er weiß es schon. Hebt also der
 * Zuständige auf, geht nichts hinaus.
 */
export function notifyReservierungAufgehoben(kundeName: string, kundeId: string, aufgehobenVonId: string | undefined, aufgehobenVon: string, objekt?: string) {
  const params = {
    titel: "Reservierung aufgehoben",
    nachricht: `${kundeName}: ${aufgehobenVon} hat die Reservierung${objekt ? ` für ${objekt}` : ""} aufgehoben. Die Vereinbarung liegt archiviert im Kundenordner, der Vorgang steht wieder auf der Objektauswahl.`,
    link: `/kunden/${kundeId}`,
    category: "leads" as PushCategory,
  };
  for (const uid of zustaendigOderLeitung(kundeId)) {
    if (uid !== aufgehobenVonId) notifyUser(uid, params);
  }
}

export function notifyDokumentHochgeladen(_kundeName: string, _docName: string, _kundeId: string, _beraterId?: string) {
  // Removed – VP gets notified when all docs are complete
}

export function notifySaEinladungVerschickt(kundeName: string, kundeId: string, beraterId?: string) {
  const params = {
    titel: "SA-Einladung verschickt",
    nachricht: `${kundeName}: Die Selbstauskunft-Einladung wurde an den Kunden gesendet.`,
    link: `/kunden/${kundeId}`,
    category: "leads" as PushCategory,
  };
  notifyZustaendigen(kundeId, beraterId, params);
}

/**
 * Meldung an den Partner, der einen Lead bekommt.
 *
 * `uebergabe` ist gesetzt, wenn der Lead vorher jemand anderem gehoerte.
 * Dann stehen der bisherige Partner und der Grund in derselben Meldung. Ein
 * zweiter Meldeweg daneben waere doppelt und wuerde die Glocke fuellen, ohne
 * mehr zu sagen.
 */
export function notifyLeadZugewiesen(
  leadName: string,
  beraterName: string,
  beraterId: string,
  kundeId: string,
  uebergabe?: { vonName?: string; grund?: string },
) {
  const teile = [`${leadName} wurde dir als neuer Lead zugewiesen.`];
  const vonName = (uebergabe?.vonName || "").trim();
  const grund = (uebergabe?.grund || "").trim();
  if (vonName) teile.push(`Übergabe von ${vonName}.`);
  if (grund) teile.push(`Grund: ${grund}`);
  // Nur wenn der Lead ihm jetzt wirklich gehoert (Regel vom 29.09.2026). Die
  // Uebergabe durch die Setterin auf der Kundenseite setzt nur den
  // Beraternamen, nicht die Zustaendigkeit; der Partner bekam dann eine Glocke
  // zu einem Lead, der ihm nicht zugewiesen ist und den er nicht oeffnen kann.
  if (aktuellerZustaendiger(kundeId, beraterId) !== beraterId) return;
  notifyUser(beraterId, {
    titel: "Neuer Lead zugewiesen",
    nachricht: teile.join(" "),
    link: `/kunden/${kundeId}`,
    category: "leads",
  });
}

/**
 * Meldung an den Partner, dem die Leitung einen Kunden weggenommen hat.
 *
 * Nur wenn Admin, Inhaber oder Vertriebsleitung umhaengen (Christians
 * Entscheidung vom 29.09.2026, geprueft in `reassignBerater`). Der Kundenname
 * steht drin, den kannte er bisher. Kein Grund, kein neuer Partner und kein
 * Link aufs Kundenprofil: Er kann es nicht mehr oeffnen.
 */
export function notifyLeadAbgegeben(leadName: string, bisherigerBeraterId: string) {
  notifyUser(bisherigerBeraterId, {
    titel: "Kunde wurde einem neuen Vertriebspartner zugewiesen",
    nachricht: `${leadName || "Ein Kunde"} wurde einem neuen Vertriebspartner zugewiesen.`,
    category: "leads",
  });
}

/** Ein Kontakt aus einer Rückgabe an die Zentrale. */
export interface ZurueckgegebenerKontakt {
  kontaktId: string;
  name: string;
  /** Name der Stufe, nur gesetzt, wenn der Kunde schon ab Reservierung ist. */
  stufeAbReservierung?: string;
  /** Der Grund als Satz, siehe `grundSatz`. */
  grund?: string;
}

/**
 * Eine Glocke je Rückgabe an die Zentrale, an Admin, Inhaber und
 * Vertriebsleitung (seit 29.09.2026, vorher Backoffice statt Vertriebsleitung).
 *
 * Christians Vorgabe vom 28.09.2026: Jede gelungene Rückgabe meldet an die
 * Zentrale, nicht nur ab Reservierung wie vorher, und zwar zusammengefasst je
 * Aktion statt je Kontakt. Andere Partner erfahren nichts, der Zurückgebende
 * auch nicht (er weiß es, und ist er selbst Admin, bekommt er keine Glocke
 * über seine eigene Handlung). Kunden ab Reservierung stehen namentlich in der
 * Meldung, weil sie ohne Betreuer in der Abwicklung liegen.
 */
export function notifyRueckgabeAnZentrale(
  kontakte: ZurueckgegebenerKontakt[],
  angaben: { durch?: string; durchId?: string } = {},
) {
  if (kontakte.length === 0) return;
  const anzahl = kontakte.length;
  const einer = anzahl === 1 ? kontakte[0] : null;
  const durch = (angaben.durch || "").trim();
  const vonWem = durch ? ` von ${durch}` : "";
  const reserviert = kontakte.filter((k) => k.stufeAbReservierung);
  const gruende = [...new Set(kontakte.map((k) => (k.grund || "").trim()).filter(Boolean))];

  const teile: string[] = [];
  if (einer) {
    teile.push(`${einer.name} wurde${vonWem} an die Zentrale zurückgegeben.`);
    if (einer.stufeAbReservierung) {
      teile.push(`Der Kunde ist bereits in Stufe ${einer.stufeAbReservierung} und hat keinen Vertriebspartner mehr.`);
    }
  } else {
    teile.push(`${anzahl} Kontakte wurden${vonWem} an die Zentrale zurückgegeben.`);
    if (reserviert.length > 0) {
      teile.push(`Bereits ab Reservierung: ${reserviert.map((k) => `${k.name} (${k.stufeAbReservierung})`).join(", ")}.`);
    }
  }
  if (gruende.length === 1) teile.push(`Grund: ${gruende[0]}`);
  else if (gruende.length > 1) teile.push(`Gründe: ${gruende.join("; ")}`);
  teile.push(einer ? "Bitte neu zuweisen." : "Bitte in der Lead-Verwaltung neu zuweisen.");

  const titel = einer
    ? (einer.stufeAbReservierung ? "Kunde ab Reservierung zurückgegeben" : "Kontakt an die Zentrale zurückgegeben")
    : `${anzahl} Kontakte an die Zentrale zurückgegeben${reserviert.length > 0 ? `, ${reserviert.length} ab Reservierung` : ""}`;

  const params: NotifyParams = {
    titel,
    nachricht: teile.join(" "),
    link: einer ? `/kunden/${einer.kontaktId}` : "/lead-verwaltung",
    category: "leads",
  };
  // Die Leitung, nicht das Backoffice (Christians Entscheidung vom 29.09.2026).
  for (const uid of kennungenMitRolle(LEITUNG_ROLLEN)) {
    if (uid !== angaben.durchId) notifyUser(uid, params);
  }
}

export function notifyLeadQualifiziert(leadName: string, beraterName: string, kundeId: string) {
  // No notification
}

export function notifyTerminGebucht(leadName: string, datum: string, kundeId: string) {
  // No notification
}

export function notifySelbstauskunftEingegangen(_kundeName: string, _kundeId: string, _beraterId?: string) {
  // Removed – "Selbstauskunft unterschrieben" is the important notification
}

export function notifySelbstauskunftUnterschrieben(kundeName: string, kundeId: string, beraterId?: string) {
  const params = {
    titel: "Selbstauskunft unterschrieben ✓",
    nachricht: `${kundeName}: Die Selbstauskunft wurde unterschrieben.`,
    link: `/kunden/${kundeId}`,
    category: "leads" as PushCategory,
  };
  notifyZustaendigen(kundeId, beraterId, params);
}

export function notifyPipelineChange(kundeName: string, neueStufe: string, kundeId: string, beraterId?: string) {
  // Primär läuft der DB-Trigger trg_notify_vp_pipeline_change – dieser Client-Aufruf ist
  // ein Fallback für Legacy-Codepfade, die pipelineStufe außerhalb von kontakte.meta setzen.
  const stufeLabel: Record<string, string> = {
    neuer_lead: "Neuer Lead", kontaktversuche: "Kontaktversuche", follow_up: "Follow-Up",
    erstgespraech: "Erstgespräch", beratungsgespraech: "Beratungsgespräch",
    bonitaetsunterlagen: "Bonitätsunterlagen", objektauswahl: "Objektauswahl",
    follow_up_objekt: "Follow-Up",
    reservierung: "Reservierung", finanzierung: "Finanzierung", notar: "Notar",
    faelligkeit: "Kaufpreisfälligkeit", abgeschlossen: "Abgeschlossen", verloren: "Verloren",
  };
  const label = stufeLabel[neueStufe] || neueStufe;
  const params = {
    titel: `Pipeline-Stufe geändert: ${label}`,
    nachricht: `${kundeName} wurde auf Stufe „${label}" verschoben.`,
    link: `/kunden/${kundeId}`,
    category: "leads" as PushCategory,
  };
  // Ohne mitgereichte Kennung bleibt es still wie bisher: Die Glocke kommt
  // dann aus dem Datenbank-Trigger, eine zweite waere doppelt.
  if (!beraterId) return;
  const zustaendig = aktuellerZustaendiger(kundeId, beraterId);
  if (zustaendig) notifyUser(zustaendig, params);
}

export function notifyNotarTerminGesetzt(kundeName: string, datum: string, kundeId: string, _beraterId?: string) {
  // Admin + Vertriebsleitung + Backoffice
  notifyByRole(["admin", "inhaber", "vertriebsleiter", "backoffice"], {
    titel: "Notartermin festgelegt",
    nachricht: `${kundeName}: Notartermin am ${datum}.`,
    link: `/kunden/${kundeId}`,
    category: "termine" as PushCategory,
  });
}

/** Schedule 3 Empfehlungsprogramm reminders for the VP – now server-side via cron. */
export function scheduleEmpfehlungsprogrammReminders(kundeName: string, kundeId: string, notarDatum: string, notarUhrzeit: string, beraterId?: string) {
  const link = `/kunden/${kundeId}#empfehlungsprogramm`;

  // 1) Immediate bell notification (nicht scheduled – direkt raus)
  const immediateParams = {
    titel: "Empfehlungsprogramm einrichten",
    nachricht: `${kundeName}: Notartermin wurde vereinbart. Bitte richte jetzt das Empfehlungsprogramm ein.`,
    link,
  };
  notifyZustaendigen(kundeId, beraterId, immediateParams);

  const notarDate = parseNotarDate(notarDatum, notarUhrzeit);
  if (!notarDate) return;

  for (const uid of zustaendigOderLeitung(kundeId, beraterId)) {
    // 2) On notartermin day
    scheduleServerNotification({
      targetUserId: uid,
      titel: "Empfehlungsprogramm – Notartermin heute",
      nachricht: `${kundeName}: Heute ist der Notartermin. Bitte das Empfehlungsprogramm einrichten, falls noch nicht geschehen.`,
      link,
      triggerAt: notarDate,
      kontaktId: kundeId,
      dedupeKey: `empf-notarday-${kundeId}-${uid}`,
    });

    // 3) 48h after notartermin
    scheduleServerNotification({
      targetUserId: uid,
      titel: "Empfehlungsprogramm – Erinnerung",
      nachricht: `${kundeName}: Der Notartermin war vor 2 Tagen. Bitte richte das Empfehlungsprogramm ein.`,
      link,
      triggerAt: new Date(notarDate.getTime() + 48 * 3600000),
      kontaktId: kundeId,
      dedupeKey: `empf-48h-${kundeId}-${uid}`,
    });
  }
}

function parseNotarDate(notarDatum: string, notarUhrzeit: string): Date | null {
  let d: Date;
  if (notarDatum.includes("-")) {
    d = new Date(`${notarDatum}T${notarUhrzeit || "10:00"}`);
  } else {
    const [dd, mm, yy] = notarDatum.split(".");
    d = new Date(`${yy}-${mm}-${dd}T${notarUhrzeit || "10:00"}`);
  }
  return isNaN(d.getTime()) ? null : d;
}

/** Schedule Kundenordner reminders (2/10/20 days after notar) – server-side via cron. */
export function scheduleKundenordnerReminder(kundeName: string, kundeId: string, notarDatum: string, notarUhrzeit: string, beraterId?: string) {
  const notarDate = parseNotarDate(notarDatum, notarUhrzeit);
  if (!notarDate) return;
  for (const uid of zustaendigOderLeitung(kundeId, beraterId)) {
    for (const r of [{ days: 2, text: "vor 2 Tagen" }, { days: 10, text: "vor 10 Tagen" }, { days: 20, text: "vor 20 Tagen" }]) {
      scheduleServerNotification({
        targetUserId: uid,
        titel: "Kundenordner befüllen",
        nachricht: `${kundeName}: Der Notartermin war ${r.text}. Bitte die Unterlagen im Kundenordner auf der Kundenseite hochladen.`,
        link: `/kunden/${kundeId}`,
        triggerAt: new Date(notarDate.getTime() + r.days * 24 * 3600000),
        kontaktId: kundeId,
        dedupeKey: `kundenordner-${r.days}d-${kundeId}-${uid}`,
      });
    }
  }
}

/** Schedule Notarfoto reminders for VP around notartermin – server-side via cron. */
export function scheduleNotarfotoReminders(kundeName: string, kundeId: string, notarDatum: string, notarUhrzeit: string, beraterId?: string) {
  const notarDate = parseNotarDate(notarDatum, notarUhrzeit);
  if (!notarDate) return;

  const formatTime = (date: Date) => date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const terminStr = formatTime(notarDate);
  const link = `/kunden/${kundeId}`;
  const reminders = [
    { offsetMs: -6 * 3600000, key: "minus6h", titel: "Notarfoto nicht vergessen!", nachricht: `In 6 Stunden ist der Notartermin für ${kundeName} (${terminStr}). Bitte denke an das Notarfoto!` },
    { offsetMs: -1 * 3600000, key: "minus1h", titel: "Notarfoto nicht vergessen!", nachricht: `In 1 Stunde ist der Notartermin für ${kundeName}. Bitte denke an das Notarfoto!` },
    { offsetMs: 1 * 3600000, key: "plus1h", titel: "Notarfoto hochladen!", nachricht: `Der Notartermin für ${kundeName} war vor 1 Stunde. Bitte lade das Notarfoto jetzt hoch unter Highlight Notar im Investment-Bereich.` },
    { offsetMs: 6 * 3600000, key: "plus6h", titel: "Notarfoto hochladen – Erinnerung", nachricht: `Der Notartermin für ${kundeName} war heute. Bitte lade das Notarfoto hoch unter Highlight Notar im Investment-Bereich.` },
  ];

  for (const uid of zustaendigOderLeitung(kundeId, beraterId)) {
    for (const r of reminders) {
      scheduleServerNotification({
        targetUserId: uid,
        titel: r.titel,
        nachricht: r.nachricht,
        link,
        triggerAt: new Date(notarDate.getTime() + r.offsetMs),
        kontaktId: kundeId,
        dedupeKey: `notarfoto-${r.key}-${kundeId}-${uid}`,
      });
    }
  }
}

export function notifyObjektEinreichung(objektTitel: string, einreicherName: string) {
  notifyVertriebsleitung({
    titel: "Neue Objekt-Einreichung",
    nachricht: `"${objektTitel}" wurde von ${einreicherName} eingereicht.`,
    link: "/objekt-einreichungen",
    category: "system" as PushCategory,
  });
}

export function notifyWohnungReserviert(kundeName: string, weNr: string, objektTitel: string, kundeId: string, beraterId?: string) {
  const params = {
    titel: "Wohnung reserviert 🎉",
    nachricht: `${kundeName}: WE ${weNr} in „${objektTitel}" wurde reserviert.`,
    link: `/kunden/${kundeId}`,
    category: "leads" as PushCategory,
  };
  notifyZustaendigen(kundeId, beraterId, params);
}
// Keep old name as alias for backwards compatibility
export const notifyWohnungGesetzt = notifyWohnungReserviert;

export function notifyPruefungErgebnis(kundeName: string, kundeId: string, beraterId?: string) {
  const params = {
    titel: "Prüfungsergebnis versendet",
    nachricht: `${kundeName}: Das Prüfungsergebnis der Bonitätsunterlagen wurde an den Kunden gesendet.`,
    link: `/kunden/${kundeId}`,
  };
  notifyZustaendigen(kundeId, beraterId, params);
}

export function notifySaBearbeitungAngefordert(kundeName: string, kundeId: string) {
  notifyBackoffice({
    titel: "SA-Bearbeitung angefordert",
    nachricht: `${kundeName}: Der VP hat eine Bearbeitung der Selbstauskunft angefordert.`,
    link: `/kunden/${kundeId}`,
  });
}

export function notifySaBearbeitungFreigegeben(kundeName: string, kundeId: string, beraterId?: string) {
  const params = {
    titel: "SA-Bearbeitung freigegeben",
    nachricht: `${kundeName}: Die Bearbeitung der Selbstauskunft wurde freigegeben.`,
    link: `/kunden/${kundeId}`,
  };
  notifyZustaendigen(kundeId, beraterId, params);
}

export function notifyFollowUpErstellt(kundeName: string, titel: string, kundeId: string) {
  // Keine Admin-Benachrichtigung für Follow-Ups
}

export function notifyKaufpreisfaellig(kundeName: string, kundeId: string) {
  notifyByRole(["admin", "inhaber", "vertriebsleiter", "backoffice"], {
    titel: "Kaufpreisfälligkeit",
    nachricht: `${kundeName}: Die Kaufpreisfälligkeit wurde eingetragen.`,
    link: `/kunden/${kundeId}`,
    category: "provisionen" as PushCategory,
  });
  notifyByRole("buchhaltung", {
    titel: "Kaufpreisfälligkeit",
    nachricht: `${kundeName}: Die Kaufpreisfälligkeit wurde eingetragen. Provision kann berechnet werden.`,
    link: `/kunden/${kundeId}`,
    category: "provisionen" as PushCategory,
  });
}

export function notifyInvestmentAbgeschlossen(kundeName: string, kundeId: string) {
  notifyVertriebsleitung({
    titel: "Investment abgeschlossen ✓",
    nachricht: `${kundeName}: Das Investment wurde erfolgreich abgeschlossen.`,
    link: `/kunden/${kundeId}`,
    category: "pipeline" as PushCategory,
  });
}

export function notifyRvErneuerung(_kundeName: string, _weNr: string, _neuesDatum: string, _kundeId: string) {
  // Removed – not needed
}

export function notifyNotarfotoHochgeladen(kundeName: string, vpName: string, kundeId: string) {
  // Only marketing notification
  notifyByRole("marketing", {
    titel: "Notarfoto hochgeladen 📸",
    nachricht: `${vpName} hat ein Notarfoto für ${kundeName} hochgeladen.`,
    link: `/kunden/${kundeId}`,
  });
}

export function notifyVermoegenLeadGeeignet(kundeName: string, setterName: string, kundeId: string) {
  notifyByRole("versicherungsexperte", {
    titel: "Neuer Lead für Vermögensaufbau 📈",
    nachricht: `${kundeName} wurde von ${setterName} als für den Vermögensaufbau geeignet markiert.`,
    link: `/kunden/${kundeId}`,
    category: "leads" as PushCategory,
  });
}

/**
 * Schedule SA follow-up reminders at 48h and 96h after invitation.
 * Skipped if SA is already signed at trigger time.
 */
export function scheduleSaFollowUpReminders(
  kundeName: string,
  kundeId: string,
  investmentId: string,
  beraterId: string,
) {
  const now = Date.now();
  // Der aktuelle Zustaendige. Hat der Kunde keinen, wie bisher der Absender
  // der Einladung (der Aufrufer faellt ohnehin auf ihn zurueck), nie eine
  // veraltete Kennung eines frueheren Partners.
  const empfaenger = aktuellerZustaendiger(kundeId, beraterId) || getCurrentUserId() || beraterId;

  for (const r of [{ hours: 48, text: "48 Stunden" }, { hours: 96, text: "96 Stunden" }]) {
    const triggerAt = new Date(now + r.hours * 3600000);

    // Server-scheduled: wird von pg_cron zuverlässig ausgelöst, auch wenn der Tab zu ist.
    // Die skip_condition "sa_signed" verhindert die Benachrichtigung, falls SA in der Zwischenzeit unterschrieben wurde.
    scheduleServerNotification({
      targetUserId: empfaenger,
      titel: "Selbstauskunft ausstehend – Nachfassen",
      nachricht: `${kundeName}: Die Selbstauskunft wurde seit ${r.text} nicht ausgefüllt. Bitte beim Kunden nachfragen, ob Unterstützung benötigt wird.`,
      link: `/kunden/${kundeId}`,
      triggerAt,
      kontaktId: kundeId,
      investmentId,
      skipCondition: "sa_signed",
      dedupeKey: `sa-followup-${r.hours}h-${investmentId}`,
    });

    // Backup als Aufgabe (Inbox) für sichtbare Übersicht
    if (!isTestAccount()) {
      cacheInsert("aufgaben", {
        id: crypto.randomUUID(),
        benutzer_id: empfaenger,
        titel: "SA-Nachfass: " + kundeName,
        beschreibung: `Die Selbstauskunft wurde seit ${r.text} nicht ausgefüllt. Bitte beim Kunden nachfragen, ob Unterstützung benötigt wird. (/kunden/${kundeId})`,
        typ: "follow_up",
        prioritaet: "hoch",
        status: "offen",
        faellig_am: triggerAt.toISOString(),
        kontakt_id: kundeId,
        zugewiesen_an: empfaenger,
      });
    }
  }
}
