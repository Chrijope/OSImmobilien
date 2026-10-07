import { useRef, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalisiereSprache } from "@/lib/kundenSprache";
import { saText } from "@/lib/selbstauskunftTexte";

export default function SaMobileSign() {
  const [params] = useSearchParams();
  const channelId = params.get("ch") || "";
  /*
   * Die Sprache reist im QR-Link mit (`lang=en`), denn diese Seite kennt den
   * Kunden nicht. Ohne oder mit unbekanntem Wert gilt Deutsch. Die
   * Beschriftung (`label`) übersetzt schon das Formular.
   */
  const sprache = normalisiereSprache(params.get("lang")) ?? "de";
  const t = (de: string) => saText(de, sprache);
  const label = params.get("label") || t("Unterschrift");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }, []);

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "hsl(222, 47%, 11%)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawn(true);
  };
  const stop = () => setDrawing(false);
  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  };

  useEffect(() => {
    document.title = saText("Unterschrift – MOREImmo", sprache);
    const html = document.documentElement;
    const vorher = html.lang;
    html.lang = sprache;
    return () => { html.lang = vorher; };
  }, [sprache]);

  const submit = async () => {
    if (!channelId || !canvasRef.current || !hasDrawn) return;
    setSending(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const channel = supabase.channel(channelId);
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
        });
        setTimeout(() => resolve(), 1500);
      });
      await channel.send({ type: "broadcast", event: "signature", payload: { dataUrl } });
      // give it a moment to flush
      await new Promise((r) => setTimeout(r, 400));
      await supabase.removeChannel(channel);
      setDone(true);
    } finally {
      setSending(false);
    }
  };

  if (!channelId) {
    return (
      <div data-lg="seite" className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="p-6 max-w-md text-center">
          <p className="text-sm text-muted-foreground">{t("Ungültiger Link.")}</p>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div data-lg="seite" className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="p-8 max-w-md text-center">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-3" />
          <h1 className="text-lg font-bold mb-1">{t("Unterschrift übertragen|Überschrift")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Ihre Unterschrift wurde an das Gerät übertragen, auf dem Sie den QR-Code gescannt haben. Sie können dieses Fenster jetzt schließen.")}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div data-lg="seite" className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="p-5 w-full max-w-md">
        <h1 className="text-base font-bold mb-1">{label}</h1>
        <p className="text-xs text-muted-foreground mb-3">
          {t("Unterschreiben Sie unten mit dem Finger. Ihre Unterschrift wird sofort an Ihren Computer übertragen.")}
        </p>
        <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-white touch-none">
          <canvas
            ref={canvasRef}
            width={500}
            height={220}
            className="w-full"
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={stop}
          />
        </div>
        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={clear} disabled={!hasDrawn || sending}>
            <Trash2 className="h-4 w-4 mr-1" /> {t("Löschen")}
          </Button>
          <Button className="flex-1" onClick={submit} disabled={!hasDrawn || sending}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {sending ? t("Wird übertragen…") : t("Unterschrift übertragen|Knopf")}
          </Button>
        </div>
      </Card>
    </div>
  );
}