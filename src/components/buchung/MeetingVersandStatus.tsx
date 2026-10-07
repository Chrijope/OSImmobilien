import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { TERMINE_AKTUALISIERT_EVENT } from '@/lib/terminAnzeige';
type Auftrag = { id: string; email: string; art: string; status: string; fehler: string | null };
/** Remains visible after the last meeting was deleted, so a failed cancellation can be retried. */
export function MeetingVersandStatus({ kundeId }: { kundeId: string }) {
  const [jobs, setJobs] = useState<Auftrag[]>([]);
  const [fehler, setFehler] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /*
   * Die Abfrage laeuft laenger als der Bildschirm, auf dem sie steht. Wer das
   * Kundenprofil schliesst, waehrend sie unterwegs ist, bekam bisher ein
   * setState auf einer abgebauten Komponente. Im Betrieb ist das eine Warnung
   * in der Konsole, im Testlauf ein "window is not defined" nach dem Abbau der
   * Umgebung. Der Merker bricht die Antwort ab, statt sie noch einzutragen.
   */
  const lebt = useRef(true);
  const laden = useCallback(async () => {
    try {
      // Tabelle noch nicht in den erzeugten Typen enthalten, daher ungetypter Zugriff.
      const r = await (supabase as any).from('meeting_mail_auftraege').select('id,email,art,status,fehler').eq('kontakt_id', kundeId).neq('status', 'angenommen').order('created_at', { ascending: true }).limit(50);
      if (!lebt.current) return;
      setFehler(Boolean(r.error)); if (!r.error) setJobs((r.data || []) as Auftrag[]);
    } catch { if (lebt.current) setFehler(true); }
  }, [kundeId]);
  useEffect(() => {
    // Beim Wiedereinhaengen zuruecksetzen: React baut Effekte im Entwicklungs-
    // modus zweimal auf, sonst bliebe die Komponente danach dauerhaft "tot".
    lebt.current = true;
    void laden(); const timer = window.setInterval(() => void laden(), 15000);
    window.addEventListener(TERMINE_AKTUALISIERT_EVENT, laden);
    return () => { lebt.current = false; window.clearInterval(timer); window.removeEventListener(TERMINE_AKTUALISIERT_EVENT, laden); };
  }, [laden]);
  if (fehler) return <p className="text-xs text-muted-foreground">Versandstatus für Meetingänderungen derzeit nicht verfügbar.</p>;
  if (!jobs.length) return null;
  return <div className="rounded-lg border p-4 space-y-2" aria-live="polite">
    <p className="text-sm font-medium">Offene Meeting-Benachrichtigungen</p>
    {jobs.map(j => <div key={j.id} className="flex flex-wrap items-center gap-2 text-xs">
      <span className="break-all">{j.art === 'absage' ? 'Absage' : 'Änderung'} an {j.email}: {j.status === 'fehler' ? 'Versand fehlgeschlagen' : j.fehler ? 'Wird erneut versucht' : 'Zum Versand vorgemerkt'}</span>
      {(j.status === 'fehler' || j.fehler) && <Button size="sm" variant="outline" disabled={busy !== null} onClick={async () => {
        setBusy(j.id);
        try {
          const r = await (supabase as any).rpc('meeting_mail_erneut', { _id: j.id });
          if (r.error) throw r.error;
          toast.success('Erneuter Versand vorgemerkt.'); await laden();
        } catch { toast.error('Erneuter Versand nicht möglich.'); }
        finally { setBusy(null); }
      }}>Erneut versuchen</Button>}
    </div>)}
    {jobs.length === 50 && <p className="text-xs">Die ersten 50 offenen Nachrichten werden angezeigt.</p>}
    <p className="text-xs text-muted-foreground">Nach Annahme durch den Versanddienst verschwindet der Eintrag. Die Zustellung lässt sich im Versandprotokoll prüfen.</p>
  </div>;
}
