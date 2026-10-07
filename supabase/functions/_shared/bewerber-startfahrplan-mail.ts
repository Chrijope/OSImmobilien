/**
 * Der Wortlaut der Startfahrplan-Mail (Vorlage `paket-uebersicht`).
 *
 * ## Wann sie hinausgeht
 *
 * Sie geht an einen Bewerber, der im persönlichen Gespräch gesagt hat, dass er
 * die Unterlagen möchte (Tür „Ich möchte die Unterlagen" in
 * `bewerberVideocall.ts`). Verschickt wird über `sendeStartfahrplan` in
 * `src/lib/startfahrplanVersand.ts` und von dort über die Edge Function
 * `send-transactional-email`. Dieselbe Vorlage benutzen der Service-Knopf im
 * Reiter Closing und die Unterlagen-Weiche in Teil 2 des alten Erstgesprächs.
 *
 * ## Warum der Wortlaut hier steht und nicht in der Vorlage
 *
 * Dieselbe Begründung wie in `bewerber-kooperationsgespraech-mail.ts`: Die
 * Vorlagen laden React über einen `npm:`-Spezifizierer und sind für Vitest
 * damit unerreichbar. Was hier steht, können beide Welten lesen, die Vorlage in
 * Deno und der Test in `src/lib/bewerberStartfahrplanMail.test.ts`.
 *
 * ## Was an der alten Fassung falsch war (09.09.2026)
 *
 *   1. **Sie siezte.** Als einzige Mail des neuen Bewerberwegs. Kennenlernen,
 *      Einladung, Erinnerung und Absage duzen alle.
 *   2. **Sie nannte „alle vier Startmöglichkeiten".** Die gibt es nicht mehr.
 *      Seit dem 07.09.2026 ist die Servicevereinbarung aus dem Vertragswerk
 *      heraus, und wählbar sind nach `lizenzPakete.ts` nur noch der
 *      Vertriebspartner mit 4 Prozent und der Tippgeber. Die vier alten
 *      Setup-Pakete stehen dort mit `waehlbar: false` und existieren nur noch
 *      für Bestandspartner.
 *   3. **Sie benutzte das Wort „Quereinsteiger".** Der übrige Prozess
 *      vermeidet es bewusst: Im Bogen heißt die fünfte Gruppe „Vertrieb ist
 *      für mich neu, ich will es lernen", in den Folien „Beides ist neu für
 *      mich", und die Regieanweisung zu Weg 5 sagt wörtlich: kein Wort
 *      „Quereinsteiger".
 *   4. **Sie verwies auf „Anlage 2".** Das war die Nummer der Altfassung. Im
 *      heutigen Vertrag ist Anlage 1 das Konditionenblatt und Anlage 2 die
 *      Auftragsverarbeitungsvereinbarung (`ANLAGE_TITEL` in
 *      `vertragKlauseln.ts`). Statt einer Nummer, die wieder wandern kann,
 *      steht hier der Vertrag mit seinen Anlagen.
 *
 * ## Der Ton
 *
 * Du-Ansprache, kurze Sätze, keine Werbesprache, keine Gedankenstriche. Jede
 * Zahl in diesem Text steht so im Code; der Test hält sie daran fest.
 */

export const STARTFAHRPLAN_BETREFF = 'Dein Startfahrplan bei OS Immobilien'
export const STARTFAHRPLAN_AUGENBRAUE = 'Nach unserem Gespräch'
export const STARTFAHRPLAN_TITEL = 'Dein Startfahrplan'
export const STARTFAHRPLAN_VORSCHAU =
  'Zum Nachlesen: wie die Zusammenarbeit aussieht und wie es weitergeht.'

/**
 * Der erste Absatz. Er nennt den Grund der Mail im ersten Satz und zählt auf,
 * was im PDF steht. Die Aufzählung folgt den Abschnitten aus
 * `paketUebersichtPdf.ts`, damit die Mail nichts ankündigt, was das Dokument
 * nicht hat.
 */
export const STARTFAHRPLAN_EINLEITUNG =
  'du wolltest die Unterlagen, hier sind sie. Der Startfahrplan fasst zusammen, ' +
  'worüber wir gesprochen haben: wer wir sind, welche Immobilien wir anbieten, ' +
  'wie die Zusammenarbeit aussieht und wie ein Kundenfall vom ersten Lead bis ' +
  'zur Abrechnung läuft.'

/** Die Zeile über der Aufzählung der beiden Wege. */
export const STARTFAHRPLAN_WEGE_VORSATZ = 'Für den Start gibt es zwei Wege:'

