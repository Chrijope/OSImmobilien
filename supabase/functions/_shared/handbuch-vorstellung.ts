/**
 * Die Aufgabe „Objekt-Vorstellungstermin vereinbaren“ für Leads der
 * Handbuch-Seite (Christians Wunsch vom 26.09.2026).
 *
 * Sie entsteht, sobald ein Handbuch-Lead beides hat: eine unterschriebene
 * Selbstauskunft und einen zuständigen Partner. Das ist genau der Moment, in
 * dem das Kundenprofil als nächsten Schritt „Passende Wohnung vorschlagen“
 * zeigt (Stufe `objektauswahl`, siehe nextStepsGuide.ts). Zwei Auslöser, je
 * nachdem, was zuletzt eintritt:
 *
 *   - `finalize-selbstauskunft`, wenn der Lead schon einem Partner gehört
 *     (Partnerlink oder vorher zugewiesen), serverseitig;
 *   - die Zuweisung im CRM (`leadZuweisenWennFrei`, `reassignBerater`), wenn
 *     die Selbstauskunft schon vorliegt, im Browser des Zuweisenden, weil die
 *     Zuweisung selbst dort geschrieben wird.
 *
 * Beide rufen `stelleVorstellungsAufgabeSicher`. Je Kontakt gibt es höchstens
 * eine offene solche Aufgabe (Auslöser `objekt_vorstellung:<kontakt>`).
 * Wechselt der Partner, wird die offene Aufgabe umgehängt, keine zweite
 * angelegt. Hat ein Partner sie abgehakt, entsteht keine neue.
 *
 * Geht der Lead zurück in den Pool (`releaseBeraterToPool`), schließt
 * `schliesseVorstellungsAufgabe` die offene Aufgabe als „abgesagt“, mit
 * Vermerk. Eine abgesagte zählt nicht als erledigt: Bei der nächsten
 * Zuteilung entsteht die Aufgabe neu für den neuen Partner. Damit das auch
 * für denselben Partner geht, zählt der eindeutige Index seit der Migration
 * 20260926210000 „abgesagt“ nicht mehr als offen (Christian, 26.09.2026).
 *
 * Läuft hier etwas schief, wird es nur protokolliert: Weder die Unterschrift
 * noch die Zuweisung dürfen an dieser Aufgabe scheitern.
 */
import { handbuchRahmen, istKonfiguratorQuelle, pruefeAntworten, rahmenText } from "./handbuch-funnel.ts";

export const VORSTELLUNG_TITEL = "Objekt-Vorstellungstermin vereinbaren";
export const VORSTELLUNG_PRAEFIX = "objekt_vorstellung:";

export function vorstellungSchluessel(kontaktId: string): string {
  return `${VORSTELLUNG_PRAEFIX}${kontaktId}`;
}

export function istVorstellungsAufgabe(schluessel?: string | null): boolean {
  return !!schluessel && schluessel.startsWith(VORSTELLUNG_PRAEFIX);
}

/** Vermerk an einer Aufgabe, die das System bei der Rückgabe in den Pool schließt. */
export const VORSTELLUNG_POOL_VERMERK = "Automatisch geschlossen, Lead zurück im Pool.";

type AufgabeKurz = { id: string; status?: string | null; zugewiesen_an?: string | null; beschreibung?: string | null };

function istOffen(a: AufgabeKurz): boolean {
  return a.status !== "erledigt" && a.status !== "abgesagt";
}

type InvestmentZeile = { id: string; erstellt_am?: string | null; meta?: Record<string, unknown> | null };

/**
 * Das Investment, dessen nächster Schritt „Passende Wohnung vorschlagen“ ist:
 * Selbstauskunft unterschrieben und Stufe `objektauswahl` (alt `closing`).
 * Weiter fortgeschrittene Investments zählen nicht, dort ist die Wohnung
 * schon gefunden. Bei mehreren das jüngste.
 */
export function vorstellungsInvestment(zeilen: InvestmentZeile[]): string | null {
  const passend = zeilen
    .filter((z) => {
      const m = z.meta || {};
      const stufe = String(m.pipelineStufe || "").trim();
      return m.saSigned === true && (stufe === "objektauswahl" || stufe === "closing");
    })
    .sort((a, b) => String(b.erstellt_am || "").localeCompare(String(a.erstellt_am || "")));
  return passend[0]?.id ?? null;
}

/** Kurztext für den Partner, mit dem Rahmen aus dem Konfigurator, falls es Antworten gibt. */
export function vorstellungBeschreibung(kontaktMeta: Record<string, unknown> | null | undefined): string {
  const funnel = kontaktMeta?.handbuchFunnel as Record<string, unknown> | undefined;
  const antworten = funnel ? pruefeAntworten(funnel.antworten) : null;
  const rahmen = antworten ? ` Rahmen laut Konfigurator: ${rahmenText(handbuchRahmen(antworten))}.` : "";
  return `Selbstauskunft liegt vor.${rahmen} Vereinbare einen Termin, um passende Wohnungen vorzustellen.`;
}

/** Heute in Berlin als JJJJ-MM-TT. So steht die Aufgabe in der Inbox unter „heute“. */
export function heuteInBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);
}

export type VorstellungsPlan =
  | { aktion: "anlegen"; investmentId: string }
  | { aktion: "umhaengen"; aufgabeId: string }
  | { aktion: "nichts"; grund: string };

