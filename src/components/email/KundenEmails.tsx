import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Mail, Reply, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { datumUhrzeitText } from "@/lib/sprachFormat";
import { useUserSettings } from "@/hooks/useUserSettings";
import { cn } from "@/lib/utils";

/*
 * E-Mails im Kundenprofil (01.11.2026). Gezeigt werden Mails aus dem eigenen
 * Postfach, die diesem Kontakt zugeordnet sind: von seiner Adresse oder an
 * sie. Fremde Postfächer sieht niemand (RLS auf emails, Entscheidung
 * Christian: nur der Postfach-Inhaber).
 */

interface KundenMail {
  id: string;
  konto_id: string | null;
  ordner: string;
  betreff: string;
  vorschau: string | null;
  inhalt: string | null;
  absender_name: string | null;
  absender_email: string | null;
  gelesen: boolean;
  empfangen_am: string;
}

interface Entwurf {
  kontoId: string;
  an: string;
  betreff: string;
  text: string;
  antwortAuf: string | null;
}

function htmlAusText(text: string): string {
  const ersetzt = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return ersetzt.split("\n").map((z) => `<div>${z || "&nbsp;"}</div>`).join("");
}

export function KundenEmails({ kontaktId, kundeEmail }: { kontaktId: string; kundeEmail?: string | null }) {
  const [mails, setMails] = useState<KundenMail[]>([]);
  const [konten, setKonten] = useState<{ id: string; adresse: string }[] | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const { settings } = useUserSettings();

  const laden = useCallback(async () => {
    const { data } = await supabase
      .from("emails")
      .select("id, konto_id, ordner, betreff, vorschau, inhalt, absender_name, absender_email, gelesen, empfangen_am")
      .eq("kontakt_id", kontaktId)
      .neq("ordner", "papierkorb")
      .order("empfangen_am", { ascending: false })
      .limit(50);
    setMails((data as unknown as KundenMail[]) ?? []);
  }, [kontaktId]);

  useEffect(() => {
    void laden();
    void supabase.from("email_konten" as never).select("id, adresse").order("erstellt_am").then(({ data }) => {
      setKonten((data as unknown as { id: string; adresse: string }[]) ?? []);
    });
    const kanal = supabase
      .channel(`kunden-emails-${kontaktId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "emails", filter: `kontakt_id=eq.${kontaktId}` }, () => void laden())
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
  }, [kontaktId, laden]);

  const oeffnen = async (m: KundenMail) => {
    setOffen((jetzt) => (jetzt === m.id ? null : m.id));
    if (!m.gelesen) {
      setMails((alt) => alt.map((x) => (x.id === m.id ? { ...x, gelesen: true } : x)));
      void supabase.functions.invoke("email-aktion", { body: { aktion: "gelesen", ids: [m.id], wert: true } });
    }
    if (!m.inhalt) {
      const { data } = await supabase.functions.invoke("email-aktion", { body: { aktion: "inhalt", id: m.id } });
      if (typeof data?.inhalt === "string") setMails((alt) => alt.map((x) => (x.id === m.id ? { ...x, inhalt: data.inhalt } : x)));
    }
  };

  const senden = async (): Promise<boolean> => {
    if (!entwurf) return false;
    const signatur = settings?.email?.signatur;
    const html = htmlAusText(entwurf.text) + (signatur?.aktiv && signatur.html ? `<br>${signatur.html}` : "");
    const { data, error } = await supabase.functions.invoke("email-aktion", {
      body: { aktion: "senden", kontoId: entwurf.kontoId, an: entwurf.an.split(/[,;\s]+/).filter(Boolean), betreff: entwurf.betreff, text: entwurf.text, html, antwortAuf: entwurf.antwortAuf },
    });
    if (error) {
      const f = await edgeFehlerMitGrund(error, { functionName: "email-aktion" });
      toast.error((f as Error)?.message || "Nicht gesendet");
      return false;
    }
    toast.success("E-Mail gesendet", data?.hinweis ? { description: data.hinweis } : undefined);
    setEntwurf(null);
    await laden();
    return true;
  };

  const ersteKonto = konten?.[0]?.id ?? "";

  return (
    <Card className="p-4" data-ui="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" /> E-Mails</h3>
        {konten && konten.length > 0 && kundeEmail && (
          <Button size="sm" variant="outline" onClick={() => setEntwurf({ kontoId: ersteKonto, an: kundeEmail, betreff: "", text: "", antwortAuf: null })}>
            <Send className="h-4 w-4 mr-1" /> Neue E-Mail
          </Button>
        )}
      </div>
      {konten && konten.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Verbinde dein Postfach unter <Link to="/einstellungen?tab=e-mail" className="text-primary underline">Einstellungen, E-Mail</Link>. Danach stehen hier alle Mails von und an diesen Kunden.
        </p>
      ) : mails.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine E-Mails mit diesem Kunden{kundeEmail ? ` (${kundeEmail})` : ""}.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {mails.map((m) => {
            const raus = m.ordner === "gesendet";
            return (
              <li key={m.id}>
                <button type="button" onClick={() => oeffnen(m)} className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-start gap-2">
                  {raus ? <ArrowUpRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-label="gesendet" /> : <ArrowDownLeft className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-label="empfangen" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("text-sm truncate", !m.gelesen && "font-semibold")}>{m.betreff}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{datumUhrzeitText(m.empfangen_am, "de")}</span>
                    </span>
                    {offen !== m.id && m.vorschau && <span className="block text-xs text-muted-foreground truncate">{m.vorschau}</span>}
                  </span>
                </button>
                {offen === m.id && (
                  <div className="px-3 pb-3 pl-9">
                    <p className="text-xs text-muted-foreground mb-2">{raus ? "Gesendet" : `Von ${m.absender_name || ""} <${m.absender_email}>`}</p>
                    <div className="text-sm whitespace-pre-wrap break-words max-h-80 overflow-y-auto rounded-md bg-muted/30 p-3">{m.inhalt ?? "Wird geladen …"}</div>
                    {!raus && m.konto_id && (
                      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setEntwurf({
                        kontoId: m.konto_id!,
                        an: m.absender_email ?? "",
                        betreff: /^re:/i.test(m.betreff) ? m.betreff : `Re: ${m.betreff}`,
                        text: `\n\n---\n${m.inhalt ?? ""}`,
                        antwortAuf: m.id,
                      })}>
                        <Reply className="h-4 w-4 mr-1" /> Antworten
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!entwurf} onOpenChange={(o) => !o && setEntwurf(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{entwurf?.antwortAuf ? "Antworten" : "Neue E-Mail"}</DialogTitle></DialogHeader>
          {entwurf && (
            <div className="space-y-3">
              {konten && konten.length > 1 && (
                <select value={entwurf.kontoId} onChange={(e) => setEntwurf({ ...entwurf, kontoId: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm" data-ui="field" aria-label="Von">
                  {konten.map((k) => <option key={k.id} value={k.id}>{k.adresse}</option>)}
                </select>
              )}
              <Input aria-label="An" value={entwurf.an} onChange={(e) => setEntwurf({ ...entwurf, an: e.target.value })} />
              <Input aria-label="Betreff" placeholder="Betreff" value={entwurf.betreff} onChange={(e) => setEntwurf({ ...entwurf, betreff: e.target.value })} />
              <Textarea aria-label="Nachricht" className="min-h-[220px]" value={entwurf.text} onChange={(e) => setEntwurf({ ...entwurf, text: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEntwurf(null)}>Abbrechen</Button>
                <Button haken disabled={!entwurf.an || !entwurf.betreff} onClick={senden}><Send className="h-4 w-4 mr-1" /> Senden</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
