/**
 * Der Wortlaut der Mails des neuen Bewerberprozesses.
 *
 * Getrennt von den Vorlagen, weil die Vorlagen React über einen npm:-Spezifizierer
 * importieren und damit für Vitest unerreichbar sind. Was hier steht, können
 * beide Welten lesen: die Vorlage in Deno und der Test in
 * `src/lib/bewerberKennenlernenMail.test.ts`.
 *
 * Vorbild und Gegenstück: `bewerber-eingangsmail.ts` für den alten Ablauf.
 */

/** Die öffentliche Adresse des Kennenlernens. */
export const KENNENLERNEN_BASIS_URL = 'https://portal.more.immo/kennenlernen'

/** Gültigkeit des persönlichen Links in Tagen. Wie beim Vorabbogen. */
/*
 * Wie lange ein Kennenlernlink gilt: sechs Monate.
 *
 * Vorher 14 Tage. Christian hat das am 14.09.2026 geaendert, und der Grund
 * steht in der Sammelmail, die seither hinausgeht: Sie sagt zu, dass der
 * Bewerber den Bogen "jederzeit" ausfuellen kann, auch Wochen spaeter. Mit
 * zwei Wochen Gueltigkeit waere das ein leeres Versprechen gewesen.
 *
 * Bewusst ein Datum und kein "unbegrenzt": Die Spalte `expires_at` ist
 * NOT NULL, und drei Pruefungen im Code lesen sie mit `new Date(...)`. Ein
 * leerer Wert waere dort der 1. Januar 1970, der Link also sofort abgelaufen.
 * Ein fernes Datum laesst jede vorhandene Pruefung unveraendert richtig
 * arbeiten.
 *
 * Laeuft ein Link doch einmal ab, erzeugen HR, Admin und Inhaber ueber
 * "Noch einmal schicken" einen neuen. Die Suche nach einem wiederverwendbaren
 * Link findet einen abgelaufenen nicht und legt dann von selbst einen frischen
 * an, siehe `send-bewerber-kennenlernen`.
 */
export const KENNENLERNEN_GUELTIG_TAGE = 180

// ── Nachricht 1, Tag 0 ────────────────────────────────────────────────────

/**
 * Der Dank samt kurzer Vorstellung, direkt nach der Anrede.
 *
 * Kurz gehalten, damit der Leser schnell bei dem ist, was er davon hat. Zwei
 * Aenderungen vom 19.09.2026:
 *
 * "erweitern gerade unser Vertriebsteam" ist heraus. "Team" ist
 * Eingliederungssprache, und die Eingliederung in eine fremde
 * Arbeitsorganisation gehoert zu den Merkmalen, auf die bei der Frage nach
 * der Scheinselbstaendigkeit gesehen wird. Fuer sich allein kein Alarm, aber
 * eine Spur, die niemand legen muss.
 *
 * Der Dank gilt jetzt der Meldung und nicht dem "Interesse an einer
 * vertrieblichen Zusammenarbeit". Das ist waermer und kuerzer.
 *
 * Dass es eine selbstaendige Taetigkeit auf Provision ist, steht bewusst NICHT
 * hier. Christians Entscheidung: Darauf geht der Kennenlernbogen auf seiner
 * ersten Ansicht ausfuehrlich ein, und die Mail soll nicht mit einer
 * Einschraenkung beginnen.
 */
export const KENNENLERNEN_DANKE =
  'vielen Dank, dass du dich bei uns gemeldet hast. Wir sind ein ' +
  'Kapitalanlage-Vertrieb aus Rosenheim und vergrößern uns vertrieblich.'

/**
 * Die Einladung zum Kennenlernen.
 *
 * Kein Anruf, kein Kalenderlink, keine Zeitzusage. Die Mail hat genau eine
 * Aufgabe, und die steht im Knopf darunter.
 *
 * Diese Fassung dreht die Reihenfolge um: Erst sagt sie, was der Bewerber
 * bekommt, dann erst, was wir von ihm wollen. Der alte Anfang „Statt eines
 * Fragebogens" erklärte, was es nicht ist, und das ist eine schwache Zeile am
 * stärksten Platz der Mail.
 */
export const KENNENLERNEN_EINLADUNG =
  'Bevor wir miteinander sprechen, kannst du dir in Ruhe ansehen, worauf du ' +
  'dich einlässt. Dafür haben wir ein Kennenlernen zum Durchklicken gebaut: ' +
  'sieben Kapitel, die sich an dem ausrichten, was du mitbringst. Du erfährst ' +
  'darin:'

/**
 * Was im Kennenlernen steht, als Häkchenliste.
 *
 * Diese Aufzählung steht ausschließlich hier und nicht mehr auf der ersten
 * Ansicht des Bogens. Zweimal derselbe Text hintereinander liest sich wie ein
 * Versehen, und die Ansicht soll kurz sein.
 */
