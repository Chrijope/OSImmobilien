import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  /**
   * Der EMPFAENGER, allein fuer die Anrede.
   *
   * Der Name taeuscht: Diese Mail laeuft in beide Richtungen. Schreibt der
   * Kunde, steht hier der Partner. Wer die beiden Felder nach ihren Namen
   * belegt statt nach ihrer Bedeutung, dreht Anrede und Betreff um.
   */
  kundeName?: string
  /** Der ABSENDER der Nachricht, steht im Titel und im Betreff. */
  beraterName?: string
  nachrichtVorschau?: string
  portalUrl?: string
  berater?: Ansprechpartner
  /**
   * Die Mail geht an den Partner, nicht an den Kunden. Dann entfaellt der
   * Unterschriftsblock: sonst stuende der schreibende Kunde als Ansprechpartner
   * unter seiner eigenen Nachricht. Und sie bleibt deutsch, der Partner liest
   * das CRM auf Deutsch.
   */
  anPartner?: boolean
  /**
   * Der Name des Chats, nur in der Richtung `anPartner`. Bei einem Kundenchat
   * ist das der Kunde, bei einem internen Chat sein Titel.
   */
  chatName?: string
  sprache?: MailSprache
}

/*
 * Die Richtung an den Partner, also an jemanden im CRM.
 *
 * Seit dem 25.09.2026 bekommt jeder im CRM bei jeder Chatnachricht diese Mail,
 * verschickt von der Edge Function `chat-benachrichtigung`. Der Knopf fuehrt
 * direkt in genau diesen Chat. Die Texte darunter sprechen deshalb vom Chat
 * im CRM und nicht vom Kundenportal. Sie bleiben deutsch.
 */
const AN_PARTNER = {
  betreff: (absender: string) => (absender ? `Neue Chatnachricht von ${absender}` : 'Neue Chatnachricht im CRM'),
  titel: (absender: string) => (absender ? `${absender} hat dir geschrieben` : 'Du hast eine neue Chatnachricht'),
  vorschauRueckfall: 'Neue Chatnachricht im CRM',
  text: (chatName: string) =>
    chatName
      ? `im Chat „${chatName}“ liegt eine neue Nachricht für dich. Über den Knopf kommst du direkt in diesen Chat und kannst dort antworten.`
      : 'im CRM liegt eine neue Chatnachricht für dich. Über den Knopf kommst du direkt in diesen Chat und kannst dort antworten.',
  knopf: 'Zum Chat',
}

const DE = {
  betreff: (absender: string) => (absender ? `Neue Nachricht von ${absender}` : 'Neue Nachricht in deinem Kundenportal'),
  augenbraue: 'Neue Nachricht',
  titel: (absender: string) => (absender ? `${absender} hat dir geschrieben` : 'Du hast eine neue Nachricht'),
  vorschauRueckfall: 'Neue Nachricht in deinem Kundenportal',
  text: 'in deinem Kundenportal liegt eine neue Nachricht für dich. Dort kannst du direkt antworten, alles bleibt an einem Ort und geht nicht im Postfach unter.',
  knopf: 'Nachricht lesen und antworten',
  auszug: 'Auszug',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (absender: string) => (absender ? `New message from ${absender}` : 'New message in your customer portal'),
    augenbraue: 'New message',
    titel: (absender: string) => (absender ? `${absender} has written to you` : 'You have a new message'),
    vorschauRueckfall: 'New message in your customer portal',
    text: 'There is a new message for you in your customer portal. You can reply to it directly there; everything stays in one place and does not get lost in your inbox.',
    knopf: 'Read and reply',
    auszug: 'Excerpt',
  },
}

/** Geht die Mail an den Partner, bleibt sie deutsch. */
function spracheFuer(data: { anPartner?: boolean; sprache?: unknown }): unknown {
  return data.anPartner ? 'de' : data.sprache
}

const Mail = ({ kundeName, beraterName, nachrichtVorschau, portalUrl, berater, anPartner, chatName, sprache: roh }: Props) => {
  const sprache = spracheFuer({ anPartner, sprache: roh }) as MailSprache
  const t = texteFuer(TEXTE, sprache)
  const absender = beraterName || ''
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={anPartner ? AN_PARTNER.titel(absender) : t.titel(absender)}
      vorschau={nachrichtVorschau || (anPartner ? AN_PARTNER.vorschauRueckfall : t.vorschauRueckfall)}
      anrede={hallo(kundeName, sprache)}
      person={berater}
      ohneUnterschrift={!!anPartner}
    >
      <Absatz letzter>{anPartner ? AN_PARTNER.text((chatName || '').trim()) : t.text}</Absatz>

      <Handlung sprache={sprache} href={portalUrl || ''} text={anPartner ? AN_PARTNER.knopf : t.knopf} />

      {/* Die Nachricht selbst wird nie uebersetzt, sie steht, wie sie geschrieben wurde. */}
      {nachrichtVorschau && <Angaben titel={t.auszug} zeilen={[['', nachrichtVorschau]]} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    data?.anPartner
      ? AN_PARTNER.betreff(data?.beraterName || '')
      : texteFuer(TEXTE, spracheFuer(data)).betreff(data?.beraterName || ''),
  displayName: 'Chat-Nachricht',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    beraterName: 'Christian Peetz',
    nachrichtVorschau: 'Ich habe die Unterlagen geprüft, wir können nächste Woche weitermachen.',
    portalUrl: 'https://portal.more.immo/kunde/chat',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
