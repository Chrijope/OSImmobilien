import { useEffect } from "react";
import { wennTabellenGeladen } from "@/lib/dataCache";
import { getInvestments, getInvestmentNotarFoto } from "@/lib/investmentsStore";
import { getKontakte } from "@/lib/kundenStore";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import {
  schliesseErledigteAutomatikAufgaben,
  stelleAutomatikAufgabeSicher,
} from "@/lib/aufgabenStore";

/**
 * Erinnerungen rund um den Notartermin.
 *
 * Zwei Dinge waren hier vorher falsch:
 *
 * Die Schleife lief über alle Investments, ohne zu prüfen, wem der Kunde
 * gehört. Ein Vertriebspartner bekam dadurch Erinnerungen zu Kunden von
 * Kollegen. Jetzt zählt nur, was ihm gehört.
 *
 * Und eine einmal erzeugte Aufgabe blieb für immer stehen. Wurde das Foto
 * hochgeladen, musste sie trotzdem von Hand abgehakt werden. Jetzt trägt jede
 * Aufgabe den Grund, aus dem sie entstanden ist, und verschwindet, sobald der
 * Grund entfallen ist.
 */
const PRAEFIX = "notar:";

export function useNotarfotoReminder(userRole?: string, userName?: string, userId?: string) {
  useEffect(() => {
    const allowedRoles = ["vertriebspartner", "testaccount", "individuell"];
    // Ohne bekannte Rolle wird nichts erzeugt. Vorher lief die Prüfung an,
    // solange das Profil noch lud, und traf dann jeden.
    if (!userRole || !allowedRoles.includes(userRole)) return;
    if (!userId) return;

    async function pruefe() {
      const investments = getInvestments();
      const kunden = getKontakte();
      const now = Date.now();
      const aktiv = new Set<string>();

      for (const inv of investments) {
        const kunde = kunden.find((k) => k.id === inv.kontaktId);
        if (!kunde) continue;
        if (!kontaktBelongsToUser(kunde, { userName, userId })) continue;
        const kundeName = `${kunde.vorname ?? ""} ${kunde.nachname ?? ""}`.trim() || "Kunde";

        // Notarfoto: gilt, solange Termin ansteht und kein Foto da ist.
        if (inv.notarTermin && inv.pipelineStufe === "notar" && !getInvestmentNotarFoto(inv.id)) {
          const termin = new Date(inv.notarTermin);
          if (inv.notarUhrzeit) {
            const [h, m] = inv.notarUhrzeit.split(":").map(Number);
            termin.setHours(h || 10, m || 0, 0, 0);
          } else {
            termin.setHours(10, 0, 0, 0);
          }
          const stunden = (termin.getTime() - now) / (1000 * 60 * 60);

          // Der Zustand gilt über das ganze Fenster, nicht nur in der Minute
          // des Übergangs. Dadurch entsteht die Aufgabe auch dann, wenn beim
          // Umschlagen niemand eingeloggt war.
          if (stunden <= 24 && stunden > 1) {
            const key = `${PRAEFIX}foto24:${inv.id}`;
            aktiv.add(key);
            await stelleAutomatikAufgabeSicher(
              {
                kontaktId: inv.kontaktId,
                typ: "aufgabe",
                prioritaet: "hoch",
                titel: `Notarfoto vorbereiten: ${kundeName}`,
                beschreibung: `Der Notartermin für ${kundeName} (${inv.label}) ist morgen. Bitte an das Notarfoto denken.`,
                faelligAm: inv.notarTermin,
                uhrzeit: inv.notarUhrzeit || "10:00",
                ausloeserSchluessel: key,
              },
              userId,
            );
          }

          if (stunden <= 1 && stunden > -24) {
            const key = `${PRAEFIX}foto1:${inv.id}`;
            aktiv.add(key);
            await stelleAutomatikAufgabeSicher(
              {
                kontaktId: inv.kontaktId,
                typ: "aufgabe",
                prioritaet: "dringend",
                titel: `Notarfoto hochladen: ${kundeName}`,
                beschreibung: `Der Notartermin für ${kundeName} (${inv.label}) steht unmittelbar bevor. Bitte das Notarfoto hochladen.`,
                faelligAm: inv.notarTermin,
                uhrzeit: inv.notarUhrzeit || "10:00",
                ausloeserSchluessel: key,
              },
              userId,
            );
          }
        }

        // Portfolio-Check acht Monate nach dem Notartermin.
        if (inv.notarTermin && (inv.pipelineStufe === "faelligkeit" || inv.pipelineStufe === "notar")) {
          const achtMonate = new Date(inv.notarTermin);
          achtMonate.setMonth(achtMonate.getMonth() + 8);
          if (now >= achtMonate.getTime()) {
            const key = `${PRAEFIX}portfolio8m:${inv.id}`;
            aktiv.add(key);
            await stelleAutomatikAufgabeSicher(
              {
                kontaktId: inv.kontaktId,
                typ: "aufgabe",
                prioritaet: "mittel",
                titel: `Portfolio-Check: ${kundeName}`,
                beschreibung: `Acht Monate seit dem Notartermin von ${kundeName} (${inv.label}). Guter Zeitpunkt, den Stand zu besprechen und über eine Erweiterung zu sprechen.`,
                faelligAm: new Date().toISOString().slice(0, 10),
                uhrzeit: "09:00",
                ausloeserSchluessel: key,
              },
              userId,
            );
          }
        }
      }

      // Alles, was nicht mehr in `aktiv` steht, ist erledigt und wird
      // geschlossen. Der Nutzer muss nichts abhaken.
      await schliesseErledigteAutomatikAufgaben(PRAEFIX, aktiv, userId);
    }

    // Erst rechnen, wenn Kontakte und Investments im Cache liegen. Beim
    // Laden je Route bringt sie erst das Vorladen oder die erste Vertriebsseite.
    const abmelden = wennTabellenGeladen(["kontakte", "investments"], () => void pruefe());
    const interval = setInterval(() => void pruefe(), 5 * 60 * 1000);
    return () => { abmelden(); clearInterval(interval); };
  }, [userRole, userName, userId]);
}
