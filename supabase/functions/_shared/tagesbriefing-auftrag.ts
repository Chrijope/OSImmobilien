/**
 * Der Auftrag an das Sprachmodell für das Tagesbriefing, und die Aufbereitung
 * der Zahlen, die es dazu bekommt.
 *
 * WARUM DAS EINE EIGENE DATEI IST
 *
 * Dasselbe Briefing soll an zwei Stellen entstehen: als Mail um 8 Uhr aus
 * `supabase/functions/tagesbriefing/`, und im Gespräch mit der Persona
 * Charlotte Renner auf der Personaseite. Stünde der Auftragstext in der
 * Function, müsste ihn die Seite abschreiben, und spätestens bei der ersten
 * Änderung sagten Mail und Gespräch Verschiedenes. Das wäre schlimmer als nur
 * eins von beidem.
 *
 * Deshalb steht hier alles, was den Inhalt bestimmt, und sonst nichts:
 *
 *   CHARLOTTE_AUFTRAG   der vollständige Systemauftrag, wortwörtlich
 *   baueDatenblock()    die Zahlen als Text, so wie das Modell sie sieht
 *   SCHWELLEN           welche Zahl ab wann Aufmerksamkeit verlangt
 *   KENNZAHL_LABEL      Klartextnamen der 83 Kennzahlen
 *
 * Diese Datei hat bewusst KEINE Importe. Sie lässt sich damit sowohl aus Deno
 * als auch aus dem Browser lesen und notfalls schlicht abschreiben.
 *
 * ZWEI WAHRHEITEN, DIE NICHT AUSEINANDERLAUFEN DÜRFEN
 *
 * `KENNZAHL_LABEL` und `BEREICH_LABEL` gibt es auch in
 * `src/lib/kennzahlenVerlauf.ts`. Eine Edge Function läuft in Deno und kann
 * `src/lib/` nicht mitbenutzen, deshalb liegen die Namen hier ein zweites Mal.
 * Die Fassung hier ist die vollständigere: Sie kennt auch die 25 Kennzahlen
 * aus `20260914180000_kennzahlen_alle_abteilungen.sql` und die Bereiche TEC,
 * ST und REC, die in `src/lib/kennzahlenVerlauf.ts` bis heute fehlen. Wer dort
 * nacharbeitet, gleicht bitte mit dieser Datei ab.
 *
 * Ein unbekannter Kurzname ist kein Fehler. Kommt in der Datenbank eine
 * Kennzahl dazu, bevor sie hier steht, erscheint eben der Kurzname. Das ist
 * besser, als sie stillschweigend wegzulassen.
 */

// ── Die Bereiche ─────────────────────────────────────────────────────────

/** Die vierzehn Kürzel aus der Datenbank, in der Reihenfolge der Ausgabe. */
export const BEREICH_LABEL: Record<string, string> = {
  AGL: 'Assistenz der Geschäftsleitung',
  OPS: 'Operative Leitung',
  VL: 'Vertriebsleitung',
  FIN: 'Finanzierung',
  BO: 'Backoffice und Support',
  OBJ: 'Objektmanagement',
  CTR: 'Controlling und Buchhaltung',
  HR: 'HR und Bewerbermanagement',
  MKT: 'Marketing',
  AS: 'Aftersales',
  VA: 'Vertriebsakademie',
  ST: 'Verkaufstraining',
  TEC: 'Technik und CRM-Qualität',
  REC: 'Recht',
}

/** Die Reihenfolge, in der die Bereiche in der Volltabelle stehen. */
export const BEREICH_REIHENFOLGE = Object.keys(BEREICH_LABEL)

// ── Die Kennzahlen ───────────────────────────────────────────────────────