export const KENNENLERNEN_PUNKTE = [
  'wer wir sind und für wen wir arbeiten',
  'mit welchen Immobilien wir arbeiten, und warum du sie auf keinem Portal findest',
  'was du selbst machst, was wir dir abnehmen, und was ab dem ersten Tag für dich bereitsteht',
  // Seit 26.09.2026 ohne "verdienst" und "Provision": Solche Wörter
  // zählen bei Spamfiltern zu den Geldversprechen. Siehe bewerberMailTexte.test.ts.
  'wie die Vergütung aufgebaut ist, und wie lange es bis zur ersten Abrechnung dauert',
] as const

/** Der Absatz unter der Liste: die Gegenleistung und das Ziel des Weges. */
export const KENNENLERNEN_GESPRAECH =
  'Zwischendurch fragen wir dich ein paar Dinge. Deine Antworten entscheiden ' +
  'mit, was du als Nächstes zu lesen bekommst, und sie sorgen dafür, dass wir ' +
  'im Gespräch über dich reden und nicht über Grundlagen. ' +
  'Am Ende schickst du uns deine Antworten, und wir melden ' +
  'uns danach bei dir. Passt es für beide Seiten, laden wir dich zu einem ' +
  'persönlichen Gespräch ein: ein Videocall, in dem wir die Zusammenarbeit im ' +
  'Detail besprechen.'

/**
 * Die Zeile unter dem Knopf der EINLADUNG.
 *
 * Bewusst eine eigene Zeile und nicht mehr dieselbe wie in den Erinnerungen.
 * Dort stand bis zum 19.09.2026 "Du kannst jederzeit pausieren, der Link gilt
 * sechs Monate", und beide Haelften arbeiteten gegen den Knopf: "pausieren"
 * ist als einzige Aufwandsangabe eine Warnung, man pausiert nur bei etwas
 * Langem, und die sechs Monate sagen dem Leser woertlich, dass es Zeit hat.
 *
 * Jetzt steht die Dauer vorn. Damit wird aus "pausieren" eine Entlastung statt
 * einer Warnung, und der Leser weiss vor dem Klick, worauf er sich einlaesst.
 * Das ist der wichtigste Punkt der ganzen Mail: Sie versprach "sieben kurze
 * Kapitel" und "ein paar Fragen", dahinter stehen 21 Ansichten und 19 Fragen.
 * Wer klickt und "Ansicht 1 von 21" liest, steigt genau dort aus.
 *
 * Die Gueltigkeit faellt hier weg. Sie ist richtig und steht weiterhin in den
 * Erinnerungen, aber in der Einladung ist sie ein Grund, es nicht heute zu
 * tun.
 */
export const KENNENLERNEN_KNOPF_HINWEIS =
  'Etwa 15 Minuten  ·  du kannst jederzeit pausieren und an derselben Stelle weitermachen'

/**
 * Die Zeile unter dem Knopf der ERINNERUNGEN.
 *
 * Ab einem vollen Monat wird in Monaten gezaehlt. "der Link gilt 180 Tage"
 * ist zwar richtig, aber niemand rechnet das im Kopf um; "sechs Monate" sagt
 * dasselbe und wird verstanden.
 */
export function kennenlernenLinkHinweis(gueltigTage: number): string {
  return `Du kannst jederzeit pausieren  ·  der Link gilt ${gueltigkeitText(gueltigTage)}`
}

/** Aus 180 wird "sechs Monate", aus 14 "14 Tage". */
export function gueltigkeitText(tage: number): string {
  const monate = Math.round(tage / 30)
  if (tage < 30 || Math.abs(monate * 30 - tage) > 2) return `${tage} Tage`
  const woerter = ['null', 'einen Monat', 'zwei Monate', 'drei Monate', 'vier Monate',
    'fünf Monate', 'sechs Monate', 'sieben Monate', 'acht Monate', 'neun Monate',
    'zehn Monate', 'elf Monate', 'zwölf Monate']
  return woerter[monate] || `${monate} Monate`
}

/**
 * Die Sammeladresse, wenn niemand die Rolle `hr` trägt.
 *
 * Sie steht hier und nicht in der Vorlage, damit Mailtext, Reply-To und Test
 * dieselbe Zeichenkette lesen.
 */
export const HR_SAMMEL_EMAIL = 'office@more.immo'

/**
 * Der letzte Absatz der Eingangsmail, in zwei Teilen um die Adresse herum.
 *
 * Warum nicht mehr „antworte einfach auf diese Mail": Die Mail geht von
 * `noreply@` hinaus, eine Antwort landete also in einem Postfach, das niemand
 * liest, und nicht bei der Ansprechpartnerin, deren Name unten in der Mail
 * steht. Deshalb steht ihre Adresse jetzt im Satz, als anklickbarer
 * mailto-Link. Zusätzlich setzt die Function Reply-To auf dieselbe Adresse,
 * damit auch der Antwortknopf des Mailprogramms richtig landet.
 */
