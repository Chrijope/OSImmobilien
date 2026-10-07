/// <reference types="npm:@types/react@18.3.1" />
/**
 * Das gemeinsame Aussehen aller OS Immobilien-Mails.
 *
 * Bis hierher gab es kein gemeinsames Layout. Jede der 68 Vorlagen schrieb
 * Kopfbereich, Logo, Schrift, Knopf, Trennlinie und Fusszeile neu und legte
 * darunter zwanzig eigene Stilobjekte an. Die Folgen sah man an den Details:
 * das Logo mal 200, mal 220 Pixel breit; 26 Vorlagen trugen noch das Taupe und
 * Beige aus der Zeit vor der Farbumstellung; die Konstanten in der
 * Wochenzusammenfassung heissen bis heute GOLD, obwohl blaue Werte darin
 * stehen. Und eine Aenderung am Aussehen hiess: 68 Dateien anfassen.
 *
 * Ab jetzt beschreibt eine Vorlage nur noch ihren Inhalt.
 *
 * Die Gestaltung folgt drei Regeln:
 *
 *   Eine Handlung je Mail. Ein Knopf, weit oben, ueber die volle Breite, mit
 *   der Angabe, was er kostet. Alles andere ordnet sich unter.
 *
 *   Farbe hebt genau eine Sache hervor. Vorher konkurrierten zwei farbige
 *   Kaesten mit dem Knopf um dieselbe Aufmerksamkeit. Jetzt ist nur der Knopf
 *   farbig, der Rest ist Schwarz auf Weiss mit Grauabstufungen.
 *
 *   Struktur entsteht durch Abstand, nicht durch Rahmen. Das ist der
 *   Unterschied zwischen teuer und bunt.
 *
 * Technisch: Tabellen statt Flexbox, Inline-Stile statt Klassen, feste
 * Pixelwerte statt rem. Outlook rendert mit Word, und Word kann nichts davon.
 *
 * Drei Dinge lassen sich mit Inline-Stilen allein nicht loesen. Sie stehen
 * deshalb hier zentral, damit sie in jeder Mail gelten:
 *
 *   Dunkelmodus. Ohne `color-scheme` dreht Apple Mail die Farben selbst um,
 *   und dann steht das Logo als heller Kasten auf dunklem Grund. Siehe
 *   DUNKELMODUS_CSS und die Klassen `mi-*` weiter unten.
 *
 *   Knoepfe in Outlook unter Windows. Word ignoriert `display:block` und
 *   `padding` an einem `a`, uebrig blieb ein gedrungener Balken. Siehe
 *   knopfMarkup().
 *
 *   Der Nur-Text-Teil. Aus einer Tabelle macht der Textwandler eine einzige
 *   Wurst ("AnlassTelefonisches ErstgespraechDatum..."), weil Tabellenzellen
 *   keine Trennzeichen setzen. Siehe NurText und Zeilenende.
 */