export const KENNZAHL_LABEL: Record<string, string> = {
  // AGL
  kontakte_aktiv: 'Aktive Kontakte',
  reservierungen_erstellt: 'Reservierungen erstellt',
  abschluesse: 'Abschlüsse',
  partner_aktiv: 'Partner aktiv',
  investments_aktiv: 'Aktive Investments',
  ampel_rot: 'Vorgänge über der Eskalationsschwelle',
  // OPS
  aufgaben_offen: 'Offene Aufgaben',
  aufgaben_ueberfaellig: 'Überfällige Aufgaben',
  follow_ups_offen: 'Offene Follow-Ups',
  follow_ups_ueberfaellig: 'Überfällige Follow-Ups',
  kontakte_ohne_zustaendigen: 'Kontakte ohne Zuständigen',
  nachtpruefung_befunde_offen: 'Offene Befunde der Nachtprüfung',
  steckenbleiber: 'Steckengebliebene Vorgänge',
  aeltester_vorgang_tage: 'Ältester steckengebliebener Vorgang',
  fristen_7_tage: 'Fristen in den nächsten sieben Tagen',
  // VL
  neue_leads: 'Neue Leads',
  in_kontakt: 'In Kontakt',
  qualifiziert: 'Qualifiziert',
  in_abwicklung: 'In Abwicklung',
  bestandskunden: 'Bestandskunden',
  verloren: 'Verloren',
  conversion_lead_termin: 'Conversion Lead zu Termin',
  forecast_gewichtet: 'Gewichteter Forecast',
  volumen_offen: 'Offenes Pipelinevolumen',
  partner_ohne_bewegung: 'Partner ohne Bewegung',
  // TEC
  nachtpruefung_fehler: 'Fehler aus der Nachtprüfung',
  // HR
  bewerber_gesamt: 'Bewerber gesamt',
  bewerber_eingang: 'Bewerber im Eingang',
  bewerber_im_prozess: 'Bewerber im Prozess',
  bewerber_aktiv: 'Bewerber aktiv',
  bewerber_abgelehnt: 'Bewerber abgelehnt',
  bewerber_kein_interesse: 'Bewerber ohne Interesse',
  gespraeche_woche: 'Bewerbergespräche diese Woche',
  wartend_ueber_3_tage: 'Bewerber warten länger als drei Tage',
  // VA
  partner_mit_fortschritt: 'Partner mit Fortschritt',
  kapitel_abgeschlossen: 'Abgeschlossene Kapitel',
  aufgaben_geloest: 'Gelöste Übungsaufgaben',
  partner_in_einarbeitung: 'Partner in Einarbeitung',
  // ST
  weekly_call_in_tagen: 'Tage bis zum Weekly Call',
  weekly_call_punkte_offen: 'Offene Punkte für den Weekly Call',
  // MKT
  leads_quelle_formular_manuell: 'Leads aus Formular oder manuell',
  leads_quelle_plattform: 'Leads von benannten Plattformen',
  leads_mit_kampagne: 'Leads mit Kampagnenkennung',
  leads_mit_utm_campaign: 'Leads mit Kampagnennamen',
  kampagnen_mit_leads_30_tage: 'Kampagnen mit Leads in 30 Tagen',
  // OBJ
  objekte_gesamt: 'Objekte gesamt',
  objekte_sichtbar: 'Objekte sichtbar',
  wohneinheiten_gesamt: 'Wohneinheiten gesamt',
  wohneinheiten_frei: 'Wohneinheiten frei',
  wohneinheiten_reserviert: 'Wohneinheiten reserviert',
  wohneinheiten_verkauft: 'Wohneinheiten verkauft',
  einreichungen_offen: 'Offene Objekteinreichungen',
  standzeit_max_tage: 'Längste Standzeit eines Objekts',
  objekte_ohne_unterlagen: 'Objekte ohne Unterlagen',
  // BO
  tickets_gesamt: 'Tickets gesamt',
  tickets_neu: 'Tickets neu',
  tickets_offen: 'Tickets offen',
  tickets_in_bearbeitung: 'Tickets in Bearbeitung',
  tickets_erledigt: 'Tickets erledigt',
  notartermine_14_tage: 'Notartermine in den nächsten 14 Tagen',
  // FIN
  reservierungen_offen: 'Offene Reservierungen',
  bonitaetsunterlagen: 'In Bonitätsunterlagen',
  notar: 'Beim Notar',
  signaturen_offen: 'Offene Unterschriften',
  signaturen_abgelaufen: 'Abgelaufene Unterschriften',
  bonitaet_unvollstaendig: 'Bonität unvollständig',
  bank_schweigt: 'Bank meldet sich nicht',
  weiter_zum_notar_prozent: 'Weiter von Finanzierung zum Notar',
  // AS
  empfehlungen_gesamt: 'Empfehlungen gesamt',
  empfehlungen_neu: 'Empfehlungen neu',
  empfehlungen_abgeschlossen: 'Empfehlungen abgeschlossen',
  tippgeber_gesamt: 'Tippgeber gesamt',
  vp_bewertungen_gesamt: 'Partnerbewertungen',
  kunden_bewertungen_gesamt: 'Kundenbewertungen',
  ohne_kontakt_90_tage: 'Bestandskunden ohne Kontakt seit 90 Tagen',
  zweitkauf_kandidaten: 'Kandidaten für einen Zweitkauf',
  // CTR
  abrechnungen_gesamt: 'Abrechnungen gesamt',
  abrechnungen_offen: 'Abrechnungen offen',
  abrechnungen_freigegeben: 'Abrechnungen freigegeben',
  abrechnungen_ausgezahlt: 'Abrechnungen ausgezahlt',
  umsatz_monat: 'Umsatz im laufenden Monat',
  // OBJ, FIN und AS, je Bereich dieselben beiden Kurznamen. Sie kommen aus
  // `kennzahlen_tagesstand_objektdaten()` (Migration 20260924170000) und
  // zählen die Unstimmigkeiten, die der Nachtwächter in den Objektdaten
  // gefunden hat. Personen stehen darin nicht, nur Anzahlen von Objekten.
  objektdaten_unstimmig: 'Objekte mit unstimmigen Daten',
  objektdaten_neu: 'Neue Unstimmigkeiten in den Objektdaten',
}

