/**
 * Was nach dem Absenden des Handbuch-Konfigurators auf dem Server passiert.
 *
 * `submit-lead` legt den Kontakt an (oder hängt die Anfrage an eine
 * Dublette) und ruft dann diese Funktion. Sie
 *
 *   1. sucht das Investment des Kontakts. Für einen neuen Kontakt hat der
 *      Trigger `trg_auto_create_investment` es bereits angelegt (Migration
 *      20260622163050). Fehlt es trotzdem, wird es hier auf dieselbe Weise
 *      angelegt;
 *   2. legt den persönlichen Link zur Selbstauskunft an, mit Vorbelegung aus
 *      den Antworten und 30 statt 7 Tagen Laufzeit (nur auf diesem Weg).
 *      Seit dem 26.09.2026 ist das genau die Selbstauskunft wie bei „An Kunde
 *      senden“ im Kundenprofil: derselbe Token in `sa_fill_tokens`, dieselbe
 *      Seite `/sa/:token`, dieselbe Mailvorlage `sa-invitation`;
 *   3. legt die Zeile in `handbuch_anforderungen` an, mit dem Token des
 *      Handbuchs. Fehlt die Tabelle (Migration noch nicht gelaufen), geht es
 *      ohne weiter: Der Besucher sieht sein Handbuch trotzdem sofort, nur der
 *      Link in der Mail fehlt, und die Mail geht deshalb nicht raus;
 *   4. verschickt die Zustellmail „handbuch-zustellung“. Absender ist der
 *      zuständige Partner („Name | OS Immobilien“, Antworten an ihn), ohne Partner
 *      das OS Immobilien Team. Das regelt `send-transactional-email` selbst über
 *      `absender: 'zustaendiger-partner'`.
 *
 * Bei der offenen Selbstauskunft (ohne Handbuch) geht statt der Zustellmail
 * die Mail mit dem Selbstauskunft-Link hinaus (`sa-invitation`), beim neuen
 * Kontakt an die eingegebene, bei einer über die E-Mail erkannten Dublette an
 * die gespeicherte Adresse. Die Bestätigungsmails an Leads sind seit dem
 * 26.09.2026 entfallen.
 *
 * Liegt die Selbstauskunft eines über die E-Mail erkannten Kontakts schon
 * unterschrieben vor, entsteht kein neuer Link. Dann geht an die gespeicherte
 * Adresse die Mail „selbstauskunft-liegt-vor“ (der Ansprechpartner meldet
 * sich), und der zuständige Partner bekommt eine Glocke, ohne Partner die
 * Leitung (HB-009).
 *
 * Fehler werden protokolliert und stoppen nichts: Der Lead ist zu diesem
 * Zeitpunkt schon gespeichert und darf nicht verloren gehen.
 */
import {
  HANDBUCH_GUELTIG_TAGE,
  ermittleAusgang,
  handbuchRahmen,
  saVorbelegung,
  type HandbuchAntworten,
} from "./handbuch-funnel.ts";
import { sendeVorlage } from "./transactional-versand.ts";
import { zustaendigerAnsprechpartner } from "./zustaendiger-ansprechpartner.ts";
import { kundenSprache } from "./kunden-sprache.ts";

/** Die öffentliche Adresse für Links in Mails. Wie `SA_FILL_BASE_URL` in send-sa-invitation. */
export const HANDBUCH_BASIS_URL = "https://osimmobilien.netlify.app";

/** `?lang=en` für englische Links, damit die Seite in der Sprache der Mail öffnet. */
function sprachZusatz(sprache?: string | null): string {
  return sprache === "en" ? "?lang=en" : "";
}

export function handbuchLink(token: string, sprache?: string | null): string {
  return `${HANDBUCH_BASIS_URL}/handbuch/ergebnis/${token}${sprachZusatz(sprache)}`;
}

/**
 * Der persönliche Link zur Selbstauskunft. Seit dem 26.09.2026 dieselbe
 * Seite wie beim Versand aus dem Kundenprofil (`send-sa-invitation`).
 */
