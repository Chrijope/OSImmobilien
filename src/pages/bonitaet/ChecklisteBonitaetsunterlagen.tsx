import {
  FileCheck, IdCard, Briefcase, Building2, Wallet, FileText, Receipt,
  ScrollText, FileSignature, FileBadge, Banknote, FileSpreadsheet, FilePieChart,
  Landmark, BarChart3, Stamp, Users, HeartPulse,
} from "lucide-react";
import {
  UnterlagenDetailLayout,
  SectionCard,
} from "@/components/unterlagen/UnterlagenDetailLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DocItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  warum: string;
  hinweis?: string;
  /** Ohne Angabe gilt die Unterlage als Pflicht. */
  optional?: boolean;
}

/**
 * Unterlagen, die jede Bank unabhängig von der Beschäftigungsart verlangt.
 *
 * Sie standen früher in der Angestellten-Liste. Damit las sich die Seite so,
 * als bräuchte ein Selbstständiger weder Ausweis noch Schufa-Auskunft. Jetzt
 * stehen sie einmal oben, darunter folgt je Beschäftigungsart nur noch das,
 * was dazukommt. Genauso ist das PDF aufgebaut, das über den Knopf oben
 * heruntergeladen wird.
 */
const FUER_ALLE: DocItem[] = [
  {
    name: "Selbstauskunft",
    icon: FileSignature,
    warum:
      "Die Bank prüft anhand der Selbstauskunft deine gesamte wirtschaftliche Situation – Einnahmen, Ausgaben, Vermögen und Verbindlichkeiten. Sie ist die Grundlage jeder Kreditentscheidung.",
    hinweis: "Wahrheitsgemäße und vollständige Angaben sind Pflicht – falsche Angaben sind strafbar.",
  },
  {
    name: "Personalausweis",
    icon: IdCard,
    warum:
      "Identitätsnachweis nach dem Geldwäschegesetz (GwG). Die Bank ist verpflichtet, deine Identität zweifelsfrei festzustellen.",
    hinweis: "Vorder- und Rückseite, gut lesbar, nicht abgelaufen.",
  },
  {
    name: "Schufa-Bonitätsauskunft",
    icon: FileBadge,
    warum:
      "Die Schufa-Auskunft zeigt dein bisheriges Zahlungsverhalten und bestehende Kredite. Ein guter Score ist Voraussetzung für eine Finanzierungszusage.",
    hinweis: "Bestellung über selbstauskunft.de – nicht älter als 3 Monate.",
  },
  {
    name: "Eigener Mietvertrag / „Mietfrei-Bestätigung“",
    icon: FileText,
    warum:
      "Die Bank muss deine tatsächliche Wohnkostenbelastung kennen. Wer mietfrei wohnt (z. B. bei Eltern), erhöht durch eine Mietfrei-Bestätigung sein verfügbares Einkommen deutlich.",
  },
  {
    name: "Eigenkapitalnachweis",
    icon: Wallet,
    warum:
      "Beleg über vorhandene liquide Mittel (Konto-/Depotauszüge, Sparbücher). Eigenkapital reduziert das Risiko der Bank und verbessert deine Konditionen.",
    hinweis: "Auszüge nicht älter als 1 Monat.",
  },
  {
    name: "Kontoauszüge der letzten 3 Monate",
    icon: Banknote,
    warum:
      "Zeigen der Bank die tatsächlichen Zahlungsströme: was regelmäßig eingeht, was abgeht und ob Rücklastschriften vorkommen. Sie sind der Wirklichkeitstest zur Selbstauskunft.",
    hinweis: "Alle Seiten, auch die Leerseiten, lückenlos.",
  },
  {
    name: "Nachweis der privaten Krankenversicherung",
    icon: HeartPulse,
    warum:
      "Nur bei privater Versicherung. Der Beitrag ist eine feste monatliche Belastung und steigt mit dem Alter, deshalb rechnet die Bank ihn gesondert ein.",
    optional: true,
    hinweis: "Entfällt bei gesetzlicher Krankenversicherung.",
  },
];

