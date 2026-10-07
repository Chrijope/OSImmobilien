/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Posten, Hinweis, NurText, Zeilenende, T } from './_layout.tsx'

/**
 * Das Tagesbriefing der Geschäftsleitung, jeden Werktag um 8 Uhr.
 *
 * Geschrieben hat den Text ein Sprachmodell in der Rolle von Charlotte Renner,
 * der Assistenz der Geschäftsleitung. Diese Vorlage bringt ihn nur in Form.
 *
 * DIE REIHENFOLGE IST DER GANZE PUNKT
 *
 * Kein Rundgang durch vierzehn Abteilungen, sondern nach Dringlichkeit: erst
 * die Lage in zwei Sätzen, dann was heute eine Entscheidung braucht, dann was
 * liegen bleibt, dann die Zahlen, die sich bewegt haben. Die vollständige
 * Tabelle steht klein am Ende, für den, der nachsehen will.
 *
 * WENN DAS MODELL AUSFÄLLT
 *
 * Dann kommt die Mail trotzdem, nur ohne Text: `ohneText` schaltet die
 * Fließtextteile ab und lässt die Zahlen stehen. Eine ausbleibende Mail merkt
 * niemand, ein fehlender Absatz fällt sofort auf. Deshalb dieser Weg und nicht
 * der andere.
 */

interface Entscheidung {
  text: string
  frist?: string
  blockiert?: string
}

interface Liegenbleiber {
  text: string
  alter?: string
  folge?: string
}

interface Zahl {
  text: string
  wert?: string
  einordnung?: string
  ton?: 'neutral' | 'warnung' | 'fehler'
}

/** Eine Zeile der vollständigen Tabelle am Ende. */
interface TabellenZeile {
  label: string
  wert: string
  vorwoche: string
  veraenderung: string
}

interface TabellenBlock {
  bereich: string
  zeilen: TabellenZeile[]
}

interface Props {
  /** "Montag, 14.09.2026" */
  tag?: string
  /** Der Stichtag der Zahlen, falls er nicht heute ist. */
  datenstand?: string
  vorschau?: string
  lage?: string
  entscheidungen?: Entscheidung[]
  liegenbleiber?: Liegenbleiber[]
  zahlen?: Zahl[]
  unsicher?: string
  tabelle?: TabellenBlock[]
  /** Das Sprachmodell hat nicht geantwortet. Dann gehen nur die Zahlen hinaus. */
  ohneText?: boolean
  /** Warum der Text fehlt, in einem Satz für den Leser. */
  ohneTextGrund?: string
}

/**
 * Die vollständige Tabelle, klein.
 *
 * Eigener Baustein und nicht `Posten` aus dem Layout: Der ist auf fünfzehn
 * Pixel und zwei Spalten ausgelegt und damit richtig für eine Handvoll
 * Vorgänge. Hier stehen über achtzig Zeilen, und die sollen ausdrücklich klein
 * sein und drei Werte nebeneinander zeigen. Farben, Linien und die
 * Dunkelmodus-Klassen kommen unverändert aus dem Layout, damit die Tabelle
 * nicht aussieht wie ein Fremdkörper.
 */