export function saLinkHandbuch(saToken: string, sprache?: string | null): string {
  return `${HANDBUCH_BASIS_URL}/sa/${saToken}${sprachZusatz(sprache)}`;
}

/**
 * Die offene Selbstauskunft ohne Token, mit Kürzel die eines Partners. Für
 * jeden, der keinen gültigen persönlichen Link hat (Dublette, abgelaufen,
 * weitergegeben). Sie legt beim Absenden einen Lead an, siehe `submit-lead`.
 */
export function offenerSaLink(kuerzel?: string | null): string {
  const k = (kuerzel || "").trim();
  return `${HANDBUCH_BASIS_URL}/handbuch${k ? `/${encodeURIComponent(k)}` : ""}/selbstauskunft`;
}

/** Die Notiz am Kontakt, wenn er über die offene Selbstauskunft kam. */
export const HANDBUCH_SA_OFFEN_NOTIZ =
  "Über die offene Selbstauskunft der Handbuch-Seite: möchte die Selbstauskunft ausfüllen. " +
  "Den persönlichen Link hat das System automatisch per E-Mail geschickt, bei einem schon " +
  "bekannten Kontakt an die gespeicherte Adresse.";

/**
 * Die Antwort an den Browser auf beiden Wegen der Handbuch-Seite, für einen
 * neuen Kontakt wie für eine Dublette in derselben Form. Keine
 * Kontaktkennung, kein Partner, kein Merkmal „bekannt“: Wer nur die Adresse
 * eines Kunden kennt, soll aus der Antwort nichts lernen. Ein fehlendes
 * Token hat mehrere mögliche Gründe (Dublette, Migration fehlt, Fehler).
 */
export function handbuchAntwort(e: Pick<HandbuchAnlageErgebnis, "handbuchToken" | "saToken" | "zustellung"> | null): HandbuchBrowserAntwort {
  return { success: true, handbuchToken: e?.handbuchToken ?? null, saToken: e?.saToken ?? null, zustellung: e?.zustellung ?? "ok" };
}

/**
 * Dieselbe Antwort für eine Dublette: nie ein Token, aber `zustellung` wie
 * bei einem neuen Kontakt. So sieht der Browser, ob etwas technisch
 * gescheitert ist, erfährt aber nicht, ob die Adresse bekannt war.
 */
export function handbuchDublettenAntwort(e: Pick<HandbuchAnlageErgebnis, "zustellung"> | null): HandbuchBrowserAntwort {
  return handbuchAntwort({ handbuchToken: null, saToken: null, zustellung: e?.zustellung ?? "ok" });
}

export interface HandbuchBrowserAntwort {
  success: true;
  handbuchToken: string | null;
  saToken: string | null;
  /**
   * `fehler`: Ein Schritt, der hätte stattfinden sollen, ist technisch
   * gescheitert (Investment, Selbstauskunft-Link, Mail). Die Seite bittet
   * dann, es gleich noch einmal zu versuchen. Bewusst stille Fälle (Dublette
   * über Telefon) sind `ok`, sonst verriete das Feld eine bekannte Adresse.
   */
  zustellung: "ok" | "fehler";
}

/**
 * Welcher Konfigurator-Stand am bestehenden Kontakt stehen soll, wenn eine
 * Dublette hereinkommt (Befund HB-001).
 *
 * Der erste Stand bleibt. Sonst koennte jeder, der die Adresse eines Kunden
 * kennt, dessen Angaben im Kundenprofil („Aus dem Konfigurator“) mit eigenen
 * Antworten ueberschreiben. Verloren geht die neue Einsendung trotzdem nicht:
 * Sie steht mit Antworten, Ausgang, Rahmen und Zeitpunkt in
 * `weitereAnfragen`, ihr Text in der Notiz („Neue Anfrage … über
 * Konfigurator“), und sie bekommt ihre eigene Zeile in
 * `handbuch_anforderungen`. Nur ein Kontakt ohne Stand bekommt den neuen.
 *
 * Gibt zurueck, was in `meta` gemischt wird, sonst ein leeres Objekt.
 */
