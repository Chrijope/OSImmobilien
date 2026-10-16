import { RechnungsGeneratorDialog } from "@/components/unterlagen/RechnungsGeneratorDialog";

/*
 * Lokale Vorschau der Rechnungsvorlage (16.10.2026). Nur im Entwicklungsmodus
 * erreichbar (siehe vorschauRouten.ts), ohne Anmeldung. Zeigt die echte
 * Komponente mit dem Seitenrand des CRM, aber ohne Sidebar.
 */
export default function VorschauRechnungsvorlage() {
  return (
    <div className="min-h-screen bg-background p-3 sm:p-6 space-y-4" data-lg="seite">
      <div className="rounded-lg border-2 border-dashed border-[#e5007d] bg-[#e5007d]/5 p-3 text-sm">
        <strong>Lokale Vorschau, nur auf diesem Rechner.</strong> Ohne Anmeldung, Eingaben bleiben im Browser.
      </div>
      <RechnungsGeneratorDialog asPage />
    </div>
  );
}
