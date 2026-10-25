import { getInboxTasks, getAlleTermine } from "./aktivitaetenStore";
import { getAufgaben, getMeineAufgaben } from "./aufgabenStore";
import { getBewerber } from "./bewerbungStore";
import { bewerberErinnerungen } from "./bewerberErinnerungen";
import { siehtBewerberMeldungen } from "./bewerberRechte";
import { getFollowUps } from "./followUpStore";
import { getKontakte } from "./kundenStore";
import { getInvestments } from "./investmentsStore";
import { getDoneInboxIds } from "./inboxCountStore";
import { kontaktBelongsToUser } from "./kontaktOwnership";
import { getJuniorsForRecruiter } from "./juniorOverrideLogic";
import { istFuehrungskraft } from "./datenSicht";
import { sammleInboxTermine } from "./inboxTermine";
import type { Sicht } from "./dashboardKpis";

export type InboxVorgang = {
  id: string;
  titel: string;
  beschreibung: string;
  prioritaet: "niedrig" | "mittel" | "hoch" | "dringend";
  typ: "anruf" | "meeting" | "follow_up" | "aufgabe" | "deadline";
  faellig_am: string;
  uhrzeit: string;
  kundeId: string;
  kundeName: string;
  /** Gesetzt, wenn jemand anderes die Aufgabe gestellt hat. */
  vonWem?: string;
  /** Die Aufgabe hängt an einem Bewerber, kundeId ist dann die Bewerbungs-ID. */
  bewerber?: boolean;
};

// Parst TT.MM.JJJJ → ISO String (oder gibt Input zurück, wenn schon ISO)
function parseGermanDateToISO(d: string): string {
  if (!d) return "";
  const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const [_, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
  }
  return d;
}

// Manuelle Follow-Ups (bw-) und Rückrufe aus der Bedenkzeit (bz-), beide aus
// derselben Ableitung in bewerberErinnerungen.ts.
function getBewerberFollowUps(): InboxVorgang[] {
  try {
    return getBewerber()
      .flatMap(bewerberErinnerungen)
      .map(e => ({
        id: e.id,
        titel: e.titel,
        beschreibung: e.beschreibung,
        prioritaet: "mittel" as const,
        typ: "follow_up" as const,
        faellig_am: parseGermanDateToISO(e.faelligAm),
        uhrzeit: e.uhrzeit || "—",
        kundeId: e.bewerberId,
        kundeName: e.name,
      }));
  } catch {
    return [];
  }
}

/**
 * Aufgaben aus der Tabelle `aufgaben` in das Anzeigeformat der Inbox bringen.
 *
 * Diese Aufgaben hängen am Kunden und tragen einen Empfänger. Sie sind damit
 * die einzige Quelle, die eine Zuweisung überhaupt abbilden kann. Die alte
 * persönliche Liste bleibt vorerst daneben bestehen, damit nichts verschwindet.
 *
 * Eine Aufgabe kann statt am Kunden auch an einem Bewerber hängen, etwa die
 * HR-Aufgabe nach der Vertragsunterschrift. Dann zeigt die Karte den
 * Bewerbernamen und führt in die Bewerberakte statt zu "Ohne Kunde".
 */
export function mappeAufgaben(
  rohe: ReturnType<typeof getMeineAufgaben>,
  namenJeKunde: Map<string, string>,
  namenJeBewerber: Map<string, string>,
  eigeneId?: string,
): InboxVorgang[] {
  return rohe.map((a) => {
    const basis = {
      id: `ag-${a.id}`,
      titel: a.titel,
      beschreibung: a.beschreibung || "",
      prioritaet: a.prioritaet,
      typ: a.typ,
      faellig_am: a.faelligAm || "",
      uhrzeit: a.uhrzeit || "—",
      vonWem: a.benutzerId && eigeneId && a.benutzerId !== eigeneId ? (a as any).erstelltVonName || "einem Kollegen" : undefined,
    };
    if (a.bewerbungId) {
      return {
        ...basis,
        kundeId: a.bewerbungId,
        kundeName: namenJeBewerber.get(a.bewerbungId) || "Bewerber",
        bewerber: true,
      };
    }
    return {
      ...basis,
      kundeId: a.kontaktId || "",
      kundeName: (a.kontaktId && namenJeKunde.get(a.kontaktId)) || "Ohne Kunde",
    };
  });
}