export function handbuchFunnelFuerDublette(
  bestehendeMeta: Record<string, unknown>,
  neuerFunnel: unknown,
): Record<string, unknown> {
  if (!neuerFunnel || typeof neuerFunnel !== "object") return {};
  if (bestehendeMeta.handbuchFunnel) return {};
  return { handbuchFunnel: neuerFunnel };
}

export interface HandbuchAnlageEingabe {
  kontaktId: string;
  beraterId: string | null;
  vorname: string;
  nachname: string;
  email: string;
  /** Handynummer aus dem Formular, zur Vorbelegung der Selbstauskunft (nur neuer Kontakt). */
  telefon?: string;
  /**
   * Die sechs Antworten des Konfigurators. `null` bei der offenen
   * Selbstauskunft: Dann entsteht nur der Link zur Selbstauskunft, ohne
   * Handbuch-Zeile und ohne Zustellmail.
   */
  antworten: HandbuchAntworten | null;
  token: string;
  /** Sprache der Seite. Gilt nur für einen neuen Kontakt, siehe `spracheFuerHandbuch`. */
  sprache?: string | null;
  /**
   * Die Anfrage gehört zu einem bestehenden Kontakt (Dublette). Dann gilt
   * das Vorsichtsprinzip der Sicherheitsprüfung vom 26.09.2026, seit dem
   * Abend desselben Tages so:
   *
   *   - Der Browser bekommt nie einen Link (siehe `handbuchAntwort`). Wer nur
   *     die Adresse eines Kunden kennt, soll keine fremde Akte sehen oder
   *     befüllen können.
   *   - Wurde der Kontakt über die E-Mail erkannt, entsteht der Link zur
   *     Selbstauskunft trotzdem und geht per Mail an die GESPEICHERTE Adresse.
   *     Der Mail-Link belegt, dass die Adresse dem gehört, der ihn öffnet.
   *     Name und Adresse am Link sind die gespeicherten, vorbelegt wird nur
   *     der angefangene Stand am Investment, nichts aus dem Formular.
   *   - Bei Erkennung über Telefon und Nachname geht keine Mail hinaus und es
   *     entsteht kein Link: Die eingegebene Adresse ist dann eine andere als
   *     die gespeicherte, und wer die Anfrage stellt, ist nicht belegt.
   */
  dublette?: { erkanntUeber: "email" | "telefon"; gespeicherteEmail: string; gespeicherterName?: string } | null;
}

export interface HandbuchAnlageErgebnis {
  /** Token des Handbuchs, nur wenn die Zeile gespeichert ist. */
  handbuchToken: string | null;
  saToken: string | null;
  investmentId: string | null;
  mailVerschickt: boolean;
  /** Mail mit dem Selbstauskunft-Link (offene Selbstauskunft) verschickt. */
  saMailVerschickt?: boolean;
  /** Siehe `HandbuchBrowserAntwort.zustellung`, abgeleitet aus `hinweise`. */
  zustellung: "ok" | "fehler";
  /** Stichworte für das Protokoll, ohne personenbezogene Daten. */
  hinweise: string[];
}

/** Hinweise, die ein technisches Scheitern bedeuten. Alles andere ist Absicht oder fehlende Migration. */
const TECHNISCHE_FEHLER = new Set(["investment_fehler", "sa_link_fehler", "sa_mail_fehler", "sa_liegt_vor_mail_fehler", "mail_fehler"]);

export function zustellungAus(hinweise: readonly string[]): "ok" | "fehler" {
  return hinweise.some((h) => TECHNISCHE_FEHLER.has(h)) ? "fehler" : "ok";
}

