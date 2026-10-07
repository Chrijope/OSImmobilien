/**
 * Wem gehoert ein hereinkommender Lead, und in welcher Pipelinestufe landet er?
 *
 * Die Logik liegt hier und nicht in `submit-lead/index.ts`, weil die Edge
 * Function in Deno laeuft und nichts aus `src/` importieren kann. Getestet wird
 * von `src/lib/leadZuordnung.test.ts`, so wie bei `meta-capi` und
 * `kontakt-dublette`.
 *
 * Zwei Dinge stehen hier zusammen, weil sie zusammengehoeren: Erst wird
 * geprueft, ob eine mitgeschickte Beraterkennung ueberhaupt zu einem Partner
 * gehoert, und genau diese Antwort entscheidet danach ueber die Stufe.
 */

/**
 * Rollen, die eine oeffentliche Partnerseite haben und deshalb einen Lead
 * zugewiesen bekommen duerfen.
 *
 * Dieselbe Liste benutzt `get-vp-microsite`, um ueberhaupt ein Profil
 * herauszugeben. Sie steht hier einmal, damit die beiden Seiten nicht
 * auseinanderlaufen koennen: Wer eine Seite bekommt, bekommt auch die Leads
 * daraus, und wer keine bekommt, auch keine Leads.
 */
export const BERATER_ROLLEN = ["vertriebspartner", "vertriebsleiter", "admin", "inhaber"] as const;

/*
 * Die Vertriebsleitung steht seit dem 24.09.2026 in der Liste. Christian hat
 * entschieden, dass sie einen eigenen Steuerrechner-Link bekommt, damit ein
 * Lead darueber ihr zugeordnet wird und sie die Glocke bekommt. Weil dieselbe
 * Liste auch `get-vp-microsite` und `ensure-vp-slug` steuert, loest ihr
 * Kuerzel damit auch unter /vp/ und /analyse/ auf. Das ist gewollt: Wer einen
 * Link hat, bekommt auch die Leads daraus, auf jedem Weg gleich.
 *
 * Backoffice steht ausdruecklich NICHT hier. Es sieht die Seite
 * Steuerrechner, bekommt aber keinen Link, siehe `hatEigenenPartnerLink`.
 */

/**
 * Bekommt diese Rolle einen eigenen Partnerlink?
 *
 * Fuer die Oberflaeche: Nur dann erscheint auf der Seite Steuerrechner der
 * Knopf zum Teilen, und nur dann wird `ensure-vp-slug` ueberhaupt gerufen.
 * Die Function prueft dieselbe Liste noch einmal selbst, das hier ist nur
 * die Anzeige und keine Zugriffskontrolle.
 */
export function hatEigenenPartnerLink(rolle: unknown): boolean {
  return typeof rolle === "string" && (BERATER_ROLLEN as readonly string[]).includes(rolle);
}

/** Sieht die Zeichenkette wie eine UUID aus? */
export function istUuid(wert: unknown): boolean {
  if (typeof wert !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wert.trim());
}

/** Traegt mindestens eine der Rollenzeilen eine Beraterrolle? */
export function hatBeraterRolle(zeilen: Array<{ role?: unknown }> | null | undefined): boolean {
  const erlaubt = new Set<string>(BERATER_ROLLEN);
  return (zeilen || []).some((z) => typeof z?.role === "string" && erlaubt.has(z.role));
}

/**
 * Warum eine mitgeschickte Beraterkennung verworfen wurde. `"ok"` heisst, sie
 * darf uebernommen werden.
 */
export type KennungBefund =
  | "ok"
  | "kein_uuid_format"
  | "profil_unbekannt"
  | "profil_gesperrt"
  | "keine_beraterrolle"
  | "kuerzel_ungueltig"
  | "kuerzel_unbekannt";

