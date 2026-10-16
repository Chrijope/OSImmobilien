import { DashboardLayout } from "@/components/DashboardLayout";
import { EmailSignaturDialog } from "@/components/unterlagen/EmailSignaturDialog";
import { useSearchParams } from "react-router-dom";

export default function EmailSignaturPage() {
  const [searchParams] = useSearchParams();
  const backTo = searchParams.get("backTo") || undefined;
  const backLabel = searchParams.get("backLabel") || undefined;

  return (
    <DashboardLayout>
      <div>
        <EmailSignaturDialog asPage backTo={backTo} backLabel={backLabel} />
      </div>
    </DashboardLayout>
  );
}