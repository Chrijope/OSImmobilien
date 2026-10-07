import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
type Auftrag = { id: string; art: string; status: string; created_at: string };
export function VersandStatus({ buchungId }: { buchungId: string }) {
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [fehler, setFehler] = useState(false);
  const laden = useCallback(async () => {
    // Tabelle noch nicht in den erzeugten Typen enthalten, daher ungetypter Zugriff.
    const { data, error } = await (supabase as any).from('buchung_mail_auftraege').select('id,art,status,created_at').eq('buchung_id', buchungId).order('created_at', { ascending: false }).limit(3);
    setFehler(Boolean(error)); if (!error) setAuftraege((data || []) as unknown as Auftrag[]);
  }, [buchungId]);
  useEffect(() => { void laden(); const timer = window.setInterval(() => void laden(), 30000); return () => clearInterval(timer); }, [laden]);
  if (fehler) return <p className="text-xs text-amber-700">Versandstatus nicht verfügbar.</p>;
  return <div className="mt-1 space-y-1" aria-live="polite">{auftraege.map((a) => <div key={a.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <span>{a.art === 'bestaetigung' ? 'Bestätigung' : 'Terminänderung'}: {a.status === 'angenommen' ? 'Vom Versanddienst angenommen' : a.status === 'fehler' ? 'Versand fehlgeschlagen' : 'Versand wird geprüft / wiederholt'}</span>
    {a.status === 'fehler' && <Button size="sm" variant="outline" onClick={async () => {
      const { error } = await (supabase as any).rpc('buchung_mail_erneut', { _auftrag_id: a.id });
      if (error) toast.error('Erneuter Versand nicht möglich.'); else { toast.success('Versand erneut vorgemerkt.'); await laden(); }
    }}>Erneut versuchen</Button>}
  </div>)}</div>;
}