import * as React from 'npm:react@18.3.1'
import {
  Body, Head, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { LAYOUT_TEXTE, mailSprache, mitSprache, rolleFuer, type MailSprache } from './_sprache.ts'
import { avatarUrlFuerMail, MAIL_LOGO_URL } from '../avatar-signieren.ts'

// ── Marke ────────────────────────────────────────────────────────────────

export const MARKE = {
  name: 'OS Immobilien',
  /**
   * Eigene Fassung fuer den Mailversand, nicht das Original aus der App.
   *
   * Das Original ist 1920 mal 575 Pixel gross, zu 87 Prozent transparent und
   * hat viel Rand. In einer Mail hiess das: aeltere Outlook-Versionen legen
   * transparente PNG schwarz hinterlegt an, und ein dunkles Logo auf schwarzem
   * Grund ist unsichtbar. Der Rand liess es ausserdem kleiner wirken, als die
   * Breitenangabe versprach.
   *
   * Diese Fassung ist auf den sichtbaren Inhalt zugeschnitten, auf Weiss
   * gesetzt (die Farbe des Mailgrunds) und liegt in doppelter Aufloesung vor,
   * damit sie auf Retina-Bildschirmen scharf bleibt: 320 mal 55 Pixel, gezeigt
   * mit 160 mal 27.
   *
   * Weil das Weiss eingebrannt ist, sitzt das Logo auf einer eigenen weissen
   * Platte, die auch im Dunkelmodus weiss bleibt. Im hellen Modus verschmilzt
   * sie mit dem weissen Grund und ist unsichtbar; im dunklen wird aus dem
   * ehemals zufaelligen hellen Kasten eine bewusst gesetzte Flaeche mit
   * runden Ecken, auf der die dunkle Logoschrift lesbar bleibt.
   *
   * Die Adresse stimmt und die Datei liegt dort: `public/moreimmo-logo-mail.png`
   * wird mit veroeffentlicht und antwortet unter dieser Adresse mit 200 und
   * `image/png`, auch gegenueber den Bildproxys der Mailanbieter. Wenn das Logo
   * trotzdem nicht erscheint, laedt das Programm des Empfaengers fremde Bilder
   * nicht. Dagegen hilft keine andere Adresse, sondern nur ein Ersatztext, der
   * etwas taugt, siehe logoStil.
   *
   * Zwei Auswege wurden geprueft und verworfen. Ein Data-URI braeuchte keinen
   * Abruf, aber Gmail und Outlook.com entfernen `data:` aus `src`, dann bliebe
   * gar kein Bild; ausserdem haengt er jeder Mail rund 13 Kilobyte an. Ein
   * Anhang mit Content-ID wuerde zwar ueberall geladen, muesste aber von jeder
   * versendenden Function einzeln mitgeschickt werden und waere damit genau die
   * Streuung ueber viele Dateien, die dieses Layout beseitigt hat.
   */
  logo: MAIL_LOGO_URL,
  logoBreite: 160,
  logoHoehe: 27,
  anschrift: 'OS Immobilien Holding GmbH, Am Ostbahnhof 1, 15749 Mittenwalde',
  impressum: 'https://osimmobilien.netlify.app/impressum',
  datenschutz: 'https://osimmobilien.netlify.app/datenschutz',
  telefon: '',
  mail: 'os@os-immobilien.com',
} as const

/**
 * Farben und Groessen, nach dem Hausstil von OS Immobilien.
 *
 * Bis hierher stand hier das Aussehen von Apple: Systemblau #159061, die
 * Systemschrift SF Pro, Radien von 16 Pixeln, neutrale Grautoene. Der Hausstil
 * ist ein anderer, und er ist im Projekt an drei Stellen festgehalten:
 * `src/index.css` (die Tokens des CRM), `EmailSignaturDialog.tsx` (die
 * Signatur, Abschnitt 3 und 9 der Markenrichtlinie) und die PDF-Erzeugung in
 * `src/lib/`. Die Werte hier sind von dort uebernommen, nicht neu erfunden.
 *
 *   Blau 600 #15724F   Knopf, Balken. Entspricht --primary im CRM. Mit weisser
 *                      Schrift 4,51:1; das alte #159061 kam nur auf 4,02:1.
 *   Blau 700 #13704D   Verweise. Auf Weiss 6,05:1.
 *   Tinte    #131720   Fliesstext und Ueberschriften, 17,9:1.
 *   Linie    #E3E7EC   Haarlinien.
 *
 * Die Abstufungen der leiseren Toene liegen in derselben Blaufamilie und sind
 * so gewaehlt, dass jede von ihnen 4,5:1 erreicht, gemessen auf dem weissen
 * Grund: 7,9 / 6,6 / 5,1:1. Das betrifft vor allem die
 * Fusszeile, sie stand vorher in #A9AAAE und damit bei 2,3:1, also unter jeder
 * Lesbarkeitsschwelle. Viel Luft nach oben gibt es dabei nicht: mehr als drei
 * unterscheidbare Graustufen sind ueber der Schwelle nicht unterzubringen, den
 * Rest der Abstufung tragen Schriftgroesse und Fettung.
 *
 * Gruen, Rot und Gelb waren die Systemfarben von Apple. Als Text auf Weiss
 * erreichten sie 1,9 bis 2,3:1. Hier stehen jetzt abgedunkelte Fassungen
 * derselben Bedeutungen, alle ueber 4,5:1; fuer den Dunkelmodus gibt es
 * aufgehellte Gegenstuecke, siehe DUNKELMODUS_CSS.
 *
 * Zur Schrift: Helvetica steht vorn, wie in der Signatur und aus demselben
 * Grund. Die Mail landet in fremden Programmen, und die Systemschrift sieht
 * dort ueberall anders aus. Webschriften scheiden aus, Outlook laedt keine.
 *
 * Die graue Flaeche #F5F5F7 hinter der Karte ist entfallen: Die Mail steht
 * jetzt komplett auf Weiss, die ehemalige Karte hat keinen sichtbaren Kasten
 * mehr. Das Logo-PNG ist passend dazu auf Weiss gesetzt (siehe MARKE.logo).
 */
export const T = {
  blau: '#15724F',
  blauDunkel: '#13704D',
  /** Fuer Verweise auf hellem Grund. Dasselbe Blau 700 wie in der Signatur. */
  blauLink: '#13704D',
  /** Nur fuer den Dunkelmodus. Entspricht --primary im dunklen CRM. */
  blauHell: '#36E2A0',
  text: '#131720',
  textLeise: '#4A5261',
  textStumm: '#565D6C',
  textZart: '#676E7D',
  linie: '#E3E7EC',
  weiss: '#FFFFFF',
  gruen: '#22825A',
  rot: '#C81D1D',
  gelb: '#A85D00',
  radius: '12px',
  radiusKlein: '10px',
  schrift: 'Helvetica, "Helvetica Neue", Arial, sans-serif',
} as const

// ── Dunkelmodus ──────────────────────────────────────────────────────────

/**
 * Der Dunkelmodus war bisher nirgends behandelt. Ohne Angabe halten Apple Mail
 * und Outlook eine Mail fuer ein helles Dokument und rechnen die Farben selbst
 * um. Was dabei herauskommt, hat mit der Gestaltung nichts mehr zu tun: Texte
 * werden ungleichmaessig aufgehellt, und Bilder bleiben, wie sie sind. Beim
 * Logo mit seiner eingebrannten hellen Flaeche hiess das: ein heller Kasten
 * mitten im dunklen Kopfbereich.
 *
 * Mit `color-scheme` sagt die Mail, dass sie beide Modi selbst beherrscht.
 * Die Umrechnung unterbleibt dann, und stattdessen greifen diese Regeln.
 *
 * Warum ueberhaupt Klassen, wo doch sonst alles inline steht: Eine
 * Medienabfrage laesst sich inline nicht ausdruecken. Die Inline-Stile bleiben
 * die Wahrheit fuer den hellen Modus und fuer jedes Programm, das `<style>`
 * verwirft; die Klassen sind nur der Zusatz fuer den dunklen. Deshalb `!important`:
 * ein Inline-Stil schlaegt sonst jede Klasse.
 *
 * Die Toene sind aus den dunklen Tokens des CRM uebernommen (`src/index.css`,
 * Abschnitt `.dark`): Text, Linie und das helle Blau. Flaeche und Karte
 * tragen bewusst dieselbe Grundfarbe, die bisherige Kartenfarbe #1F2428.
 * Im hellen Modus ist die Mail komplett weiss und ohne Kasten; der
 * Dunkelmodus zieht das nach, sonst kaeme der Kasten-Effekt dort zurueck.
 *
 * Mit dem Hausstil sind Klassen dazugekommen. `mi-link` und `mi-balken` hellen
 * Blau 600 auf, das auf dunklem Grund zu dunkel waere; `mi-gut`, `mi-warn`,
 * `mi-fehler` und die `mi-strich`-Reihe tun dasselbe fuer die Statusfarben,
 * die im hellen Modus bewusst abgedunkelt sind. Ohne sie stuenden Verweise und
 * Kennzahlen im Dunkelmodus unter 3:1.
 */
const DUNKELMODUS_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .mi-flaeche { background-color: #1F2428 !important; }
  .mi-karte   { background-color: #1F2428 !important; }
  .mi-text    { color: #E5E9EC !important; }
  .mi-leise   { color: #B9C0C7 !important; }
  .mi-stumm   { color: #9BA3AB !important; }
  .mi-zart    { color: #8A929A !important; }
  .mi-linie   { background-color: #35383B !important; }
  .mi-kreis   { background-color: #35383B !important; color: #B9C0C7 !important; }
  .mi-rahmen  { border-color: #35383B !important; }
  .mi-platte  { background-color: #FFFFFF !important; }
  .mi-link    { color: #36E2A0 !important; }
  .mi-balken  { background-color: #36E2A0 !important; }
  .mi-gut     { color: #4ADE80 !important; }
  .mi-warn    { color: #FFB020 !important; }
  .mi-fehler  { color: #FF6B60 !important; }
  .mi-strich        { background-color: #6E7681 !important; }
  .mi-strich-warn   { background-color: #FFB020 !important; }
  .mi-strich-fehler { background-color: #FF6B60 !important; }
}
`.trim()

// ── Nur-Text-Teil ────────────────────────────────────────────────────────

/**
 * Sichtbar nur im Nur-Text-Teil.
 *
 * Jede Mail geht als HTML und als reiner Text hinaus, beide entstehen aus
 * derselben Vorlage. Der Textwandler kennt aber keine Tabellenzellen und haengt
 * ihren Inhalt ohne Trennung aneinander. Aus zwei Spalten wurde so
 * "AnlassTelefonisches Erstgespraech". Was hierin steht, ist im HTML verborgen
 * und taucht nur im Text auf.
 */
const versteckt = {
  display: 'none' as const,
  fontSize: 0,
  lineHeight: 0,
  maxHeight: 0,
  overflow: 'hidden' as const,
  msoHide: 'all',
}

/** Ein Trennzeichen, das nur der Nur-Text-Teil zeigt, etwa ": ". */
export function NurText({ children }: { children: React.ReactNode }) {
  return <span style={versteckt}>{children}</span>
}

/** Ein Zeilenumbruch, den nur der Nur-Text-Teil zeigt. */
export function Zeilenende() {
  return (
    <span style={versteckt}>
      <br />
    </span>
  )
}

// ── Stile ────────────────────────────────────────────────────────────────

const body = { backgroundColor: T.weiss, fontFamily: T.schrift, margin: 0, padding: 0 }
// margin 0 statt auto: die Mail steht links, nicht in der Mitte. Fuer Outlook
// haengt zusaetzlich align="left" an der Huellen-Tabelle, Word liest nur das.
const huelle = { maxWidth: '600px', width: '100%', margin: 0, padding: 0 }
// Der Innenabstand der Platte (8/12) ist hier abgezogen, damit das Logo an
// derselben Stelle sitzt wie vorher: 32 Pixel von oben, 40 von links.
const kopf = { padding: '24px 28px 0' }
// Weiss auf Weiss unsichtbar. Die Platte bleibt wegen des Dunkelmodus: das
// Logo-PNG hat dunkle Schrift auf eingebranntem Weiss (siehe MARKE.logo) und
// braucht dort einen hellen Grund, siehe .mi-platte in DUNKELMODUS_CSS.
const logoPlatte = {
  backgroundColor: T.weiss,
  borderRadius: '8px',
  padding: '8px 12px',
  lineHeight: 0,
}
/**
 * Der Stil des Logos, und zugleich der Stil seines Ersatztextes.
 *
 * Die Schriftangaben stehen hier nicht aus Versehen. Ein Bild in einer Mail ist
 * kein sicherer Bestandteil: Outlook unter Windows laedt fremde Bilder in der
 * Voreinstellung gar nicht, Apple Mail unterdrueckt sie bei aktiviertem
 * Datenschutz, und viele Firmenpostfaecher blockieren sie grundsaetzlich. Wer
 * eine solche Mail oeffnet, sah bisher oben links einen leeren Kasten mit dem
 * blossen Wort „OS Immobilien" darin, gesetzt in der Standardschrift des Programms.
 *
 * Ein Mailprogramm zeichnet den Alternativtext eines blockierten Bildes aber
 * mit den Schriftangaben, die am `img` selbst stehen. Deshalb tragen sie hier
 * die Hausschrift, die Tinte und die Fettung der Wortmarke. Aus dem leeren
 * Rahmen wird damit der Schriftzug, und die Mail sieht auch ohne geladenes
 * Bild nach uns aus.
 *
 * Dasselbe Mittel setzt weiter unten schon der Unterschriftsblock ein, dort
 * mit den Initialen als Alternativtext des Profilbildes.
 *
 * Die Farbe bleibt bewusst die dunkle Tinte und bekommt keine `mi-`Klasse: Der
 * Ersatztext steht auf der Logoplatte, und die ist auch im Dunkelmodus weiss
 * (siehe `.mi-platte`). Ein aufgehellter Ton waere dort unsichtbar.
 *
 * 17 Pixel, weil der Text in die 27 Pixel hohe Bildflaeche passen muss. Groesser
 * gesetzt schneiden ihn Outlook und Apple Mail unten ab.
 */
const logoStil = {
  display: 'block' as const,
  width: '160px',
  height: '27px',
  border: 0,
  outline: 'none' as const,
  textDecoration: 'none' as const,
  fontFamily: T.schrift,
  fontSize: '17px',
  lineHeight: '27px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  whiteSpace: 'nowrap' as const,
  color: T.text,
  // Outlook rendert mit Word und ignoriert width in Prozent. Deshalb feste
  // Pixel im Stil und zusaetzlich als Attribut am Bild.
  msInterpolationMode: 'bicubic' as const,
}
// Seit dem Wechsel auf den weissen Grund hat die Karte keinen sichtbaren
// Kasten mehr, sie verschmilzt mit dem Body. Der Baustein bleibt trotzdem:
// er traegt die Abstaende, und der Dunkelmodus haengt an .mi-karte.
const karte = {
  backgroundColor: T.weiss,
  borderRadius: T.radius,
  margin: '20px 40px 0',
  padding: 0,
}
const innen = { padding: '40px 40px 0' }
const innenSchluss = { padding: '28px 40px 40px' }

const augenbraue = {
  margin: '0 0 10px',
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: T.textStumm,
  fontWeight: 700,
}
// Die enge Laufweite von -0.02em war auf SF Pro gemuenzt. Helvetica ist von
// Haus aus enger gesetzt, dieselbe Angabe laesst die Buchstaben verkleben.
const ueberschrift = {
  margin: '0 0 12px',
  fontSize: '28px',
  lineHeight: '1.2',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: T.text,
}
/**
 * Der blaue Balken der Markenrichtlinie.
 *
 * Er sitzt unter der Ueberschrift, 44 mal 3 Pixel in Blau 600, genau wie im
 * CRM (`PageHeader.tsx`), auf der Karriereseite und in der Mailsignatur. Er
 * ist das eine Zeichen, an dem eine Seite als unsere zu erkennen ist, und er
 * war das einzige Element des Hausstils, das in den Mails fehlte.
 *
 * Er nimmt dem Knopf nichts weg: drei Pixel Hoehe sind keine zweite Handlung.
 */
const markenbalken = {
  width: '44px',
  height: '3px',
  backgroundColor: T.blau,
  borderRadius: '2px',
  fontSize: 0,
  lineHeight: 0,
  margin: '0 0 18px',
}
const anredeStil = { margin: '0 0 6px', fontSize: '16px', lineHeight: '1.55', color: T.text }
const absatz = { margin: '0 0 20px', fontSize: '16px', lineHeight: '1.55', color: T.textLeise }
const trenner = { height: '1px', backgroundColor: T.linie, fontSize: 0, lineHeight: 0 }

const fussBlock = { padding: '22px 40px 36px' }
const fussText = { margin: '0 0 8px', fontSize: '12px', lineHeight: '1.6', color: T.textStumm }
const fussZart = { margin: 0, fontSize: '12px', lineHeight: '1.6', color: T.textZart }
const fussLink = { color: T.textZart, textDecoration: 'underline' }

/** Die Ueberschrift eines Blocks. Ueberall gleich, deshalb an einer Stelle. */
const blockTitel = { margin: '24px 0 14px', fontSize: '13px', fontWeight: 700, color: T.text }

// ── Bausteine ────────────────────────────────────────────────────────────

/** Eine Trennlinie, die auch im Dunkelmodus stimmt. */
function Linie() {
  return (
    <div style={trenner} className="mi-linie">
      &nbsp;
    </div>
  )
}

function schuetze(wert: string): string {
  return wert
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Der Knopf als Auszeichnung, nicht als React-Baum.
 *
 * Outlook unter Windows rendert mit Word. Word kennt an einem `a` weder
 * `display:block` noch `padding`, uebrig blieb bisher die blosse Textzeile auf
 * blauem Grund: ein gedrungener Balken statt eines Knopfes. Der uebliche Weg
 * dagegen ist eine VML-Form, die nur Outlook sieht, und der gewohnte Link fuer
 * alle anderen. Beides steckt in bedingten Kommentaren, und Kommentare lassen
 * sich in JSX nicht ausdruecken. Deshalb hier als Zeichenkette.
 *
 * Die 440 Pixel sind die Innenbreite: 600 Huelle, minus 2 mal 40 Rand der
 * Karte, minus 2 mal 40 Innenabstand. VML braucht eine feste Breite,
 * Prozentangaben rechnet Word nicht aus.
 *
 * Das `arcsize` von 19 Prozent ist die Umrechnung von T.radiusKlein auf die
 * Knopfhoehe: 10 von 54 Pixeln. VML kennt keine Pixelradien.
 */
function knopfMarkup(href: string, text: string): string {
  const h = schuetze(href)
  const t = schuetze(text)
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;">` +
    `<tr><td align="center">` +
    `<!--[if mso]>` +
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `href="${h}" style="height:54px;v-text-anchor:middle;width:440px;" arcsize="19%" stroke="f" fillcolor="${T.blau}">` +
    `<w:anchorlock/>` +
    `<center style="color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;">${t}</center>` +
    `</v:roundrect>` +
    `<![endif]-->` +
    `<!--[if !mso]><!-->` +
    `<a href="${h}" style="display:block;background-color:${T.blau};border-radius:${T.radiusKlein};` +
    // Die Schriftliste enthaelt doppelte Anfuehrungszeichen. In einem
    // style-Attribut, das selbst in doppelten steht, wuerde das Attribut dort
    // enden; einfache Anfuehrungszeichen sind in CSS gleichwertig.
    // Fettung wie in der VML-Fassung darueber, sonst sieht der Knopf in
    // Outlook kraeftiger aus als ueberall sonst.
    `padding:17px 28px;font-family:${T.schrift.replace(/"/g, "'")};font-size:16px;font-weight:700;color:#FFFFFF;` +
    `text-decoration:none;">${t}</a>` +
    `<!--<![endif]-->` +
    `</td></tr></table>`
  )
}

/**
 * Die eine Handlung. Über die volle Breite, damit sie nicht zu übersehen ist.
 *
 * Fehlt der Link, wird KEIN Knopf gezeichnet.
 *
 * Vorher setzten die Vorlagen in dem Fall `href="#"`. Der Knopf sah dann
 * vollkommen normal aus, tat beim Klicken aber nichts. Genau so ist ein
 * Namensfehler zwischen Function und Vorlage monatelang unbemerkt geblieben:
 * Die Mail kam an, sah richtig aus, und der Kunde klickte ins Leere. Ein
 * fehlender Knopf faellt auf, ein toter nicht. Deshalb steht hier stattdessen
 * ein Satz, mit dem der Empfaenger etwas anfangen kann, und im Log der
 * Function eine deutliche Meldung.
 *
 * Dieser Satz ist bewusst anredefrei formuliert. Das Layout traegt sowohl
 * Kundenmails (Sie) als auch Bewerbermails (Du) und weiss selbst nicht,
 * welche gerade gebaut wird. Bis zum 14.09.2026 stand hier "Bitte antworten
 * Sie kurz", und ein Bewerber, der ueberall geduzt wird, wurde ausgerechnet
 * in einer Stoerung gesiezt. Dasselbe gilt fuer die Rollenzeile in
 * `Unterschrift`.
 */
export function Handlung({
  href,
  text,
  /** Was sie kostet: "Etwa 12 Minuten · Gültig bis 5. August". */
  hinweis,
  sprache,
}: {
  href: string
  text: string
  hinweis?: string
  /** Nur fuer den Ersatztext, falls der Link fehlt. */
  sprache?: MailSprache
}) {
  const ziel = (href || '').trim()
  if (!ziel || ziel === '#') {
    console.error(`Mailvorlage: Knopf "${text}" hat keinen Link bekommen. Bitte die templateData der aufrufenden Function pruefen.`)
    return (
      <Section style={{ padding: '0 40px' }}>
        <Text className="mi-text" style={{ margin: 0, fontSize: '15px', lineHeight: '24px', color: T.text }}>
          {LAYOUT_TEXTE[mailSprache(sprache)].linkFehlt}
        </Text>
      </Section>
    )
  }

  return (
    <Section style={{ padding: '0 40px' }}>
      <div dangerouslySetInnerHTML={{ __html: knopfMarkup(ziel, text) }} />
      {hinweis && (
        <Text
          className="mi-stumm"
          style={{ margin: '12px 0 0', textAlign: 'center' as const, fontSize: '13px', color: T.textStumm }}
        >
          {hinweis}
        </Text>
      )}
    </Section>
  )
}

/** Eine nummerierte Aufzählung. Ersetzt die Emoji-Kästen von vorher. */
/**
 * Der zweite Weg unter dem Hauptknopf.
 *
 * Zwei gleich kraeftige Knoepfe nebeneinander lassen den Leser waehlen, statt
 * ihn zu fuehren, und dann klickt er haeufig keinen von beiden. Deshalb bleibt
 * `Handlung` der einzige Knopf und alles Weitere steht als ruhiger Textlink
 * darunter.
 */
export function Nebenhandlung({
  href,
  text,
  hinweis,
}: {
  href: string
  text: string
  hinweis?: string
}) {
  const ziel = (href || '').trim()
  if (!ziel || ziel === '#') return null

  return (
    <Section style={{ padding: '14px 40px 0' }}>
      <Text
        className="mi-stumm"
        style={{
          margin: 0,
          textAlign: 'center' as const,
          fontSize: '14px',
          lineHeight: '22px',
          color: T.textStumm,
        }}
      >
        <a
          href={ziel}
          className="mi-link"
          style={{
            color: T.blau,
            fontWeight: 600,
            textDecoration: 'underline',
          }}
        >
          {text}
        </a>
        {hinweis && (
          <span className="mi-stumm" style={{ color: T.textStumm }}>
            {' '}
            {hinweis}
          </span>
        )}
      </Text>
    </Section>
  )
}

export function Schritte({ titel, punkte }: { titel?: string; punkte: string[] }) {
  return (
    <Section style={{ padding: '32px 40px 0' }}>
      <Linie />
      {titel && (
        <Text className="mi-text" style={blockTitel}>
          {titel}
        </Text>
      )}
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          {punkte.map((p, i) => (
            <tr key={i}>
              <td width={24} valign="top" className="mi-stumm" style={{ padding: i === punkte.length - 1 ? 0 : '0 0 10px', fontSize: '14px', color: T.textStumm }}>
                {i + 1}
                <NurText>. </NurText>
              </td>
              <td valign="top" className="mi-leise" style={{ padding: i === punkte.length - 1 ? 0 : '0 0 10px', fontSize: '15px', lineHeight: '1.5', color: T.textLeise }}>
                {p}
                <Zeilenende />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

/**
 * Eine Aufzaehlung ohne Nummern, bei der einzelne Punkte verlinkt sein koennen.
 * Fuer Dokumentenlisten gedacht, wo die Reihenfolge nichts bedeutet.
 */
export function Liste({
  titel,
  punkte,
}: {
  titel?: string
  punkte: Array<{ text: string; href?: string }>
}) {
  return (
    <Section style={{ padding: '32px 40px 0' }}>
      <Linie />
      {titel && (
        <Text className="mi-text" style={blockTitel}>
          {titel}
        </Text>
      )}
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          {punkte.map((p, i) => (
            <tr key={i}>
              <td width={14} valign="top" className="mi-stumm" style={{ padding: '0 0 10px', fontSize: '15px', lineHeight: '1.5', color: T.textStumm }}>
                &middot;
                <NurText> </NurText>
              </td>
              <td valign="top" className="mi-leise" style={{ padding: '0 0 10px', fontSize: '15px', lineHeight: '1.5', color: T.textLeise }}>
                {p.href ? (
                  <Link href={p.href} className="mi-link" style={{ color: T.blauLink, textDecoration: 'none' }}>
                    {p.text}
                  </Link>
                ) : (
                  p.text
                )}
                <Zeilenende />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

/** Angaben in Zeilen, etwa Termine oder Beträge. Ohne farbigen Kasten. */
/**
 * Eine Aufzaehlung mit Haken, ohne Trennlinie und ohne Ueberschrift.
 *
 * Der Unterschied zu `Liste`: Diese hier gehoert mitten in den Fliesstext und
 * nicht als eigener Block ans Ende. Sie steht deshalb dicht am Absatz darueber,
 * hat keine Linie und keinen Titel. Gedacht fuer die Aufzaehlung „Du erfaehrst
 * darin" in der Eingangsmail des Bewerberprozesses.
 *
 * Der Haken ist ein Zeichen und kein Bild: Bilder werden in vielen Postfaechern
 * erst nach einem Klick geladen, und dann stuende dort eine Reihe leerer
 * Kaesten. Im Nur-Text-Teil wird daraus ein schlichter Bindestrich.
 */
export function Haken({ punkte }: { punkte: readonly string[] }) {
  return (
    <Section style={{ padding: '0 40px' }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          {punkte.map((p, i) => (
            <tr key={i}>
              <td
                width={26}
                valign="top"
                className="mi-link"
                style={{
                  padding: i === punkte.length - 1 ? '0 0 20px' : '0 0 10px',
                  fontSize: '15px',
                  lineHeight: '1.55',
                  fontWeight: 700,
                  color: T.blauLink,
                }}
              >
                <span aria-hidden="true">&#10003;</span>
                <NurText>- </NurText>
              </td>
              <td
                valign="top"
                className="mi-leise"
                style={{
                  padding: i === punkte.length - 1 ? '0 0 20px' : '0 0 10px',
                  fontSize: '16px',
                  lineHeight: '1.55',
                  color: T.textLeise,
                }}
              >
                {p}
                <Zeilenende />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

/**
 * Eine Leerzeile zwischen zwei Bloecken.
 *
 * Klingt nach Kosmetik, ist aber genau der Punkt, den Christian gemeldet hat:
 * Unter dem Knopf steht die Zeile „der Link gilt 14 Tage", und der
 * Schlussabsatz klebte bisher unmittelbar daran. Beides las sich als ein
 * Block. Ein `<br>` traegt in Outlook keine Hoehe, ein Abstand schon.
 */
export function Luft({ hoehe = 18 }: { hoehe?: number }) {
  return (
    <Section style={{ padding: '0 40px' }}>
      <div style={{ height: `${hoehe}px`, fontSize: 0, lineHeight: 0 }}>&nbsp;</div>
    </Section>
  )
}

export function Angaben({ titel, zeilen }: { titel?: string; zeilen: Array<[string, string]> }) {
  return (
    <Section style={{ padding: '32px 40px 0' }}>
      <Linie />
      {titel && (
        <Text className="mi-text" style={blockTitel}>
          {titel}
        </Text>
      )}
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          {zeilen.map(([k, v], i) => (
            <tr key={i}>
              <td valign="top" className="mi-stumm" style={{ padding: '0 12px 10px 0', fontSize: '15px', lineHeight: '1.5', color: T.textStumm }}>
                {k}
                <NurText>: </NurText>
              </td>
              <td valign="top" align="right" className="mi-text" style={{ padding: '0 0 10px', fontSize: '15px', lineHeight: '1.5', color: T.text, fontWeight: 600 }}>
                {v}
                <Zeilenende />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

/**
 * Grosse Zahlen nebeneinander, fuer Berichte. Die Zahl traegt die Aussage, das
 * Wort darunter erklaert sie. Keine farbigen Kaesten: die Farbe steckt in der
 * Zahl selbst, und nur dann, wenn sie etwas bedeutet.
 */
export function Kennzahlen({
  titel,
  werte,
}: {
  titel?: string
  werte: Array<{ wert: string | number; label: string; ton?: 'neutral' | 'gut' | 'warnung' | 'fehler' }>
}) {
  const farbe = (ton?: string) =>
    ton === 'fehler' ? T.rot : ton === 'warnung' ? T.gelb : ton === 'gut' ? T.gruen : T.text
  // Auch die bedeutungstragenden Farben brauchen im Dunkelmodus eine
  // aufgehellte Fassung. Die hellen Toene sind so abgedunkelt, dass sie auf
  // Weiss lesbar sind, und genau das macht sie auf Schwarz unlesbar.
  const tonKlasse = (ton?: string) =>
    ton === 'fehler' ? 'mi-fehler' : ton === 'warnung' ? 'mi-warn' : ton === 'gut' ? 'mi-gut' : 'mi-text'
  return (
    <Section style={{ padding: '32px 40px 0' }}>
      <Linie />
      {titel && (
        <Text className="mi-text" style={{ ...blockTitel, margin: '24px 0 0' }}>
          {titel}
        </Text>
      )}
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ marginTop: '16px' }}>
        <tbody>
          <tr>
            {werte.map((w, i) => (
              <td key={i} valign="top" style={{ paddingRight: i === werte.length - 1 ? 0 : '16px' }}>
                <Text
                  className={tonKlasse(w.ton)}
                  style={{ margin: 0, fontSize: '32px', lineHeight: '1.1', fontWeight: 700, letterSpacing: '-0.01em', color: farbe(w.ton) }}
                >
                  {w.wert}
                  <NurText> </NurText>
                </Text>
                <Text className="mi-stumm" style={{ margin: '4px 0 0', fontSize: '13px', color: T.textStumm }}>
                  {w.label}
                </Text>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

/**
 * Eine Liste von Vorgaengen: links der Name, gern verlinkt, darunter eine
 * leise Zusatzzeile, rechts ein Wert. Ersetzt die farbigen Lead-Kaesten der
 * Berichte.
 */
export function Posten({
  titel,
  zeilen,
}: {
  titel?: string
  zeilen: Array<{ text: string; href?: string; unter?: string; wert?: string; ton?: 'neutral' | 'warnung' | 'fehler' }>
}) {
  return (
    <Section style={{ padding: '32px 40px 0' }}>
      <Linie />
      {titel && (
        <Text className="mi-text" style={blockTitel}>
          {titel}
        </Text>
      )}
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          {zeilen.map((z, i) => (
            <tr key={i}>
              <td valign="top" style={{ padding: '0 12px 12px 0' }}>
                <Text className="mi-text" style={{ margin: 0, fontSize: '15px', lineHeight: '1.4', fontWeight: 600, color: T.text }}>
                  {z.href ? (
                    // Die Klasse gehoert an den Link selbst. Sein eigener
                    // Inline-Stil schlaegt sonst die Klasse am Absatz, und im
                    // Dunkelmodus stuende der Name fast schwarz auf schwarz.
                    <Link href={z.href} className="mi-text" style={{ color: T.text, textDecoration: 'none' }}>
                      {z.text}
                    </Link>
                  ) : (
                    z.text
                  )}
                </Text>
                {z.unter && (
                  <Text className="mi-stumm" style={{ margin: '2px 0 0', fontSize: '13px', color: T.textStumm }}>
                    {z.unter}
                  </Text>
                )}
              </td>
              {z.wert && (
                <td valign="top" align="right" style={{ padding: '0 0 12px', whiteSpace: 'nowrap' as const }}>
                  <Text
                    className={z.ton === 'fehler' ? 'mi-fehler' : z.ton === 'warnung' ? 'mi-warn' : 'mi-stumm'}
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      lineHeight: '1.4',
                      fontWeight: 600,
                      color: z.ton === 'fehler' ? T.rot : z.ton === 'warnung' ? T.gelb : T.textStumm,
                    }}
                  >
                    {z.wert}
                  </Text>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

/**
 * Ein laengerer, woertlich uebernommener Text, etwa die Beschreibung aus einem
 * Fehlerbericht. Zeilenumbrueche bleiben erhalten.
 */
export function Textblock({ titel, text }: { titel?: string; text: string }) {
  return (
    <Section style={{ padding: '32px 40px 0' }}>
      <Linie />
      {titel && (
        <Text className="mi-text" style={blockTitel}>
          {titel}
        </Text>
      )}
      <Text
        className="mi-leise"
        style={{
          margin: 0,
          fontSize: '15px',
          lineHeight: '1.6',
          color: T.textLeise,
          whiteSpace: 'pre-wrap' as const,
        }}
      >
        {text}
      </Text>
    </Section>
  )
}

/** Angehaengte Bilder, etwa Bildschirmfotos aus einem Fehlerbericht. */
export function Bilder({ titel, urls }: { titel?: string; urls: string[] }) {
  return (
    <Section style={{ padding: '32px 40px 0' }}>
      <Linie />
      {titel && (
        <Text className="mi-text" style={blockTitel}>
          {titel}
        </Text>
      )}
      {urls.map((u, i) => (
        <Link key={i} href={u}>
          <Img
            src={u}
            alt={`Anhang ${i + 1}`}
            className="mi-rahmen"
            style={{ display: 'block', width: '100%', maxWidth: '520px', height: 'auto', borderRadius: T.radiusKlein, marginBottom: '12px', border: `1px solid ${T.linie}` }}
          />
        </Link>
      ))}
    </Section>
  )
}

/**
 * Ein Hinweis, der wirklich wichtig ist. Sparsam einsetzen: sobald zwei davon
 * in einer Mail stehen, hebt keiner mehr etwas hervor.
 */
export function Hinweis({ text, ton = 'neutral' }: { text: string; ton?: 'neutral' | 'warnung' | 'fehler' }) {
  const farbe = ton === 'fehler' ? T.rot : ton === 'warnung' ? T.gelb : T.textStumm
  const strich = ton === 'fehler' ? 'mi-strich-fehler' : ton === 'warnung' ? 'mi-strich-warn' : 'mi-strich'
  return (
    <Section style={{ padding: '24px 40px 0' }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          <tr>
            <td width={3} className={strich} style={{ backgroundColor: farbe, borderRadius: '2px' }}>&nbsp;</td>
            <td style={{ paddingLeft: '14px' }}>
              <Text className="mi-leise" style={{ margin: 0, fontSize: '14px', lineHeight: '1.55', color: T.textLeise }}>
                {text}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

/**
 * Ein Einmalcode zum Abtippen, etwa der Bestaetigungscode der Zweitpruefung.
 *
 * Neu hinzugekommen fuer die Anmelde- und Zugangsmails. Die uebrigen Vorlagen
 * sind davon nicht betroffen, der Baustein kommt hinzu und aendert nichts.
 *
 * Warum ein eigener Baustein und nicht `Angaben`: Ein Code ist keine Angabe
 * unter mehreren, sondern der ganze Zweck der Mail. Er steht deshalb allein,
 * gross und mittig, so wie sonst der Knopf.
 *
 * Zur Schrift: die Hausschrift, nicht Courier. Ein Code aus sechs Ziffern
 * braucht keine feste Zeichenbreite, aber Luft zwischen den Zeichen, sonst
 * verliest man sich beim Abtippen. Die Laufweite steht zusaetzlich als
 * `textIndent`, weil das letzte Zeichen sonst einen Abstand nach rechts
 * traegt, den es links nicht hat, und der Code dann sichtbar aus der Mitte
 * rutscht.
 *
 * Der Code steht als Text und nicht als Bild: Bilder werden in vielen
 * Postfaechern nicht geladen, und ein Code, den man nicht kopieren kann, ist
 * keiner.
 */
export function Code({ wert }: { wert: string }) {
  return (
    <Section style={{ padding: '8px 40px 22px' }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          <tr>
            <td
              align="center"
              className="mi-rahmen"
              style={{
                border: `1px solid ${T.linie}`,
                borderRadius: T.radiusKlein,
                padding: '20px 16px',
              }}
            >
              <Text
                className="mi-text"
                style={{
                  margin: 0,
                  fontFamily: T.schrift,
                  fontSize: '30px',
                  lineHeight: '1.2',
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textIndent: '0.18em',
                  color: T.text,
                }}
              >
                {wert}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

export interface Ansprechpartner {
  name?: string
  rolle?: string
  telefon?: string
  email?: string
  /**
   * Profilbild, oeffentlich erreichbare Adresse.
   *
   * Fehlt es oder blockiert der Mailclient Bilder, erscheinen die Initialen.
   * Deshalb liegen sie als Text hinter dem Bild und nicht als dessen alt-Text:
   * Ein alt-Text erbt die Bildgroesse nicht und stuende in vielen Clients als
   * nackter Buchstabe neben dem Namen.
   */
  bildUrl?: string
}

/**
 * Der Mensch, der unterschreibt.
 *
 * Vorher endete jede Mail mit "Ihr OS Immobilien Team" in elf Pixel Hellgrau. Wenn
 * die Angaben des zuständigen Vertriebspartners fehlen, fällt es auf die
 * allgemeine Adresse zurück.
 */
function Unterschrift({ person, sprache }: { person?: Ansprechpartner; sprache: MailSprache }) {
  const name = person?.name?.trim() || `${MARKE.name} Team`
  // Die Rolle kommt deutsch aus dem CRM. Englisch steht einheitlich
  // "Your contact at OS Immobilien", siehe rolleFuer in _sprache.ts.
  const rolle = rolleFuer(person?.rolle, sprache)
  const mail = person?.email?.trim() || MARKE.mail
  const tel = person?.telefon?.trim() || MARKE.telefon
  // Durch den gemeinsamen Helfer, auch wenn die Vorlage das Bild flach
  // bekam (beraterBild): keine Vorschau-, Daten- oder Ablaufadresse in der Mail.
  const bild = avatarUrlFuerMail(person?.bildUrl)
  const kuerzel = name
    .split(/\s+/)
    .map((t) => t[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <Section style={innenSchluss}>
      <Linie />
      <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ marginTop: '24px' }}>
        <tbody>
          <tr>
            <td width={44} valign="top">
              {/*
                Der Kreis traegt entweder das Profilbild oder die Initialen.

                Vorher lag das Bild als `background-image` auf diesem `div`,
                und sobald eines gesetzt war, wurde zusaetzlich
                `color: transparent` gesetzt, damit die Initialen dahinter
                verschwinden. Der Kommentar daneben versprach, sie blieben
                sichtbar, falls das Bild nicht geladen wird. Das war ein
                Denkfehler: Genau dann waren sie unsichtbar, und uebrig blieb
                ein leerer grauer Kreis. Und Bilder werden in Mails haeufig
                nicht geladen, sei es weil der Empfaenger sie blockt, sei es
                weil Outlook `background-image` auf einem `div` gar nicht
                kennt.

                Jetzt ein echtes `<img>` mit den Initialen als Alternativtext.
                Laedt das Bild, steht das Gesicht im Kreis. Laedt es nicht,
                zeigt der Mailclient den Alternativtext, also die Initialen.

                Der Kreis selbst haengt dabei an der ZELLE, nicht am Bild.

                Grund, gemeldet am 14.09.2026: Lagen Hintergrund und
                Zentrierung am `<img>`, sass der Alternativtext bei blockiertem
                Bild oben links und ragte aus dem Kreis heraus. Ein Bild richtet
                seinen Ersatztext anders aus als ein Textfeld, und `textAlign`
                auf einem `<img>` erreicht ihn in den meisten Mailprogrammen
                gar nicht. Die Zelle dagegen zentriert mit `align` und `valign`
                verlaesslich, und zwar unabhaengig davon, ob darin ein Bild
                oder Text steht.

                Bilder werden in Mails haeufig nicht geladen, sei es weil der
                Empfaenger sie blockt, sei es weil das Programm es von sich aus
                tut. Der Rueckfall ist deshalb kein Randfall, sondern der
                Normalfall, und er muss genauso ordentlich aussehen.
              */}
              <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                <tbody>
                  <tr>
                    <td
                      className="mi-kreis"
                      width="36"
                      height="36"
                      align="center"
                      valign="middle"
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '18px',
                        backgroundColor: T.linie,
                        color: T.textStumm,
                        fontSize: '12px',
                        lineHeight: '36px',
                        textAlign: 'center' as const,
                        fontWeight: 600,
                        overflow: 'hidden',
                      }}
                    >
                      {bild ? (
                        <Img
                          src={bild}
                          alt={kuerzel}
                          width={36}
                          height={36}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '18px',
                            objectFit: 'cover' as const,
                            display: 'block',
                            border: 0,
                          }}
                        />
                      ) : (
                        kuerzel
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
            <td valign="top">
              <Text className="mi-text" style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: T.text }}>
                {name}
              </Text>
              <Text className="mi-stumm" style={{ margin: '2px 0 0', fontSize: '13px', color: T.textStumm }}>
                {rolle}
              </Text>
              <Text className="mi-stumm" style={{ margin: '6px 0 0', fontSize: '13px', color: T.textStumm }}>
                {tel && (
                  <>
                    <Link href={`tel:${tel.replace(/\s/g, '')}`} className="mi-link" style={{ color: T.blauLink, textDecoration: 'none' }}>
                      {tel}
                    </Link>
                    {'  ·  '}
                  </>
                )}
                <Link href={`mailto:${mail}`} className="mi-link" style={{ color: T.blauLink, textDecoration: 'none' }}>
                  {mail}
                </Link>
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

// ── Das Layout selbst ────────────────────────────────────────────────────

export interface LayoutProps {
  /** Zeile über der Überschrift, etwa "Nächster Schritt". */
  augenbraue?: string
  titel: string
  /** Erscheint in der Vorschauzeile des Mailprogramms. */
  vorschau: string
  /** "Guten Tag Herr Mustermann," — ohne Angabe entfällt die Zeile. */
  anrede?: string
  /** Der zuständige Vertriebspartner. */
  person?: Ansprechpartner
  /**
   * Ohne Unterschriftsblock. Für interne Meldungen und neutrale Systemmails:
   * dort wirkt ein persönlicher Ansprechpartner fehl am Platz, und der
   * Platzhalter "OS Immobilien Team" erst recht.
   */
  ohneUnterschrift?: boolean
  /**
   * Zusätzliche Zeile im Fuss, etwa der Datenschutzhinweis einer
   * Selbstauskunft.
   */
  fussHinweis?: string
  /**
   * Interne Mail. Seit dem 26.09.2026 ohne Wirkung auf den Fuss: Den
   * Abmeldelink setzt Lovable selbst, fuer alle Mails gleich. Die Angabe
   * bleibt, damit die Vorlagen sagen, wofuer sie gedacht sind.
   */
  intern?: boolean
  /** Zaehlpixel, falls die Vorlage das Oeffnen messen soll. */
  pixelUrl?: string
  /**
   * Sprache der Mail. Setzt `<html lang>` und uebersetzt Fuss, Unterschrift
   * und Ersatztexte. Ohne Angabe Deutsch, das bleibt fuer interne Mails so.
   */
  sprache?: MailSprache
  children: React.ReactNode
}

export function EmailLayout({
  augenbraue: augenbraueText,
  titel,
  vorschau,
  anrede,
  person,
  ohneUnterschrift = false,
  fussHinweis,
  intern: _intern = false,
  pixelUrl,
  sprache: spracheRoh,
  children,
}: LayoutProps) {
  const sprache = mailSprache(spracheRoh)
  const fuss = LAYOUT_TEXTE[sprache]
  return (
    <Html lang={sprache} dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: DUNKELMODUS_CSS }} />
      </Head>
      <Preview>{vorschau}</Preview>
      <Body style={body} className="mi-flaeche">
        {/*
          Eigene Tabelle statt des Container-Bausteins von react-email: der
          schreibt align="center" fest in die Tabelle, und Outlook rendert
          mit Word, das nur dieses Attribut liest und jedes margin im Stil
          ignoriert. Die Mail soll aber links stehen, deshalb align="left"
          als Attribut und margin 0 im Stil fuer alle uebrigen Programme.
        */}
        <table
          role="presentation"
          align="left"
          width="100%"
          border={0}
          cellPadding={0}
          cellSpacing={0}
          style={huelle}
        >
          <tbody>
            <tr>
              <td align="left">
          <Section style={kopf}>
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td className="mi-platte" style={logoPlatte}>
                    <Img
                      src={MARKE.logo}
                      alt={MARKE.name}
                      width={MARKE.logoBreite}
                      height={MARKE.logoHoehe}
                      style={logoStil}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section style={karte} className="mi-karte">
            <Section style={innen}>
              {augenbraueText && (
                <Text className="mi-stumm" style={augenbraue}>
                  {augenbraueText}
                </Text>
              )}
              <Text className="mi-text" style={ueberschrift}>
                {titel}
              </Text>
              <div className="mi-balken" style={markenbalken}>
                &nbsp;
              </div>
              {anrede && (
                <Text className="mi-text" style={anredeStil}>
                  {anrede}
                </Text>
              )}
            </Section>

            {children}

            {ohneUnterschrift ? (
              // Nur der Abschlussabstand, damit die Karte nicht direkt unter
              // dem Inhalt endet. Kein Block, keine Trennlinie, kein Platzhalter.
              <Section style={{ padding: '0 0 40px' }} />
            ) : (
              <Unterschrift person={person} sprache={sprache} />
            )}
          </Section>

          <Section style={fussBlock}>
            {fussHinweis && (
              <Text className="mi-stumm" style={fussText}>
                {fussHinweis}
              </Text>
            )}
            <Text className="mi-zart" style={fussZart}>
              {MARKE.anschrift}
              {'  ·  '}
              <Link href={mitSprache(MARKE.impressum, sprache)} style={fussLink}>{fuss.impressum}</Link>
              {'  ·  '}
              <Link href={mitSprache(MARKE.datenschutz, sprache)} style={fussLink}>{fuss.datenschutz}</Link>
              {/*
                Kein eigener Abmeldelink mehr (seit 26.09.2026). Lovable haengt
                an jede App-Mail selbst einen Abmeldefuss an, und die Doku
                (docs.lovable.dev/features/custom-emails) sagt ausdruecklich,
                man solle keinen eigenen dazusetzen. Zwei Abmeldelinks in einer
                Mail sehen fuer Spamfilter nach Massenversand aus. Geprueft in
                src/lib/bewerberMailTexte.test.ts.
              */}
            </Text>
          </Section>

          {pixelUrl && (
            <Img src={pixelUrl} alt="" width={1} height={1} style={{ display: 'block', width: '1px', height: '1px', border: 0 }} />
          )}
              </td>
            </tr>
          </tbody>
        </table>
        {/*
          Raeumt den Umfluss der links ausgerichteten Tabelle auf: align="left"
          laesst Folgeinhalte rechts daneben fliessen. Der vom Versanddienst
          angehaengte Abmeldehinweis stand dadurch seitlich neben dem Kopf der
          Mail statt unter ihr.
        */}
        <div style={{ clear: 'both', lineHeight: '0', fontSize: '0' }}>&nbsp;</div>
      </Body>
    </Html>
  )
}

/** Fliesstext innerhalb des Layouts. */
export function Absatz({ children, letzter = false }: { children: React.ReactNode; letzter?: boolean }) {
  return (
    <Section style={{ padding: '0 40px' }}>
      <Text className="mi-leise" style={{ ...absatz, margin: letzter ? '0 0 28px' : absatz.margin }}>
        {children}
      </Text>
    </Section>
  )
}

// ── Betreffzeilen ────────────────────────────────────────────────────────

/**
 * "Donnerstag, 6. August 2026" wird zu "6. August".
 *
 * Postfaecher zeigen etwa 60 Zeichen. Der Wochentag kostet davon bis zu zwoelf
 * und traegt nichts bei, was das Datum nicht schon sagt; die Jahreszahl steht
 * bei einem Termin in den naechsten Wochen ohnehin fest. Im Mailtext bleibt
 * beides erhalten, gekuerzt wird nur der Betreff.
 */
export function kurzesDatum(datum?: string): string {
  const roh = (datum || '').trim()
  if (!roh) return ''
  const ohneWochentag = roh.replace(/^[^\d]*,\s*/, '')
  const ohneJahr = ohneWochentag.replace(/\s+\d{4}$/, '').trim()
  return ohneJahr || ohneWochentag || roh
}

/**
 * Der Anlass eines Termins, sofern es wirklich einer ist.
 *
 * Die aufrufenden Functions setzen "Termin" ein, wenn weder Bezeichnung noch
 * Terminart gepflegt sind. Als Ueberschrift taugt das Wort nicht, und in einer
 * Angabenzeile "Anlass: Termin" erst recht nicht. Hier faellt es weg, und die
 * Vorlage waehlt ihren eigenen Satz.
 */
export function echterAnlass(titel?: string): string {
  const wert = (titel || '').trim()
  return wert.toLowerCase() === 'termin' ? '' : wert
}

/** Kuerzt einen Namen im Betreff, damit die Zeile nicht ueberlaeuft. */
export function kuerze(text: string, maxLaenge: number): string {
  const wert = (text || '').trim()
  if (wert.length <= maxLaenge) return wert
  return `${wert.slice(0, Math.max(1, maxLaenge - 1)).trimEnd()}…`
}
