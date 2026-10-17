// Der Schritt „PDF-Vorschau“ der Selbstauskunft (17.10.2026, Wunsch Christian).
//
// Vor dem Abschluss sieht man das Dokument genau so, wie es später unterschrieben
// wird: derselbe Generator wie nach der Unterschrift (SignaturSeite), nur ohne
// Unterschriften. So lässt sich alles noch einmal gegenlesen.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { SelbstauskunftData } from "./SelbstauskunftForm";
import type { Sprache } from "@/lib/kundenSprache";

export function SaPdfVorschau({
  data,
  sprache,
  titel,
  hinweis,
  fehlerText,
}: {
  data: SelbstauskunftData;
  sprache: Sprache;
  titel: string;
  hinweis: string;
  fehlerText: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let aktiv = true;
    let erstellt: string | null = null;
    (async () => {
      try {
        const { generateSelbstauskunftPDF } = await import("@/lib/selbstauskunftPdf");
        const doc = await generateSelbstauskunftPDF(
          data,
          { vorname: data.vorname || "", nachname: data.nachname || "", osImmoId: "" },
          undefined,
          { sprache },
        );
        erstellt = URL.createObjectURL(doc.output("blob"));
        if (aktiv) setUrl(erstellt);
      } catch (e) {
        console.error("PDF-Vorschau der Selbstauskunft fehlgeschlagen:", e);
        if (aktiv) setFehler(true);
      }
    })();
    return () => {
      aktiv = false;
      if (erstellt) URL.revokeObjectURL(erstellt);
    };
  }, [data, sprache]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-2">{titel}</h2>
      <p className="text-sm text-muted-foreground mb-4">{hinweis}</p>
      {fehler ? (
        <p className="text-sm text-destructive">{fehlerText}</p>
      ) : url ? (
        <iframe title={titel} src={url} className="w-full h-[70vh] rounded-lg border bg-muted" />
      ) : (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
    </div>
  );
}
