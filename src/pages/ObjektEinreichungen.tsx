import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Plus, Search, Eye } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const statusColors: Record<string, string> = {
  eingereicht: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  in_pruefung: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  angenommen: "bg-green-500/15 text-green-700 border-green-500/30",
  abgelehnt: "bg-red-500/15 text-red-700 border-red-500/30",
  uebernommen: "bg-primary/15 text-primary border-primary/30",
};

const statusLabels: Record<string, string> = {
  eingereicht: "Eingereicht",
  in_pruefung: "In Prüfung",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  uebernommen: "Übernommen",
};

export default function ObjektEinreichungen() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [einreichungen, setEinreichungen] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data } = await supabase
      .from("objekt_einreichungen")
      .select("*")
      .order("erstellt_am", { ascending: false });
    const rows = (data as any[]) || [];
    setEinreichungen(rows);
    setLoading(false);

    // Mark all "eingereicht" entries as "in_pruefung" so the badge resets.
    // Nur Admin und Inhaber: Seit dem 30.09.2026 ändern nur sie Einreichungen,
    // und ein Partner soll den Zähler der Leitung nicht zurücksetzen.
    if (!["admin", "inhaber"].includes(user.role)) return;
    const neuIds = rows.filter(e => e.status === "eingereicht").map(e => e.id);
    if (neuIds.length > 0) {
      await supabase
        .from("objekt_einreichungen")
        .update({ status: "in_pruefung" } as any)
        .in("id", neuIds);
      // Update local state
      setEinreichungen(prev =>
        prev.map(e => neuIds.includes(e.id) ? { ...e, status: "in_pruefung" } : e)
      );
    }
  };

  const filtered = einreichungen.filter(e => {
    const q = search.toLowerCase();
    return !q || e.titel?.toLowerCase().includes(q) || e.ort?.toLowerCase().includes(q) || e.strasse?.toLowerCase().includes(q) || e.akquisiteur_name?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Objekt Einreichungen" subtitle="Alle eingereichten Objekte zur Prüfung">
        <Button onClick={() => navigate("/objekt-akquise")} className="gap-2">
          <Plus className="h-4 w-4" /> Objekt einreichen
        </Button>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..." className="pl-9 h-9" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Keine Einreichungen vorhanden.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/objekt-akquise")}>Erstes Objekt einreichen</Button>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Bezeichnung</th>
                  <th className="text-left px-4 py-3 font-medium">Akquisiteur</th>
                  <th className="text-left px-4 py-3 font-medium">Standort</th>
                  <th className="text-left px-4 py-3 font-medium">Einheiten</th>
                  <th className="text-left px-4 py-3 font-medium">Preis</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Eingereicht am</th>
                  <th className="text-right px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/objekt-einreichungen/${e.id}`)}>
                    <td className="px-4 py-3 font-medium">{e.titel || "Ohne Titel"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.akquisiteur_name || "–"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{[e.plz, e.ort].filter(Boolean).join(" ") || "–"}</td>
                    <td className="px-4 py-3">{e.einheiten || "–"}</td>
                    <td className="px-4 py-3">{e.kaufpreis ? fmt(e.kaufpreis) : "–"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs ${statusColors[e.status] || statusColors.eingereicht}`}>
                        {statusLabels[e.status] || e.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(e.erstellt_am), "dd.MM.yyyy", { locale: de })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
