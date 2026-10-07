/**
 * Der Wortlaut der beiden Mails, die aus dem Bewerberprofil heraus verschickt
 * werden: die Einladung zum persönlichen Gespräch und die Absage nach einem
 * gelesenen Kennenlernbogen.
 *
 * ## Warum es diese beiden Mails gibt
 *
 * Bis zum 08.09.2026 hat sich der Bewerber am Ende des Kennenlernbogens
 * **selbst** einen Termin gebucht. Das ist umgedreht: Der Bogen endet ohne
 * Terminwahl, und wir laden gezielt ein, nachdem wir seine Antworten gelesen
 * haben. Damit gibt es genau zwei Ausgänge, und für jeden eine Mail.
 *
 * ## Warum der Wortlaut hier steht und nicht in der Vorlage
 *
 * Dieselbe Begründung wie in `bewerber-kennenlernen-mail.ts`: Die Vorlagen
 * laden React über einen `npm:`-Spezifizierer und sind für Vitest damit
 * unerreichbar. Was hier steht, können beide Welten lesen, die Vorlage in Deno
 * und der Test in `src/lib/bewerberKooperationsgespraechMail.test.ts`.
 *
 * ## Der Ton
 *
 * Du-Ansprache, ruhig, ohne Werbesprache. Die Einladung darf keine Zusage sein
 * und keine Anstellung versprechen; sie soll aber spürbar machen, dass wir ihn
 * wollen. Die Absage sagt, was Sache ist, ohne zu verletzen und ohne Floskel.
 */

/**
 * Der Kalender, in dem der Bewerber seine Zeit aussucht.
 *
 * Seit dem 21.09.2026 Calendly und nicht mehr unsere eigene Buchungsstrecke.
 * Christian hat die Terminfindung über den Videoraum eingeklammert, weil sie
 * nicht zuverlässig lief.
 *
 * Diese Adresse steht nicht mehr in der Mail. Sie wird von der Seite
 * `/kennenlerngespraech/:token` eingebettet, siehe `kooperationsBuchungsLink`.
 * Wechselt die Person, die das Gespräch führt, wechselt hier die Adresse, an
 * genau dieser einen Stelle.
 */
export const KOOPERATION_KALENDER_URL = 'https://calendly.com/sarah-kaiser-thom-more/gespraechstermin'

/**
 * Die eigene Terminseite, das Ziel des Knopfs in der Einladungsmail.
 *
 * Warum nicht gleich Calendly: Der Bewerber soll nach dem Buchen die Zeit
 * bestätigen, damit sie ohne Nachtragen im CRM steht. Calendly meldet uns
 * nichts zurück, unsere eigene Seite kann die Bestätigung entgegennehmen.
 */
export const KOOPERATION_BASIS_URL = 'https://portal.more.immo/kennenlerngespraech'

/**
 * Der alte Weg über die eigene Buchungsstrecke mit Videoraum, eingeklammert.
 *
 * Er steht hier nur noch, damit nachvollziehbar bleibt, was der Link vorher
 * war. Die Route gibt es weiter, verlinkt wird sie nicht mehr.
 */
export const KOOPERATION_PORTAL_URL_ALT = 'https://portal.more.immo/kooperationsgespraech'

/**
 * Der Link für einen Bewerber, mit seinem Token.
 *
 * Das Token ist dasselbe wie beim Kennenlernen: `bewerber_formular.token`. Es
 * gibt kein zweites. Die Seite dahinter erkennt daran, wer da bucht, ohne dass
 * sich jemand anmelden muss, und schreibt die bestätigte Zeit an genau diesen
 * Bewerber.
 *
 * Ohne Token gibt es keinen Link. Ein Knopf, der auf eine Seite ohne Zuordnung
 * führt, wäre schlimmer als keiner: Der Bewerber bestätigt dort ins Leere.
 */
export function kooperationsBuchungsLink(token: string, basis = KOOPERATION_BASIS_URL): string {
  const sauber = (token || '').trim()
  if (!sauber) return ''
  return `${basis.replace(/\/+$/, '')}/${sauber}`
}