/** Bewerbungs-ID zu Anzeigename, aus dem Zwischenspeicher. */
export function namenDerBewerber(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    getBewerber().forEach((b) => {
      m.set(b.id, [b.vorname, b.nachname].filter(Boolean).join(" ").trim() || "Bewerber");
    });
  } catch { /* ignore */ }
  return m;
}

/** Gemeinsame Quelle für Dashboard und eigene/Team-/Firmen-Inbox. */
export function leseInboxVorgaenge(input: { userId?: string; userName: string; role: string; sicht: Sicht; erledigteIds?: string[] }) {
  const sicht = istFuehrungskraft(input.role) ? input.sicht : "eigen";
  const kontakte = getKontakte();
  const namen = new Map(kontakte.map(k => [k.id, `${k.vorname} ${k.nachname}`.trim()]));
  const team = new Set(getJuniorsForRecruiter(input.userId || "").map(j => j.userId));
  if (input.userId) team.add(input.userId);
  const erlaubt = new Set(kontakte.filter(k => sicht === "firma" ||
    kontaktBelongsToUser(k, { userName:input.userName, userId:input.userId }) ||
    (sicht === "team" && team.has(k.zustaendig_id || (k as { zustaendigId?: string }).zustaendigId || ""))).map(k => k.id));
  const roh = getAufgaben();
  const aufgaben = sicht === "eigen" ? getMeineAufgaben(input.userId) : roh.filter(a =>
    a.status !== "erledigt" && a.status !== "abgesagt" &&
    (sicht === "firma" || team.has(a.zugewiesenAn || a.benutzerId || "")));
  const folgen: InboxVorgang[] = getFollowUps().filter(f => f.status !== "erledigt" && erlaubt.has(f.kundeId)).map(f => ({
    id:`fu-${f.id}`,titel:f.titel,beschreibung:f.beschreibung || "",prioritaet:f.prioritaet === "hoch" ? "hoch" : f.prioritaet === "niedrig" ? "niedrig" : "mittel",
    typ:"follow_up",faellig_am:f.faelligAm,uhrzeit:"—",kundeId:f.kundeId,kundeName:namen.get(f.kundeId) || f.kundeName,
  }));
  const erledigt = new Set([...getDoneInboxIds(), ...(input.erledigteIds || [])]);
  let offen: InboxVorgang[] = [
    ...getInboxTasks(),
    ...mappeAufgaben(aufgaben,namen,namenDerBewerber(),input.userId), ...folgen,
    ...(sicht === "eigen" && siehtBewerberMeldungen(input.role) ? getBewerberFollowUps().map(t => ({...t,bewerber:true})) : []),
  ].filter(t => !erledigt.has(t.id));
  if (input.role.toLowerCase() === "finanzierungspartner") {
    const kunden = new Set(getInvestments().filter(i => ["reservierung","finanzierung","bankgutachter","besichtigung"].includes(i.pipelineStufe)).map(i => i.kontaktId));
    offen = offen.filter(t => kunden.has(t.kundeId));
    for (const id of erlaubt) if (!kunden.has(id)) erlaubt.delete(id);
  }
  // Identische IDs sind derselbe Vorgang; gleichlautende unabhängige Aufgaben bleiben erhalten.
  offen = [...new Map(offen.map(t => [t.id,t])).values()];
  const termine = sammleInboxTermine({aktivitaeten:getAlleTermine(),erlaubteKundeIds:erlaubt,namenJeKunde:namen,aufgaben:roh});
  return {offen,termine};
}