/**
 * Die Einheit einer Kennzahl. Alles, was hier nicht steht, ist eine Anzahl.
 *
 * Ohne diese Angabe stünde in der Mail "1250000 Umsatz im laufenden Monat",
 * und ein Betrag ohne Währung liest sich wie eine Stückzahl.
 */
export const KENNZAHL_EINHEIT: Record<string, 'euro' | 'prozent' | 'tage'> = {
  umsatz_monat: 'euro',
  forecast_gewichtet: 'euro',
  volumen_offen: 'euro',
  conversion_lead_termin: 'prozent',
  weiter_zum_notar_prozent: 'prozent',
  aeltester_vorgang_tage: 'tage',
  standzeit_max_tage: 'tage',
  weekly_call_in_tagen: 'tage',
}

/**
 * Kennzahlen, bei denen eine kleine Zahl eine einzelne Person bezeichnet.
 *
 * Die Hausordnung sagt es so: "Bei sehr kleinen Zahlen ist auch die
 * Sammelaussage wieder ein Personenbezug." Ein Bewerber, der seit vier Tagen
 * wartet, ist genau ein Mensch, und wer ihn im Haus sucht, findet ihn in
 * Sekunden. Für diese Kennzahlen darf der Fließtext der Mail bei Werten unter
 * drei keine Zahl nennen, sondern nur die Sache.
 */
export const PERSONENBEZOGEN = new Set([
  'wartend_ueber_3_tage',
  'bewerber_eingang',
  'bewerber_im_prozess',
  'gespraeche_woche',
  'ohne_kontakt_90_tage',
  'zweitkauf_kandidaten',
  'bank_schweigt',
  'bonitaet_unvollstaendig',
  'signaturen_abgelaufen',
])

// ── Die Schwellen ────────────────────────────────────────────────────────

export interface Schwelle {
  bereich: string
  kennzahl: string
  /** Ab diesem Wert einschließlich gilt die Schwelle als gerissen. */
  ab: number
  /** Ein Satz: was es bedeutet, wenn die Schwelle gerissen ist. */
  bedeutung: string
  /** Die Kennzahl, die das Alter dieser Menge angibt, falls es eine gibt. */
  alterAus?: string
}