/**
 * Derselbe Weg als Pfad innerhalb des Portals.
 *
 * Für Links im Browser, die nicht aus einer Mail kommen: Der Kennenlernbogen
 * zeigt einem Bewerber, der bereits einen Termin hat, den Weg zum Verschieben
 * und Absagen, und der führt in dieselbe Buchungsstrecke. Ein absoluter Link
 * wäre dort falsch, er verließe die Vorschau und landete in der Produktion.
 */
export function kooperationsPfad(token: string): string {
  const sauber = (token || '').trim()
  return sauber ? `/kooperationsgespraech/${sauber}` : ''
}

// ── Die Einladung zum persönlichen Gespräch ────────────────────────────────

/** Der Name des Gesprächs. Muss `GESPRAECH_NAME` im CRM entsprechen. */
export const KOOPERATION_GESPRAECH_NAME = 'Persönliches Gespräch'

/** Derselbe Name gebeugt, für „zu einem …". Entspricht `GESPRAECH_NAME_DATIV`. */
export const KOOPERATION_GESPRAECH_DATIV = 'persönlichen Gespräch'

export const EINLADUNG_BETREFF = 'Lass uns miteinander sprechen'
export const EINLADUNG_AUGENBRAUE = 'Dein Kennenlernen'
export const EINLADUNG_TITEL = 'Wir würden dich gern kennenlernen'
export const EINLADUNG_VORSCHAU =
  'Deine Antworten haben uns gefallen. Such dir eine Zeit aus.'

/**
 * Der erste Absatz: die Wertschätzung, und zwar konkret.
 *
 * Er nennt den Grund der Mail im ersten Satz. „Wir haben deine Antworten
 * gelesen" ist überprüfbar und deshalb glaubwürdig; ein allgemeines „Danke für
 * dein Interesse" wäre an dieser Stelle austauschbar, das stand schon in der
 * Eingangsmail.
 */
export const EINLADUNG_GEFALLEN =
  'wir haben deine Antworten aus dem Kennenlernen in Ruhe gelesen, und sie ' +
  'haben uns gefallen. Wir können uns gut vorstellen, dass eine Zusammenarbeit ' +
  'zwischen uns passt.'

/**
 * Der zweite Absatz: die Einladung selbst, und was das Gespräch ist.
 *
 * Hier liest der Bewerber den Namen zum ersten Mal, deshalb steht er nicht
 * allein da, sondern mit dem, was ihn füllt. Der kurze Name gehört in die
 * Betreffzeile und in den Kalender, hier gehört der ganze Satz hin.
 *
 * Bewusst ohne Zeitangabe. Wie lange das Gespräch dauert, ergibt sich aus
 * seinen eigenen Antworten (25 oder 35 Minuten) und steht auf der
 * Buchungsseite, wo die Zahl auch stimmt. Eine ausgedachte Zahl in der Mail
 * widerspräche später der Seite.
 */
export const EINLADUNG_GESPRAECH =
  `Deshalb möchten wir dich zu einem ${KOOPERATION_GESPRAECH_DATIV} einladen, ` +
  'in dem wir uns näher kennenlernen und alles Weitere zur Zusammenarbeit ' +
  'besprechen, auch wie ein Start für dich individuell aussehen kann. Das ist ' +
  'ein Videocall, in dem wir uns virtuell gegenübersitzen.'

/** Der dritte Absatz, direkt über dem Knopf. Er sagt, was zu tun ist. */
export const EINLADUNG_TERMINWAHL =
  'Such dir einfach den Tag und die Uhrzeit aus, die dir am besten passen.'

/**
 * Die Beschriftung des einen Knopfes.
 *
 * Drei Überlegungen. Erstens steht der Name des Gesprächs darin, denn genau so
 * heißt es im ganzen Prozess, in der Bestätigung, im Kalendereintrag und in der
 * Erinnerung; ein anderes Wort im Knopf hieße, der Bewerber müsste zwei Namen
 * für dieselbe Sache lernen. Zweitens „vereinbaren" und nicht „buchen": Buchen
 * tut man ein Hotelzimmer, und der ganze Prozess vermeidet die Sprache des
 * Verkaufs. Drittens ist „vereinbaren" das Wort, das die Rückfrage vor der
 * Buchung ohnehin schon benutzt, damit sagen Mail und Seite dasselbe.
 */