/**
 * Ueber welchen Weg nennt eine Anfrage den Linkinhaber?
 *
 *   "link_kuerzel" – das Kuerzel aus dem persoenlichen Link, also
 *                    /steuer/<kuerzel>, /analyse/<kuerzel> oder
 *                    /vp/<kuerzel>. Der Server ermittelt den Partner selbst
 *                    daraus. Eine mitgeschickte `beraterUserId` zaehlt dann
 *                    nicht mehr, sie wird nur noch protokolliert.
 *   "alter_link"   – nur eine Nutzerkennung, kein Kuerzel. So kommen die
 *                    bereits verschickten Links mit `?b=` herein, in denen die
 *                    Kennung offen im Link steht. Sie funktionieren weiter,
 *                    damit kein Lead im Pool landet, werden aber als "alter
 *                    Link" gekennzeichnet.
 *   "ohne_link"    – weder noch, der Weg der Gesellschaft.
 *
 * Warum das Kuerzel Vorrang hat: Es steht im Link, den der Partner selbst
 * verschickt hat, und der Server loest es selbst auf. Die Kennung dagegen ist
 * ein Wert, den der Browser nach der Aufloesung zurueckschickt, und den kann
 * jeder, der die Anfrage von Hand baut, durch eine fremde ersetzen.
 */
export type ZuordnungsWeg =
  | { weg: "link_kuerzel"; kuerzel: string; kuerzelGueltig: boolean; mitgeschickteKennung: string }
  | { weg: "alter_link"; kennung: string }
  | { weg: "ohne_link" };

/** Dieselbe Pruefung wie in `get-vp-microsite`, damit beide gleich urteilen. */
export function istGueltigesKuerzel(kuerzel: string): boolean {
  return kuerzel.length > 0 && kuerzel.length <= 80 && /^[a-z0-9-]+$/.test(kuerzel);
}

export function waehleZuordnungsWeg(args: {
  beraterSlug?: unknown;
  beraterUserId?: unknown;
}): ZuordnungsWeg {
  const kennung = typeof args.beraterUserId === "string" ? args.beraterUserId.trim() : "";
  const kuerzel = typeof args.beraterSlug === "string" ? args.beraterSlug.trim().toLowerCase() : "";
  if (kuerzel) {
    return {
      weg: "link_kuerzel",
      kuerzel,
      kuerzelGueltig: istGueltigesKuerzel(kuerzel),
      mitgeschickteKennung: kennung,
    };
  }
  if (kennung) return { weg: "alter_link", kennung };
  return { weg: "ohne_link" };
}

/**
 * Beurteilt den Linkinhaber, der ueber ein Kuerzel gefunden wurde.
 *
 * Dieselben Regeln wie bei einer mitgeschickten Kennung: Profil vorhanden,
 * nicht gesperrt, Beraterrolle. Dazu die beiden Faelle, die nur ein Kuerzel
 * haben kann: Es ist gar keins, oder niemand traegt es.
 */
export function beurteileLinkKuerzel(args: {
  kuerzelGueltig: boolean;
  profil: { id?: unknown; gesperrt?: unknown } | null | undefined;
  rollen: Array<{ role?: unknown }> | null | undefined;
}): KennungBefund {
  if (!args.kuerzelGueltig) return "kuerzel_ungueltig";
  if (!args.profil) return "kuerzel_unbekannt";
  return beurteileBeraterKennung({ kennung: args.profil.id, profil: args.profil, rollen: args.rollen });
}

/**
 * Beurteilt eine Beraterkennung aus bereits geladenen Daten.
 *
 * Die Abfragen selbst stehen in der Function, hier steht nur die Entscheidung,
 * damit sie ohne Datenbank pruefbar ist.
 */
export function beurteileBeraterKennung(args: {
  kennung: unknown;
  profil: { id?: unknown; gesperrt?: unknown } | null | undefined;
  rollen: Array<{ role?: unknown }> | null | undefined;
}): KennungBefund {
  if (!istUuid(args.kennung)) return "kein_uuid_format";
  if (!args.profil) return "profil_unbekannt";
  if (args.profil.gesperrt === true) return "profil_gesperrt";
  if (!hatBeraterRolle(args.rollen)) return "keine_beraterrolle";
  return "ok";
}

/**
 * Auf welchem Weg ist der Lead hereingekommen?
 *
 *   "partner_persoenlich" – ueber den personalisierten Link eines Partners,
 *                           also Beraterseite, Analysetool und kuenftig der
 *                           Steuerrechner. Der Lead gehoert dem Partner.
 *   "gesellschaft"        – ueber eine Kampagne des Hauses, also Zapier, Meta
 *                           Lead Ads und alles andere ohne geprueften
 *                           Partnerlink. Der Lead gehoert in die
 *                           Lead-Verwaltung und wird von Hand verteilt.
 */