/** Die reine Entscheidung, ohne Datenbank. */
export function planeVorstellungsAufgabe(e: {
  quelle: unknown;
  partnerId: string | null | undefined;
  investments: InvestmentZeile[];
  vorhandene: AufgabeKurz[];
}): VorstellungsPlan {
  if (!istKonfiguratorQuelle(e.quelle)) return { aktion: "nichts", grund: "kein_handbuch_lead" };
  const partnerId = (e.partnerId || "").trim();
  if (!partnerId) return { aktion: "nichts", grund: "kein_partner" };

  const offen = e.vorhandene.find(istOffen);
  if (offen) {
    return offen.zugewiesen_an === partnerId
      ? { aktion: "nichts", grund: "schon_da" }
      : { aktion: "umhaengen", aufgabeId: offen.id };
  }
  // Von einem Partner abgehakt heißt erledigt, auch nach einem Wechsel.
  // Abgesagte (bei Rückgabe in den Pool geschlossen) zählen nicht.
  if (e.vorhandene.some((a) => a.status === "erledigt")) return { aktion: "nichts", grund: "schon_erledigt" };

  const investmentId = vorstellungsInvestment(e.investments);
  if (!investmentId) return { aktion: "nichts", grund: "keine_selbstauskunft" };
  return { aktion: "anlegen", investmentId };
}

/**
 * Liest den Stand, entscheidet und schreibt. `db` ist ein Supabase-Client,
 * im Server mit Dienstschlüssel, im Browser der des angemeldeten Nutzers
 * (RLS: interne Rollen dürfen Aufgaben für andere anlegen, die Leitung darf
 * Aufgaben am Kunden ändern).
 *
 * @param partnerId  Der neue Zuständige. Ausdrücklich übergeben statt aus
 *                   dem Kontakt gelesen, weil die Zuweisung im Browser noch
 *                   unterwegs sein kann.
 * @param erstellerId Wer die Aufgabe anlegt. Ohne Angabe der Partner selbst.
 */
export async function stelleVorstellungsAufgabeSicher(
  // deno-lint-ignore no-explicit-any
  db: any,
  kontaktId: string,
  partnerId: string | null | undefined,
  erstellerId?: string | null,
): Promise<VorstellungsPlan> {
  if (!kontaktId) return { aktion: "nichts", grund: "kein_kontakt" };
  try {
    const schluessel = vorstellungSchluessel(kontaktId);
    const [kontakt, investments, vorhandene] = await Promise.all([
      db.from("kontakte").select("quelle, meta").eq("id", kontaktId).maybeSingle(),
      db.from("investments").select("id, erstellt_am, meta").eq("kunde_id", kontaktId),
      db.from("aufgaben").select("id, status, zugewiesen_an").eq("ausloeser_schluessel", schluessel),
    ]);
    const fehler = kontakt.error || investments.error || vorhandene.error;
    if (fehler) throw fehler;
    if (!kontakt.data) return { aktion: "nichts", grund: "kontakt_nicht_lesbar" };

    const plan = planeVorstellungsAufgabe({
      quelle: kontakt.data.quelle,
      partnerId,
      investments: investments.data || [],
      vorhandene: vorhandene.data || [],
    });

    if (plan.aktion === "umhaengen") {
      const { error } = await db.from("aufgaben").update({ zugewiesen_an: partnerId }).eq("id", plan.aufgabeId);
      if (error) throw error;
    } else if (plan.aktion === "anlegen") {
      const { error } = await db.from("aufgaben").insert({
        benutzer_id: erstellerId || partnerId,
        zugewiesen_an: partnerId,
        kontakt_id: kontaktId,
        investment_id: plan.investmentId,
        typ: "aufgabe",
        prioritaet: "hoch",
        status: "offen",
        titel: VORSTELLUNG_TITEL,
        beschreibung: vorstellungBeschreibung(kontakt.data.meta),
        faellig_am: heuteInBerlin(),
        ausloeser_schluessel: schluessel,
      });
      // 23505: Ein gleichzeitiger Lauf war schneller, die Aufgabe steht schon
      // (eindeutiger Index auf Partner und Auslöser).
      if (error && error.code !== "23505") throw error;
    }
    return plan;
  } catch (fehler) {
    console.error(
      "Objekt-Vorstellung: Aufgabe nicht angelegt:",
      fehler instanceof Error ? fehler.message : (fehler as { message?: string })?.message ?? fehler,
    );
    return { aktion: "nichts", grund: "fehler" };
  }
}

/**
 * Lead zurück im Pool: offene Aufgabe als „abgesagt“ schließen, mit Vermerk.
 * Rückgabe: Zahl der geschlossenen Aufgaben. Wirft nie.
 */
export async function schliesseVorstellungsAufgabe(
  // deno-lint-ignore no-explicit-any
  db: any,
  kontaktId: string,
): Promise<number> {
  if (!kontaktId) return 0;
  try {
    const { data, error } = await db
      .from("aufgaben")
      .select("id, status, beschreibung")
      .eq("ausloeser_schluessel", vorstellungSchluessel(kontaktId));
    if (error) throw error;
    const offen = ((data || []) as AufgabeKurz[]).filter(istOffen);
    for (const a of offen) {
      const text = (a.beschreibung || "").trim();
      const { error: fehler } = await db
        .from("aufgaben")
        .update({ status: "abgesagt", beschreibung: text ? `${text}\n\n${VORSTELLUNG_POOL_VERMERK}` : VORSTELLUNG_POOL_VERMERK })
        .eq("id", a.id);
      if (fehler) throw fehler;
    }
    return offen.length;
  } catch (fehler) {
    console.error(
      "Objekt-Vorstellung: Aufgabe nicht geschlossen:",
      fehler instanceof Error ? fehler.message : (fehler as { message?: string })?.message ?? fehler,
    );
    return 0;
  }
}