/*
 * Der Schluss der Mail, in drei Teilen.
 *
 * Die Adresse stand bis zum 08.09.2026 als Link im Satz. Sie steht ohnehin
 * direkt darunter im Block der Ansprechpartnerin, mit Telefon und Bild;
 * zweimal dieselbe Adresse liest sich wie ein Formular. Der Satz kündigt sie
 * deshalb nur noch an. Das Reply-To der Mail zeigt weiterhin auf sie, damit
 * auch eine Antwort auf die Mail bei ihr landet und nicht in der
 * Sammeladresse.
 */
export const KENNENLERNEN_HINWEIS =
  'Wenn du vorher eine Frage hast, melde dich gerne. Meine Kontaktdaten ' +
  'stehen gleich hier unten.'

/*
 * Der Satz unter der Unterschrift.
 *
 * Er steht bewusst nach den Kontaktdaten und nicht davor: Wer absagen will,
 * soll das leicht finden, aber die Einladung soll nicht damit enden. Im Bogen
 * führt der Weg über "Kein Interesse", der seit dem 08.09.2026 auf jeder
 * Ansicht steht.
 */
export const KENNENLERNEN_ABSAGE_HINWEIS =
  'Wenn dein Interesse nicht mehr aktuell ist, kannst du uns das im ' +
  'Kennenlernbogen mitteilen. Ein Klick genügt, dann hörst du nichts mehr von uns.'

/**
 * Die Adresse, an die der Bewerber schreiben soll.
 *
 * Fehlt die Ansprechpartnerin oder hat ihr Profil keine Adresse, bleibt es bei
 * der Sammeladresse. Eine erfundene oder leere Adresse im Satz wäre schlimmer
 * als die allgemeine.
 */
export function kennenlernenAntwortAdresse(email?: string | null): string {
  const sauber = (email || '').trim()
  return sauber.includes('@') ? sauber : HR_SAMMEL_EMAIL
}

/** Derselbe Absatz als durchgehender Text, für den Nur-Text-Teil und für Tests. */
export function kennenlernenHinweis(_email?: string | null): string {
  return KENNENLERNEN_HINWEIS
}

// ── Die Erinnerungskette ──────────────────────────────────────────────────

/**
 * Die zwei Erinnerungen, in Tagen nach dem Versand.
 *
 * Warum genau diese Abstände: Drei Tage sind lang genug, dass niemand sich
 * gedrängt fühlt, und kurz genug, dass die erste Mail noch im Kopf ist. Die
 * acht Tage bis zur letzten geben dem Bewerber Zeit, doch noch selbst zu
 * reagieren, bevor wir das Verfahren schließen.
 *
 * **Seit dem 14.09.2026 ist Tag 11 eine Mail an den Bewerber.** Vorher ging
 * dort eine Bitte an die HR-Managerin hinaus, doch anzurufen. Das war ein
 * Anruf, den jemand von Hand machen musste, und er blieb regelmäßig aus.
 * Jetzt bekommt der Bewerber eine letzte, freundliche Nachricht, und sein
 * Stand wandert von selbst auf „Kein Interesse". Damit endet der Fall
 * sichtbar statt still.
 *
 * **Seit dem 26.09.2026 gibt es Tag 8 nicht mehr.** Dort stand „Unsere letzte
 * Erinnerung", drei Tage vor der Mail, die den Fall schließt. Ein Bewerber,
 * der nicht reagiert, bekommt jetzt höchstens drei Mails: Einladung, Tag 3,
 * Tag 11. Die Namen der Konstanten bleiben, damit sie zu Vorlage und Vermerk
 * passen, die ebenfalls „1" und „3" heißen.
 *
 * Nach Tag 11 kommt nichts mehr. Es gibt bewusst keine weitere Stufe und keine
 * Wiedervorlage.
 */
export const ERINNERUNG_TAG_1 = 3
export const ERINNERUNG_TAG_3 = 11

/** Erinnerung an Tag 3, für jemanden, der noch nicht angefangen hat. */
export const ERINNERUNG_1_NICHT_BEGONNEN =
  'dein Kennenlernen liegt noch unangetastet da. Kein Drama, das geht im Alltag ' +
  'schnell unter. Falls du noch magst, ist der Link unten.'

/** Erinnerung an Tag 3, für jemanden, der unterbrochen hat. */
export const ERINNERUNG_1_UNTERBROCHEN =
  'du hast dein Kennenlernen begonnen und dann unterbrochen. Dein Zwischenstand ' +
  'liegt noch auf deinem Gerät, du machst an derselben Stelle weiter.'

/*
 * Die Erinnerung an Tag 8 („Unsere letzte Erinnerung") stand hier bis zum
 * 26.09.2026. Sie ist entfallen, ihre Vorlage ebenso; `send-transactional-email`
 * sagt einem alten Aufrufer mit 410 ab.
 */

/**
 * Der Abmeldeknopf gehört in die Erinnerung an Tag 3.
 *
 * Bis heute steht er nur in der Nachfass-Mail. Wer erinnert wird und nicht mehr
 * will, hat deshalb keinen Knopf, sondern nur die Möglichkeit zu schweigen, und
 * Schweigen ist in dieser Kette genau das Signal, das den Anruf auslöst.
 */