export type LeadHerkunft = "partner_persoenlich" | "gesellschaft";

/**
 * Die Trennlinie zwischen den beiden Wegen.
 *
 * Massgeblich ist ausschliesslich die serverseitig GEPRUEFTE Beraterkennung,
 * also eine `beraterUserId`, zu der es ein nicht gesperrtes Profil mit
 * Beraterrolle gibt (siehe `beurteileBeraterKennung`). Nur die personalisierten
 * Links tragen sie, und nur sie steht nach der Pruefung fest.
 *
 * Warum ausdruecklich NICHT die anderen naheliegenden Merkmale:
 *
 *   `quelle`      ist ein freier Text aus dem Anfragekoerper. Zapier schickt
 *                 dort, was im Zap steht. Wer "Analysetool" hineinschreibt,
 *                 haette sich damit den persoenlichen Weg erschlichen.
 *   `meta.*`      ebenso, es wird unveraendert aus dem Anfragekoerper
 *                 uebernommen. Auch `meta.pipelineStufe` darf deshalb nichts
 *                 entscheiden, sondern hoechstens den offenen Pool feiner
 *                 unterteilen.
 *   `beraterName` ist ein Namensabgleich gegen die Profile, und genau daran
 *                 hing die Regel bisher. Zapier und Meta schicken sehr oft
 *                 einen Beraternamen mit. Der Abgleich fand dann einen
 *                 Partner, und ein Kampagnenlead des Hauses galt als
 *                 persoenlich gewonnen und verschwand aus der Lead-Verwaltung.
 *                 Ein zufaellig passender Name ist kein Herkunftsnachweis.
 *
 * Die geprueften Kennung laesst sich nicht frei erfinden: Sie muss eine echte
 * UUID sein, zu einem vorhandenen, nicht gesperrten Profil gehoeren und dieses
 * Profil muss eine Beraterrolle tragen. Alles drei wird gegen die Datenbank
 * geprueft, nicht gegen den Anfragekoerper.
 */
export function leadHerkunft(args: { beraterKennungGeprueft: boolean }): LeadHerkunft {
  return args.beraterKennungGeprueft ? "partner_persoenlich" : "gesellschaft";
}

/**
 * Die eine Stelle, an der die Pipelinestufe eines hereinkommenden Leads
 * entschieden wird.
 *
 *   persoenlicher Partnerweg -> "zugewiesen", der Lead liegt sofort beim
 *                               Partner und damit unter seinen Kontakten.
 *   Weg der Gesellschaft     -> "neuer_lead", der Lead steht in der
 *                               Lead-Verwaltung und wird von Hand verteilt.
 *
 * Zur Aufloesung eines scheinbaren Widerspruchs: Der Namensabgleich darf
 * weiterhin die ZUSTAENDIGKEIT setzen, also `zustaendig_id` und `berater`. Er
 * entscheidet aber nicht mehr ueber die STUFE. Beides ist nicht dasselbe:
 * Zustaendigkeit heisst "wer arbeitet daran", Stufe heisst "wo steht der
 * Vorgang". Ein Zapier-Lead mit erkanntem Beraternamen ist deshalb zugleich
 * einem Partner zugewiesen UND steht in der Lead-Verwaltung, weil er aus einer
 * Kampagne des Hauses stammt und die Fuehrung ihn dort sehen muss. Der Partner
 * verliert nichts: Er sieht den Lead ueber `zustaendig_id` bei seinen
 * Kontakten.
 *
 * Eine Terminbuchung bleibt unberuehrt, sie hat ihre eigene Stufe.
 * Eine ausdrueckliche Vorgabe des Aufrufers zaehlt nur auf dem Weg der
 * Gesellschaft. Sonst koennte ein oeffentliches Formular die Regel aushebeln.
 */
export function pipelineStufeFuerLead(args: {
  istTerminLead: boolean;
  persoenlicherPartnerWeg: boolean;
  vorgabe?: unknown;
}): string {
  if (args.istTerminLead) return "termin_gebucht";
  if (args.persoenlicherPartnerWeg) return "zugewiesen";
  if (typeof args.vorgabe === "string" && args.vorgabe.trim()) return args.vorgabe.trim();
  return "neuer_lead";
}

