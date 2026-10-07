import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { ERINNERUNG_TEXTE, erinnerungZeilen, type ErinnerungProps } from './erstgespraech-erinnerung.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, mitSprache, texteFuer, zeitraumFuer } from './_sprache.ts'

const ANALYSE_BASIS_URL = 'https://osimmobilien.netlify.app/analyse'

/**
 * Eine Stunde vorher. Kuerzer als die anderen Erinnerungen: wer gleich im
 * Gespräch sitzt, liest keine Aufzaehlung mehr. Die Texte liegen bei der
 * Grundvorlage, in ERINNERUNG_TEXTE.
 */
const Erinnerung1h = ({
  kundeName,
  beraterName,
  beraterEmail,
  beraterTelefon,
  beraterPosition,
  terminDatum,
  terminUhrzeit,
  vorText,
  analyseUrl,
  berater,
  sprache,
}: ErinnerungProps) => {
  const t = texteFuer(ERINNERUNG_TEXTE, sprache)
  const wann = zeitraumFuer(vorText, sprache) || zeitraumFuer('in einer Stunde', sprache)
  const person: Ansprechpartner = {
    name: berater?.name || beraterName,
    rolle: berater?.rolle || beraterPosition,
    telefon: berater?.telefon || beraterTelefon,
    email: berater?.email || beraterEmail,
    bildUrl: berater?.bildUrl,
  }
  const vornameBerater = person.name ? person.name.split(' ')[0] : ''
  const zeilen = erinnerungZeilen({ terminDatum, terminUhrzeit, sprache }, person.name)

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue1h}
      titel={t.titel(wann)}
      vorschau={t.vorschau1h}
      anrede={hallo(kundeName, sprache)}
      person={person.name ? person : undefined}
    >
      <Absatz letzter>{t.text1h(vornameBerater, wann)}</Absatz>

      <Handlung
        sprache={sprache}
        href={mitSprache(analyseUrl || `${ANALYSE_BASIS_URL}?source=reminder`, sprache)}
        text={t.knopf1h}
        hinweis={t.hinweisKnopf1h}
      />

      {zeilen.length > 0 && <Angaben titel={t.terminTitel} zeilen={zeilen} />}

      <Hinweis text={t.zugang1h} />
    </EmailLayout>
  )
}

export const template = {
  component: Erinnerung1h,
  subject: (data: Record<string, any>) => texteFuer(ERINNERUNG_TEXTE, data?.sprache).betreff1h,
  displayName: 'Erstgespräch-Erinnerung (1h)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    terminDatum: '25.03.2026',
    terminUhrzeit: '15:00',
    vorText: 'in einer Stunde',
    analyseUrl: 'https://osimmobilien.netlify.app/analyse?source=reminder',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Senior Berater',
      telefon: '+49 89 123456',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
