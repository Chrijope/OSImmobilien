import { useEffect } from "react";
import { getInvestments } from "@/lib/investmentsStore";
import { schliesseErledigteAutomatikAufgaben, stelleAutomatikAufgabeSicher } from "@/lib/aufgabenStore";
import { getKontakte } from "@/lib/kundenStore";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { cacheGet, wennTabellenGeladen } from "@/lib/dataCache";
import { istKontaktStumm } from "@/lib/kontaktStumm";

/**
 * Kaufpreisfälligkeits-Reminder (Buchhaltung / Admin / Inhaber):
 *  - Genau EIN Task pro Investment: fällig 14 Tage nach Notartermin
 *  - `faellig_am = max(heute, Notartermin + 14 Tage)` — nie rückdatiert
 *  - Skip, wenn `kaufpreisfaelligkeitDatum` bereits hinterlegt ist
 */

const REMINDER_KEY = "mi_kaufpreis_faelligkeit_reminders_sent";
const TARGET_ROLES = ["buchhaltung", "admin", "inhaber", "testaccount"];
const STAGE_DAYS = 14;

function getKaufpreisFaelligDatum(investmentId: string): string | undefined {
  // 1) Investment-Meta (zentral, rollen-übergreifend)
  try {
    const row = (cacheGet("investments") || []).find((r: any) => r.id === investmentId);
    const meta = (row?.meta as Record<string, any>) || {};
    if (meta.kaufpreisfaelligkeitDatum) return meta.kaufpreisfaelligkeitDatum;
  } catch { /* ignore */ }
  // 2) Persönliche Abwicklungsdaten (Buchhaltung)
  try {
    if (isTestAccount()) {
      const raw = localStorage.getItem(`mi_abwicklung_${investmentId}`);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed?.kaufpreisfaelligkeitDatum) return parsed.kaufpreisfaelligkeitDatum;
    } else {
      const all = getUserSetting<Record<string, any>>("abwicklung_daten", {});
      if (all[investmentId]?.kaufpreisfaelligkeitDatum) return all[investmentId].kaufpreisfaelligkeitDatum;
    }
  } catch { /* ignore */ }
  return undefined;
}

/**
 * Erinnerung an die Kaufpreisfälligkeit.
 *
 * Vorher entstand die Aufgabe einmal und blieb dann stehen, auch nachdem das
 * Datum längst eingetragen war. Jetzt trägt sie ihren Auslöser und schließt
 * sich selbst, sobald das Datum vorliegt oder das Investment die Stufe
 * verlässt. Außerdem bekam bisher jeder Buchhalter und Admin dieselbe Aufgabe
 * in seine persönliche Liste, bei drei Admins also dreimal. Jetzt hängt sie am
 * Kunden und existiert genau einmal.
 */
const PRAEFIX = "kaufpreis:";

export function useKaufpreisFaelligkeitReminder(userRole?: string, userId?: string) {
  useEffect(() => {
    if (!userRole || !TARGET_ROLES.includes(userRole)) return;
    if (!userId) return;

    async function check() {
      const investments = getInvestments();
      const kunden = getKontakte();
      const todayMs = Date.now();
      const aktiv = new Set<string>();

      for (const inv of investments) {
        if (!inv.notarTermin) continue;
        if (!["notar", "notar_ohne_gs", "notar_mit_gs", "faelligkeit", "abrechnung"].includes(inv.pipelineStufe)) continue;
        if (getKaufpreisFaelligDatum(inv.id)) continue;

        const notarTs = new Date(inv.notarTermin).getTime();
        if (isNaN(notarTs)) continue;

        const kunde = kunden.find(k => k.id === inv.kontaktId);
        if (!kunde) continue;
        // Testkunden melden sich nicht von selbst. Otto Hans hat einen
        // Notartermin und wird nie ein Faelligkeitsdatum bekommen, weil ihn
        // niemand zu Ende pflegt. Fuer die Automatik ist das ein liegen
        // gebliebener Vorgang, und deshalb stand er jeden Tag in der Inbox.
        if (istKontaktStumm(inv.kontaktId)) continue;
        const kundeName = `${kunde.vorname ?? ""} ${kunde.nachname ?? ""}`.trim() || "Kunde";

        /*
         * Die Aufgabe gehoert dem zustaendigen Partner, nicht dem, der zufaellig
         * die Anwendung geoeffnet hat.
         *
         * Vorher lief dieser Reminder fuer Admins, Inhaber und Buchhaltung ueber
         * SAEMTLICHE Investments und wies die Aufgabe demjenigen zu, dessen
         * Sitzung sie ausloeste. Der eigentlich Zustaendige erfuhr nichts davon,
         * weil `stelleAutomatikAufgabeSicher` eine zweite Aufgabe zum selben
         * Ausloeser verhindert. So stand die Kaufpreispruefung eines fremden
         * Kunden in der eigenen Inbox und sah aus wie eigene Arbeit.
         *
         * Ohne hinterlegten Zustaendigen faellt sie an den Ausloesenden zurueck,
         * sonst saehe sie niemand.
         */
        const zustaendig = (kunde as { zustaendig_id?: string }).zustaendig_id || userId;

        const key = `${PRAEFIX}2w:${inv.id}`;
        aktiv.add(key);

        const faelligDateMs = Math.max(todayMs, notarTs + STAGE_DAYS * 86400000);
        await stelleAutomatikAufgabeSicher(
          {
            kontaktId: inv.kontaktId,
            typ: "aufgabe",
            prioritaet: "hoch",
            titel: `Kaufpreisfälligkeit prüfen: ${kundeName}`,
            beschreibung:
              `Zwei Wochen nach dem Notartermin am ${new Date(inv.notarTermin).toLocaleDateString("de-DE")} für ${kundeName} (${inv.label}). ` +
              `Bitte die Kaufpreisfälligkeit prüfen. Sobald Fälligkeitsdatum und Grundbucheintrag vorliegen, beides im Investment unter Abwicklung eintragen.`,
            faelligAm: new Date(faelligDateMs).toISOString().slice(0, 10),
            uhrzeit: "09:00",
            ausloeserSchluessel: key,
            zugewiesenAn: zustaendig,
          },
          zustaendig,
          // Einmal geprüft ist geprüft. Vorher entstand die Aufgabe nach dem
          // Abhaken beim nächsten Lauf neu, weil das Fälligkeitsdatum weiter
          // fehlte, und der Lauf kommt alle zehn Minuten.
          true,
        );
      }

      await schliesseErledigteAutomatikAufgaben(PRAEFIX, aktiv, userId);
    }

    // Erst rechnen, wenn Kontakte und Investments im Cache liegen (Laden je Route).
    const abmelden = wennTabellenGeladen(["kontakte", "investments"], () => void check());
    const interval = setInterval(() => void check(), 10 * 60 * 1000);
    return () => { abmelden(); clearInterval(interval); };
  }, [userRole, userId]);
}