/**
 * Worueber ist der Lead hereingekommen? Fuer die Glocke des Partners.
 *
 * Die Bezeichnung ist reine Anzeige und darf deshalb aus `quelle` kommen. Sie
 * entscheidet nichts, das hat `leadHerkunft` bereits getan.
 *
 * Der Steuerrechner steht schon hier, obwohl er noch keine Leads schickt. So
 * muss beim Anschluss nur die Quelle stimmen, und niemand sucht spaeter, warum
 * in der Glocke der falsche Weg steht.
 *
 * Die Reihenfolge entscheidet, das erste passende Muster gewinnt. Der EXPATS
 * Calculator steht deshalb VOR dem allgemeinen Steuerrechner: Er ist ein
 * eigener Weg mit eigener Sprache und eigenen Annahmen, und in der Glocke soll
 * sein Name stehen und nicht "den Steuerrechner".
 *
 * Wichtig fuer heute: Leads aus dem EXPATS Calculator kommen ohne gepruefte
 * Beraterkennung herein, gehen also den Weg der Gesellschaft in die
 * Lead-Verwaltung. Die Partnerglocke laeuft auf diesem Weg gar nicht, dieses
 * Muster greift also erst, wenn der Rechner einmal an einen persoenlichen
 * Partnerlink gehaengt wird. Es steht trotzdem schon hier, aus demselben Grund
 * wie der Steuerrechner eine Zeile darunter.
 */
const HERKUNFT_MUSTER: Array<{ treffer: RegExp; text: string }> = [
  // Vor dem Steuerrechner und der Beraterseite: Die Handbuch-Seite ist ein
  // eigener Weg, seit dem 26.09.2026. Ihre Leads tragen die Quelle
  // „Konfigurator“, aeltere noch „Handbuch-Seite“.
  { treffer: /handbuch|konfigurator/i, text: "deine Handbuch-Seite" },
  { treffer: /expats/i, text: "den EXPATS Calculator" },
  { treffer: /steuer/i, text: "den Steuerrechner" },
  { treffer: /analyse/i, text: "das Analysetool" },
  { treffer: /microseite|landingpage|beraterseite|tippgeber/i, text: "deine Beraterseite" },
];

export function herkunftBezeichnung(quelle: unknown, microseiteSlug?: unknown): string {
  const text = typeof quelle === "string" ? quelle : "";
  for (const muster of HERKUNFT_MUSTER) {
    if (muster.treffer.test(text)) return muster.text;
  }
  if (typeof microseiteSlug === "string" && microseiteSlug.trim()) return "deine Beraterseite";
  return "deinen persönlichen Link";
}

/**
 * Welcher Name gehoert in die Spalte `berater`?
 *
 * Diese Spalte ist es, die im Kundenprofil unter Stammdaten als
 * "Vertriebspartner" erscheint. Sie ist zugleich der Schluessel, mit dem das
 * Kundenprofil an mehreren Stellen prueft, ob ein Kunde dem angemeldeten
 * Partner gehoert (Vergleich `kunde.berater === user.name`).
 *
 * Deshalb gewinnt der Name aus dem PROFIL. Der mitgeschickte `beraterName` ist
 * freier Text aus einem oeffentlichen Formular: Schon eine abweichende
 * Schreibweise haette in den Stammdaten einen anderen Namen angezeigt als den
 * des Partners, dem der Lead ueber `zustaendig_id` tatsaechlich gehoert, und
 * dem Partner die Rechte an seinem eigenen Lead genommen.
 *
 * Der gelieferte Name bleibt der Notnagel, falls im Profil keiner steht. Ein
 * leeres Feld waere schlechter als ein ungenauer Name.
 */
export function beraterAnzeigename(args: {
  profilName?: unknown;
  gelieferterName?: unknown;
}): string {
  const ausProfil = typeof args.profilName === "string" ? args.profilName.trim() : "";
  if (ausProfil) return ausProfil;
  const geliefert = typeof args.gelieferterName === "string" ? args.gelieferterName.trim() : "";
  return geliefert;
}

/** Wer bekommt eine Glocke, wenn ein Lead hereinkommt? */
export interface GlockenPlan {
  /** Der zustaendige Partner: Der Lead gehoert ihm. */
  partner: boolean;
  /** Der zustaendige Partner, weil ein Termin gebucht wurde. */
  partnerTermin: boolean;
  /** Die Leitung, weil der Lead ohne Zustaendigen in der Lead-Verwaltung liegt. */
  leitung: boolean;
}

