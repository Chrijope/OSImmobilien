import { useUser } from "@/contexts/UserContext";
import { FlaskConical } from "lucide-react";

export function TestModeBadge() {
  const { user } = useUser();
  if (user.role !== "testaccount") return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-orange-500 text-white px-4 py-2 shadow-lg animate-pulse">
      <FlaskConical className="h-4 w-4" />
      <span className="text-sm font-semibold">Testmodus</span>
    </div>
  );
}

export function TestModeHeaderBadge() {
  const { user } = useUser();
  if (user.role !== "testaccount") return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-orange-500 text-white px-2.5 py-0.5 text-[11px] font-semibold animate-pulse">
      <FlaskConical className="h-3 w-3" />
      Testmodus
    </div>
  );
}