export const ABMELDE_TEXT = 'Kein Interesse mehr'

// ── Die letzte Erinnerung, Tag 11 ─────────────────────────────────────────
//
// Sie schließt das Verfahren. Der Bewerber bekommt sie, und sein Stand wandert
// gleichzeitig auf „Kein Interesse". Bis zum 26.09.2026 war sie die dritte
// Erinnerung, seit dem Wegfall von Tag 8 ist sie die zweite; der Name
// `ERINNERUNG_3_*` bleibt.
//
// **Warum eine eigene Vorlage und nicht die vorhandene Absage.** Die
// „Kein Interesse"-Mail des Hauses ist für einen anderen Anlass gedacht,
// nämlich für jemanden, der uns selbst gesagt hat, dass es sich erledigt hat.
// Hier hat niemand etwas gesagt, und genau das ist der Unterschied: Wir
// konnten ihn nicht erreichen. Der Ton bleibt deshalb offen statt
// abschließend, und die Tür bleibt ausdrücklich auf.

/** Betreff. Er sagt, was geschieht, und klingt nicht nach Absage. */
export const ERINNERUNG_3_BETREFF = 'Wir schließen deine Bewerbung erst einmal'

/** Überschrift. */
export const ERINNERUNG_3_TITEL = 'Wir haben dich nicht erreicht'

/** Die Zeile, die das Mailprogramm in der Übersicht zeigt. */
export const ERINNERUNG_3_VORSCHAU =
  'Melde dich jederzeit, dann machen wir da weiter, wo wir aufgehört haben.'

/**
 * Der erste Absatz: der Anlass, ohne Vorwurf.
 *
 * Bis zum 26.09.2026 hieß es „in den letzten Wochen ein paar Mal". Ohne Tag 8
 * sind es bis hierher die Einladung und eine Erinnerung, und das in elf
 * Tagen. Der Satz zählt deshalb nicht mehr und nennt keinen Zeitraum; er
 * stimmt so auch nach einer Pause oder bei Akten, die Tag 8 noch bekamen.
 * Einen Bezug auf eine vorherige Ankündigung gibt es bewusst nicht: Die
 * Ankündigung stand in der entfallenen Tag-8-Mail.
 */
export const ERINNERUNG_3_TEXT =
  'wir haben dir zu deinem Kennenlernen geschrieben und seitdem von dir nichts ' +
  'gehört. Das nehmen wir dir nicht übel, im Alltag geht so etwas ' +
  'unter. Wir schließen deine Bewerbung deshalb zunächst und melden uns nicht ' +
  'mehr von allein.'

/** Der zweite Absatz: die offene Tür. Ohne Frist, sonst wäre sie keine. */
export const ERINNERUNG_3_OFFEN =
  'Falls du doch noch Interesse hast, antworte einfach auf diese Mail oder ' +
  'mach dein Kennenlernen fertig. Dann machen wir da weiter, wo wir aufgehört ' +
  'haben. Eine Frist gibt es dafür nicht.'

/** Der Schlusssatz. */
export const ERINNERUNG_3_SCHLUSS =
  'Danke, dass du dich bei uns gemeldet hast. Alles Gute für dich.'

/** Beschriftung des Knopfes. Er führt weiterhin in das Kennenlernen. */
export const ERINNERUNG_3_KNOPF = 'Kennenlernen doch noch öffnen'

/**
 * Die Zeile unter dem Knopf.
 *
 * Nicht `kennenlernenLinkHinweis`: Dessen „Du kannst jederzeit pausieren" ist
 * eine Einladung zum Weitermachen und passt nicht unter eine Mail, die gerade
 * den Fall schließt. Hier zählt nur, dass der Link noch gilt.
 */
export function erinnerung3KnopfHinweis(gueltigTage: number): string {
  return `Dein persönlicher Link gilt ${gueltigkeitText(gueltigTage)} ab dem Versand`
}

/** Steht als Absagegrund in der Akte, damit die vorhandene Anzeige greift. */
export const ERINNERUNG_3_ABSAGEGRUND = 'Keine Rückmeldung im Kennenlernen'

/** Der Autor des Verlaufseintrags. Kein Mitarbeiter hat das entschieden. */
export const ERINNERUNG_3_AUTOR = 'Automatisch nach der letzten Erinnerung'

/**
 * Der Eintrag im Verlauf der Bewerberakte.
 *
 * Er ist die einzige Spur dieser Stufe: Eine Glocke an HR gibt es nicht mehr,
 * und ein Status, der sich ohne Begründung ändert, wäre für die HR-Managerin
 * ein Rätsel. Bleibt der Status stehen, weil der Bewerber inzwischen weiter
 * ist, steht genau das im Text.
 */