export const EINLADUNG_KNOPF = `${KOOPERATION_GESPRAECH_NAME} vereinbaren`

/** Die Zeile unter dem Knopf. Sie nimmt die Angst vor dem festen Termin. */
export const EINLADUNG_KNOPF_HINWEIS =
  'Du suchst dir Tag und Uhrzeit selbst aus  ·  verschieben geht jederzeit'

/**
 * Der Schlussabsatz.
 *
 * Der erste Satz ist die wichtigste Zeile der ganzen Mail: Sie hält die
 * Einladung ausdrücklich offen. Ohne ihn liest sich „wir können uns gut
 * vorstellen, dass es passt" wie eine Zusage, und eine Zusage ist es nicht.
 */
export const EINLADUNG_SCHLUSS =
  'Entschieden ist damit noch nichts, weder auf deiner Seite noch auf unserer. ' +
  'Genau dafür ist das Gespräch da. Wenn du vorher eine Frage hast, melde dich ' +
  'gerne, meine Kontaktdaten stehen gleich hier unten.'

/** Die Zeile im Fuß, für den Fall, dass er doch nicht mehr möchte. */
export const EINLADUNG_FUSS_HINWEIS =
  'Wenn dein Interesse nicht mehr aktuell ist, antworte kurz auf diese Mail. ' +
  'Dann hörst du nichts mehr von uns.'

// ── Die Absage nach einem gelesenen Kennenlernbogen ───────────────────────

/**
 * Warum diese Absage eine eigene ist und nicht `bewerber-absage`.
 *
 * Die vorhandene Vorlage sagt wörtlich „Nach unserem Gespräch sind wir zu dem
 * Schluss gekommen". Sie wird aus dem Erstgespräch, dem Closing und dem
 * Videocall verschickt, also immer nach einem geführten Gespräch. Diese hier
 * kommt, bevor überhaupt jemand miteinander gesprochen hat: Wir haben einen
 * Bogen gelesen, sonst nichts. Ein Satz, der ein Gespräch behauptet, das es
 * nie gab, ist für den Empfänger nachweislich falsch, und genau daran erkennt
 * er den Textbaustein. Deshalb zwei Fassungen. Der Versandweg bleibt derselbe,
 * beide liegen in `src/lib/bewerberAbsageMail.ts`.
 */
export const ABSAGE_BETREFF = 'Deine Bewerbung bei MOREImmo'
export const ABSAGE_TITEL = 'Danke für deine Antworten'
export const ABSAGE_VORSCHAU = 'Wir haben uns dein Kennenlernen angesehen.'

/** Der erste Absatz: der Dank, und die Feststellung, dass wirklich gelesen wurde. */
export const ABSAGE_DANK =
  'danke, dass du dir die Zeit für das Kennenlernen genommen hast. Wir haben ' +
  'deine Antworten gelesen.'

/**
 * Der zweite Absatz: die Entscheidung.
 *
 * Kein Grund, der verletzt. Der zweite Satz verlagert die Ursache bewusst auf
 * uns und nicht auf ihn, denn das ist auch der Sachverhalt: Wir entscheiden
 * anhand dessen, was wir gerade begleiten können.
 */
export const ABSAGE_ENTSCHEIDUNG =
  'Wir sind zu dem Ergebnis gekommen, dass es bei uns gerade nicht passt. Das ' +
  'ist kein Urteil über dich, sondern eine Entscheidung darüber, was wir im ' +
  'Moment leisten können.'

/** Der Schluss. Ein Satz, mehr braucht es nicht. */
export const ABSAGE_SCHLUSS = 'Für deinen weiteren Weg wünschen wir dir alles Gute.'
