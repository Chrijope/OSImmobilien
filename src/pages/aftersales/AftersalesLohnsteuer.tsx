import { TrendingUp, Calculator, FileText } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard, PhaseStep } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function AftersalesLohnsteuer() {
  return (
    <UnterlagenDetailLayout
      title="Lohnsteueroptimierung durch Immobilien"
      subtitle="Mehr Netto vom Brutto – Sofort spürbar durch Eintrag des Freibetrags"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateLohnsteueroptimierungPDF();
      }}
      pdfLabel="Komplette PDF herunterladen"
      quellen={[
        { titel: "§ 39a EStG – Freibetrag im Lohnsteuer-Ermäßigungsverfahren", url: "https://www.gesetze-im-internet.de/estg/__39a.html" },
        { titel: "BMF-Schreiben zu vermieteten Immobilien", url: "https://www.bundesfinanzministerium.de" },
        { titel: "Elster-Hilfe: Lohnsteuer-Ermäßigung", url: "https://www.elster.de/eportal/infoseite/lohnsteuerermaessigung" },
      ]}
    >
      <SectionCard title="Das Prinzip" icon={<TrendingUp className="h-5 w-5" />}>
        <p>
          Wer eine vermietete Immobilie besitzt, erzielt durch <strong>Werbungskosten</strong> (AfA, Schuldzinsen,
          Hausgeld, Reparaturen) typischerweise einen <strong>negativen Überschuss</strong> aus Vermietung und
          Verpachtung. Dieser steuerliche Verlust mindert das zu versteuernde Einkommen.
        </p>
        <p>
          Statt am Jahresende auf die Erstattung zu warten, kannst du diesen Verlust als{" "}
          <strong>Freibetrag in der Lohnsteuerkarte</strong> eintragen lassen. Ergebnis: Du bekommst{" "}
          <strong>jeden Monat mehr Netto vom Brutto</strong> – ganz ohne Erstattungsantrag.
        </p>
      </SectionCard>

      <SectionCard title="Beispielrechnung" icon={<Calculator className="h-5 w-5" />}>
        <div className="bg-muted/40 border border-border rounded p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span>Bruttojahresgehalt:</span><span className="font-semibold">75.000 €</span></div>
          <div className="flex justify-between"><span>Steuerlicher Verlust aus V+V:</span><span className="font-semibold text-primary">-9.800 €</span></div>
          <div className="flex justify-between"><span>Persönlicher Grenzsteuersatz:</span><span className="font-semibold">42 %</span></div>
          <div className="border-t border-border pt-2 flex justify-between text-base">
            <span className="font-semibold">Mehr Netto pro Jahr:</span>
            <span className="font-bold text-primary">≈ 4.116 €</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Pro Monat:</span><span>≈ 343 €</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="So gehst du vor" icon={<FileText className="h-5 w-5" />}>
        <div className="space-y-5">
          <PhaseStep num={1} titel="Werbungskosten ermitteln" text="Liste alle Werbungskosten auf: AfA (2 % bzw. 2,5 %/3 % linear), Schuldzinsen, Hausgeld (nicht-umlagefähiger Anteil), Erhaltungsaufwand, Fahrtkosten, Steuerberater. Ergebnis = voraussichtlicher Verlust für das aktuelle Jahr." />
          <PhaseStep num={2} titel="Antrag auf Lohnsteuer-Ermäßigung stellen" text="Im Elster-Portal unter 'Lohnsteuer-Ermäßigung' den Antrag stellen. Verluste aus V+V werden im Hauptvordruck und in der Anlage V eingetragen. Spätestens bis 30.11. des laufenden Jahres." />
          <PhaseStep num={3} titel="Freibetrag wird in ELStAM eingetragen" text="Das Finanzamt prüft (meist innerhalb 4-6 Wochen) und überträgt den Freibetrag automatisch in die elektronische Lohnsteuer-Karte (ELStAM). Dein Arbeitgeber zieht ab nächstem Monat weniger Lohnsteuer ab." />
          <PhaseStep num={4} titel="Jährlich neu beantragen" text="Der Freibetrag gilt nur für das laufende Jahr und muss jedes Jahr neu beantragt werden. Tipp: Direkt im Januar einreichen, damit der Vorteil ab Februar wirkt." />
        </div>
      </SectionCard>

      <SectionCard title="Was zählt zu den Werbungskosten?">
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li><strong>AfA (Abschreibung)</strong>: 2 % p.a. (Bestand), 2,5 % (Baujahr ab 2023), 3 % (Neubau ab 1.1.2023), zzgl. Sonder-AfA Denkmal</li>
          <li><strong>Schuldzinsen</strong>: Vollständig ansetzbar, solange das Darlehen für die Anschaffung verwendet wurde</li>
          <li><strong>Hausgeld</strong>: Nur der nicht-umlagefähige Anteil (Verwaltung, Instandhaltungsrücklage)</li>
          <li><strong>Reparaturen / Erhaltungsaufwand</strong>: Direkt im Jahr der Zahlung absetzbar (Achtung 15-%-Grenze in den ersten 3 Jahren)</li>
          <li><strong>Sonstige</strong>: Steuerberater, Fahrten zum Objekt (0,30 €/km), Kontoführung, Maklergebühren bei Neuvermietung</li>
        </ul>
      </SectionCard>

      <SectionCard title="Wichtige Hinweise">
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li>Für den Antrag gilt eine <strong>Wesentlichkeitsgrenze</strong> von 600 € (Werbungskostenüberhang). Darunter wird kein Freibetrag eingetragen.</li>
          <li>Bei <strong>Ehepaaren</strong>: Der Freibetrag kann je nach Steuerklasse-Konstellation einem Partner zugeteilt oder geteilt werden.</li>
          <li>Wer den Freibetrag nicht beantragt, verliert nichts – die Erstattung kommt dann erst nach der jährlichen Steuererklärung.</li>
          <li><strong>Pflicht zur Steuererklärung:</strong> Mit eingetragenem Freibetrag bist du zur Abgabe der Steuererklärung verpflichtet (§ 46 EStG).</li>
        </ul>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