export function erinnerung3Notiz(statusGeaendert: boolean, alterStatus?: string | null): string {
  const kern =
    `Letzte Erinnerung verschickt. Seit ${ERINNERUNG_TAG_3} Tagen keine Rückmeldung.`
  return statusGeaendert
    ? `${kern} Der Status steht jetzt auf Kein Interesse.`
    : `${kern} Der Status blieb auf ${alterStatus || 'dem bisherigen Wert'}, bitte prüfen.`
}

/**
 * Der Eintrag für „bitte nicht anrufen". Die Mail ging hinaus, der Stand nicht.
 *
 * Dieser Bewerber hat gesagt, dass er interessiert ist und nur den Anruf nicht
 * möchte. Ihn auf „Kein Interesse" zu setzen schriebe das Gegenteil in seine
 * Akte, deshalb bleibt sein Stand stehen. Der Eintrag muss den Unterschied
 * benennen, sonst liest die HR-Managerin ihn als einen der anderen Fälle.
 */
export function erinnerung3NichtAnrufenNotiz(alterStatus?: string | null): string {
  return (
    `Letzte Erinnerung verschickt. Seit ${ERINNERUNG_TAG_3} Tagen keine Rückmeldung. ` +
    'Der Status blieb auf ' + (alterStatus || 'dem bisherigen Wert') + ', weil dieser Bewerber ' +
    'gebeten hat, nicht angerufen zu werden. Das ist kein fehlendes Interesse, deshalb entscheidet ' +
    'hier ein Mensch.'
  )
}

/** Der Eintrag, wenn die Mail nicht hinausging. Dann bleibt der Status stehen. */
export function erinnerung3FehlerNotiz(grund: string): string {
  return (
    'Die letzte Erinnerung konnte nicht verschickt werden' +
    (grund.trim() ? `: ${grund.trim()}.` : '.') +
    ' Der Status wurde deshalb nicht geändert, bitte von Hand entscheiden.'
  )
}

// ── Betreff, Überschrift und Knöpfe der Erinnerung an Tag 3 ───────────────
//
// Steht hier und nicht in den Vorlagen, aus demselben Grund wie alles darüber:
// Der Vitest-Test in `src/lib/bewerberKennenlernenMail.test.ts` erreicht die
// Vorlagen nicht, weil sie React über eine npm-Angabe laden.

/** Betreff der ersten Erinnerung. Nennt die Sache, nicht die Erinnerung. */
export const ERINNERUNG_1_BETREFF = 'Dein Kennenlernen liegt noch offen'

/** Überschrift der ersten Erinnerung, je nach Wortfassung. */
export const ERINNERUNG_1_TITEL_NICHT_BEGONNEN = 'Dein Kennenlernen wartet noch'
export const ERINNERUNG_1_TITEL_UNTERBROCHEN = 'Du warst schon mittendrin'

/** Die Zeile, die das Mailprogramm in der Übersicht zeigt. */
export const ERINNERUNG_1_VORSCHAU_NICHT_BEGONNEN =
  'Dein Link gilt noch, und du kannst jederzeit pausieren.'
export const ERINNERUNG_1_VORSCHAU_UNTERBROCHEN =
  'Dein Zwischenstand liegt noch da, du machst einfach weiter.'

/** Beschriftung des Knopfes, je nach Wortfassung. */
export const ERINNERUNG_KNOPF_NICHT_BEGONNEN = 'Kennenlernen öffnen'
export const ERINNERUNG_KNOPF_UNTERBROCHEN = 'Da weitermachen, wo du warst'

/** Die Zeile unter dem Abmeldeknopf. Sagt, was der Klick auslöst. */
export const ABMELDE_HINWEIS = 'Ein Klick genügt, dann melden wir uns nicht mehr.'

/** Der Schlusssatz der ersten Erinnerung. */
export const ERINNERUNG_1_SCHLUSS =
  'Wenn etwas unklar ist, antworte einfach auf diese Mail. Es liest jemand mit.'

/**
 * Wie es weitergeht, wenn kein Abmeldeknopf in der Mail steht.
 *
 * Die Abmelde-Token liegen in `bewerber_abmeldung`. Solange diese Migration in
 * Supabase nicht gelaufen ist, gibt es kein Token und damit keinen Knopf. Ein
 * Knopf ohne Ziel wäre schlimmer als keiner, ein Versprechen ohne Weg ebenso.
 * Deshalb steht in diesem Fall der Satz mit dem Weg, den es sicher gibt.
 */
export const ABMELDE_ERSATZ =
  'Und wenn es doch nicht passt, antworte kurz auf diese Mail. Dann hörst du nichts mehr von uns.'

// ── Nachricht 3, der persönliche Überblick ────────────────────────────────
//
// Sie geht beim Absenden hinaus, aus `submit-bewerber-formular`. Bis zum
// 06.09.2026 gab es sie nicht, versprochen wurde sie trotzdem: Die letzte
// Ansicht des Kennenlernens sagt „Du bekommst gleich eine Mail mit deinen
// Angaben".
//
// Was sie nicht enthält: keine Punktzahl, keine Eignungsprozente, keine
// Bewertung. Was hier steht, sind seine eigenen Angaben, geordnet. Das ist die
// Vorgabe aus Moment 4 der Abstimmungsfassung, und sie gilt für die Mail so
// wie für die Ansicht davor.