const ANGESTELLTER: DocItem[] = [
  {
    name: "Letzter Gehaltsnachweis",
    icon: Receipt,
    warum:
      "Der aktuelle Gehaltszettel belegt dein laufendes Einkommen. Auf dieser Basis berechnet die Bank deine maximale monatliche Belastbarkeit.",
  },
  {
    name: "Vorletzter Gehaltsnachweis",
    icon: Receipt,
    warum:
      "Zeigt der Bank, dass dein Einkommen kontinuierlich und stabil ist – ein Einzelmonat reicht der Bank nicht aus.",
  },
  {
    name: "Vorvorletzter Gehaltsnachweis",
    icon: Receipt,
    warum:
      "Vervollständigt das Bild der letzten 3 Monate. Banken nutzen den Durchschnitt, um Sondereffekte (Boni, Urlaubsgeld) realistisch einzuordnen.",
  },
  {
    name: "Gehaltsnachweis Dezember Vorjahr",
    icon: ScrollText,
    warum:
      "Der Dezember-Lohnzettel enthält die Jahressummen (Bruttojahresgehalt, Sonderzahlungen, Steuern). Damit prüft die Bank dein Gesamteinkommen des letzten Jahres.",
  },
  {
    name: "Lohnsteuerbescheinigung des Vorjahres",
    icon: FileSpreadsheet,
    warum:
      "Offizielle Bestätigung des Arbeitgebers über das gesamte Vorjahresbrutto, gezahlte Steuern und Sozialabgaben. Wichtigster Einzelnachweis für die Jahresbetrachtung.",
  },
  {
    name: "Letzter Steuerbescheid / „Negativ-Erklärung“",
    icon: FilePieChart,
    warum:
      "Der Steuerbescheid liefert das tatsächlich versteuerte Einkommen. Wer keinen aktuellen hat, gibt eine Negativ-Erklärung ab (z. B. weil keine Pflicht zur Abgabe besteht).",
  },
  {
    name: "Arbeitsvertrag",
    icon: Briefcase,
    warum:
      "Belegt die Art deiner Anstellung (befristet/unbefristet), Probezeit, Kündigungsfristen und Sonderzahlungen. Unbefristet ohne Probezeit ist ideal für die Bank.",
    hinweis: "Alle Seiten inkl. eventueller Zusatzvereinbarungen.",
  },
  {
    name: "Aktuelle Rentenauskunft",
    icon: ScrollText,
    warum:
      "Zeigt deine erworbenen Rentenanwartschaften. Für Banken relevant, um deine langfristige Bonität auch im Ruhestand zu beurteilen – insbesondere bei langen Darlehenslaufzeiten.",
  },
];

const BEAMTER: DocItem[] = [
  {
    name: "Letzte 3 Bezügemitteilungen",
    icon: Receipt,
    warum:
      "Belegen die laufenden Bezüge samt Zulagen. Drei Monate zeigen der Bank, dass die Höhe stabil ist und keine Sondereffekte enthalten sind.",
  },
  {
    name: "Lohnsteuerbescheinigung des Vorjahres",
    icon: FileSpreadsheet,
    warum:
      "Fasst das Vorjahr zusammen: Bruttobezüge, gezahlte Steuern, Abzüge. Der wichtigste Einzelnachweis für die Jahresbetrachtung.",
  },
  {
    name: "Letzter Steuerbescheid / „Negativ-Erklärung“",
    icon: FilePieChart,
    warum:
      "Liefert das tatsächlich versteuerte Einkommen. Wer keinen aktuellen hat, gibt eine Negativ-Erklärung ab.",
  },
  {
    name: "Ernennungsurkunde",
    icon: Stamp,
    warum:
      "Weist den Beamtenstatus und dessen Art nach. Auf Lebenszeit verstanden Banken als das sicherste Einkommen überhaupt, das schlägt sich in den Konditionen nieder.",
    optional: true,
    hinweis: "Falls vorhanden. Bei Beamten auf Probe oder auf Widerruf besonders aussagekräftig.",
  },
  {
    name: "Aktuelle Besoldungsbescheide (letzte 3 Monate)",
    icon: Landmark,
    warum:
      "Amtliche Festsetzung der Besoldung nach Besoldungsgruppe und Stufe. Die Bank liest daran ab, wie sich dein Einkommen künftig entwickelt.",
  },
  {
    name: "Aktuelle Rentenauskunft",
    icon: ScrollText,
    warum:
      "Bei Beamten die Versorgungsauskunft. Relevant, um die Bonität über die Dienstzeit hinaus zu beurteilen, gerade bei langen Darlehenslaufzeiten.",
  },
];

