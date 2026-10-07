import { buildEinzelDokumentPdf, type EinzelDokumentKey } from "./einzelDokumentePdf";
import type { Bewerber } from "./bewerbungStore";

const MUSTER_BEWERBER = {
  id: "muster",
  vorname: "Max",
  nachname: "Mustermann",
  email: "max.mustermann@example.com",
  telefon: "+49 170 1234567",
  ort: "Musterstadt",
  adresse: "Musterstraße 1, 12345 Musterstadt",
  rechnungsAdresse: "",
  stelleTitel: "Vertriebspartner",
} as unknown as Bewerber;

const FILE_NAMES: Record<EinzelDokumentKey, string> = {
  vertrag: "Leadberatervertrag_Muster_Max-Mustermann.pdf",
  anlage_1: "Leadberatervertrag_Anlage-1_AGB_Muster.pdf",
  anlage_2: "Leadberatervertrag_Anlage-2_Grundgebuehr-Paket_Muster.pdf",
  anlage_3: "Leadberatervertrag_Anlage-3_AVV-Verschwiegenheit_Muster.pdf",
  anlage_4: "Leadberatervertrag_Anlage-4_Provisionsordnung_Muster.pdf",
  anlage_5: "Leadberatervertrag_Anlage-5_CRM-Leadnutzung_Muster.pdf",
  anlage_6: "Leadberatervertrag_Anlage-6_Compliance-Beratungsrichtlinien_Muster.pdf",
  anlage_7: "Leadberatervertrag_Anlage-7_Team-Lizenzpartner-Struktur_Muster.pdf",
  anlage_8: "Leadberatervertrag_Anlage-8_Individuelle-Regelungen_Muster.pdf",
  anlage_9: "Leadberatervertrag_Anlage-9_Leadpaket-Vereinbarung_Muster.pdf",
};

async function downloadEinzel(key: EinzelDokumentKey): Promise<void> {
  const blob = await buildEinzelDokumentPdf(key, {
    bewerber: MUSTER_BEWERBER,
    paketId: "lead",
    zahlungsweise: "einmal",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = FILE_NAMES[key];
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const generateHvvVertragMusterPDF      = () => downloadEinzel("vertrag");
export const generateHvvAnlage1MusterPDF      = () => downloadEinzel("anlage_1");
export const generateHvvAnlage2MusterPDF      = () => downloadEinzel("anlage_2");
export const generateHvvAnlage3MusterPDF      = () => downloadEinzel("anlage_3");
export const generateHvvAnlage4MusterPDF      = () => downloadEinzel("anlage_4");
export const generateHvvAnlage5MusterPDF      = () => downloadEinzel("anlage_5");
export const generateHvvAnlage6MusterPDF      = () => downloadEinzel("anlage_6");
export const generateHvvAnlage7MusterPDF      = () => downloadEinzel("anlage_7");