/**
 * Die Glocken eines hereinkommenden Leads, an einer Stelle.
 *
 * Zwei Aenderungen gegenueber frueher, beide in Auftrag 3 begruendet:
 *
 *   1. Der Partner bekommt eine Glocke, sobald ein Lead ueber seinen
 *      persoenlichen Link kommt. Bisher erfuhr er davon erst beim naechsten
 *      Login ueber die Inbox-Aufgabe.
 *   2. Die Glocke an die Fuehrung entfaellt fuer genau diese Leads. Sie sagt
 *      "Bitte in der Lead-Verwaltung pruefen" und verlinkt dorthin, wo ein
 *      Partner-Lead gar nicht steht. Fuer die Leads der Gesellschaft bleibt
 *      sie unveraendert.
 *
 * Seit dem 04.10.2026 (M8, Regel vom 29.09.2026 "Glocken nur an den aktuell
 * Zustaendigen, ohne ihn an die Leitung"): Entscheidend ist allein, ob ein
 * Zustaendiger feststeht, nicht mehr der Weg. Ein Lead der Gesellschaft, den
 * der Namensabgleich einem Partner zuordnet, laeutet bei diesem Partner und
 * nicht mehr bei der Leitung. Ohne Zustaendigen laeutet die Leitung, auch bei
 * einer Terminbuchung, die sonst niemand mitbekaeme.
 * `persoenlicherPartnerWeg` bleibt im Aufruf, er steuert nur noch Text und
 * Stufe an anderer Stelle.
 */
export function glockenPlanFuerLead(args: {
  istTerminLead: boolean;
  persoenlicherPartnerWeg: boolean;
  hatZustaendigen: boolean;
}): GlockenPlan {
  return {
    partner: args.hatZustaendigen && !args.istTerminLead,
    partnerTermin: args.hatZustaendigen && args.istTerminLead,
    leitung: !args.hatZustaendigen,
  };
}

/**
 * Kam ein bekannter Kontakt ueber den Link eines ANDEREN Partners herein?
 *
 * Fall aus Christians Entscheidung vom 24.09.2026: Ein Interessent traegt sich
 * ueber den Link von Partner A ein, ist aber schon Kontakt von Partner B.
 * Die Zustaendigkeit bleibt bei B (Bestandsschutz), A bekommt keine
 * Kundendaten, und die Admin-Rolle bekommt einen Hinweis, damit sie den Fall
 * mit beiden klaeren kann.
 *
 * Nur auf dem persoenlichen Partnerweg, also mit geprueftem Linkinhaber. Ein
 * Lead der Gesellschaft hat keinen "fremden" Partner. Hat der Bestand keinen
 * Zustaendigen, liegt er im Pool, und die Pool-Glocke erreicht die Leitung
 * ohnehin.
 */
export function istFremdeDublette(args: {
  persoenlicherPartnerWeg: boolean;
  linkInhaberId: string | null | undefined;
  bestandsZustaendigId: string | null | undefined;
}): boolean {
  if (!args.persoenlicherPartnerWeg) return false;
  if (!args.linkInhaberId || !args.bestandsZustaendigId) return false;
  return args.linkInhaberId !== args.bestandsZustaendigId;
}

/** Wie heisst der Link in der Meldung? Reine Anzeige, entscheidet nichts. */
export function linkBezeichnung(quelle: unknown): string {
  const text = typeof quelle === "string" ? quelle : "";
  if (/expats/i.test(text)) return "EXPATS-Link";
  if (/handbuch|konfigurator/i.test(text)) return "Handbuch-Link";
  if (/steuer/i.test(text)) return "Steuerrechner-Link";
  if (/analyse/i.test(text)) return "Analysetool-Link";
  return "Beraterseiten-Link";
}

/**
 * Titel und Text der Glocke an die Admin-Rolle bei einer fremden Dublette.
 *
 * Nennt nur Namen, keine Kontaktdaten: Die stehen im Kundenprofil, auf das die
 * Glocke verlinkt, und dort greift die Zeilensicherheit.
 */
