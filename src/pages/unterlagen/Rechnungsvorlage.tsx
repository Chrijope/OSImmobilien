import { DashboardLayout } from "@/components/DashboardLayout";
import { RechnungsGeneratorDialog } from "@/components/unterlagen/RechnungsGeneratorDialog";

export default function RechnungsvorlagePage() {
  return (
    <DashboardLayout>
      <div>
        <RechnungsGeneratorDialog asPage />
      </div>
    </DashboardLayout>
  );
}