/** Betreff und Überschrift. Sie sagen, was drinsteht, und danken nicht. */
export const ZUSAMMENFASSUNG_BETREFF = 'Das hast du uns erzählt'
export const ZUSAMMENFASSUNG_TITEL = 'Das hast du uns erzählt'
export const ZUSAMMENFASSUNG_VORSCHAU =
  'Deine Angaben zum Nachlesen. Wir melden uns bei dir.'

/** Der erste Absatz. Kurz, denn darunter kommt die eigentliche Sache. */
export const ZUSAMMENFASSUNG_EINLEITUNG =
  'danke, dass du dir die Zeit genommen hast. Deine Angaben sind bei uns ' +
  'angekommen. Hier stehen sie noch einmal, damit du sie in Ruhe nachlesen kannst.'

/** Die Zeile unter dem Knopf. Nennt die Dauer, die sich aus seinen Angaben ergibt. */
export function zusammenfassungKnopfHinweis(minuten: number): string {
  return `Geplant sind ${minuten} Minuten  ·  derselbe Link wie vorhin`
}

/**
 * Kein Knopf mehr, sondern ein Satz.
 *
 * Bis zum 08.09.2026 trug diese Mail den Knopf „Termin aussuchen". Der
 * Bewerber buchte sich damit selbst eine Zeit, bevor irgendjemand seine
 * Antworten gelesen hatte. Genau das dreht sich um: Wir lesen, wir wählen aus,
 * und wer eingeladen wird, bekommt den Buchungslink in der Einladungsmail
 * (`bewerber-kooperationsgespraech-einladung`). Diese Mail hier hat damit nur
 * noch eine Aufgabe, nämlich zu bestätigen, dass die Angaben angekommen sind.
 *
 * Der Satz sagt beide Ausgänge. Nur die Einladung zu nennen hieße, das
 * Schweigen zur Absage zu machen, und das ist der Ausgang, den niemand
 * verstehen kann. Eine Frist steht bewusst nicht darin: Zugesagt wird nur, was
 * der Ablauf hergibt. Wortgleich gemeint mit `ABSCHLUSS_TEXTE` in
 * `src/lib/bewerberKennenlernen.ts`, dem Bildschirm unmittelbar davor.
 */
export const ZUSAMMENFASSUNG_MELDEN =
  'Wie es weitergeht: Wir sehen uns deine Antworten in Ruhe an und melden uns ' +
  'danach bei dir, per E-Mail oder telefonisch. In der Regel dauert das ein ' +
  'paar Tage. Passt es aus unserer Sicht, laden wir dich zu einem ' +
  'persönlichen Gespräch ein und du suchst dir Tag und Uhrzeit selbst aus. Und ' +
  'wenn es nicht passt, hörst du auch das von uns.'

/**
 * Wie eine Korrektur geht.
 *
 * Die Abstimmungsfassung nennt in Moment 4 zwei Knöpfe, „Termin aussuchen" und
 * „Angaben ändern". Den ersten gibt es nicht mehr, den zweiten gab es nie: Ein
 * abgeschickter Bogen lässt sich heute nicht mehr öffnen, und ein Knopf, der
 * auf eine Seite führt, die das Ändern nicht anbietet, ist schlimmer als
 * keiner. Deshalb der Weg, den es sicher gibt, und derselbe Satz wie auf der
 * Ansicht davor.
 */
export const ZUSAMMENFASSUNG_KORREKTUR =
  'Wenn etwas nicht stimmt, antworte einfach auf diese Mail. Dann ändern wir es für dich.'

/*
 * Der Fall, in dem der Termin schon steht.
 *
 * Der Regelfall ist er nicht mehr, seit niemand mehr selbst bucht. Er kommt
 * trotzdem vor: Die HR-Managerin trägt einen Termin manchmal von Hand in die
 * Akte, und eine erneute Einladung legt eine neue Formularzeile an, die noch
 * einmal abgeschickt werden kann. Dann steht statt des allgemeinen Satzes der
 * konkrete, wann sein persönliches Gespräch ist.
 *
 * Woran der Termin erkannt wird, entscheidet `terminAusMeta` in
 * `bewerber-buchung-erinnerung.ts`, dieselbe Stelle, die auch die
 * Erinnerungskette anhalten lässt. Zwei Wege zu derselben Frage laufen
 * auseinander, und bemerkt wird es zuerst vom Bewerber.
 */

/** Vorschauzeile, wenn der Termin schon steht. */
export const ZUSAMMENFASSUNG_VORSCHAU_TERMIN =
  'Deine Angaben zum Nachlesen, dein Termin steht schon.'

/** Die Monatsnamen, ausgeschrieben. */
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

