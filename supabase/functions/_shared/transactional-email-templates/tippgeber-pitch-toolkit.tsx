import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Liste, Hinweis, type Ansprechpartner } from './_layout.tsx'

interface PitchItem {
  emoji?: string
  titel: string
  thema: string
  text: string
}

interface Props {
  tippgeberVorname?: string
  vpFullName?: string
  landingpageUrl?: string
  portalUrl?: string
  loginUrl?: string
  pitches?: PitchItem[]
  berater?: Ansprechpartner
}

const Mail = ({
  tippgeberVorname,
  vpFullName,
  landingpageUrl,
  portalUrl = 'https://portal.more.immo/tippgeber-portal',
  loginUrl = 'https://portal.more.immo/auth',
  berater,
}: Props) => {
  const links: Array<{ text: string; href?: string }> = []
  if (landingpageUrl) links.push({ text: landingpageUrl, href: landingpageUrl })
  links.push({ text: loginUrl, href: loginUrl })

  return (
    <EmailLayout
      augenbraue="Für deine Empfehlungen"
      titel="Dein Pitch-Toolkit"
      vorschau="Fertige Vorlagen für WhatsApp und SMS, mit deinem Empfehlungs-Link."
      anrede={tippgeberVorname ? `Hallo ${tippgeberVorname},` : 'Hallo,'}
      person={berater}
    >
      <Absatz letzter>
        hier sind deine fertigen Vorlagen für WhatsApp und SMS, mit denen du dein Netzwerk auf das
        Thema Kapitalanlage-Immobilien aufmerksam machen kannst
        {vpFullName ? `, empfohlen von ${vpFullName}` : ''}.
      </Absatz>

      <Handlung
        href={portalUrl}
        text="Pitch-Toolkit im Portal öffnen"
        hinweis="Auch als PDF zum Herunterladen"
      />

      <Liste titel="Deine Links" punkte={links} />

      <Hinweis text="Die Texte sind Vorschläge. Passe sie in deinem eigenen Wording an, damit deine Nachrichten authentisch ankommen. Alle Links enthalten bereits deinen persönlichen Code, Empfehlungen werden dir damit automatisch zugeordnet." />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Dein persönliches Pitch-Toolkit für Empfehlungen',
  displayName: 'Tippgeber Pitch-Toolkit',
  previewData: {
    tippgeberVorname: 'Max',
    vpFullName: 'Sandra Mustermann',
    landingpageUrl: 'https://portal.more.immo/vp/sandra-mustermann?tg=abc123',
    portalUrl: 'https://portal.more.immo/tippgeber-portal?tab=pitches',
    loginUrl: 'https://portal.more.immo/auth',
    berater: {
      name: 'Sandra Mustermann',
      rolle: 'Deine Ansprechpartnerin bei MOREImmo',
      email: 'sandra@more.immo',
    },
  },
} satisfies TemplateEntry
