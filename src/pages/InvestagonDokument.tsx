import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSignedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";

export default function InvestagonDokument() {
  const { "*": pfad } = useParams();
  const [url, setUrl] = useState<string | null>(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    let aktiv = true;
    setUrl(null);
    setFehler(false);
    getSignedUrl("investagon-dokumente", pfad || "", 300).then(link => {
      if (aktiv) { setUrl(link); setFehler(!link); }
    }).catch(() => { if (aktiv) setFehler(true); });
    return () => { aktiv = false; };
  }, [pfad]);
  return <div className="p-8 space-y-4">
    <h1 className="text-xl font-semibold">Investagon-Unterlage</h1>
    {fehler ? <p>Die Unterlage ist nicht verfügbar oder du hast keine Zugriffsberechtigung.</p>
      : url ? <Button asChild><a href={url} target="_blank" rel="noreferrer">Unterlage öffnen</a></Button>
      : <p>Unterlage wird geladen …</p>}
  </div>;
}