/**
 * Welche Zahl ab wann Aufmerksamkeit verlangt.
 *
 * WICHTIG, UND IM AUFTRAG AN DAS MODELL STEHT DASSELBE: Diese Schwellen sind
 * hier gesetzt worden, sie stammen nicht aus dem CRM. Im System gibt es keine
 * gepflegten Grenzwerte für diese Zahlen. Sie sind ein Vorschlag, der sich in
 * einer Zeile ändern lässt, und nicht eine Messung.
 *
 * Aufgenommen ist nur, was tatsächlich ein Liegenbleiber ist. Bewusst NICHT
 * aufgenommen sind Zahlen, die groß sein dürfen, ohne dass etwas fehlt:
 * `abrechnungen_offen` (eine Abrechnung ist erst am Monatsende fällig),
 * `notartermine_14_tage` (eine gute Nachricht), `tickets_offen` (Tagesgeschäft).
 */
export const SCHWELLEN: Schwelle[] = [
  { bereich: 'OPS', kennzahl: 'steckenbleiber', ab: 1, alterAus: 'aeltester_vorgang_tage',
    bedeutung: 'Vorgänge stehen länger als vorgesehen in derselben Stufe.' },
  { bereich: 'OPS', kennzahl: 'aufgaben_ueberfaellig', ab: 1,
    bedeutung: 'Aufgaben sind über ihr Fälligkeitsdatum hinaus offen.' },
  { bereich: 'OPS', kennzahl: 'follow_ups_ueberfaellig', ab: 1,
    bedeutung: 'Zugesagte Rückmeldungen an Kontakte sind überfällig.' },
  { bereich: 'OPS', kennzahl: 'kontakte_ohne_zustaendigen', ab: 1,
    bedeutung: 'Kontakte haben niemanden, der für sie arbeitet.' },
  { bereich: 'OPS', kennzahl: 'nachtpruefung_befunde_offen', ab: 1,
    bedeutung: 'Die Nachtprüfung hat Befunde gemeldet, die niemand geschlossen hat.' },
  { bereich: 'TEC', kennzahl: 'nachtpruefung_fehler', ab: 1,
    bedeutung: 'Etwas im System funktioniert nicht. Solche Fehler machen von sich aus keinen Lärm.' },
  { bereich: 'FIN', kennzahl: 'signaturen_abgelaufen', ab: 1,
    bedeutung: 'Unterschriftsanfragen sind abgelaufen, ohne dass unterschrieben wurde.' },
  { bereich: 'FIN', kennzahl: 'bank_schweigt', ab: 1,
    bedeutung: 'Finanzierungsfälle warten auf eine Rückmeldung der Bank.' },
  { bereich: 'FIN', kennzahl: 'bonitaet_unvollstaendig', ab: 1,
    bedeutung: 'Reservierungen laufen weiter, obwohl die Bonitätsunterlagen fehlen.' },
  { bereich: 'HR', kennzahl: 'wartend_ueber_3_tage', ab: 1,
    bedeutung: 'Bewerber warten länger als drei Tage auf eine Antwort.' },
  { bereich: 'OBJ', kennzahl: 'objekte_ohne_unterlagen', ab: 1,
    bedeutung: 'Objekte stehen im System, ohne dass die Unterlagen dazu vorliegen.' },
  { bereich: 'OBJ', kennzahl: 'einreichungen_offen', ab: 1,
    bedeutung: 'Eingereichte Objekte warten auf eine Entscheidung.' },
  { bereich: 'OBJ', kennzahl: 'standzeit_max_tage', ab: 90,
    bedeutung: 'Ein Objekt steht seit über drei Monaten unverkauft im Bestand.' },
  { bereich: 'VL', kennzahl: 'partner_ohne_bewegung', ab: 1,
    bedeutung: 'Vertriebspartner haben seit längerem keinen Vorgang bewegt.' },
  { bereich: 'AS', kennzahl: 'ohne_kontakt_90_tage', ab: 1,
    bedeutung: 'Bestandskunden hatten seit 90 Tagen keinen Kontakt.' },
  { bereich: 'AGL', kennzahl: 'ampel_rot', ab: 1, alterAus: 'aeltester_vorgang_tage',
    bedeutung: 'Vorgänge liegen über der Eskalationsschwelle.' },
  { bereich: 'ST', kennzahl: 'weekly_call_punkte_offen', ab: 1,
    bedeutung: 'Für den nächsten Weekly Call sind Punkte offen.' },
  // Die Unstimmigkeiten in den Objektdaten reißen die Schwelle nur mit NEUEN
  // Treffern. Die Gesamtzahl steht trotzdem jeden Tag in der Tabelle beim
  // Bereich; als Schwelle stünde sie aber jeden Morgen im Text, auch wenn
  // sich nichts getan hat, und dieselbe Zeile liest nach einer Woche niemand.
  { bereich: 'OBJ', kennzahl: 'objektdaten_neu', ab: 1,
    bedeutung: 'Der Nachtwächter hat neue Unstimmigkeiten in den Stammdaten der Objekte gefunden, etwa Adresse, PLZ, Baujahr, Fläche, Miete oder Rendite. Die Liste steht auf der Seite Nachtprüfung.' },
  { bereich: 'FIN', kennzahl: 'objektdaten_neu', ab: 1,
    bedeutung: 'Der Nachtwächter hat neue Lücken gefunden, die eine Bank bemängeln würde: Hausgeld, Rücklage oder Pflichtunterlagen wie Teilungserklärung und Energieausweis.' },
  { bereich: 'AS', kennzahl: 'objektdaten_neu', ab: 1,
    bedeutung: 'Der Nachtwächter hat neue Lücken im Bestand gefunden: verkaufte oder vermietete Einheiten ohne Miete oder Objekte ohne Verwaltung.' },
]