export function fremdeDublettenMeldung(args: {
  kontaktName: string;
  bisherBei: string;
  linkVon: string;
  quelle: unknown;
}): { titel: string; text: string } {
  const link = linkBezeichnung(args.quelle);
  const bisher = args.bisherBei.trim() || "einem anderen Partner";
  const von = args.linkVon.trim() || "einem anderen Partner";
  return {
    titel: `⚠️ Bekannter Kontakt über fremden ${link}: ${args.kontaktName}, bisher bei ${bisher}, Link von ${von}`,
    text:
      `${args.kontaktName} hat sich über den ${link} von ${von} eingetragen, ist aber bereits Kontakt von ${bisher}. ` +
      `Die Zuständigkeit bleibt bei ${bisher}, ${von} hat keine Kundendaten bekommen. Bitte mit beiden klären.`,
  };
}

/**
 * Die Antwort von submit-lead an den Einsender (Befund HB-002).
 *
 * Nur eine per HMAC-Signatur ausgewiesene Integration erfaehrt Kontakt,
 * Partner und ob der Kontakt schon bekannt war. Jeder andere, also jeder
 * Browser, bekommt fuer einen neuen Lead und fuer eine Dublette dieselbe
 * Antwort. Sonst liesse sich mit einer fremden Adresse oder Nummer
 * herausfinden, ob sie bei uns bekannt ist und welchem Partner sie gehoert.
 */
export function leadAntwort(args: {
  signiert: boolean;
  kontaktId: string | null;
  leadTyp: "erstgespraech" | "standard";
  zugewiesenAn: string | null;
  /** Nur bei einer Dublette: worueber sie erkannt wurde. */
  dublette?: { erkanntUeber: string } | null;
}): Record<string, unknown> {
  if (!args.signiert) return { success: true, leadTyp: args.leadTyp };
  return {
    success: true,
    kontaktId: args.kontaktId,
    ...(args.dublette ? { dublette: true, erkanntUeber: args.dublette.erkanntUeber } : {}),
    leadTyp: args.leadTyp,
    zugewiesenAn: args.zugewiesenAn,
  };
}

/**
 * Ruht der bekannte Kontakt, an den eine neue Anfrage gehaengt wird?
 *
 * Archiviert oder verloren heisst: In keiner Arbeitsliste sichtbar. Bis zum
 * 04.10.2026 (M16) hing submit-lead die neue Anfrage trotzdem nur an, und
 * niemand sah, dass sich der Interessent wieder gemeldet hatte. Ein Kunde mit
 * Abschluss (`status = kunde`) bleibt, wo er ist, auch wenn er archiviert ist.
 */
export function istRuhenderKontakt(k: { archiviert?: unknown; status?: unknown; meta?: unknown }): boolean {
  if (k.status === "kunde") return false;
  const meta = (k.meta && typeof k.meta === "object" ? k.meta : {}) as Record<string, unknown>;
  return k.archiviert === true || k.status === "verloren" || meta.pipelineStufe === "verloren";
}

/**
 * Stufen ab der Reservierung: Kaufphase. Ein Kontakt, der hier steht oder ein
 * Investment hier hat, wird durch eine neue Anfrage nie in den Lead-Pool
 * zurueckgeholt, auch wenn er archiviert ist. Bonitaetsunterlagen liegen seit
 * dem 11.09.2026 hinter der Reservierung.
 */
export const KAUFPHASE_STUFEN: ReadonlySet<string> = new Set([
  "reservierung",
  "bonitaetsunterlagen",
  "finanzierung",
  "notar",
  "faelligkeit",
  "abrechnung",
  "abgeschlossen",
  "bestandsimport",
  "vermoegensaufbau",
]);

/** Steht der Kontakt selbst oder eines seiner Investments in der Kaufphase? */
export function istInKaufphase(
  kontaktMeta: unknown,
  investments: Array<{ meta?: unknown; status?: unknown }>,
): boolean {
  const stufe = (m: unknown) => (m && typeof m === "object" ? (m as Record<string, unknown>).pipelineStufe : undefined);
  const inKauf = (w: unknown) => typeof w === "string" && KAUFPHASE_STUFEN.has(w);
  if (inKauf(stufe(kontaktMeta))) return true;
  return investments.some((i) => inKauf(stufe(i.meta)) || inKauf(i.status));
}