/**
 * „2026-09-15" wird zu „15. September 2026".
 *
 * Bewusst aus der Zeichenkette gerechnet und nicht über `Date`: Ein Datum ohne
 * Uhrzeit liest JavaScript als UTC-Mitternacht, und in einer Zeitzone westlich
 * davon stünde in der Mail der Vortag. Was nicht diesem Muster folgt, bleibt
 * unverändert stehen, denn ein halb übersetztes Datum wäre schlimmer als das
 * rohe.
 */
export function terminDatumLang(datum: string): string {
  const roh = (datum || '').trim()
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(roh)
  if (!treffer) return roh
  const monat = MONATE[Number(treffer[2]) - 1]
  if (!monat) return roh
  return `${Number(treffer[3])}. ${monat} ${treffer[1]}`
}

/** Der eine Satz, der den Knopf ersetzt. */
export function zusammenfassungTerminSatz(datum: string, uhrzeit?: string | null): string {
  const tag = terminDatumLang(datum)
  const zeit = (uhrzeit || '').trim()
  const wann = zeit ? `${tag} um ${zeit} Uhr` : tag
  return (
    `Dein persönliches Gespräch steht schon: am ${wann}. Du brauchst nichts ` +
    'weiter zu tun. Verschieben und absagen kannst du jederzeit über deinen ' +
    'eigenen Link.'
  )
}

/** Der Termin, so weit die Mail ihn braucht. */
export type ZusammenfassungTermin = { datum: string; uhrzeit?: string | null }

/**
 * Die Felder, mit denen die Vorlage aufgerufen wird.
 *
 * Genau eine Stelle entscheidet, welcher der beiden Sätze in der Mail steht:
 * der konkrete mit dem Datum, oder der allgemeine „wir melden uns". Ein
 * Buchungslink geht hier nicht mehr mit, damit die Vorlage keinen Knopf zeigen
 * kann, den es nicht mehr geben soll. Die Funktion steht hier und nicht in der
 * Function, damit `src/lib/bewerberKennenlernenMail.test.ts` beide Fälle
 * prüfen kann; die Vorlage selbst erreicht Vitest nicht.
 */
export function zusammenfassungMailFelder(opts: {
  termin?: ZusammenfassungTermin | null
}): {
  terminDatum?: string
  terminUhrzeit?: string
} {
  const termin = opts.termin
  if (termin && termin.datum.trim()) {
    return {
      terminDatum: termin.datum.trim(),
      terminUhrzeit: (termin.uhrzeit || '').trim(),
    }
  }
  return {}
}

// ── Nach dem abgeschickten Bogen: erst wir, dann er ───────────────────────

/**
 * Die Sichtung: die Erinnerung an UNS, nicht an den Bewerber.
 *
 * ## Warum es sie gibt
 *
 * Bis zum 08.09.2026 mahnte die Kette an dieser Stelle den Bewerber, sich
 * endlich einen Termin auszusuchen. Seit der Bogen ohne Terminwahl endet, ist
 * das sinnlos: Er kann gar nicht buchen, solange wir ihn nicht eingeladen
 * haben. Die Kette mahnt deshalb den, der jetzt am Zug ist, und das sind wir.
 *
 * Ohne diesen Umbau wäre die Umstellung ein Rückschritt gewesen. Vorher lag es
 * am Bewerber, ob etwas passiert, und wenn er nichts tat, meldete sich das
 * System. Jetzt liegt es an uns, und wer wochenlang auf eine Antwort wartet,
 * weil niemand seinen Bogen angesehen hat, erlebt genau das Schweigen, das der
 * Abschlusstext ihm versprochen hat zu vermeiden.
 *
 *   | Tag 3 | „Ein Kennenlernen wartet auf eure Entscheidung" | Glocke und Mail an HR |
 *   | Tag 7 | dasselbe noch einmal, deutlicher                | Glocke und Mail an HR |
 *   | danach | nichts                                        |                       |
 *
 * Sie endet, sobald die Einladung hinausgegangen ist (`meta.kennenlernen.
 * einladungAm`), eine Absage erfolgt ist oder ein Termin steht.
 */
export const SICHTUNG_TAG = 3
export const SICHTUNG_TAG_2 = 7

/** Der Satz in Glocke und Mail. Er sagt, was zu tun ist. */
export function sichtungHrText(name: string, tage: number): string {
  return (
    `${name} hat das Kennenlernen vor ${tage} Tagen abgeschickt. Eine Einladung zum ` +
    'persönlichen Gespräch ist noch nicht hinausgegangen und eine Absage auch nicht. ' +
    'Bitte den Bogen ansehen und entscheiden.'
  )
}

/** Der Betreff der Mail an HR. */
export function sichtungHrBetreff(name: string): string {
  return `Bitte ansehen: der Kennenlernbogen von ${name} liegt noch`
}

/** Die Überschrift der Sichtungsmail. Sie sagt, worum es geht. */
export const HR_SICHTUNG_TITEL = 'Ein Kennenlernen wartet auf eure Entscheidung'

