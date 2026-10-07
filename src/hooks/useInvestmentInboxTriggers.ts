import { useEffect } from "react";
import { istKontaktStumm } from "@/lib/kontaktStumm";
import { getInvestments, getRvSigned } from "@/lib/investmentsStore";
import { addInboxTask, getInboxTasks, setInboxTasks } from "@/lib/aktivitaetenStore";
import { getKontakte } from "@/lib/kundenStore";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { cacheGet, wennTabellenGeladen } from "@/lib/dataCache";
import { pflichtBonitaetDocs } from "@/lib/bonitaetDocs";
import { getFinanzierungDocStatus } from "@/lib/finanzierungStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { hatVereinbartenKontakt } from "@/lib/kontaktTermine";
import { notifyUser, notifyVertriebsleitung } from "@/lib/bellNotifications";
import {
  RV_MAHN_STUFEN,
  naechsteRvMahnung,
  rvMahnTexte,
  rvUnterschriftStand,
  rvVertriebsleitungTexte,
} from "@/lib/rvUnterschriftMahnung";

/**
 * Investment-Inbox-Trigger (Phase 1–6) – läuft im Dashboard alle 10 Minuten.
 * Idempotent über REMINDER_KEY (user_settings bzw. localStorage für Testaccount).
 */

const REMINDER_KEY = "mi_investment_inbox_triggers_sent";
const RE_ENGAGEMENT_TITEL = "Re-Engagement (14 Tage inaktiv)";