// ── Die Zahlen als Text ──────────────────────────────────────────────────

/** Eine Zeile, wie sie `public.kennzahlen_verlauf()` liefert, schon geprüft. */
export interface KennzahlZeile {
  bereich: string
  kennzahl: string
  label: string
  stichtag: string
  wert: number
  stichtagVorwoche: string | null
  wertVorwoche: number | null
  veraenderung: number | null
}

/** Eine Zahl so schreiben, wie ein Mensch sie liest. */
export function formatiereWert(kennzahl: string, wert: number): string {
  const einheit = KENNZAHL_EINHEIT[kennzahl]
  if (einheit === 'euro') {
    return wert.toLocaleString('de-DE', {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
    })
  }
  if (einheit === 'prozent') {
    return `${wert.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`
  }
  if (einheit === 'tage') {
    return `${wert.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ${wert === 1 ? 'Tag' : 'Tage'}`
  }
  return wert.toLocaleString('de-DE', { maximumFractionDigits: 1 })
}

/** Die Veränderung mit Vorzeichen, oder ein ehrliches "kein Vergleichswert". */
export function formatiereVeraenderung(zeile: KennzahlZeile): string {
  if (zeile.wertVorwoche === null || zeile.veraenderung === null) {
    return 'kein Vergleichswert'
  }
  if (zeile.veraenderung === 0) return 'unverändert'
  const vorzeichen = zeile.veraenderung > 0 ? '+' : ''
  return `${vorzeichen}${formatiereWert(zeile.kennzahl, zeile.veraenderung)}`
}

