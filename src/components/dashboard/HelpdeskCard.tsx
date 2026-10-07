import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTicketStats } from "@/lib/supportTicketStore";
import { Zap, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLiveVersion } from "@/hooks/useLiveData";

export function HelpdeskCard() {
  const navigate = useNavigate();
  const _cv = useLiveVersion(["support_tickets"]);
  const stats = getTicketStats();

  return (
    <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate("/helpdesk")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">
          Helpdesk
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-y-3 sm:divide-x sm:divide-border/60">
          <div className="px-2 flex flex-col items-center text-center">
            <div className="text-[20px] sm:text-[28px] font-semibold tracking-tight tabular-nums leading-none">{stats.neu}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">Neu</div>
          </div>
          <div className="px-2 flex flex-col items-center text-center">
            <div className="text-[20px] sm:text-[28px] font-semibold tracking-tight tabular-nums leading-none">{stats.offen}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">Offen</div>
          </div>
          <div className="px-2 flex flex-col items-center text-center">
            <div className="text-[20px] sm:text-[28px] font-semibold tracking-tight tabular-nums leading-none">{stats.loesungsrate}%</div>
            <div className="mt-2 text-[11px] text-muted-foreground">Lösungsrate</div>
          </div>
          <div className="px-2 flex flex-col items-center text-center">
            <div className="text-[20px] sm:text-[28px] font-semibold tracking-tight tabular-nums leading-none">{stats.geloest + stats.geschlossen}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">Erledigt</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
