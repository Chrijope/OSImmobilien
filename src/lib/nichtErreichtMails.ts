/**
 * Die Mails an einen Lead, den wir telefonisch nicht erreichen.
 *
 * Entscheidung von Christian (26.09.2026): statt einer Mail bei jedem
 * verpassten Anruf genau drei Mails, und zwar vom zuständigen Partner.
 *
 *   Versuch 1   Mail 1: "Ich habe es gerade bei dir versucht", mit
 *               Buchungslink und der Möglichkeit, einfach ein Zeitfenster
 *               zu nennen. Gesicht und Wahl statt Druck.
 *   Versuch 4   Mail 2: eine kurze, andere Erinnerung.
 *   Versuch 10  Mail 3: ehrlicher Abschluss, "soll ich das Thema schließen?"
 *
 * Bei allen anderen Versuchen geht keine Mail. Ab dem Beratungsgespräch
 * ebenfalls nicht, dort kennt man sich und ruft wieder an.
 *
 * Gezählt wird je Partner, nicht über den allgemeinen Zähler
 * `nichtErreichtCount`. Der bleibt, was er ist: die Zahl aller Versuche am
 * Lead. Er steuert die Wartezeiten und die Grenze von 15 Versuchen, und die
 * Lead-Rückgabe liest ihn als Historie. Würde er bei einem Partnerwechsel auf
 * null gesetzt, sähe ein Lead, der schon fünfzehnmal nicht abgenommen hat,
 * wieder wie ein frischer aus. Für die Mails dagegen soll der neue Partner von
 * vorn beginnen, denn für den Lead ist er ein neues Gesicht. Deshalb ein
 * eigener kleiner Zähler in `meta.nichtErreichtMails`, der sich den Partner
 * merkt, für den er zählt.
 *
 * Der Neustart braucht dadurch keine Migration und keinen Trigger: Steht im
 * Zähler ein anderer Partner als heute in `zustaendig_id`, beginnt er bei
 * null. Das greift bei jedem Zuweisungsweg, ob Lead-Verwaltung, Kundenprofil,
 * Pipeline oder Edge Function, weil nicht die Zuweisung den Zähler
 * zurücksetzt, sondern der nächste verpasste Anruf den Wechsel bemerkt.
 */
import { supabase } from "@/integrations/supabase/client";

/** Bei welchem Versuch welche Mail geht. Alle anderen Versuche: keine. */
export const MAIL_BEI_VERSUCH: Readonly<Record<number, 1 | 2 | 3>> = { 1: 1, 4: 2, 10: 3 };

export type NichtErreichtMailNummer = 1 | 2 | 3;

/** Die drei Vorlagen in send-transactional-email. */
export const NICHT_ERREICHT_VORLAGEN: Readonly<Record<NichtErreichtMailNummer, string>> = {
  1: "nicht-erreicht-mail-1",
  2: "nicht-erreicht-mail-2",
  3: "nicht-erreicht-mail-3",
};

/**
 * Der Zähler in `kontakte.meta.nichtErreichtMails`.
 *
 * `partnerId` ist leer, solange niemand zuständig ist. `gesendet` hält die
 * Versuchsnummern, bei denen eine Mail ausgelöst wurde, also höchstens
 * [1, 4, 10]. Es ist die zweite Sicherung neben dem Idempotenzschlüssel:
 * Dieselbe Mail geht an denselben Lead vom selben Partner nur einmal.
 */
export interface NichtErreichtMailStand {
  partnerId: string;
  versuche: number;
  gesendet: number[];
}

/** Liest den gespeicherten Zähler vorsichtig, Altbestand hat keinen. */
export function leseMailStand(roh: unknown): NichtErreichtMailStand | null {
  if (!roh || typeof roh !== "object") return null;
  const r = roh as Record<string, unknown>;
  const versuche = Number(r.versuche);
  if (!Number.isFinite(versuche) || versuche < 0) return null;
  return {
    partnerId: typeof r.partnerId === "string" ? r.partnerId.trim() : "",
    versuche: Math.floor(versuche),
    gesendet: Array.isArray(r.gesendet)
      ? r.gesendet.map(Number).filter((n) => Number.isFinite(n))
      : [],
  };
}

export interface MailPlanEingabe {
  /** Was bisher in `meta.nichtErreichtMails` steht. */
  bisher: unknown;
  /** `kontakte.zustaendig_id`, nie der Name und nie der, der klickt. */
  partnerId: string | null | undefined;
  /** Ab Beratungsgespräch: keine Mail, kein Zählen. */
  fortgeschritten: boolean;
  /** Adresse des Leads. Ohne Adresse wird gezählt, aber nichts versendet. */
  email: string | null | undefined;
}

export interface MailPlan {
  /** Neuer Zählerstand zum Speichern, oder null: nichts ändern. */
  stand: NichtErreichtMailStand | null;
  /** Welche Mail jetzt geht, oder null. */
  mail: { nummer: NichtErreichtMailNummer; vorlage: string; versuch: number } | null;
}

/**
 * Reine Entscheidung: Welche Mail geht bei diesem verpassten Anruf?
 *
 * Ohne Seiteneffekte, damit sie sich vollständig testen lässt.
 */
