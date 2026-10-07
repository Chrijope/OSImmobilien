import { Percent, Calculator, Users } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function AftersalesSteuersaetze() {
  return (
    <UnterlagenDetailLayout
      title="Steuersätze nach Einkommenshöhe"
      subtitle="Aktuelle Tarife 2025 mit Beispielrechnungen für die Steuerersparnis"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateSteuersaetzePDF();
      }}
      pdfLabel="Steuersätze als PDF"
      quellen={[
        { titel: "Bundesministerium der Finanzen – Einkommensteuertarif 2025", url: "https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerarten/Lohnsteuer/Programmablaufplan/2025-11-21-PAP-2025-anlage-1.pdf" },
        { titel: "§ 32a EStG – Einkommensteuertarif", url: "https://www.gesetze-im-internet.de/estg/__32a.html" },
        { titel: "Solidaritätszuschlag-Rechner BMF", url: "https://www.bmf-steuerrechner.de/" },
        { titel: "Statistisches Bundesamt – Lohn- und Einkommensteuerstatistik", url: "https://www.destatis.de/DE/Themen/Staat/Steuern/Steuern-Bund-Laender-Gemeinden/_inhalt.html" },
      ]}
    >
      <SectionCard title="Die 5 Tarifzonen 2025 (Grundtarif)" icon={<Percent className="h-5 w-5" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 border">Zone</th>
                <th className="text-left p-2 border">Zu versteuerndes Einkommen</th>
                <th className="text-left p-2 border">Steuersatz</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="p-2 border">Nullzone</td><td className="p-2 border">bis 12.096 €</td><td className="p-2 border font-mono">0 %</td></tr>
              <tr><td className="p-2 border">Untere Progressionszone</td><td className="p-2 border">12.097 – 17.443 €</td><td className="p-2 border font-mono">14 – 24 %</td></tr>
              <tr><td className="p-2 border">Obere Progressionszone</td><td className="p-2 border">17.444 – 68.480 €</td><td className="p-2 border font-mono">24 – 42 %</td></tr>
              <tr><td className="p-2 border">Spitzensteuerzone</td><td className="p-2 border">68.481 – 277.825 €</td><td className="p-2 border font-mono">42 %</td></tr>
              <tr><td className="p-2 border">Reichensteuer</td><td className="p-2 border">ab 277.826 €</td><td className="p-2 border font-mono">45 %</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Werte gemäß § 32a EStG, Stand 2025. Beim Splittingtarif (Verheiratete) verdoppeln sich alle Schwellenwerte.
        </p>
      </SectionCard>

      <SectionCard title="Solidaritätszuschlag & Kirchensteuer">
        <ul className="space-y-2 list-disc list-inside">
          <li><strong>Solidaritätszuschlag:</strong> 5,5 % der Einkommensteuer. Seit 2021 entfällt der Soli für ca. 90 % der Steuerpflichtigen (Freigrenze 19.950 € bzw. 39.900 € Splitting).</li>
          <li><strong>Kirchensteuer:</strong> 8 % (BY, BW) bzw. 9 % (alle anderen Bundesländer) der Einkommensteuer.</li>
        </ul>
      </SectionCard>

      <SectionCard title="Beispielrechnung: Steuerersparnis durch Immobilien-AfA" icon={<Calculator className="h-5 w-5" />}>
        <p>Angenommen, ein Single hat ein zu versteuerndes Einkommen von 75.000 € und kauft eine Wohnung mit 12.000 € jährlicher AfA + Werbungskosten:</p>
        <div className="bg-primary/5 border border-primary/20 rounded p-4">
          <table className="w-full text-sm">
            <tbody>
              <tr><td>Einkommen ohne Immobilie</td><td className="text-right font-mono">75.000 €</td></tr>
              <tr><td>Steuer ohne Immobilie (ca.)</td><td className="text-right font-mono">19.620 €</td></tr>
              <tr className="border-t"><td>Verlust aus V&V (AfA + Zinsen + Hausgeld − Mieten)</td><td className="text-right font-mono">−12.000 €</td></tr>
              <tr><td>Neues zvE</td><td className="text-right font-mono">63.000 €</td></tr>
              <tr><td>Steuer mit Immobilie (ca.)</td><td className="text-right font-mono">14.580 €</td></tr>
              <tr className="border-t bg-primary/10 font-semibold"><td>Steuerersparnis</td><td className="text-right font-mono text-primary">5.040 €</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Hinweis: Die genaue Steuerersparnis hängt von Grenzsteuersatz, Bundesland und persönlicher Steuersituation ab.
          Diese Berechnung dient nur als Orientierung und ersetzt keine individuelle Steuerberatung.
        </p>
      </SectionCard>

      <SectionCard title="Splittingtarif vs. Grundtarif" icon={<Users className="h-5 w-5" />}>
        <p>
          Verheiratete und eingetragene Lebenspartner können den Splittingtarif wählen. Der Vorteil ist umso größer, je
          unterschiedlicher die Einkommen der Partner sind.
        </p>
        <ul className="space-y-1 list-disc list-inside text-xs">
          <li>Beide gleichviel: kein Splitting-Vorteil</li>
          <li>80/20-Verteilung: bis zu 9.000 € Steuerersparnis</li>
          <li>Alleinverdiener: maximaler Splitting-Vorteil ca. 18.000 €</li>
        </ul>
      </SectionCard>

      <SectionCard title="Praxis-Tipp: Lohnsteuer-Eintrag (Freibetrag)">
        <p>
          Wer absehbar Werbungskosten/AfA-Verluste hat, kann beim Finanzamt einen <strong>Lohnsteuerfreibetrag</strong> eintragen
          lassen. Dann reduziert sich die monatliche Lohnsteuer sofort – statt 12 Monate auf die Rückerstattung zu warten.
          Details siehe „Senkung der Lohnsteuer – Elster-Anleitung".
        </p>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