function KleineTabelle({ bloecke }: { bloecke: TabellenBlock[] }) {
  return (
    <Section style={{ padding: '32px 40px 0' }}>
      {/* Derselbe Trenner wie in den Layout-Bausteinen, hier von Hand, weil
          `Linie` dort nicht nach aussen gegeben ist. */}
      <div style={{ height: '1px', backgroundColor: T.linie, fontSize: 0, lineHeight: 0 }} className="mi-linie">
        &nbsp;
      </div>
      <Text className="mi-text" style={{ margin: '24px 0 4px', fontSize: '15px', fontWeight: 600, color: T.text }}>
        Alle Kennzahlen
      </Text>
      <Text className="mi-stumm" style={{ margin: '0 0 12px', fontSize: '12px', lineHeight: '1.5', color: T.textStumm }}>
        Der vollständige Stand aus dem nächtlichen Lauf. Links der Wert von heute, rechts der von vor sieben Tagen.
      </Text>

      {bloecke.map((block) => (
        <table key={block.bereich} role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ marginBottom: '14px' }}>
          <tbody>
            <tr>
              <td colSpan={3} style={{ padding: '6px 0 4px' }}>
                <Text className="mi-stumm" style={{ margin: 0, fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontWeight: 600, color: T.textStumm }}>
                  {block.bereich}
                </Text>
              </td>
            </tr>
            {block.zeilen.map((z, i) => (
              <tr key={i}>
                <td valign="top" className="mi-leise" style={{ padding: '0 10px 5px 0', fontSize: '12px', lineHeight: '1.5', color: T.textLeise }}>
                  {z.label}
                  {/* Ohne diese Trennzeichen klebt der Nur-Text-Teil die drei
                      Zellen zu "Offene Aufgaben112104" zusammen. */}
                  <NurText>: </NurText>
                </td>
                <td valign="top" align="right" className="mi-text" style={{ padding: '0 10px 5px 0', fontSize: '12px', lineHeight: '1.5', fontWeight: 600, color: T.text, whiteSpace: 'nowrap' as const }}>
                  {z.wert}
                  <NurText>, vor einer Woche </NurText>
                </td>
                <td valign="top" align="right" className="mi-stumm" style={{ padding: '0 0 5px', fontSize: '12px', lineHeight: '1.5', color: T.textStumm, whiteSpace: 'nowrap' as const }}>
                  {z.vorwoche}
                  {z.veraenderung ? ` (${z.veraenderung})` : ''}
                  <Zeilenende />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </Section>
  )
}

const Mail = ({
  tag = '',
  datenstand = '',
  vorschau = '',
  lage = '',
  entscheidungen = [],
  liegenbleiber = [],
  zahlen = [],
  unsicher = '',
  tabelle = [],
  ohneText = false,
  ohneTextGrund = '',
}: Props) => {
  const vorschauZeile =
    (vorschau || '').trim() ||
    (ohneText
      ? 'Die Zahlen von heute Nacht. Der Text fehlt, das Sprachmodell hat nicht geantwortet.'
      : 'Der Stand von heute Nacht.')

  return (
    <EmailLayout
      augenbraue={tag ? `Tagesbriefing ${tag}` : 'Tagesbriefing'}
      titel={ohneText ? 'Nur die Zahlen' : 'Die Lage heute Morgen'}
      vorschau={vorschauZeile}
      anrede="Guten Morgen Christian,"
      intern
      ohneUnterschrift
    >
      {ohneText ? (
        <>
          <Absatz letzter>
            heute kommen nur die Zahlen. {ohneTextGrund || 'Das Sprachmodell hat nicht geantwortet.'} Die
            Zahlen selbst stammen unverändert aus dem nächtlichen Lauf und sind davon nicht betroffen.
          </Absatz>
          <Hinweis
            ton="warnung"
            text="Ohne den Text fehlt die Einordnung, nicht die Grundlage. Wer heute etwas entscheiden muss, findet es in der Tabelle."
          />
        </>
      ) : (
        <>
          <Absatz letzter>{lage}</Absatz>

          {entscheidungen.length > 0 ? (
            <Posten
              titel="Heute zu entscheiden"
              zeilen={entscheidungen.map((e) => ({
                text: e.text,
                unter: [e.blockiert ? `Ohne die Entscheidung: ${e.blockiert}` : '', e.frist ? `Frist: ${e.frist}` : '']
                  .filter(Boolean)
                  .join('  ·  '),
                ton: 'warnung' as const,
              }))}
            />
          ) : (
            <Posten
              titel="Heute zu entscheiden"
              zeilen={[{ text: 'Heute steht nichts an, das deine Entscheidung braucht.', ton: 'neutral' as const }]}
            />
          )}

          {liegenbleiber.length > 0 && (
            <Posten
              titel="Was liegen bleibt"
              zeilen={liegenbleiber.map((l) => ({
                text: l.text,
                unter: l.folge,
                wert: l.alter,
                ton: 'warnung' as const,
              }))}
            />
          )}

          {zahlen.length > 0 && (
            <Posten
              titel="Bewegt hat sich"
              zeilen={zahlen.map((z) => ({
                text: z.text,
                unter: z.einordnung,
                wert: z.wert,
                ton: z.ton ?? 'neutral',
              }))}
            />
          )}

          {unsicher && unsicher.trim().toLowerCase() !== 'nichts' && (
            <Hinweis ton="neutral" text={`Unsicher: ${unsicher}`} />
          )}
        </>
      )}

      {tabelle.length > 0 && <KleineTabelle bloecke={tabelle} />}

      {datenstand && (
        <Section style={{ padding: '20px 40px 0' }}>
          <Text className="mi-zart" style={{ margin: 0, fontSize: '11px', lineHeight: '1.5', color: T.textZart }}>
            Datenstand {datenstand}, aus dem nächtlichen Kennzahlenlauf. Die Mail nennt keine Namen, sie nennt nur Zahlen.
          </Text>
        </Section>
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    // Charlotte schreibt den Betreff selbst, er soll die Lage sagen und nicht
    // die Gattung. Nur wenn sie ausfaellt, greift der Ersatz darunter.
    const eigener = typeof data?.betreff === 'string' ? data.betreff.trim() : ''
    if (eigener) return eigener
    // Aus "Montag, 14.09.2026" wird "14.09.2026". Der Wochentag kostet im
    // Postfach bis zu zwoelf Zeichen und sagt nichts, was das Datum nicht sagt.
    const roh = typeof data?.tag === 'string' ? data.tag : ''
    const datum = roh.replace(/^[^\d]*,\s*/, '').trim()
    const zusatz = datum ? ` vom ${datum}` : ''
    return data?.ohneText
      ? `Tagesbriefing${zusatz}, nur die Zahlen`
      : `Tagesbriefing${zusatz}`
  },
  displayName: 'Tagesbriefing der Geschäftsleitung',
  previewData: {
    tag: 'Montag, 14.09.2026',
    datenstand: '14.09.2026',
    betreff: 'Zwei Reservierungen ohne Bonität, sonst ruhig',
    vorschau: 'Zwei Reservierungen laufen ohne Bonitätsunterlagen weiter, alles andere ist ruhig.',
    lage: 'Das Haus läuft, zwei Stellen klemmen. Beide hängen an derselben Ursache, nämlich an Unterlagen, die niemand nachfasst.',
    entscheidungen: [
      {
        text: 'Ob eine Reservierung ohne Bonitätsunterlagen nach 21 Tagen von selbst zurückfällt',
        frist: 'ohne Frist',
        blockiert: 'nichts, aber die Fälle sammeln sich weiter an',
      },
    ],
    liegenbleiber: [
      {
        text: 'Steckengebliebene Vorgänge in der Abwicklung, gemeldet aus der Operativen Leitung',
        alter: '21 Tage',
        folge: 'Die Reservierungseskalation läuft ab Tag 21 und meldet sie täglich weiter.',
      },
      {
        text: 'Objekte ohne Unterlagen, gemeldet aus dem Objektmanagement',
        alter: '',
        folge: 'Ohne Unterlagen lässt sich kein Exposé erzeugen.',
      },
    ],
    zahlen: [
      {
        text: 'Neue Leads, Vertriebsleitung',
        wert: '34, vor einer Woche 21',
        einordnung: 'Der Zuwachs kommt aus einer einzelnen Woche und ist noch kein Trend.',
        ton: 'neutral',
      },
      {
        text: 'Überfällige Aufgaben, Operative Leitung',
        wert: '23, vor einer Woche 17',
        einordnung: 'Sechs mehr als vor einer Woche, die Richtung stimmt nicht.',
        ton: 'warnung',
      },
    ],
    unsicher:
      'Die Schwelle von 21 Tagen ist gesetzt worden und stammt nicht aus dem CRM. Im System gibt es dafür keinen gepflegten Grenzwert.',
    tabelle: [
      {
        bereich: 'Operative Leitung',
        zeilen: [
          { label: 'Offene Aufgaben', wert: '112', vorwoche: '104', veraenderung: '+8' },
          { label: 'Überfällige Aufgaben', wert: '23', vorwoche: '17', veraenderung: '+6' },
          { label: 'Kontakte ohne Zuständigen', wert: '5', vorwoche: '5', veraenderung: 'unverändert' },
        ],
      },
      {
        bereich: 'Vertriebsleitung',
        zeilen: [
          { label: 'Neue Leads', wert: '34', vorwoche: '21', veraenderung: '+13' },
          { label: 'Qualifiziert', wert: '18', vorwoche: '19', veraenderung: '-1' },
        ],
      },
    ],
  },
} satisfies TemplateEntry