function tabelleFehlt(fehler: { code?: string; message?: string } | null | undefined): boolean {
  const msg = String(fehler?.message || "");
  return fehler?.code === "42P01" || fehler?.code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * Wählt das Investment, an dem die Selbstauskunft hängen soll: das jüngste
 * ohne unterschriebene Selbstauskunft. Hat der Kontakt nur unterschriebene,
 * gibt es keinen neuen Link; das Handbuch kommt trotzdem.
 */
export function waehleInvestment(
  zeilen: Array<{ id: string; erstellt_am?: string | null; meta?: Record<string, unknown> | null }>,
): { id: string; saUnterschrieben: boolean; saEntwurf: Record<string, unknown> | null } | null {
  if (zeilen.length === 0) return null;
  const sortiert = [...zeilen].sort((a, b) => String(b.erstellt_am || "").localeCompare(String(a.erstellt_am || "")));
  const offen = sortiert.find((z) => z.meta?.saSigned !== true);
  // Der angefangene Stand am Investment, wie ihn „An Kunde senden“ mitschickt.
  const entwurf = (z: typeof sortiert[number]) => {
    const d = z.meta?.saData;
    return d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
  };
  if (offen) return { id: offen.id, saUnterschrieben: false, saEntwurf: entwurf(offen) };
  return { id: sortiert[0].id, saUnterschrieben: true, saEntwurf: null };
}

/**
 * Was die Selbstauskunft vorbelegt. Neuer Kontakt: Antworten, Handynummer und
 * Name aus dem Formular. Dublette: nur der angefangene Stand am Investment und
 * der gespeicherte Name, nie etwas aus dem Formular, denn wer es ausgefüllt
 * hat, ist nicht belegt.
 *
 * Vor- und Nachname stehen seit dem 26.09.2026 getrennt in der Vorbelegung.
 * Die Seite des anonymen Besuchers kann den Kontakt nicht lesen und hat
 * vorher den Anzeigenamen am ersten Leerzeichen zerlegt (aus „Anna Maria
 * Müller“ wurde Nachname „Maria Müller“). Ein Name im Entwurf hat Vorrang.
 */
export function saVorbelegungFuer(
  e: Pick<HandbuchAnlageEingabe, "antworten" | "telefon" | "dublette" | "vorname" | "nachname">,
  entwurf: Record<string, unknown> | null,
  gespeicherterName?: { vorname?: string | null; nachname?: string | null } | null,
): Record<string, unknown> {
  if (e.dublette) return mitNamen(entwurf ?? {}, gespeicherterName?.vorname, gespeicherterName?.nachname);
  const telefon = (e.telefon || "").trim();
  return mitNamen({ ...(e.antworten ? saVorbelegung(e.antworten) : {}), ...(telefon ? { telefon } : {}) }, e.vorname, e.nachname);
}

function mitNamen(basis: Record<string, unknown>, vorname?: string | null, nachname?: string | null): Record<string, unknown> {
  const gefuellt = (w: unknown) => typeof w === "string" && w.trim() !== "";
  if (gefuellt(basis.vorname) || gefuellt(basis.nachname)) return basis;
  const v = (vorname || "").trim();
  const n = (nachname || "").trim();
  return v || n ? { ...basis, vorname: v, nachname: n } : basis;
}

/**
 * In welcher Sprache Mail und Links hinausgehen.
 *
 * Ein bekannter Kontakt (Dublette, Einladungslink) bekommt seine Profilsprache,
 * nicht die der Seite, auf der das Formular gerade abgeschickt wurde (M14 vom
 * 04.10.2026). Ein neuer Kontakt die Sprache der Seite.
 */
export async function spracheFuerHandbuch(
  supabase: any,
  e: Pick<HandbuchAnlageEingabe, "kontaktId" | "sprache" | "dublette">,
): Promise<string | null> {
  if (e.dublette) return await kundenSprache(supabase, { kontaktId: e.kontaktId });
  return e.sprache ?? null;
}

export async function handbuchNachLeadAnlegen(
  supabase: any,
  e: HandbuchAnlageEingabe,
): Promise<HandbuchAnlageErgebnis> {
  const sprache = await spracheFuerHandbuch(supabase, e);
  const hinweise: string[] = [];
  const ergebnis: HandbuchAnlageErgebnis = {
    handbuchToken: null,
    saToken: null,
    investmentId: null,
    mailVerschickt: false,
    hinweise,
    zustellung: "ok",
  };
  const fertig = () => {
    ergebnis.zustellung = zustellungAus(hinweise);
    return ergebnis;
  };
  const ablauf = new Date(Date.now() + HANDBUCH_GUELTIG_TAGE * 24 * 3600 * 1000).toISOString();

  // 1. Investment
  let investment: { id: string; saUnterschrieben: boolean; saEntwurf: Record<string, unknown> | null } | null = null;
  try {
    const { data, error } = await supabase
      .from("investments")
      .select("id, erstellt_am, meta")
      .eq("kunde_id", e.kontaktId);
    if (error) throw error;
    investment = waehleInvestment((data || []) as any[]);
    if (!investment) {
      // Wie der Trigger: ein leeres Investment in der Stufe Erstgespraech.
      const { data: neu, error: neuFehler } = await supabase
        .from("investments")
        .insert({ kunde_id: e.kontaktId, meta: { nummer: 1, label: "Investment 1", pipelineStufe: "erstgespraech" } })
        .select("id")
        .single();
      if (neuFehler) throw neuFehler;
      investment = { id: String(neu.id), saUnterschrieben: false, saEntwurf: null };
      hinweise.push("investment_angelegt");
    }
    ergebnis.investmentId = investment.id;
  } catch (fehler) {
    console.error("Handbuch: Investment nicht ermittelbar:", fehler instanceof Error ? fehler.message : fehler);
    hinweise.push("investment_fehler");
  }

  // 2. Selbstauskunft-Link. Bei einer Dublette nur, wenn sie über die E-Mail
  //    erkannt wurde, und dann mit den gespeicherten Angaben (siehe `dublette`).
  const dubletteOhneMail = !!e.dublette && (e.dublette.erkanntUeber !== "email" || !e.dublette.gespeicherteEmail.trim());
  // Hierhin geht jede Mail dieses Vorgangs: neu an die eingegebene, bei einer
  // Dublette an die gespeicherte Adresse.
  const empfaenger = e.dublette ? (dubletteOhneMail ? "" : e.dublette.gespeicherteEmail.trim()) : e.email;
  if (dubletteOhneMail) {
    hinweise.push("dublette_ohne_sa_link");
  } else if (investment && !investment.saUnterschrieben) {
    try {
      const name = e.dublette ? (e.dublette.gespeicherterName || "").trim() || `${e.vorname} ${e.nachname}`.trim() : `${e.vorname} ${e.nachname}`.trim();
      // Bei einer Dublette die gespeicherten Namensteile, nicht die aus dem Formular.
      let gespeicherterName: { vorname?: string | null; nachname?: string | null } | null = null;
      if (e.dublette) {
        const { data: k } = await supabase.from("kontakte").select("vorname, nachname").eq("id", e.kontaktId).maybeSingle();
        gespeicherterName = k ?? null;
      }
      const { data, error } = await supabase
        .from("sa_fill_tokens")
        .insert({
          kontakt_id: e.kontaktId,
          investment_id: investment.id,
          email: empfaenger,
          name,
          created_by: null,
          prefill_data: saVorbelegungFuer(e, investment.saEntwurf, gespeicherterName),
          person_nr: 1,
          expires_at: ablauf,
        })
        .select("token")
        .single();
      if (error) throw error;
      ergebnis.saToken = String(data.token);
    } catch (fehler) {
      console.error("Handbuch: Selbstauskunft-Link nicht angelegt:", fehler instanceof Error ? fehler.message : fehler);
      hinweise.push("sa_link_fehler");
    }
  } else if (investment?.saUnterschrieben) {
    hinweise.push("sa_bereits_unterschrieben");
  }

  // Offene Selbstauskunft: kein Handbuch, also weder Zeile noch Zustellmail,
  // sondern die Mail mit dem Selbstauskunft-Link wie bei „An Kunde senden“.
  if (!e.antworten) {
    if (ergebnis.saToken && empfaenger) {
      ergebnis.saMailVerschickt = await sendeSaLink(supabase, {
        kontaktId: e.kontaktId,
        empfaenger,
        name: e.dublette ? (e.dublette.gespeicherterName || "").trim() || e.vorname : `${e.vorname} ${e.nachname}`.trim(),
        saToken: ergebnis.saToken,
        // Bei einer Dublette entscheidet das Kundenprofil über die Sprache.
        sprache,
      });
      if (!ergebnis.saMailVerschickt) hinweise.push("sa_mail_fehler");
    } else if (investment?.saUnterschrieben && e.dublette && empfaenger) {
      // Die Selbstauskunft liegt schon vor: Bescheid an den Kunden, Glocke an
      // den Partner. Die Glocke hält nichts auf, die Mail entscheidet über
      // `zustellung`.
      const name = (e.dublette.gespeicherterName || "").trim();
      const berater = await zustaendigerAnsprechpartner(supabase, e.kontaktId);
      const versand = await sendeVorlage(supabase, {
        templateName: "selbstauskunft-liegt-vor",
        recipientEmail: empfaenger,
        idempotencyKey: `sa-liegt-vor-${e.kontaktId}-${crypto.randomUUID()}`,
        kontaktId: e.kontaktId,
        templateData: {
          name,
          ...(berater ? { berater } : {}),
        },
      });
      if (!versand.ok) {
        console.error("Handbuch: Mail „Selbstauskunft liegt vor“ nicht verschickt:", versand.grund);
        hinweise.push("sa_liegt_vor_mail_fehler");
      }
      await glockeSaAktualisieren(supabase, { kontaktId: e.kontaktId, beraterId: e.beraterId, name });
    }
    return fertig();
  }
  const antworten = e.antworten;

  // 3. Handbuch-Zeile
  try {
    const { error } = await supabase.from("handbuch_anforderungen").insert({
      token: e.token,
      kontakt_id: e.kontaktId,
      investment_id: investment?.id ?? null,
      berater_id: e.beraterId,
      vorname: e.vorname,
      nachname: e.nachname,
      antworten,
      ausgang: ermittleAusgang(antworten),
      sa_token: ergebnis.saToken,
      gueltig_bis: ablauf,
    });
    if (error) throw error;
    ergebnis.handbuchToken = e.token;
  } catch (fehler) {
    const f = fehler as { code?: string; message?: string };
    if (tabelleFehlt(f)) hinweise.push("migration_handbuch_fehlt");
    else console.error("Handbuch: Anforderung nicht gespeichert:", f?.message);
    hinweise.push("handbuch_nicht_gespeichert");
  }

  // 4. Zustellmail, nur mit gespeichertem Handbuch: ohne Zeile führte der
  //    Link ins Leere. Bei einer Dublette nur an die gespeicherte Adresse
  //    und nur, wenn sie über die E-Mail erkannt wurde (`empfaenger` oben).
  if (e.dublette && !empfaenger) hinweise.push("dublette_ohne_mail");
  if (ergebnis.handbuchToken && empfaenger) {
    try {
      const r = handbuchRahmen(antworten);
      const { data, error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "handbuch-zustellung",
          recipientEmail: empfaenger,
          kontaktId: e.kontaktId,
          idempotencyKey: `handbuch-zustellung-${e.token}`,
          ...(sprache ? { sprache } : {}),
          templateData: {
            // Vor- und Nachname: Die Mail siezt seit dem 27.09.2026 und grüßt
            // mit „Guten Tag Vorname Nachname,“. Englisch nimmt nur den Vornamen.
            name: `${e.vorname} ${e.nachname}`.trim(),
            handbuchLink: handbuchLink(e.token, sprache),
            saLink: ergebnis.saToken ? saLinkHandbuch(ergebnis.saToken, sprache) : "",
            ausgang: ermittleAusgang(antworten),
            rahmenVon: r.von,
            rahmenBis: r.bis,
            gueltigTage: HANDBUCH_GUELTIG_TAGE,
          },
        },
      });
      if (error) throw error;
      // Eine gesperrte Adresse beantwortet der Versand mit 200 und
      // `success: false`. Das ist kein Versand.
      const antwort = data as { success?: boolean; reason?: string } | null;
      if (antwort && antwort.success === false) throw new Error(`nicht versendet: ${antwort.reason ?? "ohne Grund"}`);
      ergebnis.mailVerschickt = true;
      await supabase
        .from("handbuch_anforderungen")
        .update({ mail_gesendet_am: new Date().toISOString() })
        .eq("token", e.token);
    } catch (fehler) {
      console.error("Handbuch: Zustellmail nicht verschickt:", fehler instanceof Error ? fehler.message : fehler);
      hinweise.push("mail_fehler");
    }
  }

  return fertig();
}

