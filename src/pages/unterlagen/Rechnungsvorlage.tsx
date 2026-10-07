import { DashboardLayout } from "@/components/DashboardLayout";
import { RechnungsGeneratorDialog } from "@/components/unterlagen/RechnungsGeneratorDialog";

export default function RechnungsvorlagePage() {
  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <RechnungsGeneratorDialog asPage />
      </div>
    </DashboardLayout>
  );
}