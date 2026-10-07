import { LucideIcon, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * Einheitlicher, freundlicher Empty-State fürs Kundenportal.
 */
export function KundeEmptyState({ icon: Icon = Inbox, title, description, action }: Props) {
  return (
    <Card className="p-8 sm:p-10 text-center border-dashed">
      <div className="w-12 h-12 rounded-full bg-muted text-muted-foreground mx-auto flex items-center justify-center mb-3">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}