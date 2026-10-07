import { BookOpen, TrendingUp, Calculator } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function AftersalesSteuerwissen() {
  return (
    <UnterlagenDetailLayout
      title="Steuerwissen kompakt – Kapitalanlageimmobilie"
      subtitle="Steuerstrategien rund um den Verkauf nach 10 Jahren"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateSteuerwissenPDF();
      }}
      pdfLabel="Steuerwissen als PDF"
      quellen={[
        { titel: "§ 23 EStG – Private Veräußerungsgeschäfte (10-Jahres-Frist)", url: "https://www.gesetze-im-internet.de/estg/__23.html" },
        { titel: "§ 7 EStG – Lineare Abschreibung Gebäude", url: "https://www.gesetze-im-internet.de/estg/__7.html" },
        { titel: "§ 7i EStG – Erhöhte AfA bei Baudenkmalen", url: "https://www.gesetze-im-internet.de/estg/__7i.html" },
        { titel: "§ 9 EStG – Werbungskosten bei Vermietung & Verpachtung", url: "https://www.gesetze-im-internet.de/estg/__9.html" },
        { titel: "BMF-Schreiben zur 15-%-Grenze (anschaffungsnahe Herstellungskosten)", url: "https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/Steuerarten/Einkommensteuer/einkommensteuer.html" },
        { titel: "BFH-Urteil IX R 11/17 – steuerfreier Verkauf nach 10 Jahren", hinweis: "Bestätigt die Anwendung der Spekulationsfrist auf vermietete Immobilien" },
      ]}
    >
      <SectionCard title="Die 10-Jahres-Frist (§ 23 EStG)" icon={<BookOpen className="h-5 w-5" />}>
        <p>
          Wer eine vermietete Immobilie länger als 10 Jahre hält, kann sie <strong>komplett steuerfrei verkaufen</strong>.
          Die Frist beginnt mit dem Datum des notariellen Kaufvertrages und endet 10 Jahre später taggenau.
        </p>
        <p>
          Diese Regel macht die Kapitalanlage-Immobilie gegenüber Aktien und ETFs (25 % Abgeltungssteuer auf Gewinne)
          besonders attraktiv – vor allem in Zeiten steigender Marktpreise.
        </p>
        <div className="bg-primary/5 border border-primary/20 rounded p-4 mt-3">
          <strong>Beispielrechnung:</strong>
          <ul className="mt-2 space-y-1 list-disc list-inside text-xs">
            <li>Kaufpreis 2026: 280.000 €</li>
            <li>Verkaufspreis 2036: 410.000 €</li>
            <li>Gewinn: 130.000 € → <strong>0 € Steuer</strong> (steuerfrei nach § 23 EStG)</li>
            <li>Bei Verkauf nach 9 Jahren: ca. 54.600 € Steuer (42 % Spitzensatz auf 130.000 €)</li>
          </ul>
        </div>
      </SectionCard>

      <SectionCard title="Abschreibungen (AfA) während der Haltedauer" icon={<TrendingUp className="h-5 w-5" />}>
        <p>Drei AfA-Modelle stehen zur Verfügung:</p>
        <ul className="space-y-2 list-disc list-inside">
          <li><strong>Lineare AfA (§ 7 Abs. 4 EStG):</strong> 2,0 % p.a. bei Bj. ab 1925, 2,5 % bei Bj. vor 1925.</li>
          <li><strong>Neubau-AfA (seit 2023):</strong> 3,0 % p.a. degressiv für Neubauten ab Baujahr 2023.</li>
          <li><strong>Denkmal-AfA (§ 7i EStG):</strong> 9 % p.a. in Jahr 1-8, dann 7 % in Jahr 9-12 auf den Sanierungsanteil.</li>
        </ul>
        <p className="text-muted-foreground text-xs mt-2">
          Die AfA reduziert das zu versteuernde Einkommen aus Vermietung und Verpachtung – beim Verkauf nach Ablauf der
          10-Jahres-Frist müssen die abgeschriebenen Beträge nicht zurückgezahlt werden.
        </p>
      </SectionCard>

      <SectionCard title="Werbungskosten – was alles abziehbar ist" icon={<Calculator className="h-5 w-5" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold mb-2">Laufende Werbungskosten</h4>
            <ul className="space-y-1 text-xs list-disc list-inside">
              <li>Schuldzinsen (kein Tilgungsanteil!)</li>
              <li>Verwaltungskosten der Hausverwaltung</li>
              <li>Hausgeld (außer Instandhaltungsrücklage)</li>
              <li>Erhaltungsaufwendungen (Reparaturen)</li>
              <li>Versicherungen (Wohngebäude, Haftpflicht)</li>
              <li>Grundsteuer (wenn nicht umgelegt)</li>
              <li>Maklerkosten bei Neuvermietung</li>
              <li>Kontoführungsgebühren (anteilig)</li>
              <li>Fahrtkosten zum Objekt (0,30 € / km)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Anschaffungsnaher Aufwand</h4>
            <p className="text-xs mb-2">
              Vorsicht: Reparaturen <strong>innerhalb von 3 Jahren</strong> nach Kauf, deren Summe <strong>15 % der
              Anschaffungskosten</strong> übersteigt, werden zu Herstellungskosten umqualifiziert (BMF). Sie sind dann
              nur über die AfA abzugsfähig statt sofort.
            </p>
            <p className="text-xs text-muted-foreground">
              Praxis-Tipp: Größere Sanierungen entweder vor dem Kauf oder erst nach 3 Jahren durchführen, oder unter
              der 15-%-Grenze halten.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Strategien zum Ablauf der 10-Jahres-Frist">
        <ol className="space-y-3 list-decimal list-inside">
          <li>
            <strong>Halten und weiter vermieten:</strong> Die Wohnung wirft jetzt voll Cashflow ab (oft tilgungsfrei oder niedrige Restschuld).
          </li>
          <li>
            <strong>Steuerfrei verkaufen und reinvestieren:</strong> Gewinn nutzen, um 2 neue Objekte zu kaufen (Hebel-Effekt).
          </li>
          <li>
            <strong>Übertragung an Kinder:</strong> Schenkungssteuerfreibeträge (400.000 € pro Kind / 10 Jahre) nutzen.
          </li>
          <li>
            <strong>Ehegattenschaukel:</strong> Übertragung auf Ehepartner und Verkauf zur Steueroptimierung (siehe separates PDF).
          </li>
        </ol>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
