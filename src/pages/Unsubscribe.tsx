import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, MailX } from "lucide-react";
import { ABMELDE_TEXTE, abmeldeSprache, type AbmeldeSprache } from "@/lib/abmeldeSprache";

// Zweisprachig nach Kundensprache, siehe src/lib/abmeldeSprache.ts.

const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get("token");
  const langParam = params.get("lang");
  const [status, setStatus] = useState<"loading" | "valid" | "already" | "invalid" | "done" | "error">("loading");
  const [processing, setProcessing] = useState(false);
  const [sprache, setSprache] = useState<AbmeldeSprache>(() => abmeldeSprache(langParam, null));
  const t = ABMELDE_TEXTE[sprache];

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }

    const validate = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`;
        const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
        const data = await res.json();
        setSprache(abmeldeSprache(langParam, data?.sprache));
        if (!res.ok) { setStatus("invalid"); return; }
        if (data.valid === false && data.reason === "already_unsubscribed") { setStatus("already"); return; }
        setStatus("valid");
      } catch { setStatus("error"); }
    };
    validate();
  }, [token, langParam]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
      if (error) throw error;
      if (data?.success) setStatus("done");
      else if (data?.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch { setStatus("error"); }
    setProcessing(false);
  };

  return (
    <div data-lg="seite" lang={sprache} className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">{t.pruefen}</p>
          </>
        )}
        {status === "valid" && (
          <>
            <MailX className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t.titel}</h1>
            <p className="text-sm text-muted-foreground">{t.frage}</p>
            <Button onClick={handleUnsubscribe} disabled={processing} variant="destructive" className="w-full">
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.knopf}
            </Button>
          </>
        )}
        {status === "done" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t.fertigTitel}</h1>
            <p className="text-sm text-muted-foreground">{t.fertigText}</p>
          </>
        )}
        {status === "already" && (
          <>
            <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t.schonTitel}</h1>
            <p className="text-sm text-muted-foreground">{t.schonText}</p>
          </>
        )}
        {(status === "invalid" || status === "error") && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t.ungueltigTitel}</h1>
            <p className="text-sm text-muted-foreground">{t.ungueltigText}</p>
          </>
        )}
      </Card>
    </div>
  );
};

export default Unsubscribe;