/** Die Zeilen, deren Schwelle gerissen ist, samt Bedeutung und Alter. */
export function gerisseneSchwellen(
  zeilen: KennzahlZeile[],
): Array<{ zeile: KennzahlZeile; schwelle: Schwelle; alter: KennzahlZeile | null }> {
  const treffer: Array<{ zeile: KennzahlZeile; schwelle: Schwelle; alter: KennzahlZeile | null }> = []
  for (const schwelle of SCHWELLEN) {
    const zeile = zeilen.find(
      (z) => z.bereich === schwelle.bereich && z.kennzahl === schwelle.kennzahl,
    )
    if (!zeile || zeile.wert < schwelle.ab) continue
    const alter = schwelle.alterAus
      ? zeilen.find((z) => z.bereich === schwelle.bereich && z.kennzahl === schwelle.alterAus) ?? null
      : null
    treffer.push({ zeile, schwelle, alter })
  }
  return treffer
}

/** Die Zeilen, die sich gegenüber der Vorwoche bewegt haben. */
export function bewegteZahlen(zeilen: KennzahlZeile[]): KennzahlZeile[] {
  return zeilen.filter((z) => z.veraenderung !== null && z.veraenderung !== 0)
}

/**
 * Der Datenblock, den das Modell bekommt.
 *
 * Bewusst Text und kein JSON: Der Auftrag verbietet dem Modell, etwas zu
 * ergänzen, was nicht in den Daten steht, und ein lesbarer Block macht es
 * leichter nachzuprüfen, ob es sich daran gehalten hat. Christian bekommt im
 * Zweifel denselben Block zu sehen, den das Modell gesehen hat.
 */
export function baueDatenblock(zeilen: KennzahlZeile[], heute: string): string {
  const teile: string[] = []
  teile.push(`STICHTAG DER MAIL: ${heute}`)
  teile.push('')

  const gerissen = gerisseneSchwellen(zeilen)
  teile.push('SCHWELLEN GERISSEN')
  if (gerissen.length === 0) {
    teile.push('- keine')
  } else {
    for (const { zeile, schwelle, alter } of gerissen) {
      const alterText = alter ? ` | Alter der Menge: ${formatiereWert(alter.kennzahl, alter.wert)}` : ''
      teile.push(
        `- ${zeile.bereich} | ${zeile.label} | Wert: ${formatiereWert(zeile.kennzahl, zeile.wert)}` +
          ` | Schwelle: ab ${formatiereWert(zeile.kennzahl, schwelle.ab)}` +
          ` | Vorwoche: ${zeile.wertVorwoche === null ? 'kein Vergleichswert' : formatiereWert(zeile.kennzahl, zeile.wertVorwoche)}` +
          ` | Veraenderung: ${formatiereVeraenderung(zeile)}${alterText}` +
          ` | Bedeutung: ${schwelle.bedeutung}`,
      )
    }
  }
  teile.push('')

  const bewegt = bewegteZahlen(zeilen)
  teile.push('SEIT DER VORWOCHE BEWEGT')
  if (bewegt.length === 0) {
    teile.push('- keine Zahl hat sich gegenueber der Vorwoche veraendert')
  } else {
    for (const z of bewegt) {
      teile.push(
        `- ${z.bereich} | ${z.label} | heute: ${formatiereWert(z.kennzahl, z.wert)}` +
          ` | Vorwoche: ${formatiereWert(z.kennzahl, z.wertVorwoche as number)}` +
          ` | Veraenderung: ${formatiereVeraenderung(z)}`,
      )
    }
  }
  teile.push('')

  teile.push('ALLE KENNZAHLEN')
  for (const bereich of BEREICH_REIHENFOLGE) {
    const gruppe = zeilen.filter((z) => z.bereich === bereich)
    if (gruppe.length === 0) {
      teile.push(`${bereich} (${BEREICH_LABEL[bereich]}): keine Daten`)
      continue
    }
    teile.push(`${bereich} (${BEREICH_LABEL[bereich]}):`)
    for (const z of gruppe) {
      teile.push(
        `  ${z.label} | heute: ${formatiereWert(z.kennzahl, z.wert)} (Stand ${z.stichtag})` +
          ` | Vorwoche: ${z.wertVorwoche === null ? 'kein Vergleichswert' : `${formatiereWert(z.kennzahl, z.wertVorwoche)} (Stand ${z.stichtagVorwoche})`}` +
          ` | Veraenderung: ${formatiereVeraenderung(z)}`,
      )
    }
  }

  const fehlend = BEREICH_REIHENFOLGE.filter((b) => !zeilen.some((z) => z.bereich === b))
  if (fehlend.length > 0) {
    teile.push('')
    teile.push(
      `BEREICHE OHNE DATEN: ${fehlend.map((b) => `${b} (${BEREICH_LABEL[b]})`).join(', ')}`,
    )
  }

  return teile.join('\n')
}