/**
 * Wer ist nach der Reaktivierung zustaendig?
 *
 * Gegenpruefung vom 04.10.2026: Eine oeffentliche Anfrage haengt einen
 * bestehenden Kontakt nie um. Der bisherige Zustaendige bleibt. Nur wenn er
 * gesperrt ist oder keine Beraterrolle mehr hat, geht der Kontakt in den
 * Lead-Pool. War niemand zustaendig, gilt die Regel fuer neue Leads, aber nur
 * mit gepruefter Linkkennung: Ein mitgeschickter Beratername weist einen
 * bestehenden Kontakt niemandem zu.
 */
export function zustaendigNachReaktivierung(args: {
  bisherId: string | null;
  bisherGueltig: boolean;
  linkInhaberId: string | null;
}): string | null {
  if (args.bisherId) return args.bisherGueltig ? args.bisherId : null;
  return args.linkInhaberId;
}

/**
 * Was sich an einem ruhenden Kontakt aendert, wenn er neu anfragt.
 *
 * Er wird wieder aktiv, die Zaehlung der Kontaktversuche und die
 * Eskalationsmarken beginnen neu, sonst bliebe er im Pool unsichtbar
 * (`istOffenerPoolLead`) oder gaelte sofort als bereits gemeldet. Die
 * Zustaendigkeit aendert sich nur, wenn `zustaendigNeu` vom bisherigen
 * abweicht; dann wird die Beraterhistorie fortgeschrieben. Woher er kam,
 * steht als Liste in `reaktiviertAus`, jede Reaktivierung haengt an.
 */
export function reaktivierungFuerAnfrage(args: {
  bisher: { archiviert?: unknown; status?: unknown; meta?: unknown; zustaendig_id?: unknown; berater?: unknown };
  zustaendigNeu: string | null;
  beraterNameNeu: string;
  pipelineStufe: string;
  leadTyp: string;
  jetzt: string;
}): { spalten: Record<string, unknown>; metaPatch: Record<string, unknown> } {
  const meta = (args.bisher.meta && typeof args.bisher.meta === "object" ? args.bisher.meta : {}) as Record<string, unknown>;
  const bisherId = typeof args.bisher.zustaendig_id === "string" && args.bisher.zustaendig_id ? args.bisher.zustaendig_id : null;
  const bisherBerater = typeof args.bisher.berater === "string" ? args.bisher.berater : "";
  const wechsel = args.zustaendigNeu !== bisherId;

  const altAus = meta.reaktiviertAus;
  const reaktiviertAus = [
    ...(Array.isArray(altAus) ? altAus : altAus && typeof altAus === "object" ? [altAus] : []),
    {
      am: args.jetzt,
      archiviert: args.bisher.archiviert === true,
      status: typeof args.bisher.status === "string" ? args.bisher.status : null,
      pipelineStufe: typeof meta.pipelineStufe === "string" ? meta.pipelineStufe : null,
      vorherZustaendigId: bisherId,
      vorherBerater: bisherBerater || null,
    },
  ].slice(-10);

  const historie = Array.isArray(meta.beraterHistorie) ? (meta.beraterHistorie as Array<Record<string, unknown>>) : [];
  const beraterHistorie = wechsel
    ? [
        ...historie.map((e) => (e && e.name && !e.bis ? { ...e, bis: args.jetzt } : e)),
        ...(args.zustaendigNeu
          ? [{ name: args.beraterNameNeu, von: args.jetzt, geaendertVonName: "Neue Anfrage" }]
          : []),
      ]
    : null;

  return {
    spalten: {
      archiviert: false,
      status: "neu",
      ...(wechsel
        ? { zustaendig_id: args.zustaendigNeu, berater: args.zustaendigNeu ? args.beraterNameNeu : "" }
        : {}),
    },
    metaPatch: {
      pipelineStufe: args.pipelineStufe,
      offenerLead: !args.zustaendigNeu,
      nichtErreichtCount: 0,
      eskalationGesendet: {},
      eskalationFinalGesendet: {},
      ...(meta.leadTyp ? {} : { leadTyp: args.leadTyp }),
      ...(args.pipelineStufe === "zugewiesen" ? { zugewiesenAm: args.jetzt } : {}),
      ...(beraterHistorie ? { beraterHistorie } : {}),
      reaktiviertAm: args.jetzt,
      reaktiviertAus,
    },
  };
}