export function planeNichtErreichtMail(e: MailPlanEingabe): MailPlan {
  if (e.fortgeschritten) return { stand: null, mail: null };

  const partnerId = (e.partnerId || "").trim();
  const alt = leseMailStand(e.bisher);
  // Anderer Partner als beim letzten Mal: Für den Lead beginnt es von vorn.
  const basis: NichtErreichtMailStand =
    alt && alt.partnerId === partnerId ? alt : { partnerId, versuche: 0, gesendet: [] };

  const versuch = basis.versuche + 1;
  const nummer = MAIL_BEI_VERSUCH[versuch];
  const hatAdresse = !!(e.email || "").trim();
  const schonGesendet = basis.gesendet.includes(versuch);

  if (!nummer || !hatAdresse || schonGesendet) {
    return { stand: { ...basis, versuche: versuch }, mail: null };
  }
  return {
    stand: { partnerId, versuche: versuch, gesendet: [...basis.gesendet, versuch] },
    mail: { nummer, vorlage: NICHT_ERREICHT_VORLAGEN[nummer], versuch },
  };
}

/**
 * Rückfall, wenn niemand zuständig ist.
 *
 * Dann unterschreibt nicht die Person, die zufällig geklickt hat, etwa die
 * Setterin, sondern das Haus. Der Lead kennt sie nicht, und eine Antwort an
 * ihre Adresse würde beim nächsten Partner nie ankommen. office@ liest das
 * Büro, von dort wird weitergegeben. Dieselben Werte stehen serverseitig in
 * supabase/functions/_shared/zustaendiger-absender.ts.
 */
export const TEAM_ABSENDER = { name: "OS Immobilien Team", email: "os@os-immobilien.com" } as const;

export interface MailAnfrageEingabe {
  kontaktId: string;
  email: string;
  kundeName: string;
  partnerId: string | null | undefined;
  vorlage: string;
}

/**
 * Der Aufruf an send-transactional-email.
 *
 * Absender ist immer der zuständige Partner aus `zustaendig_id`. Wer klickt,
 * spielt keine Rolle, deshalb nimmt die Funktion den angemeldeten Nutzer gar
 * nicht erst entgegen. Der Server liest `zustaendig_id` zur Sicherheit noch
 * einmal selbst aus der Datenbank (der Zwischenspeicher im Browser kann eine
 * Umverteilung verpasst haben), setzt Absendername, Antwortadresse und
 * Buchungslink und unterschreibt mit dem Partner.
 */
export function nichtErreichtMailAnfrage(e: MailAnfrageEingabe) {
  const partnerId = (e.partnerId || "").trim();
  return {
    templateName: e.vorlage,
    recipientEmail: e.email.trim(),
    // Je Kontakt, Partner und Mail höchstens eine, auch bei Doppelklick.
    idempotencyKey: `${e.vorlage}-${e.kontaktId}-${partnerId || "team"}`,
    // Über den Kontakt ermittelt der Server Sprache und Partner.
    kontaktId: e.kontaktId,
    templateData: {
      name: e.kundeName,
      ...(partnerId ? { beraterUserId: partnerId } : { berater: { ...TEAM_ABSENDER } }),
    },
  };
}

export interface KontaktFuerMail {
  id: string;
  email?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  zustaendig_id?: string | null;
  nichtErreichtMails?: unknown;
}

/**
 * Für die Aufrufstellen: entscheiden, bei Bedarf versenden, neuen Stand
 * zurückgeben. Der Aufrufer speichert den Stand mit seinem ohnehin fälligen
 * `updateKontakt`, damit es bei einem Schreibvorgang bleibt.
 *
 * Der Versand läuft im Hintergrund. Scheitert er, wird das protokolliert,
 * der Anruf selbst ist trotzdem erfasst.
 */
export function nichtErreichtMailVerarbeiten(
  kontakt: KontaktFuerMail,
  optionen: { fortgeschritten: boolean },
): NichtErreichtMailStand | null {
  const plan = planeNichtErreichtMail({
    bisher: kontakt.nichtErreichtMails,
    partnerId: kontakt.zustaendig_id,
    fortgeschritten: optionen.fortgeschritten,
    email: kontakt.email,
  });
  if (plan.mail && kontakt.email) {
    const body = nichtErreichtMailAnfrage({
      kontaktId: kontakt.id,
      email: kontakt.email,
      kundeName: `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim(),
      partnerId: kontakt.zustaendig_id,
      vorlage: plan.mail.vorlage,
    });
    const vorlage = plan.mail.vorlage;
    (async () => {
      // Projektregel: vor einem Kundenversand aus dem CRM einmal die Sprache
      // sichern. Fragt nur, solange für den Kontakt noch keine gewählt ist.
      // Dynamisch geladen wie in buchungslinkMail.ts, damit die reine Logik
      // oben ohne Dialog und Zwischenspeicher testbar bleibt.
      const sprache = await (await import("./kundenSprache")).stelleKundenspracheSicher(kontakt.id);
      await supabase.functions.invoke("send-transactional-email", { body: { ...body, sprache } });
    })().catch((fehler) => console.error(`${vorlage}: Mail an den Lead fehlgeschlagen`, fehler));
  }
  return plan.stand;
}