const SELBSTSTAENDIGER: DocItem[] = [
  {
    name: "Steuerbescheide der letzten 3 Jahre",
    icon: FilePieChart,
    warum:
      "Der amtliche Nachweis deines tatsächlich versteuerten Gewinns. Drei Jahre, weil die Bank Schwankungen sehen und einen Durchschnitt bilden will. Ein einzelnes gutes Jahr zählt nicht.",
    hinweis: "Ohne diese drei Jahre prüft in der Regel keine Bank.",
  },
  {
    name: "Steuererklärungen der letzten 3 Jahre",
    icon: FileSpreadsheet,
    warum:
      "Zeigen, wie der Gewinn zustande kommt, also welche Einnahmen und welche Abschreibungen dahinterstehen. Erst zusammen mit den Bescheiden ergibt sich das vollständige Bild.",
  },
  {
    name: "Bilanz / BWA der letzten 3 Jahre",
    icon: BarChart3,
    warum:
      "Die betriebswirtschaftliche Auswertung zeigt den laufenden Geschäftsverlauf, die Bilanz die Vermögenslage des Unternehmens. Die Bank beurteilt damit, ob dein Einkommen tragfähig bleibt.",
  },
  {
    name: "Geschäftskontoauszüge der letzten 3 Monate",
    icon: Banknote,
    warum:
      "Trennen das Geschäftliche vom Privaten und belegen die aktuellen Zahlungsströme. Sie sind der Beleg dafür, dass die Zahlen aus BWA und Bilanz auch heute noch stimmen.",
  },
  {
    name: "Handelsregisterauszug",
    icon: Building2,
    warum:
      "Weist Rechtsform, Vertretungsbefugnis und Sitz des Unternehmens nach. Die Bank muss wissen, wer für die Gesellschaft handeln darf.",
    optional: true,
    hinweis: "Nur bei eingetragenen Unternehmen. Freiberufler brauchen ihn nicht.",
  },
  {
    name: "Summen- und Saldenliste des laufenden Jahres",
    icon: FileSpreadsheet,
    warum:
      "Ergänzt die BWA um den Stand des angefangenen Jahres. Je weiter das Jahr fortgeschritten ist, desto wichtiger wird sie der Bank.",
  },
];

/** Die Kartenliste einer Beschäftigungsart. Vorher stand sie einmal fest im
 *  Aufbau, jetzt wird sie viermal gebraucht. */
function DokumentGitter({ docs }: { docs: DocItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {docs.map((doc) => {
        const Icon = doc.icon;
        return (
          <Card key={doc.name} className="p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-sm text-foreground">{doc.name}</h4>
                  <Badge variant={doc.optional ? "outline" : "secondary"} className="text-[10px]">
                    {doc.optional ? "Falls vorhanden" : "Pflicht"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{doc.warum}</p>
                {doc.hinweis && (
                  <p className="text-[11px] text-primary/80 mt-2 italic border-l-2 border-primary/30 pl-2">
                    {doc.hinweis}
                  </p>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function ChecklisteBonitaetsunterlagen() {
  return (
    <UnterlagenDetailLayout
      title="Checkliste Bonitätsunterlagen"
      subtitle="Alle Dokumente, die deine Bank für die Bonitätsprüfung benötigt – mit Erklärung, warum jede Unterlage wichtig ist"
      pdfLabel="Checkliste als PDF herunterladen"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateChecklisteBonitaetPDF();
      }}
    >
      <SectionCard title="Wofür brauche ich diese Unterlagen?" icon={<FileCheck className="h-5 w-5" />}>
        <p>
          Die Bonitätsprüfung ist der wichtigste Schritt vor jeder Finanzierungszusage. Je
          vollständiger und besser strukturiert deine Unterlagen sind, desto schneller bekommst
          du eine Zusage – und in der Regel auch bessere Konditionen.
        </p>
        <p className="text-muted-foreground">
          Unten stehen zuerst die Unterlagen, die <strong className="text-foreground">jede Bank
          von allen verlangt</strong>. Danach folgt je ein Abschnitt für Angestellte, Beamte und
          Selbstständige. Du brauchst den Block „Für alle“ plus genau einen der drei darunter.
        </p>
      </SectionCard>

      <SectionCard title="Für alle Beschäftigungsarten" icon={<Users className="h-5 w-5" />}>
        <DokumentGitter docs={FUER_ALLE} />
      </SectionCard>

      <SectionCard title="Zusätzlich für Angestellte" icon={<Briefcase className="h-5 w-5" />}>
        <DokumentGitter docs={ANGESTELLTER} />
      </SectionCard>

      <SectionCard title="Zusätzlich für Beamte" icon={<Landmark className="h-5 w-5" />}>
        <DokumentGitter docs={BEAMTER} />
      </SectionCard>

      <SectionCard title="Zusätzlich für Selbstständige und Freiberufler" icon={<Building2 className="h-5 w-5" />}>
        <p className="text-muted-foreground mb-3">
          Bei Selbstständigen verlangt die Bank <strong className="text-foreground">keinen
          Arbeitsvertrag, keine Lohnsteuerbescheinigung und keine Rentenauskunft</strong>. An
          deren Stelle treten die drei Jahre Steuerbescheide, Steuererklärungen und Bilanz oder
          BWA.
        </p>
        <DokumentGitter docs={SELBSTSTAENDIGER} />
      </SectionCard>

      <SectionCard title="Tipp für die schnellste Bearbeitung" icon={<Banknote className="h-5 w-5" />}>
        <p>
          Sammle alle Unterlagen in <strong className="text-foreground">einem einzigen PDF</strong>,
          sortiert nach der Reihenfolge dieser Checkliste. Banken bearbeiten vollständige Akten in
          der Regel <strong className="text-foreground">3–5 Tage schneller</strong> als unvollständig
          eingereichte Unterlagen.
        </p>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
