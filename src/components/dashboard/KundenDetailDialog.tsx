import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { tarnName, unscharfKlasse } from "@/lib/vorfuehrmodus";
import { useNavigate } from "react-router-dom";
import { resolveKontaktBerater } from "@/lib/kontaktOwnership";
import { getFollowUpsByKunde } from "@/lib/followUpStore";
import { kontaktKaufpreis } from "@/lib/objektDatenPflicht";

interface Kontakt {
  id: string;
  vorname: string;
  nachname: string;
  email?: string;
  telefon?: string;
  status: string;
  berater?: string;
  zustaendig_id?: string;
  kaufpreis?: number;
  objekt?: string;
  erstellt_am?: string;
  erstelltAm?: string;
  notarTermin?: string;
  meta?: any;
}

export type KundenDialogVariant =
  | "kontakt"
  | "followup"
  | "neukunde"
  | "abwicklung"
  | "bestandskunde"
  | "bestand";

interface KundenDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  kunden: Kontakt[];
  variant?: KundenDialogVariant;
}

const statusColors: Record<string, string> = {
  neu: "bg-blue-100 text-blue-800",
  kontaktiert: "bg-yellow-100 text-yellow-800",
  qualifiziert: "bg-orange-100 text-orange-800",
  kunde: "bg-green-100 text-green-800",
  verloren: "bg-red-100 text-red-800",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtEuro(n?: number): string {
  return n ? `${n.toLocaleString("de-DE")} €` : "–";
}

/** Betraege werden im Vorfuehrmodus weichgezeichnet, nicht ersetzt. */
function EuroZelle({ wert }: { wert?: number }) {
  return <span className={unscharfKlasse("tabular-nums")}>{fmtEuro(wert)}</span>;
}

function nextFollowUp(kundeId: string): string | undefined {
  try {
    const fus = getFollowUpsByKunde(kundeId).filter(f => f.status !== "erledigt");
    if (!fus.length) return undefined;
    fus.sort((a, b) => (a.faelligAm || "").localeCompare(b.faelligAm || ""));
    return fus[0].faelligAm;
  } catch { return undefined; }
}

export function KundenDetailDialog({ open, onOpenChange, title, kunden, variant = "kontakt" }: KundenDetailDialogProps) {
  const navigate = useNavigate();

  const extraHeaders: { label: string; align?: "right" }[] = (() => {
    switch (variant) {
      case "followup": return [{ label: "Follow-Up", align: "right" }];
      case "neukunde": return [{ label: "Selbstauskunft am", align: "right" }];
      case "abwicklung": return [{ label: "Objekt" }, { label: "Kaufpreis", align: "right" }];
      case "bestandskunde": return [{ label: "Notartermin", align: "right" }, { label: "Kaufpreis", align: "right" }];
      case "bestand": return [{ label: "Angelegt am", align: "right" }];
      case "kontakt":
      default: return [{ label: "Angelegt am", align: "right" }];
    }
  })();

  const renderExtras = (k: Kontakt) => {
    const createdAt = k.erstellt_am || k.erstelltAm;
    const saAt = k.meta?.selbstauskunftSignedAt || k.meta?.saSignedAt || k.meta?.selbstauskunftStand;
    switch (variant) {
      case "followup": {
        const d = nextFollowUp(k.id);
        return <TableCell className="text-right tabular-nums text-sm">{fmtDate(d)}</TableCell>;
      }
      case "neukunde":
        return <TableCell className="text-right tabular-nums text-sm">{fmtDate(saAt)}</TableCell>;
      case "abwicklung":
        return (
          <>
            <TableCell className="text-sm">{k.objekt || "–"}</TableCell>
            <TableCell className="text-right tabular-nums"><EuroZelle wert={kontaktKaufpreis(k.id, k.kaufpreis)} /></TableCell>
          </>
        );
      case "bestandskunde":
        return (
          <>
            <TableCell className="text-right tabular-nums text-sm">{fmtDate(k.notarTermin)}</TableCell>
            <TableCell className="text-right tabular-nums"><EuroZelle wert={kontaktKaufpreis(k.id, k.kaufpreis)} /></TableCell>
          </>
        );
      case "bestand":
      case "kontakt":
      default:
        return <TableCell className="text-right tabular-nums text-sm">{fmtDate(createdAt)}</TableCell>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{title} ({kunden.length})</DialogTitle>
        </DialogHeader>
        <div className="overflow-auto flex-1 -mx-6 px-6">
          {kunden.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Keine Kontakte gefunden.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vertriebspartner</TableHead>
                  {extraHeaders.map((h, i) => (
                    <TableHead key={i} className={h.align === "right" ? "text-right" : ""}>{h.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {kunden.map((k) => (
                  <TableRow
                    key={k.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/kunden/${k.id}`);
                    }}
                  >
                    <TableCell className="font-medium">
                      {tarnName(`${k.vorname ?? ""} ${k.nachname ?? ""}`.trim())}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[k.status] || ""}>
                        {k.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {tarnName(resolveKontaktBerater(k as any), "partner") || "–"}
                    </TableCell>
                    {renderExtras(k)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