/**
 * Die beiden Modelle, die neuen Bewerbern heute offenstehen
 * (`WAEHLBARE_LIZENZ_PAKETE`).
 *
 * Der Satz zum Vertriebspartner nennt 4 Prozent, den Satz aus dem Paket
 * „junior"; der Test vergleicht die Zahl mit `lizenzPakete.ts`. Beim Tippgeber
 * steht bewusst keine Zahl: Seine Vergütung wird individuell im Closing
 * hinterlegt, es gibt keinen allgemeinen Satz, den man hier nennen könnte.
 *
 * Das Paket „Lead-Berater" fehlt hier absichtlich. Es ist ein Duplikat des
 * Vertriebspartners mit demselben Satz und unterscheidet sich nur darin, wie
 * es zu Leads kommt. Als eigener „Weg" wäre es eine Unterscheidung ohne
 * Unterschied.
 */
export const STARTFAHRPLAN_WEGE: readonly string[] = [
  'Als Vertriebspartner berätst du selbst. Du bekommst 4 Prozent Provision, ' +
    'auf eigene Kunden und auf Leads von uns gleichermaßen.',
  'Als Tippgeber stellst du nur den Kontakt her und berätst nicht. Was du je ' +
    'vermitteltem Abschluss bekommst, halten wir mit dir persönlich fest.',
]

/**
 * Was der Start kostet, und was das PDF davon im Einzelnen behandelt.
 *
 * Beide wählbaren Pakete haben `preis: 0`, `monatlich: 0` und
 * `laufzeitMonate: 0`. Der letzte Satz sagt ehrlich, dass der Startfahrplan
 * den Weg als Vertriebspartner beschreibt und nicht beide vergleicht; das
 * Dokument kennt den Tippgeber nicht.
 */
export const STARTFAHRPLAN_KOSTEN =
  'Für beide Wege gilt: kein laufendes Entgelt, kein Einmalbetrag, keine ' +
  'Mindestlaufzeit. CRM, Objektzugänge, Exposés, Skripte und die ' +
  'Pflichtschulungen stellen wir dir. Der Startfahrplan geht auf den Weg als ' +
  'Vertriebspartner im Einzelnen ein.'

/**
 * Der Absatz zur Herkunft, in der Sprache des übrigen Prozesses.
 *
 * Er ersetzt „Ob Sie als Quereinsteiger starten oder aus der Branche kommen".
 * Dass der Lernplan an Voraussetzungen hängt und nicht an Wochen, steht so im
 * Modul „Lernplan" des persönlichen Gesprächs.
 */
export const STARTFAHRPLAN_HERKUNFT =
  'Ob du aus der Branche kommst oder ganz neu anfängst, beides geht. Der ' +
  'Lernplan richtet sich danach, was du schon mitbringst.'

export const STARTFAHRPLAN_KNOPF = 'Startfahrplan öffnen'

/**
 * Die Zeile unter dem Knopf. Die 90 Tage sind die Laufzeit der signierten
 * Adresse aus `uploadPaketUebersichtPdf`, nicht geschätzt.
 */
export const STARTFAHRPLAN_KNOPF_HINWEIS = 'PDF  ·  Link 90 Tage gültig'

/**
 * Der Schlussabsatz.
 *
 * Zwei Dinge muss er leisten. Erstens die Entscheidung offen halten, wörtlich
 * wie die Tür im Gespräch es versprochen hat: „Ein Vertrag wird dafür nicht
 * erstellt, entschieden ist noch nichts." Zweitens sagen, was als Nächstes
 * passiert, denn zu dieser Mail gehört ein Nachfassen mit Termin
 * (`abschlussWirkung`, Fall „unterlagen"). Ein Datum steht bewusst nicht hier:
 * Der Termin wird im Gespräch gesetzt und ist der Vorlage nicht bekannt.
 */
export const STARTFAHRPLAN_SCHLUSS =
  'Entschieden ist damit nichts. Lies in Ruhe nach, und wenn du eine Frage ' +
  'hast, melde dich einfach. Wir melden uns wieder bei dir, damit die Sache ' +
  'nicht liegen bleibt.'

/** Der rechtliche Hinweis am Fuß. Ohne Nummer einer Anlage, siehe Kopf. */
export const STARTFAHRPLAN_HINWEIS =
  'Der Startfahrplan ist eine unverbindliche Information zur Vorbereitung auf ' +
  'unser nächstes Gespräch. Verbindlich ist erst der unterschriebene Vertrag ' +
  'mit seinen Anlagen.'
