/**
 * Versandprotokoll der E-Mails.
 *
 * Anlass: Ein Kunde bekam keine Meeting-Einladung, und im Programm gab es keine
 * Möglichkeit nachzusehen, woran es lag. Der Hinweis nach dem Anlegen sagte
 * "versendet", tatsächlich wird die Mail nur in eine Warteschlange gestellt.
 * Zwischen "in der Warteschlange" und "beim Kunden angekommen" liegen mehrere
 * Schritte, von denen jeder scheitern kann.
 *
 * Diese Ansicht zeigt genau diese Schritte: was verschickt wurde, an wen, mit
 * welchem Ergebnis, und ob die Warteschlange gerade pausiert.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Mail, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LogEintrag {
  id: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

const STATUS_TEXT: Record<string, string> = {
  pending: "In der Warteschlange",
  sent: "Zugestellt an den Anbieter",
  suppressed: "Blockiert, Empfänger abgemeldet",
  failed: "Fehlgeschlagen",
  bounced: "Unzustellbar",
  complained: "Als Spam gemeldet",
  dlq: "Aufgegeben nach mehreren Versuchen",
};

function statusFarbe(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "sent") return "default";
  if (status === "pending") return "secondary";
  if (status === "suppressed") return "outline";
  return "destructive";
}

export function MailversandProtokoll() {
  const [eintraege, setEintraege] = useState<LogEintrag[]>([]);
  const [suche, setSuche] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pausiertBis, setPausiertBis] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      let abfrage = supabase
        .from("email_send_log")
        .select("id, template_name, recipient_email, status, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      const gesucht = suche.trim();
      if (gesucht) abfrage = abfrage.ilike("recipient_email", `%${gesucht}%`);

      const { data, error } = await abfrage;
      if (error) throw error;
      setEintraege((data || []) as LogEintrag[]);

      // Ist der Versand gerade wegen einer Sperre des Anbieters pausiert?
      const { data: zustand } = await supabase
        .from("email_send_state")
        .select("retry_after_until")
        .limit(1)
        .maybeSingle();
      const bis = (zustand as { retry_after_until?: string } | null)?.retry_after_until;
      setPausiertBis(bis && new Date(bis).getTime() > Date.now() ? bis : null);
    } catch (e) {
      setFehler(
        (e as { message?: string })?.message ||
          "Das Protokoll konnte nicht geladen werden. Läuft die Migration 20260728070000 schon?",
      );
    } finally {
      setLaeuft(false);
    }
  }, [suche]);

  useEffect(() => { void laden(); }, [laden]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Versandprotokoll
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => void laden()} disabled={laeuft} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${laeuft ? "animate-spin" : ""}`} /> Aktualisieren
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Die letzten fünfzig E-Mails. Hier steht, ob eine Mail wirklich raus ist.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Nach E-Mail-Adresse suchen"
            className="pl-8"
          />
        </div>

        {pausiertBis && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">
              Der Versand pausiert bis {new Date(pausiertBis).toLocaleString("de-DE")}. Der Anbieter hat
              das Tempo gedrosselt, die Mails in der Warteschlange gehen danach automatisch raus.
            </p>
          </div>
        )}

        {fehler && <p className="text-xs text-destructive">{fehler}</p>}

        {!fehler && eintraege.length === 0 && !laeuft && (
          <p className="text-sm text-muted-foreground py-4 text-center">Keine Einträge gefunden.</p>
        )}

        <div className="space-y-1.5 max-h-[26rem] overflow-y-auto pr-1">
          {eintraege.map((e) => (
            <div key={e.id} className="rounded-lg border p-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{e.recipient_email}</p>
                <p className="text-xs text-muted-foreground truncate">{e.template_name}</p>
                {e.error_message && (
                  <p className="text-xs text-destructive mt-0.5 break-words">{e.error_message}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <Badge variant={statusFarbe(e.status)} className="text-[10px]">
                  {STATUS_TEXT[e.status] || e.status}
                </Badge>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(e.created_at).toLocaleString("de-DE")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