export const SA_AKTUALISIEREN_TITEL = "Kunde möchte seine Selbstauskunft aktualisieren";
/** Wer die Glocke ohne zuständigen Partner bekommt. */
export const SA_AKTUALISIEREN_LEITUNG = ["admin", "inhaber", "vertriebsleiter"] as const;

/**
 * Glocke „Kunde möchte seine Selbstauskunft aktualisieren“ an den
 * zuständigen Partner, ohne Partner an die Leitung. Wie die übrigen Glocken
 * in `submit-lead`: Zeile in `benachrichtigungen`, Text als JSON. Wirft nie.
 */
async function glockeSaAktualisieren(
  supabase: any,
  a: { kontaktId: string; beraterId: string | null; name: string },
): Promise<void> {
  try {
    let empfaenger: string[] = a.beraterId ? [a.beraterId] : [];
    if (empfaenger.length === 0) {
      const { data } = await supabase.from("user_roles").select("user_id").in("role", SA_AKTUALISIEREN_LEITUNG as unknown as string[]);
      empfaenger = Array.from(new Set(((data || []) as Array<{ user_id?: string }>).map((r) => r.user_id).filter(Boolean))) as string[];
    }
    if (empfaenger.length === 0) {
      console.warn("Handbuch: keine Empfaenger fuer die Glocke Selbstauskunft aktualisieren", a.kontaktId);
      return;
    }
    const text =
      `${a.name || "Ein Kunde"} hat über die Handbuch-Seite die Selbstauskunft angefordert. Sie liegt bereits unterschrieben vor. ` +
      "Der Kunde hat per Mail erfahren, dass sich sein Ansprechpartner meldet. Bitte melde dich bei ihm.";
    const { error } = await supabase.from("benachrichtigungen").insert(
      empfaenger.map((uid) => ({
        benutzer_id: uid,
        titel: SA_AKTUALISIEREN_TITEL,
        nachricht: JSON.stringify({ text, notif_type: "handbuch_sa_aktualisieren", kontaktId: a.kontaktId, kontaktName: a.name }),
        link: `/kunden/${a.kontaktId}`,
        gelesen: false,
      })),
    );
    if (error) console.error("Handbuch: Glocke Selbstauskunft aktualisieren fehlgeschlagen:", error.message ?? error);
  } catch (fehler) {
    console.error("Handbuch: Glocke Selbstauskunft aktualisieren fehlgeschlagen:", fehler instanceof Error ? fehler.message : fehler);
  }
}