function getSent(): Record<string, string[]> {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(REMINDER_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  return getUserSetting<Record<string, string[]>>(REMINDER_KEY, {});
}
function markSent(invId: string, stage: string) {
  const sent = getSent();
  if (!sent[invId]) sent[invId] = [];
  if (!sent[invId].includes(stage)) {
    sent[invId].push(stage);
    if (isTestAccount()) localStorage.setItem(REMINDER_KEY, JSON.stringify(sent));
    else setUserSetting(REMINDER_KEY, sent);
  }
}
function wasSent(invId: string, stage: string): boolean {
  return getSent()[invId]?.includes(stage) ?? false;
}

function getInvestmentMeta(invId: string): Record<string, any> {
  const row = (cacheGet("investments") || []).find((r: any) => r.id === invId);
  return (row?.meta as Record<string, any>) || {};
}

function parseDateMaybe(d?: string): Date | null {
  if (!d) return null;
  let iso = d;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
    const [dd, mm, yy] = d.split(".");
    iso = `${yy}-${mm}-${dd}`;
  }
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function hasBirthdayToday(geb?: string): boolean {
  const d = parseDateMaybe(geb || ""); if (!d) return false;
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth();
}

const VP_ROLES = ["vertriebspartner", "testaccount", "individuell"];
const ADMIN_ROLES = ["admin", "inhaber", "vertriebsleiter", "testaccount"];
const BUCHHALTUNG_ROLES = ["admin", "inhaber", "buchhaltung", "testaccount"];

export function useInvestmentInboxTriggers(userRole?: string, userName?: string, userId?: string) {
  useEffect(() => {
    const isVp = !userRole || VP_ROLES.includes(userRole);
    const isAdmin = userRole ? ADMIN_ROLES.includes(userRole) : false;
    const isBuchhaltung = userRole ? BUCHHALTUNG_ROLES.includes(userRole) : false;
    if (!isVp && !isAdmin && !isBuchhaltung) return;

    function check() {
      const investments = getInvestments();
      const kunden = getKontakte();
      const now = Date.now();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayMs = today.getTime();
      const toISO = (ms: number) => new Date(Math.max(ms, todayMs)).toISOString().slice(0, 10);

      /*
       * Eine Eskalation gehoert immer dem zustaendigen Partner, sonst
       * niemandem.
       *
       * Frueher galt die Besitzpruefung nur fuer Vertriebspartner. Admins,
       * Inhaber und die Buchhaltung bekamen Eintraege zu SAEMTLICHEN Kunden in
       * ihre persoenliche Inbox, und zwar exklusiv: Der eigentlich Zustaendige
       * erfuhr nichts davon, weil eine Sperre eine zweite Aufgabe zum selben
       * Ausloeser verhindert. Am Eintrag stand ausserdem nirgends, dass der
       * Kunde einem Kollegen gehoert, er sah aus wie eigene Arbeit.
       *
       * Jetzt gilt die Pruefung fuer alle Rollen. Einzige Ausnahme: ein Kunde
       * ganz ohne Zustaendigen. Dessen Eskalation wuerde sonst niemand sehen,
       * deshalb faellt sie an die Aufsicht zurueck.
       */
      const ownsKontakt = (k: typeof kunden[number]) =>
        kontaktBelongsToUser(k, { userName, userId });
      const hatZustaendigen = (k: typeof kunden[number]) =>
        !!(k as { zustaendig_id?: string }).zustaendig_id || !!k.berater;
      const zustaendigFuer = (k: typeof kunden[number]) =>
        ownsKontakt(k) || ((isAdmin || isBuchhaltung) && !hatZustaendigen(k));

      // Defensive Bereinigung: Tasks zu Kunden, die diesem VP nicht (mehr)
      // gehören, werden entfernt. Verhindert, dass alte/fremde Trigger sichtbar bleiben.
      // Zusätzlich für ALLE Rollen: Tasks zu Kunden, die nicht (mehr) im
      // aktiven Datenbestand existieren (Soft- oder Hard-Delete), entfernen.
      {
        const liveIds = new Set(kunden.map((k) => k.id));
        // Gilt jetzt fuer alle Rollen: Was einem Kollegen gehoert, verschwindet
        // auch aus der eigenen Liste wieder.
        const ownedIds = (userName || userId)
          ? new Set(kunden.filter(zustaendigFuer).map((k) => k.id))
          : null;
        const current = getInboxTasks();
        const cleaned = current.filter((t) => {
          if (!t.kundeId) return true;
          if (!liveIds.has(t.kundeId)) return false; // verwaiste Tasks raus
          if (ownedIds && !ownedIds.has(t.kundeId)) return false; // nur eigene Kunden
          // Re-Engagement ist erledigt, sobald ein nächster Schritt vereinbart ist.
          if (t.titel?.startsWith(RE_ENGAGEMENT_TITEL)) {
            const k = kunden.find((x) => x.id === t.kundeId);
            if (k && hatVereinbartenKontakt(k)) return false;
          }
          return true;
        });
        if (cleaned.length !== current.length) setInboxTasks(cleaned);
      }

      const existingTasks = getInboxTasks();
      const taskExists = (titel: string) => existingTasks.some((t) => t.titel === titel);
      const add = (titel: string, beschreibung: string, prio: "niedrig"|"mittel"|"hoch"|"dringend", typ: "anruf"|"meeting"|"follow_up"|"aufgabe"|"deadline", kundeId: string, kundeName: string, uhrzeit = "09:00", faelligMs?: number) => {
        if (taskExists(titel)) return;
        const faellig_am = faelligMs != null ? toISO(faelligMs) : todayISO();
        addInboxTask({ titel, beschreibung, prioritaet: prio, typ, faellig_am, uhrzeit, kundeId, kundeName });
      };

      for (const inv of investments) {
        // Testkunden loesen keine Erinnerungen aus, siehe kontaktStumm.
        if (istKontaktStumm(inv.kontaktId)) continue;
        const kunde = kunden.find((k) => k.id === inv.kontaktId);
        if (!kunde) continue;
        // Nur eigene Kunden verarbeiten, unabhaengig von der Rolle.
        if (!zustaendigFuer(kunde)) continue;
        const kundeName = `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim() || "Kunde";
        const meta = getInvestmentMeta(inv.id);
        const stage = inv.pipelineStufe || "";

        // =========== PHASE 1 (VP) ===========
        if (isVp) {
          /*
           * 1) Reservierungsvereinbarung ohne Unterschrift, drei Stufen nach
           *    2, 5 und 10 Tagen (Freigabe Christian, 23.09.2026).
           *
           * Hier standen bis zum 24.09.2026 zwei Erinnerungen
           * ("RV-Gegenzeichnung Kunde", "RV noch nicht unterschrieben"), die
           * nie ausgeloest haben: Sie warteten auf ein Reservierungs-PDF, das
           * erst mit der Unterschrift entsteht. Massgeblich ist jetzt
           * `rvSignaturePending` samt `rvSignatureSentAt`, beides setzt die
           * Edge Function `send-reservation-signature` beim Versand. Die
           * Rechnerei steht in `rvUnterschriftMahnung.ts`.
           *
           * Nur Versaende ab `RV_ERINNERUNG_AB` (25.09.2026, 00:00 Uhr
           * deutscher Zeit) laufen durch die Stufen. Aeltere und Vorgaenge
           * ohne `rvSignatureSentAt` bleiben ruhig, auch nicht verspaetet
           * (Entscheidung Christian vom 24.09.2026).
           *
           * Die Kette geht serverseitig weiter: Tag 14 legt
           * `send-reservierung-eskalation` eine Aufgabe fuer den Berater an,
           * unabhaengig von diesem Hook und von `RV_ERINNERUNG_AB`.
           */
          {
            const stand = rvUnterschriftStand(meta, { jetzt: new Date(now) });
            const mahnung = naechsteRvMahnung(stand, (s) => wasSent(inv.id, s));
            if (mahnung) {
              const { stufe } = mahnung;
              const tage = stand.tage ?? stufe.tage;
              const texte = rvMahnTexte(stufe, { kundeName, investmentLabel: inv.label, tage });
              add(texte.titel, texte.beschreibung, stufe.prioritaet, stufe.typ, inv.kontaktId, kundeName);
              for (const sperre of mahnung.sperren) markSent(inv.id, sperre);
              /*
               * Die Glocke kommt zusaetzlich, das Rueckgrat bleibt die
               * Aufgabe: Eine Glocke verschwindet, wenn man sie wegklickt,
               * eine Aufgabe bleibt und hat einen Besitzer. Deshalb steht die
               * Sperre schon oben, und ein Fehler hier darf die Kette nicht
               * anhalten.
               */
              try {
                const link = `/kunden/${inv.kontaktId}`;
                if (stufe.anVertriebsleitung) {
                  const vl = rvVertriebsleitungTexte({ kundeName, investmentLabel: inv.label, tage, partnerName: userName });
                  notifyVertriebsleitung({ titel: vl.titel, nachricht: vl.beschreibung, link });
                } else if (stufe === RV_MAHN_STUFEN[0] && userId) {
                  notifyUser(userId, { titel: texte.titel, nachricht: texte.beschreibung, link });
                }
              } catch (fehler) {
                console.warn("RV-Erinnerung: Glocke fehlgeschlagen:", fehler);
              }
            }
          }

          // 2+3) Notar T-2 / T-0
          if (inv.notarTermin && stage === "notar") {
            const termin = parseDateMaybe(inv.notarTermin);
            if (termin) {
              if (inv.notarUhrzeit && /^\d{1,2}:\d{2}$/.test(inv.notarUhrzeit)) {
                const [h, m] = inv.notarUhrzeit.split(":").map(Number);
                termin.setHours(h || 10, m || 0, 0, 0);
              } else termin.setHours(10, 0, 0, 0);
              const diffH = (termin.getTime() - now) / 3_600_000;
              if (diffH > 24 && diffH <= 56 && !wasSent(inv.id, "notar_t_minus_2")) {
                add(`Notartermin in 2 Tagen: ${kundeName}`, `Der Notartermin für ${kundeName} (${inv.label}) findet in 2 Tagen statt (${termin.toLocaleDateString("de-DE")} ${inv.notarUhrzeit || ""} Uhr). Mit Kunde Rücksprache halten – passt alles? Offene Fragen klären.`, "hoch", "anruf", inv.kontaktId, kundeName);
                markSent(inv.id, "notar_t_minus_2");
              }
              const sameDay = termin.getFullYear() === today.getFullYear() && termin.getMonth() === today.getMonth() && termin.getDate() === today.getDate();
              if (sameDay && diffH > 0 && !wasSent(inv.id, "notar_tag")) {
                add(`Heute Notartermin: ${kundeName}`, `Heute um ${inv.notarUhrzeit || "10:00"} Uhr findet der Notartermin für ${kundeName} (${inv.label}) statt. Wichtig: Nach der Unterschrift Foto-Pflicht – bitte Notarfoto im Investment hochladen.`, "dringend", "meeting", inv.kontaktId, kundeName, inv.notarUhrzeit || "10:00");
                markSent(inv.id, "notar_tag");
              }
            }
          }

          // 4) Aftersales-Beratung Gegenzeichnung
          const ab = (meta.aftersalesBeratung as Record<string, any>) || {};
          if (ab.vpSignedAt && !ab.kundeSignedAt) {
            const vpSignedAt = parseDateMaybe(ab.vpSignedAt);
            if (vpSignedAt) {
              const d = daysBetween(vpSignedAt, new Date(now));
              for (const s of [{ k: "as_kunde_3d", d: 3, p: "mittel" as const }, { k: "as_kunde_7d", d: 7, p: "hoch" as const }, { k: "as_kunde_14d", d: 14, p: "dringend" as const }]) {
                if (d < s.d || wasSent(inv.id, s.k)) continue;
                add(`Aftersales-Beratung Gegenzeichnung: ${kundeName}`, `Seit ${s.d} Tagen wartet das Aftersales-Beratungsdokument für ${kundeName} (${inv.label}) auf die Kunden-Gegenzeichnung. Bitte beim Kunden nachhalten.`, s.p, "follow_up", inv.kontaktId, kundeName);
                markSent(inv.id, s.k);
              }
            }
          }

          // 5) Quartalsweiser Check-In
          const terminNotar = parseDateMaybe(inv.notarTermin);
          if (terminNotar && ["faelligkeit","abrechnung","abgeschlossen"].includes(stage) && terminNotar.getTime() < now) {
            const q = Math.floor(daysBetween(terminNotar, new Date(now)) / 90);
            for (let i = 1; i <= Math.min(q, 8); i++) {
              const key = `bestand_q${i}`;
              if (wasSent(inv.id, key)) continue;
              add(`Quartals-Check-In: ${kundeName} (Q${i})`, `${i * 3} Monate seit Notartermin von ${kundeName} (${inv.label}). Proaktiver Check-In laut Aftersales-Konzept: Stand erfragen, Zufriedenheit prüfen, Portfolio-Erweiterung ansprechen.`, "mittel", "anruf", inv.kontaktId, kundeName);
              markSent(inv.id, key);
            }
          }
        }

        // =========== PHASE 2 – Beratung & Bonität ===========
        if (isVp) {
          const bd = (meta.beratungsdokument as Record<string, any>) || {};
          if (bd.vpSignedAt && !bd.kundeSignedAt) {
            const vpAt = parseDateMaybe(bd.vpSignedAt);
            if (vpAt) {
              const d = daysBetween(vpAt, new Date(now));
              for (const s of [{ k: "bd_kunde_3d", d: 3, p: "mittel" as const }, { k: "bd_kunde_7d", d: 7, p: "hoch" as const }]) {
                if (d < s.d || wasSent(inv.id, s.k)) continue;
                add(`Beratungsdokument Gegenzeichnung: ${kundeName}`, `Seit ${s.d} Tagen wartet das Beratungsdokument für ${kundeName} (${inv.label}) auf die Kunden-Gegenzeichnung. Bitte beim Kunden nachhalten.`, s.p, "follow_up", inv.kontaktId, kundeName);
                markSent(inv.id, s.k);
              }
            }
          }
          // Steht der Vermerk „Kunde finanziert selbst", braucht es die
          // Bonitätsunterlagen nicht. Dann darf auch keine Aufgabe mehr
          // entstehen, die darauf wartet.
          const saEntfaelltHier = !!(meta.selbstauskunftEntfaellt as { aktiv?: boolean } | undefined)?.aktiv;
          if (stage === "bonitaetsunterlagen" && !saEntfaelltHier) {
            const ds: Record<string, string> = (meta.docStatuses as Record<string, string>) || {};
            // saSnapshot als Rueckfall wie in `finanzierungIstFrei`: Ist die
            // Selbstauskunft abgeschlossen, steht die Beschaeftigungsart oft nur dort.
            const pflicht = pflichtBonitaetDocs(((meta.saData || meta.saSnapshot) as Record<string, unknown> | undefined)?.beschaeftigungsart as string | undefined);
            const fehlend = pflicht.filter((d) => ds[d] !== "approved" && ds[d] !== "uploaded");
            // Nur echte Pipeline-Datierung verwenden – nicht das Zuweisungsdatum
            // (sonst würden Tasks ausgelöst, sobald der Kunde X Tage zugeordnet ist,
            // unabhängig davon, wann die Bonitätsstufe tatsächlich begonnen hat).
            const seit = parseDateMaybe(meta.bonitaetSeit) || parseDateMaybe(meta.pipelineSeit);
            if (fehlend.length > 0 && seit) {
              const d = daysBetween(seit, new Date(now));
              for (const s of [{ k: "bonitaet_3d", d: 3, p: "mittel" as const }, { k: "bonitaet_7d", d: 7, p: "hoch" as const }, { k: "bonitaet_14d", d: 14, p: "dringend" as const }]) {
                if (d < s.d || wasSent(inv.id, s.k)) continue;
                add(`Bonitätsunterlagen fehlen: ${kundeName}`, `Seit ${d} Tagen sind noch Bonitätsunterlagen offen für ${kundeName} (${inv.label}). Fehlend: ${fehlend.join(", ")}. Bitte beim Kunden nachfassen.`, s.p, "follow_up", inv.kontaktId, kundeName);
                markSent(inv.id, s.k);
              }
            }
          }
        }

        // =========== PHASE 3 – Objektauswahl ===========
        if (stage === "objektauswahl") {
          const seit = parseDateMaybe(meta.objektZugewiesenAm) || parseDateMaybe(meta.objektauswahlSeit) || parseDateMaybe(meta.pipelineSeit);
          if (isVp && inv.objektId && seit && daysBetween(seit, new Date(now)) >= 5 && !wasSent(inv.id, "obj_5d")) {
            add(`Kunde zum Objekt zurückrufen: ${kundeName}`, `Objekt wurde ${kundeName} (${inv.label}) vor mehr als 5 Tagen zugewiesen – noch keine Reservierung. Bitte aktiv beim Kunden nachfassen.`, "hoch", "anruf", inv.kontaktId, kundeName);
            markSent(inv.id, "obj_5d");
          }
          if ((isVp || isAdmin) && seit && daysBetween(seit, new Date(now)) >= 14 && !wasSent(inv.id, "obj_14d_eskal")) {
            add(`Eskalation Objektauswahl > 14 Tage: ${kundeName}`, `${kundeName} (${inv.label}) ist seit über 14 Tagen in der Objektauswahl ohne Fortschritt. Vertriebsleiter informieren und Kunden persönlich kontaktieren.`, "dringend", "aufgabe", inv.kontaktId, kundeName);
            markSent(inv.id, "obj_14d_eskal");
          }
        }

        // =========== PHASE 4 – Finanzierungs-Kette ===========
        if (isVp || isAdmin) {
          const rvSigned = getRvSigned(inv.id);
          const angebotUploaded = getFinanzierungDocStatus(inv.id, "Finanzierungsangebot").uploaded;
          const darlehenUploaded = getFinanzierungDocStatus(inv.id, "Darlehensvertrag").uploaded;
          // rvSignedAt schreibt die Edge Function finalize-reservierung.
          const rvSignedAt = parseDateMaybe(meta.rvSignedAt) || parseDateMaybe(meta.rvKundeSignedAt) || parseDateMaybe(meta.reservierungUnterschriebenAm);

          if (isVp && rvSigned && !angebotUploaded && rvSignedAt) {
            const d = daysBetween(rvSignedAt, new Date(now));
            for (const s of [{ k: "fin_angebot_5d", d: 5, p: "mittel" as const }, { k: "fin_angebot_10d", d: 10, p: "hoch" as const }, { k: "fin_angebot_15d", d: 15, p: "dringend" as const }]) {
              if (d < s.d || wasSent(inv.id, s.k)) continue;
              add(`Finanzierung starten: ${kundeName}`, `RV von ${kundeName} (${inv.label}) ist seit ${s.d} Tagen unterschrieben. Bitte mit dem Finanzierungspartner Kontakt aufnehmen / Status des Angebots prüfen.`, s.p, "follow_up", inv.kontaktId, kundeName);
              markSent(inv.id, s.k);
            }
          }

          if (isVp && angebotUploaded && !darlehenUploaded) {
            // Erstdetektion datieren
            const stored = getSent()[inv.id]?.find((s) => s.startsWith("fin_angebot_detect_at:"));
            let detected = stored ? parseDateMaybe(stored.split(":")[1]) : null;
            if (!detected) {
              detected = new Date();
              markSent(inv.id, `fin_angebot_detect_at:${todayISO()}`);
            }
            const d = daysBetween(detected, new Date(now));
            for (const s of [{ k: "fin_darlehen_5d", d: 5, p: "mittel" as const }, { k: "fin_darlehen_10d", d: 10, p: "hoch" as const }, { k: "fin_darlehen_15d", d: 15, p: "dringend" as const }]) {
              if (d < s.d || wasSent(inv.id, s.k)) continue;
              add(`Darlehensvertrag fehlt: ${kundeName}`, `Finanzierungsangebot für ${kundeName} (${inv.label}) liegt seit ${s.d} Tagen vor – Darlehensvertrag noch nicht hochgeladen. Bitte mit Bank / Finanzierungspartner klären.`, s.p, "follow_up", inv.kontaktId, kundeName);
              markSent(inv.id, s.k);
            }
          }

          // Frueher: fin.phase === "gesendet". Diese Phase wurde nie gesetzt,
          // der Hinweis kam also nie. Massgeblich ist jetzt, ob ein Angebot
          // vorliegt und der Darlehensvertrag noch fehlt.
          if (isVp && angebotUploaded && !darlehenUploaded) {
            const angSentAt = parseDateMaybe(meta.finanzierungAngebotGesendetAm) || parseDateMaybe(meta.finanzierungSeit);
            if (angSentAt && daysBetween(angSentAt, new Date(now)) >= 7 && !wasSent(inv.id, "fin_angebot_besprechen")) {
              add(`Finanzierungsangebot mit Kunde besprechen: ${kundeName}`, `Das Finanzierungsangebot für ${kundeName} (${inv.label}) liegt seit über 7 Tagen vor, wurde aber noch nicht akzeptiert. Bitte Termin mit Kunde abstimmen und Konditionen besprechen.`, "hoch", "anruf", inv.kontaktId, kundeName);
              markSent(inv.id, "fin_angebot_besprechen");
            }
          }

          if (isVp && darlehenUploaded && !wasSent(inv.id, "fin_darlehen_pruefen")) {
            add(`Finanzierung prüfen & Aufnahmebogen ausfüllen: ${kundeName}`, `Darlehensvertrag für ${kundeName} (${inv.label}) wurde hochgeladen. Bitte Finanzierung mit Kunde final bestätigen und anschließend den Notaraufnahmebogen ausfüllen, damit der Notartermin koordiniert werden kann.`, "hoch", "aufgabe", inv.kontaktId, kundeName);
            markSent(inv.id, "fin_darlehen_pruefen");
          }

          if (isAdmin && stage === "finanzierung") {
            const finSeit = parseDateMaybe(meta.finanzierungSeit) || parseDateMaybe(meta.pipelineSeit);
            if (finSeit && daysBetween(finSeit, new Date(now)) >= 30 && !darlehenUploaded && !wasSent(inv.id, "fin_30d_eskal")) {
              add(`Eskalation Finanzierung > 30 Tage: ${kundeName}`, `${kundeName} (${inv.label}) hängt seit über 30 Tagen in der Finanzierungsphase ohne Darlehensvertrag. Bitte Status mit VP / Finanzierungspartner klären.`, "dringend", "aufgabe", inv.kontaktId, kundeName);
              markSent(inv.id, "fin_30d_eskal");
            }
          }
        }

        // =========== PHASE 5 – Fälligkeit / Abrechnung ===========
        const kpFaellig = parseDateMaybe(meta.kaufpreisfaelligkeitDatum);
        if (isAdmin && stage === "faelligkeit" && !kpFaellig && !wasSent(inv.id, "kp_eintragen")) {
          add(`Kaufpreisfälligkeit eintragen: ${kundeName}`, `Bitte das Datum der Kaufpreisfälligkeit für ${kundeName} (${inv.label}) im Investment eintragen, damit der VP den Kunden informieren kann.`, "hoch", "aufgabe", inv.kontaktId, kundeName);
          markSent(inv.id, "kp_eintragen");
        }
        if (isVp && kpFaellig && !wasSent(inv.id, "kp_vp_besprechen")) {
          add(`Kaufpreiszahlung mit Kunde besprechen: ${kundeName}`, `Die Kaufpreisfälligkeit für ${kundeName} (${inv.label}) ist auf den ${kpFaellig.toLocaleDateString("de-DE")} festgesetzt. Bitte mit Kunde die Zahlung besprechen und offene Fragen klären.`, "hoch", "anruf", inv.kontaktId, kundeName);
          markSent(inv.id, "kp_vp_besprechen");
        }
        if (isVp && kpFaellig) {
          const d = daysBetween(new Date(now), kpFaellig);
          if (d <= 14 && d >= 0 && !wasSent(inv.id, "kp_14d_vorab")) {
            add(`Zahlungseingang vorbereiten: ${kundeName}`, `In ${d} Tagen ist Kaufpreisfälligkeit für ${kundeName} (${inv.label}). Bitte mit Kunde Rücksprache zum Zahlungseingang halten.`, "hoch", "anruf", inv.kontaktId, kundeName);
            markSent(inv.id, "kp_14d_vorab");
          }
        }
        if (isAdmin || isBuchhaltung) {
          const abrErstellt = parseDateMaybe(meta.abrechnungErstelltAm);
          if (abrErstellt && !meta.abrechnungBezahltAm) {
            const d = daysBetween(abrErstellt, new Date(now));
            for (const s of [{ k: "abr_14d", d: 14, p: "hoch" as const }, { k: "abr_30d", d: 30, p: "dringend" as const }]) {
              if (d < s.d || wasSent(inv.id, s.k)) continue;
              add(`Abrechnung unbezahlt seit ${s.d} Tagen: ${kundeName}`, `Die Abrechnung für ${kundeName} (${inv.label}) wurde vor ${s.d} Tagen erstellt, ist aber noch nicht bezahlt. Bitte Zahlungseingang prüfen und ggf. mahnen.`, s.p, "aufgabe", inv.kontaktId, kundeName);
              markSent(inv.id, s.k);
            }
          }
        }

        // =========== PHASE 6 – Allgemeine Schwellen pro Investment ===========
        if (isVp) {
          const ACTIVE = ["kontaktversuche","vermoegensaufbau","follow_up","erstgespraech_geplant", "erstgespraech","beratungsgespraech","bonitaetsunterlagen","objektauswahl","follow_up_objekt","finanzierung"];
          if (ACTIVE.includes(stage)) {
            const lastAct = parseDateMaybe(kunde.aktualisiert_am);
            // Ein vereinbarter Folgetermin ist keine Inaktivität.
            if (lastAct && daysBetween(lastAct, new Date(now)) >= 14 && !hatVereinbartenKontakt(kunde)) {
              const key = `inaktiv_14d_${stage}`;
              if (!wasSent(inv.id, key)) {
                const label = (stage === "kontaktversuche" || stage === "follow_up")
                  ? "Kunden erneut kontaktieren – warmhalten & nächste Schritte abstimmen"
                  : `Re-Engagement in Stufe „${stage}" – Stand erfragen und nächste Schritte planen`;
                add(`${RE_ENGAGEMENT_TITEL}: ${kundeName}`, `${kundeName} (${inv.label}) – seit 14 Tagen keine Aktivität. ${label}.`, "mittel", "anruf", inv.kontaktId, kundeName);
                markSent(inv.id, key);
              }
            }
          }

          const notarT = parseDateMaybe(inv.notarTermin);
          if (notarT && notarT.getTime() < now) {
            const yearsSince = Math.floor(daysBetween(notarT, new Date(now)) / 365);
            for (let y = 1; y <= Math.min(yearsSince, 10); y++) {
              const key = `jubilaeum_${y}j`;
              if (wasSent(inv.id, key)) continue;
              add(`${y}-Jahres-Jubiläum: ${kundeName}`, `${kundeName} (${inv.label}) ist seit ${y} Jahr${y > 1 ? "en" : ""} Investor. Bitte Jahres-Feedback einholen und – falls noch nicht geschehen – über Portfolio-Erweiterung / Folge-Investment sprechen.`, "mittel", "anruf", inv.kontaktId, kundeName, "10:00");
              markSent(inv.id, key);
            }
            const dN = daysBetween(notarT, new Date(now));
            if (dN >= 180 && !wasSent(inv.id, "steuer_6m")) {
              add(`Steuerunterlagen-Reminder (AfA + Anlage V): ${kundeName}`, `${kundeName} (${inv.label}) – 6 Monate seit Notartermin. Bitte Kunde an AfA-Bescheinigung und Anlage V für die Steuererklärung erinnern (Belege sammeln, Hausverwaltungs-Abrechnung anfragen, Steuerberater einbeziehen).`, "mittel", "follow_up", inv.kontaktId, kundeName);
              markSent(inv.id, "steuer_6m");
            }
          }
        }
      }

      // =========== PHASE 6 – Geburtstage (außerhalb Investment-Loop) ===========
      if (isVp) {
        for (const k of kunden) {
          if (!zustaendigFuer(k)) continue;
          if (!hasBirthdayToday(k.geburtstag)) continue;
          const key = `kunde_geb_${k.id}_${new Date().getFullYear()}`;
          if (wasSent("birthdays", key)) continue;
          const name = `${k.vorname || ""} ${k.nachname || ""}`.trim() || "Kunde";
          add(`Geburtstag heute: ${name}`, `${name} hat heute Geburtstag. Bitte persönlich gratulieren (Anruf / WhatsApp / Karte).`, "mittel", "anruf", k.id, name);
          markSent("birthdays", key);
        }
      }
      if (isAdmin) {
        const profiles = (cacheGet("profiles") || []) as any[];
        for (const p of profiles) {
          const role = p.role || p.rolle;
          if (!role || role === "tippgeber" || role === "kunde") continue;
          const gebStr = p.geburtstag || p.geburtsdatum || p.birthday;
          if (!hasBirthdayToday(gebStr)) continue;
          const key = `intern_geb_${p.id || p.user_id}_${new Date().getFullYear()}`;
          if (wasSent("birthdays", key)) continue;
          const name = `${p.vorname || p.first_name || ""} ${p.nachname || p.last_name || ""}`.trim() || "Teammitglied";
          add(`Team-Geburtstag heute: ${name}`, `${name} (${role}) hat heute Geburtstag. Bitte im Team persönlich gratulieren.`, "mittel", "aufgabe", "", name);
          markSent("birthdays", key);
        }
      }
    }

    // Erst rechnen, wenn Kontakte und Investments im Cache liegen (Laden je Route).
    // Dazu die beiden globalen Tabellen: In `user_settings` liegt die Sperrliste,
    // ohne sie sieht jeder Ausloeser neu aus; aus `user_roles` findet die Glocke
    // an die Vertriebsleitung ihre Empfaenger. Kaeme sie vorher, ginge sie ins
    // Leere, waehrend die Sperre schon gesetzt ist.
    const abmelden = wennTabellenGeladen(["kontakte", "investments", "user_settings", "user_roles"], check);
    const interval = setInterval(check, 10 * 60 * 1000);
    return () => { abmelden(); clearInterval(interval); };
  }, [userRole, userName, userId]);
}