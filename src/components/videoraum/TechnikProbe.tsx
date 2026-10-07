import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ladeEisServer } from '@/lib/videoraumVerbindung';
import { erstelleHintergrundRegie, type HintergrundRegie } from '@/lib/videocallHintergrund';
import { hintergrundBildUrl } from '@/lib/videocallHintergrundStore';
import type { HintergrundWahl } from '@/lib/videocallEinstellungen';

/** Local-only preview. A deliberate click is required before requesting media. */
export function TechnikProbe({ kameraId, mikrofonId, lautsprecherId, spiegeln, hintergrund }: {
  kameraId?: string; mikrofonId?: string; lautsprecherId?: string; spiegeln: boolean; hintergrund: HintergrundWahl;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const regie = useRef<HintergrundRegie | null>(null);
  const lauf = useRef(0);
  const frame = useRef(0);
  const [aktiv, setAktiv] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  const [pegel, setPegel] = useState(0);
  const [meldung, setMeldung] = useState('Starte die Vorschau, um Bild und Mikrofon vor dem Gespräch zu prüfen.');
  const [netz, setNetz] = useState('Verbindungsdienst noch nicht geprüft.');
  const stop = () => {
    lauf.current++;
    cancelAnimationFrame(frame.current);
    regie.current?.beenden(); regie.current = null;
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    void context.current?.close(); context.current = null;
    if (video.current) video.current.srcObject = null;
  };
  useEffect(() => () => stop(), []);
  useEffect(() => { stop(); setAktiv(false); setPegel(0); }, [kameraId, mikrofonId, hintergrund.art, hintergrund.bildPfad]);

  const start = async () => {
    stop(); const versuch = lauf.current; setArbeitet(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: kameraId ? { deviceId: { ideal: kameraId } } : true,
        audio: mikrofonId ? { deviceId: { ideal: mikrofonId } } : true,
      });
      if (versuch !== lauf.current) { media.getTracks().forEach((t) => t.stop()); return; }
      stream.current = media;
      const bg = erstelleHintergrundRegie({ stream: media, aufFehler: setMeldung });
      regie.current = bg;
      const url = hintergrund.art === 'bild' && hintergrund.bildPfad ? await hintergrundBildUrl(hintergrund.bildPfad) : null;
      if (versuch !== lauf.current) return;
      await bg.setzeWahl(hintergrund, url);
      if (versuch !== lauf.current) return;
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      const audio = new AudioContext(); context.current = audio; await audio.resume();
      const analyser = audio.createAnalyser(); analyser.fftSize = 256;
      audio.createMediaStreamSource(media).connect(analyser);
      const daten = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(daten);
        const rms = Math.sqrt(daten.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / daten.length);
        setPegel(Math.min(100, Math.round(rms * 400)));
        frame.current = requestAnimationFrame(tick);
      };
      tick(); setAktiv(true); setMeldung('Vorschau läuft nur auf deinem Gerät. Sprich kurz und prüfe den Mikrofonpegel.');
    } catch (e) {
      stop(); setMeldung((e as DOMException).name === 'NotAllowedError'
        ? 'Kamera oder Mikrofon wurden nicht freigegeben. Prüfe die Website-Berechtigungen im Browser.'
        : 'Geräte konnten nicht gestartet werden. Prüfe Anschluss und andere geöffnete Video-Apps.');
    } finally { setArbeitet(false); }
  };
  const testTon = async () => {
    const audio = new AudioContext();
    try {
      const sink = audio as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      if (lautsprecherId && sink.setSinkId) await sink.setSinkId(lautsprecherId);
      await audio.resume();
      const oscillator = audio.createOscillator(); const gain = audio.createGain();
      oscillator.frequency.value = 440; gain.gain.value = 0.08;
      oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.5);
      oscillator.onended = () => void audio.close();
      setMeldung(lautsprecherId && !sink.setSinkId ? 'Testton über den Systemlautsprecher. Dieser Browser unterstützt hier keine separate Gerätewahl.' : 'Testton abgespielt. Wenn du nichts hörst, prüfe Lautstärke und Ausgabegerät.');
    } catch { await audio.close(); setMeldung('Testton nicht möglich. Bitte prüfe die Audiofreigabe im Browser.'); }
  };
  return <section className="space-y-3 rounded-xl border p-4" aria-label="Technik vor dem Gespräch prüfen">
    <h3 className="font-medium">Bild, Ton und Verbindung testen</h3>
    <video ref={video} muted playsInline className={`aspect-video w-full max-w-lg rounded-lg bg-muted ${spiegeln ? '-scale-x-100' : ''}`} aria-label="Eigene Kameravorschau" />
    <label className="block text-sm">Mikrofonpegel <meter className="ml-2 w-40" min={0} max={100} value={pegel}>{pegel}%</meter></label>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={arbeitet} onClick={() => aktiv ? (stop(), setAktiv(false), setPegel(0)) : void start()}>{arbeitet ? 'Geräte werden gestartet…' : aktiv ? 'Vorschau beenden' : 'Vorschau starten'}</Button>
      <Button variant="outline" onClick={() => void testTon()}>Lautsprecher testen</Button>
      <Button variant="outline" onClick={async () => {
        setNetz('Verbindungsdienst wird geprüft…');
        const servers = await ladeEisServer();
        const turn = servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/.test(u)));
        setNetz(turn ? 'Verbindungsdienst mit Relay verfügbar. Ein tatsächlicher Gesprächstest prüft zusätzlich das Netzwerk.' : 'Eingeschränkte Verbindung: kein Relay verfügbar. Bitte den Administrator informieren; Firmennetze können betroffen sein.');
      }}>Verbindungsdienst prüfen</Button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{meldung}</p>
    <p role="status" className="text-sm text-muted-foreground">{netz}</p>
  </section>;
}
