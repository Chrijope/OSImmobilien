import { ErstgespraechErinnerung, erinnerungBetreff } from './erstgespraech-erinnerung.tsx'
import type { TemplateEntry } from './registry.ts'
import { DE_EN } from './_sprache.ts'

/** Gleiche Mail, andere Betreffzeile. Der Inhalt liegt in der Grundvorlage. */
export const template = {
  component: ErstgespraechErinnerung,
  subject: (data: Record<string, any>) => erinnerungBetreff(data, 'in 6 Stunden'),
  displayName: 'Erstgespräch-Erinnerung (6h)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    terminDatum: '25.03.2026',
    terminUhrzeit: '15:00',
    vorText: 'in 6 Stunden',
    analyseUrl: 'https://portal.more.immo/analyse?source=reminder',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Senior Berater',
      telefon: '+49 89 123456',
      email: 'c.peetz@more.immo',
    },
  },
} satisfies TemplateEntry
