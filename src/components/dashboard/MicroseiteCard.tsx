import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, Globe, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { buildVpUrl } from "@/lib/publicUrl";

export function MicroseiteCard() {
  const { authUser } = useUser();
  const [slug, setSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ensure-vp-slug", { body: {} });
        if (!cancelled && !error && data?.slug) setSlug(data.slug);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  const url = slug ? buildVpUrl(slug) : "";
  const displayUrl = url.replace(/^https?:\/\//, "");

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Dein persönlicher Link wurde kopiert!");
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const handleShare = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Meine persönliche Beraterseite",
          text: "Vermögen aufbauen & Steuern sparen mit Immobilien.",
          url,
        });
      } catch {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Globe className="h-4 w-4 text-primary" />
          Meine persönliche Landingpage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Teile diesen Link – neue Interessenten landen direkt in deinem CRM und werden dir automatisch zugewiesen.
        </p>
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-muted/50 text-[13px] font-mono truncate">
          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{loading ? "Lade…" : displayUrl || "Wird vorbereitet…"}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="tinted" className="gap-2 flex-1 min-w-[140px]" onClick={handleCopy} disabled={!slug}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Kopiert" : "Link kopieren"}
          </Button>
          <Button size="sm" variant="ghost" className="gap-2" onClick={handleShare} disabled={!slug}>
            <Share2 className="h-4 w-4" />
            Teilen
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-2"
            onClick={() => slug && window.open(url, "_blank")}
            disabled={!slug}
          >
            <ExternalLink className="h-4 w-4" />
            Öffnen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
