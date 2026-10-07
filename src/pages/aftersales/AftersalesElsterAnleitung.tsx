import { Monitor, FileText, AlertCircle } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard } from "@/components/unterlagen/UnterlagenDetailLayout";

export default function AftersalesElsterAnleitung() {
  return (
    <UnterlagenDetailLayout
      title="Senkung der Lohnsteuer – Elster-Anleitung"
      subtitle="Schritt-für-Schritt zum Lohnsteuer-Freibetrag bei Vermietungseinkünften"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateElsterAnleitungPDF();
      }}
      pdfLabel="Anleitung als PDF"
      quellen={[
        { titel: "Mein ELSTER – Login & Antragsstellung", url: "https://www.elster.de/eportal/start" },
        { titel: "§ 39a EStG – Freibetrag auf der Lohnsteuerkarte", url: "https://www.gesetze-im-internet.de/estg/__39a.html" },
        { titel: "BMF: Antrag auf Lohnsteuer-Ermäßigung", url: "https://www.formulare-bfinv.de/" },
        { titel: "Bundeszentralamt für Steuern – ELSTER FAQ", url: "https://www.bzst.de/" },
      ]}
    >
      <SectionCard title="Was ist der Lohnsteuer-Freibetrag?" icon={<FileText className="h-5 w-5" />}>
        <p>
          Wer vorhersehbar Werbungskosten oder Verluste aus Vermietung & Verpachtung hat, kann beim Finanzamt einen
          <strong> Lohnsteuer-Freibetrag</strong> beantragen. Damit wird die monatliche Lohnsteuer sofort reduziert –
          statt 12 Monate auf die Rückerstattung zu warten.
        </p>
        <div className="bg-primary/5 border border-primary/20 rounded p-3 text-xs">
          <strong>Beispiel:</strong> Bei 12.000 € jährlichem Verlust aus V&V und Spitzensteuersatz 42 % = ca. <strong>420 € mehr Netto pro Monat</strong>.
        </div>
      </SectionCard>

      <SectionCard title="Voraussetzungen">
        <ul className="space-y-2 list-disc list-inside">
          <li>ELSTER-Konto (kostenlos auf <a className="text-primary underline" href="https://www.elster.de" target="_blank" rel="noreferrer">elster.de</a>)</li>
          <li>Aktiv elektronisches Zertifikat (.pfx-Datei) – einmalig per Brief mit Aktivierungs-ID</li>
          <li>Realistische Schätzung der Werbungskosten und Mieteinnahmen für das laufende Jahr</li>
          <li>Mindestbetrag: 600 € Antragsschwelle (Werbungskosten + Sonderausgaben + außergew. Belastungen)</li>
        </ul>
      </SectionCard>

      <SectionCard title="Schritt für Schritt – ELSTER-Antrag" icon={<Monitor className="h-5 w-5" />}>
        <ol className="space-y-3 list-decimal list-inside">
          <li>
            <strong>ELSTER-Login:</strong> Bei <a className="text-primary underline" href="https://www.elster.de" target="_blank" rel="noreferrer">elster.de</a> mit Zertifikatsdatei einloggen.
          </li>
          <li>
            <strong>Formular wählen:</strong> Im Menü „Alle Formulare" → „Lohnsteuer-Ermäßigungsantrag" auswählen (auch unter „Anträge / Mitteilungen / Bescheinigungen" zu finden).
          </li>
          <li>
            <strong>Hauptvordruck ausfüllen:</strong> Persönliche Daten und Steuer-ID werden automatisch übernommen. Wahljahr eintragen.
          </li>
          <li>
            <strong>Anlage „Werbungskosten" befüllen:</strong> Falls neben V&V auch Arbeitnehmerwerbungskosten anfallen.
          </li>
          <li>
            <strong>Anlage V (Vermietung & Verpachtung):</strong>
            <ul className="ml-6 mt-1 space-y-1 list-disc list-inside text-xs">
              <li>Erwartete Mieteinnahmen für das Jahr</li>
              <li>Geplante Werbungskosten (Schuldzinsen, AfA, Hausgeld, Versicherungen, Reparaturen)</li>
              <li>Erwarteter Verlust aus V&V</li>
            </ul>
          </li>
          <li>
            <strong>Antrag prüfen und absenden:</strong> Plausibilitätsprüfung läuft automatisch. Senden mit Zertifikat.
          </li>
          <li>
            <strong>Bearbeitung:</strong> Finanzamt prüft (i. d. R. 2-4 Wochen) und stellt elektronische Lohnsteuer-Abzugsmerkmale (ELStAM) ein. Arbeitgeber zieht den Freibetrag automatisch.
          </li>
        </ol>
      </SectionCard>

      <SectionCard title="Welche Posten als Verlust einrechnen?">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="bg-primary/5 border border-primary/20 rounded p-3">
            <strong className="text-primary">Einnahmen-Seite</strong>
            <ul className="mt-1 space-y-1 list-disc list-inside text-xs">
              <li>Kaltmiete × 12 Monate</li>
              <li>Umlagefähige Nebenkosten (durchlaufender Posten)</li>
              <li>Möbelmiete (falls möbliert)</li>
            </ul>
          </div>
          <div className="bg-destructive/5 border border-destructive/20 rounded p-3">
            <strong className="text-destructive">Werbungskosten-Seite</strong>
            <ul className="mt-1 space-y-1 list-disc list-inside text-xs">
              <li>Schuldzinsen (Bank-Annuitätenplan)</li>
              <li>Lineare AfA (2,0–2,5 %)</li>
              <li>Hausgeld (ohne Instandhaltungsrücklage)</li>
              <li>Verwaltungskosten</li>
              <li>Versicherungen & Grundsteuer</li>
              <li>Erhaltungsaufwand / kleinere Reparaturen</li>
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Häufige Fehler" icon={<AlertCircle className="h-5 w-5" />}>
        <ul className="space-y-2 list-disc list-inside text-sm text-destructive/90">
          <li>Tilgung als Werbungskosten ansetzen (NICHT erlaubt)</li>
          <li>Vollständiges Hausgeld absetzen (Instandhaltungsrücklage NICHT abziehbar)</li>
          <li>Antrag erst im Dezember stellen (zu spät – Wirkung nur noch wenige Wochen)</li>
          <li>Unterschätzte Mieteinnahmen → Steuernachzahlung am Jahresende</li>
        </ul>
      </SectionCard>

      <SectionCard title="Praxis-Tipps">
        <ul className="space-y-2 list-disc list-inside">
          <li><strong>Jährlich neu beantragen</strong> – der Freibetrag gilt nur für ein Kalenderjahr.</li>
          <li><strong>Antrag bis Ende November</strong> für volles Folgejahr (Antragsfrist: 30. November).</li>
          <li>Bei <strong>mehreren Objekten</strong>: alle in einer Anlage V zusammenführen.</li>
          <li>Bei Verheirateten: Antrag immer von beiden Partnern unterschreiben (auch wenn nur einer vermietet).</li>
        </ul>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
