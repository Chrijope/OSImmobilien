import { CheckSquare, Lightbulb, Calendar } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function AftersalesSteuerersparnis() {
  return (
    <UnterlagenDetailLayout
      title="Checkliste maximale Steuerersparnis"
      subtitle="Schritt-für-Schritt zur optimalen Steuerersparnis als Vermieter"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateChecklisteSteuerersparnisPDF();
      }}
      pdfLabel="Checkliste als PDF"
      quellen={[
        { titel: "§ 9 EStG – Werbungskosten", url: "https://www.gesetze-im-internet.de/estg/__9.html" },
        { titel: "§ 7 EStG – Abschreibungen", url: "https://www.gesetze-im-internet.de/estg/__7.html" },
        { titel: "BMF-Schreiben anschaffungsnahe Herstellungskosten", url: "https://www.bundesfinanzministerium.de/" },
        { titel: "Lohnsteuerhilfevereine – BVL", url: "https://www.bvl-verband.de/", hinweis: "Beratung zur Lohnsteuer für Arbeitnehmer" },
      ]}
    >
      <SectionCard title="Vor dem Kauf" icon={<Lightbulb className="h-5 w-5" />}>
        <ul className="space-y-2">
          {[
            "Kaufpreis-Aufteilung Grund/Boden vs. Gebäude im Kaufvertrag explizit regeln",
            "Möglichst hohen Gebäudeanteil (60-80 %) anstreben → mehr AfA",
            "Sanierungskonzept erstellen (vor Kauf, um anschaffungsnahe Kosten zu vermeiden)",
            "Bei Denkmal: Bescheinigung der Denkmalbehörde VOR Sanierungsbeginn einholen",
            "Steuerberater einbinden für AfA-Strategie und individuelle Beratung",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Im Kaufjahr" icon={<Calendar className="h-5 w-5" />}>
        <ul className="space-y-2">
          {[
            "Notarkosten und Grundbucheintragung als sofort abziehbare Werbungskosten geltend machen",
            "Maklerprovision (Käufer-Anteil) als Anschaffungsnebenkosten erfassen → AfA",
            "Finanzierungsnebenkosten (Bankgebühren, Bereitstellungszinsen) als WK absetzen",
            "Erste Lohnsteuer-Korrektur durch Freibetragseintrag (Elster) prüfen",
            "Alle Belege geordnet sammeln (Hausgeld, Verwaltung, Reparaturen)",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Laufend (jedes Jahr)">
        <ul className="space-y-2">
          {[
            "Schuldzinsen aus Bankabrechnung in Anlage V eintragen (Tilgung NICHT absetzbar!)",
            "Lineare AfA gemäß Bj. ansetzen (2,0 % oder 2,5 %)",
            "Alle Werbungskosten dokumentiert sammeln (Versicherungen, Hausgeld ohne Rücklage, Reparaturen)",
            "Fahrten zur Wohnung mit 0,30 €/km dokumentieren",
            "Kontoauszüge mit Sondertilgungen für Steuerberater bereithalten",
            "Einnahmen-Überschuss aus V&V berechnen und in Anlage V eintragen",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Bei Sanierung & Reparaturen">
        <ul className="space-y-2">
          {[
            "Innerhalb 3 Jahre: 15-%-Grenze prüfen (sonst Aktivierung als Herstellungskosten)",
            "Erhaltungsaufwand sofort absetzen (Streichen, kleine Reparaturen)",
            "Größere Maßnahmen auf 2-5 Jahre verteilen (§ 82b EStDV)",
            "Modernisierungen mit nachhaltiger Mieterhöhung dokumentieren",
            "Energetische Sanierung: BAFA/KfW-Förderung mit Steuervorteil kombinieren",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Vor dem Verkauf">
        <ul className="space-y-2">
          {[
            "10-Jahres-Frist (§ 23 EStG) prüfen – nach Ablauf steuerfrei",
            "Bei Eigennutzung: 2 Jahre vor Verkauf einziehen (Spekulationsfrist umgehbar)",
            "Bei Verkauf in den letzten 12 Monaten der Frist: Steuerlast vorher berechnen",
            "Schenkung an Kinder als Alternative prüfen (Freibetrag 400.000 € / 10 Jahre)",
            "Ehegattenschaukel bei Spitzensteuersatz prüfen",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Häufige Fehler (vermeiden!)">
        <ul className="space-y-2 text-sm">
          {[
            "Tilgungsanteil als Werbungskosten ansetzen (NICHT absetzbar)",
            "Hausgeld komplett absetzen (Instandhaltungsrücklage NICHT abziehbar)",
            "Anschaffungsnahe Sanierung über 15 % nicht aktivieren",
            "Bei Eigennutzungsanteilen kein Aufteilungsschlüssel",
            "Belege nicht aufbewahren (10 Jahre Aufbewahrungspflicht)",
            "Verspätet abgegebene Steuererklärung → Verspätungszuschlag bis 25.000 €",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-destructive">
              <span className="font-bold">✗</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
