import { Heart, Gift, Scale } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard, PhaseStep } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function AftersalesVerkaufKinder() {
  return (
    <UnterlagenDetailLayout
      title="Verkauf & Übertragung an Kinder"
      subtitle="Vermögensübertragung mit maximaler Steuerersparnis – Schenkung, Verkauf oder Nießbrauch"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateVerkaufKinderPDF();
      }}
      pdfLabel="Komplette PDF herunterladen"
      quellen={[
        { titel: "§ 16 ErbStG – Persönliche Freibeträge bei Schenkung/Erbschaft", url: "https://www.gesetze-im-internet.de/erbstg_1974/__16.html" },
        { titel: "§ 14 ErbStG – Zusammenrechnung mehrerer Erwerbe (10-Jahres-Regel)", url: "https://www.gesetze-im-internet.de/erbstg_1974/__14.html" },
        { titel: "BFH zur Schenkung mit Nießbrauch", url: "https://www.bundesfinanzhof.de" },
        { titel: "Haufe: Vermögensübertragung an Kinder", hinweis: "Standardliteratur zur vorweggenommenen Erbfolge" },
      ]}
    >
      <SectionCard title="Drei Wege, drei Strategien" icon={<Scale className="h-5 w-5" />}>
        <p>
          Wer eine vermietete Immobilie an die nächste Generation übertragen will, hat drei Hauptoptionen –
          jede mit unterschiedlicher Steuerwirkung, Kontrolle und Liquiditätseffekt.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div data-ui="card" className="border border-border rounded-lg p-4 bg-card">
            <h4 className="font-bold text-primary mb-2">1. Schenkung</h4>
            <p className="text-xs text-muted-foreground">Übertragung ohne Gegenleistung. Freibetrag 400.000 € pro Kind und Elternteil – alle 10 Jahre erneut nutzbar.</p>
          </div>
          <div data-ui="card" className="border border-border rounded-lg p-4 bg-card">
            <h4 className="font-bold text-primary mb-2">2. Verkauf</h4>
            <p className="text-xs text-muted-foreground">Echter Kaufvertrag zu fremdüblichen Konditionen. Steuerfrei nach 10 Jahren Haltedauer beim Eltern­teil. Liquidität für die Eltern.</p>
          </div>
          <div data-ui="card" className="border border-border rounded-lg p-4 bg-card">
            <h4 className="font-bold text-primary mb-2">3. Schenkung mit Nießbrauch</h4>
            <p className="text-xs text-muted-foreground">Eigentum geht auf das Kind über, Mieteinnahmen verbleiben bei den Eltern. Steuer­wert wird kapitalisiert reduziert.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Schenkungs-Freibeträge nach § 16 ErbStG" icon={<Gift className="h-5 w-5" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left">
                <th className="py-2 pr-4">Beziehung</th>
                <th className="py-2 pr-4">Freibetrag</th>
                <th className="py-2">Wiederholbar</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border/50"><td className="py-2 pr-4">Ehepartner</td><td className="font-semibold text-foreground">500.000 €</td><td>alle 10 Jahre</td></tr>
              <tr className="border-b border-border/50"><td className="py-2 pr-4">Kinder (pro Elternteil)</td><td className="font-semibold text-foreground">400.000 €</td><td>alle 10 Jahre</td></tr>
              <tr className="border-b border-border/50"><td className="py-2 pr-4">Enkel</td><td className="font-semibold text-foreground">200.000 €</td><td>alle 10 Jahre</td></tr>
              <tr className="border-b border-border/50"><td className="py-2 pr-4">Eltern (im Erbfall)</td><td className="font-semibold text-foreground">100.000 €</td><td>alle 10 Jahre</td></tr>
              <tr><td className="py-2 pr-4">Sonstige</td><td className="font-semibold text-foreground">20.000 €</td><td>alle 10 Jahre</td></tr>
            </tbody>
          </table>
        </div>
        <div className="bg-primary/10 border border-primary/30 rounded p-3 text-xs mt-3">
          <strong>Praxis-Tipp:</strong> Vater + Mutter + 2 Kinder = bis zu <strong>1,6 Mio. € steuerfrei</strong> übertragbar
          (400.000 € × 2 Eltern × 2 Kinder), und das alle 10 Jahre wiederholt!
        </div>
      </SectionCard>

      <SectionCard title="Strategie: Schenkung mit Nießbrauch" icon={<Heart className="h-5 w-5" />}>
        <p>
          Die <strong>Königs-Strategie</strong> für vermögende Familien: Eltern übertragen die Immobilie auf die
          Kinder, behalten sich aber das <strong>Nießbrauchrecht</strong> vor – sie bekommen weiterhin die
          Mieteinnahmen, das Kind ist Eigentümer.
        </p>
        <div className="space-y-5 mt-4">
          <PhaseStep num={1} titel="Wertermittlung" text="Verkehrswert der Immobilie ermitteln (Gutachten oder Maklerwert). Davon wird der kapitalisierte Nießbrauchwert abgezogen." />
          <PhaseStep num={2} titel="Nießbrauch-Wert berechnen" text="Jährliche Nettokaltmiete × Vervielfältiger nach Lebenserwartung des Schenkers (Anlage 9 zu § 14 BewG). Bei 60-jährigem Schenker ca. Faktor 13-14." />
          <PhaseStep num={3} titel="Steuerlich relevanter Wert sinkt drastisch" text="Beispiel: Immobilienwert 600.000 €, Nießbrauch-Wert 220.000 € → steuerlich relevant nur 380.000 €. Liegt unter dem Freibetrag von 400.000 € → komplett steuerfrei." />
          <PhaseStep num={4} titel="Notarieller Vertrag + Grundbucheintrag" text="Schenkungsvertrag mit Nießbrauchsvorbehalt beim Notar. Eintragung der Eigentumsänderung und des Nießbrauchs im Grundbuch." />
        </div>
      </SectionCard>

      <SectionCard title="Beispielrechnung Schenkung mit Nießbrauch">
        <div className="bg-muted/40 border border-border rounded p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span>Verkehrswert der Immobilie:</span><span className="font-semibold">600.000 €</span></div>
          <div className="flex justify-between"><span>Jahreskaltmiete:</span><span>18.000 €</span></div>
          <div className="flex justify-between"><span>Vervielfältiger (Schenker, 60 J):</span><span>13,4</span></div>
          <div className="flex justify-between"><span>Kapitalisierter Nießbrauch:</span><span className="text-primary">- 241.200 €</span></div>
          <div className="border-t border-border pt-2 flex justify-between"><span className="font-semibold">Steuerlich anrechenbarer Wert:</span><span className="font-bold text-primary">358.800 €</span></div>
          <div className="flex justify-between"><span>Schenkungssteuer-Freibetrag:</span><span>400.000 €</span></div>
          <div className="border-t border-border pt-2 flex justify-between text-base">
            <span className="font-bold">Schenkungssteuer:</span>
            <span className="font-bold text-primary">0 €</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Variante: Verkauf an Kinder">
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li><strong>Voraussetzung:</strong> 10-Jahres-Spekulationsfrist beim Eltern­teil abgelaufen → steuerfreier Verkaufserlös.</li>
          <li><strong>Vorteil für Kinder:</strong> Volle Anschaffungskosten als neue AfA-Basis (analog zur Ehegattenschaukel).</li>
          <li><strong>Finanzierung:</strong> Bank oder Eltern-Darlehen mit marktüblichen Zinsen.</li>
          <li><strong>Steuer:</strong> Grunderwerbsteuer entfällt zwischen Eltern und Kindern in gerader Linie (§ 3 Nr. 6 GrEStG).</li>
          <li><strong>Pflichtteil-Verzicht:</strong> Bei größeren Übertragungen ggf. Pflichtteilsverzicht der Geschwister einholen.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Wichtig: Beratung durch Experten">
        <p className="text-sm">
          Diese Strategien sind komplex und individuell. Vor jeder Übertragung solltest du folgende Beratung
          einholen:
        </p>
        <ul className="space-y-1 list-disc list-inside text-sm mt-2">
          <li><strong>Steuerberater</strong> für individuelle Steuerwirkung und Optimierung</li>
          <li><strong>Notar</strong> für rechtskonforme Vertragsgestaltung</li>
          <li><strong>Fachanwalt für Erbrecht</strong> bei mehreren Erben oder besonderen Familienkonstellationen</li>
        </ul>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
