import { UnterlagenDetailLayout } from "@/components/unterlagen/UnterlagenDetailLayout";
import { EinwandBibliothekMerged } from "@/components/einwaende/EinwandBibliothekMerged";

const generateEinwandbehandlungPDF = async () => {
  const m = await import("@/lib/unterlagenPdfContent");
  await m.generateEinwandbehandlungPDF();
};

export default function LeitfadenEinwandbehandlung() {
  return (
    <UnterlagenDetailLayout
      title="Einwandbehandlung & Einwand-Bibliothek"
      subtitle="Zentraler Hub: 10 erprobte Techniken + alle Einwände (Kapitalanlage-Top-20 + Bibliothek) — kategorisiert, durchsuchbar."
      onDownloadPdf={generateEinwandbehandlungPDF}
      pdfLabel="Top-20 als PDF"
      quellen={[
        { titel: "Cialdini, R.: Influence – The Psychology of Persuasion", hinweis: "Reziprozität, Konsistenz, Sozialer Beweis" },
        { titel: "Chris Voss: Never Split the Difference", hinweis: "Verhandlungstechniken aus FBI-Geiselverhandlungen" },
        { titel: "Neil Rackham: SPIN Selling", hinweis: "Situations-, Problem-, Implikations- und Nutzenfragen" },
        { titel: "Vermögensaufbau-Studie Postbank 2024", url: "https://www.postbank.de/unternehmen/medien/meldungen/2024.html", hinweis: "Verbreitete Vorbehalte gegen Immobilien als Kapitalanlage" },
        { titel: "vdp-Immobilienpreisindex", url: "https://www.pfandbrief.de/site/de/vdp/immobilie/marktinformation/vdp_immobilienpreisindex.html" },
      ]}
    >
      <EinwandBibliothekMerged />
    </UnterlagenDetailLayout>
  );
}