// ── Der Auftrag ──────────────────────────────────────────────────────────

/**
 * Der Systemauftrag an das Modell, wortwörtlich.
 *
 * Er ist aus `.claude/agents/assistenz-geschaeftsleitung.md` abgeleitet: Rolle,
 * Ton, Redlichkeitsregeln und die Datenschutzgrenze stehen dort, hier stehen
 * sie in der Kurzfassung, die für eine einzelne Mail reicht. Wer den Ton
 * ändern will, ändert ihn hier und nirgends sonst.
 *
 * Die Personaseite verwendet denselben Text unverändert. Ändert sich die
 * Beschreibung der Persona, gehört die Änderung auch hierher.
 */
export const CHARLOTTE_AUFTRAG = `Du bist Charlotte Renner, 38, Assistenz der Geschäftsleitung bei der MOREImmo GmbH, im Haus Chief of Staff genannt. Sieben Jahre McKinsey, danach vier Jahre Chief of Staff bei einem Berliner Proptech. Deine Aufgabe hier ist immer dieselbe: aus vielen Einzelmeldungen ein Bild bauen, an dem sich entscheiden lässt.

Du schreibst das tägliche Briefing an Christian Peetz, den Geschäftsführer. Er ist kein Programmierer. Er liest es morgens um acht in zwei Minuten, oft auf dem Handy.

DEIN TON
Du duzt Christian. Du schreibst kurz, in ganzen Sätzen, ohne Beraterjargon. Du dramatisierst nicht und du polsterst nicht. Du sagst am Ende, was du vorschlägst, auch wenn niemand danach gefragt hat. Allergisch bist du gegen Zahlen ohne Stichtag, gegen das Wort "ungefähr", wenn dahinter niemand nachgesehen hat, und gegen Vorschläge, die nur eine Lage beschreiben statt eine Entscheidung zu enthalten.
Du trennst sauber zwischen Beobachtung, Auslegung und Empfehlung und vermischst die drei nie.
Keine Gedankenstriche. Keine Emojis. Keine englischen Modewörter.

DEINE REDLICHKEITSREGELN, SIE STEHEN ÜBER ALLEM
1. Du erfindest nichts. Keine Zahl, keine Tabelle, keine Kennzahl, keinen Vorgang, kein Ereignis. Was unten im Datenblock nicht steht, kommt in deinem Text nicht vor. Auch nicht als Vermutung, auch nicht als Beispiel.
2. Liefert ein Bereich keine Daten, schreibst du das als Befund hin, statt es zu überspringen. Der Satz lautet sinngemäß: "Aus <Bereich> kam heute keine Zahl."
3. Eine Zahl ohne Vergleichswert bekommt den Zusatz, dass es keinen gibt. Du behauptest nie eine Null, wo "nicht gemessen" steht.
4. Eine Schätzung kennzeichnest du als Schätzung und nennst die Annahme. Besser ist, gar nicht zu schätzen.
5. Die Schwellen im Datenblock sind gesetzt worden und stammen nicht aus dem CRM. Wenn du dich auf eine berufst, sagst du dazu, dass es eine gesetzte Schwelle ist.
6. Du weißt, was das CRM nicht kann: Es gibt keine Kosten, keine Marge, keinen Deckungsbeitrag, keine Bank-Genehmigungsquote und keine Prognosegüte. Frag nicht danach und rechne nichts davon aus.

DIE DATENSCHUTZGRENZE, OHNE AUSNAHME
Keine Namen von Kunden, Interessenten, Bewerbern, Mietern, Eigentümern oder Empfohlenen. Keine Adressen, keine Mailadressen, keine Telefonnummern, keine Bonitätsdaten. Im Datenblock stehen ohnehin nur Zahlen, erfinde keine Namen dazu.
Bei sehr kleinen Mengen ist auch eine Anzahl ein Personenbezug. Wenn eine personenbezogene Menge bei eins oder zwei steht, nennst du die Sache ohne die Zahl, also "Es warten Bewerber länger als drei Tage" statt "Ein Bewerber wartet".

DER AUFBAU DER MAIL
Sie ist kein Rundgang durch vierzehn Abteilungen. Vierzehn Blöcke mit "bei uns ist alles grün" liest niemand zweimal. Sie ist nach Dringlichkeit sortiert, und die Abteilung steht nur als Herkunft dabei.

1. Die Lage. Zwei Sätze, deine Einschätzung, nicht eine Aufzählung.
2. Was heute eine Entscheidung braucht. Jeder Punkt mit Frist und mit dem, was ohne die Entscheidung nicht weitergeht. Steht nichts an, sagst du das ausdrücklich, statt den Abschnitt leer zu lassen.
3. Was liegen bleibt. Aus allen Bereichen, mit Alter, wo der Datenblock ein Alter hergibt. Drei Tage sind etwas anderes als drei Wochen, und genau das soll man sehen.
4. Die Zahlen, gefiltert. Nur die, die sich bewegt haben oder eine Schwelle reißen. Eine Zahl ohne Bewegung gehört nicht in eine tägliche Mail.

Die vollständige Tabelle hängt die Mail selbst an, dafür musst du nichts tun.

DER VORSCHAUTEXT
Die ersten 90 Zeichen sieht Christian auf dem Handy, bevor er die Mail öffnet. Dort gehört die Lage hin, nicht das Wort "Tagesbriefing". Schreib ihn als ganzen Satz, höchstens 90 Zeichen, ohne Doppelpunkt am Anfang.

DEINE ANTWORT
Antworte ausschließlich mit einem JSON-Objekt, ohne Fließtext davor oder danach, ohne Code-Zaun. Genau diese Felder:

{
  "betreff": "höchstens 60 Zeichen, sagt die Lage, nicht die Gattung",
  "vorschau": "höchstens 90 Zeichen, ein ganzer Satz",
  "lage": "zwei Sätze",
  "entscheidungen": [
    { "text": "was zu entscheiden ist", "frist": "bis wann, oder 'ohne Frist'", "blockiert": "was ohne die Entscheidung nicht weitergeht" }
  ],
  "liegenbleiber": [
    { "text": "was liegen bleibt, mit Herkunftsbereich im Klartext", "alter": "wie alt, oder leer wenn der Datenblock kein Alter hergibt", "folge": "was passiert, wenn es liegen bleibt" }
  ],
  "zahlen": [
    { "text": "Name der Kennzahl mit Bereich", "wert": "Wert heute und Vorwochenwert", "einordnung": "ein halber Satz, was das heißt", "ton": "neutral oder warnung oder fehler" }
  ],
  "unsicher": "was du nicht belegen kannst und woran das liegt. Das Wort 'nichts' ist erlaubt, das Feld darf nicht fehlen."
}

Höchstens fünf Einträge je Liste. Ist eine Liste leer, schick ein leeres Array und sag den Grund in "lage" oder "unsicher". Für "entscheidungen" gilt zusätzlich: Ein leeres Array bedeutet, dass heute nichts zu entscheiden ist, und die Mail schreibt das dann selbst hin.`

/** Die Nachricht, die den Datenblock trägt. */
export function baueNutzerNachricht(datenblock: string): string {
  return `Hier ist der Kennzahlenstand von heute Nacht. Er stammt aus der Datenbankfunktion public.kennzahlen_verlauf, geschrieben vom nächtlichen Lauf um 04:10 UTC. Andere Daten hast du nicht, und du hast keinen Zugriff auf das CRM.

${datenblock}

Schreib jetzt das Briefing als JSON.`
}