// ── Die Erinnerungen an den Termin, nach unserer Einladung ────────────────

/**
 * Die Kette nach der verschickten Einladung: Tag 3, Tag 7, Tag 10.
 *
 * Gezählt wird seit dem 08.09.2026 ab `meta.kennenlernen.einladungAm` und
 * nicht mehr ab dem abgeschickten Bogen. Vorher stand hier der Vorwurf, er
 * habe keinen Termin gebucht, obwohl er gar nicht buchen konnte.
 *
 * Jetzt: Tag 3 die erste Erinnerung an die Einladung, Tag 7 die zweite mit dem
 * angekündigten Anruf, Tag 10 Glocke und Mail an die HR-Managerin. Danach
 * kommt nichts mehr von allein, dann greift der Anruf.
 *
 * Nicht zu verwechseln mit ERINNERUNG_TAG_1 weiter oben: Der zählt ab der
 * Einladung zum Kennenlernen und erinnert an den Bogen selbst. Die drei
 * Ketten können sich nicht überlagern: Ein abgeschickter Bogen beendet die
 * erste, die Sichtung endet mit der Einladung, und diese hier beginnt damit.
 */
export const BUCHUNG_ERINNERUNG_TAG = 3
export const BUCHUNG_ERINNERUNG_TAG_2 = 7
export const BUCHUNG_HR_TAG = 10

export const BUCHUNG_ERINNERUNG_BETREFF = 'Deine Einladung wartet noch'
export const BUCHUNG_ERINNERUNG_TITEL = 'Fehlt nur noch der Termin'
export const BUCHUNG_ERINNERUNG_VORSCHAU =
  'Deine Einladung liegt bereit, such dir eine Zeit aus.'

export const BUCHUNG_ERINNERUNG_TEXT =
  'wir haben dich vor ein paar Tagen zum persönlichen Gespräch eingeladen, ein ' +
  'Termin steht aber noch nicht. Such dir einfach eine Zeit aus, die dir passt. ' +
  'Es dauert keine Minute.'

export const BUCHUNG_ERINNERUNG_KNOPF = 'Termin aussuchen'

export const BUCHUNG_ERINNERUNG_SCHLUSS =
  'Wenn dir keine der Zeiten passt oder etwas dazwischengekommen ist, antworte ' +
  'kurz auf diese Mail.'

/**
 * Der zweite Versuch an Tag 7.
 *
 * Sie kündigt den Anruf an. Ein angekündigter Anruf ist keine Zumutung, ein
 * unangekündigter schon.
 */
export const BUCHUNG_ERINNERUNG_2_BETREFF = 'Such dir deinen Termin aus, sonst rufen wir kurz an'
export const BUCHUNG_ERINNERUNG_2_TITEL = 'Sollen wir dich kurz anrufen?'
export const BUCHUNG_ERINNERUNG_2_VORSCHAU =
  'Eine Zeit aussuchen, oder wir melden uns telefonisch.'

export const BUCHUNG_ERINNERUNG_2_TEXT =
  'unsere Einladung zum persönlichen Gespräch liegt bei dir, dein Termin fehlt ' +
  'noch. Such dir eine Zeit aus, dann steht er. Wenn wir in ein paar Tagen ' +
  'nichts von dir gehört haben, ruft dich unsere HR-Managerin einmal an und wir ' +
  'suchen die Zeit gemeinsam.'

export const BUCHUNG_ERINNERUNG_2_SCHLUSS =
  'Und wenn du es dir anders überlegt hast, sag uns das kurz. Das ist völlig in ' +
  'Ordnung, und dann hörst du nichts mehr von uns.'

/**
 * Die Mitteilung an die HR-Managerin, wenn nach zehn Tagen kein Termin steht.
 *
 * Sie geht als Glocke UND als Mail hinaus. Eine Glocke sieht nur, wer gerade
 * im CRM arbeitet; wer drei Tage im Außendienst ist, findet sie nie wieder.
 */
export function buchungHrText(name: string): string {
  return (
    `${name} ist eingeladen, hat aber seit ${BUCHUNG_HR_TAG} Tagen keinen Termin ` +
    'gebucht. Bitte anrufen und den Termin gemeinsam buchen.'
  )
}

/** Der Betreff der Mail an HR, mit dem Namen im Betreff. */
export function buchungHrBetreff(name: string): string {
  return `Bitte anrufen: ${name} hat keinen Termin gebucht`
}

/** Die Überschrift der beiden Anruf-Mails. Sie sagt, was zu tun ist. */
export const HR_ANRUF_TITEL = 'Ein Anruf wäre jetzt dran'
export const HR_ANRUF_AUGENBRAUE = 'Bewerberprozess'
export const HR_ANRUF_KNOPF = 'Bewerber öffnen'
export const HR_ANRUF_SCHLUSS =
  'Danach läuft von allein nichts mehr. Was jetzt passiert, entscheidet ihr.'