/**
 * Die Mail mit dem persönlichen Selbstauskunft-Link, genau wie
 * `send-sa-invitation` sie verschickt: Vorlage `sa-invitation`, der
 * zuständige Partner als Unterschrift, Sprache aus dem
 * Kundenprofil. Wirft nie; `false` heißt nicht verschickt.
 */
async function sendeSaLink(
  supabase: any,
  a: { kontaktId: string; empfaenger: string; name: string; saToken: string; sprache: string | null },
): Promise<boolean> {
  try {
    const berater = await zustaendigerAnsprechpartner(supabase, a.kontaktId);
    const versand = await sendeVorlage(supabase, {
      templateName: "sa-invitation",
      recipientEmail: a.empfaenger,
      idempotencyKey: `sa-fill-${a.saToken}`,
      kontaktId: a.kontaktId,
      ...(a.sprache ? { sprache: a.sprache } : {}),
      templateData: {
        kundeName: a.name,
        fillUrl: saLinkHandbuch(a.saToken, a.sprache),
        ...(berater ? { berater } : {}),
      },
    });
    if (!versand.ok) console.error("Handbuch: Selbstauskunft-Mail nicht verschickt:", versand.grund);
    return versand.ok;
  } catch (fehler) {
    console.error("Handbuch: Selbstauskunft-Mail nicht verschickt:", fehler instanceof Error ? fehler.message : fehler);
    return false;
  }
}
