import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tarnName } from "@/lib/vorfuehrmodus";

/**
 * Der Name im Kopf des Bewerberprofils.
 *
 * Vorher stand dort für jeden, der bearbeiten darf, dauerhaft ein Paar
 * Eingabefelder. Das Profil sah damit aus wie ein halb ausgefülltes Formular,
 * und der Name, die wichtigste Angabe der Seite, war das unauffälligste
 * Element darauf. Geschrieben wurde außerdem bei jedem einzelnen Tastendruck.
 *
 * Jetzt steht dort der Name, wie im Kundenprofil: eine Überschrift in 28 px.
 * Geändert wird er über den Stift daneben, und das ist auch der Grund, warum
 * es überhaupt einen Abbrechen-Knopf geben kann: Solange nichts bestätigt ist,
 * ist nichts geschrieben.
 *
 * Der Kreis mit den Initialen ist auf Christians Wunsch entfallen, hier wie in
 * den Listen. Er trug keine Angabe, die nicht daneben im Klartext stand.
 */

export interface BewerberNameKopfProps {
  vorname: string;
  nachname: string;
  /** Ohne dieses Recht gibt es keinen Stift, nur den Namen. */
  darfBearbeiten: boolean;
  /** Wird einmal beim Bestätigen gerufen, nicht bei jedem Tastendruck. */
  onSpeichern: (vorname: string, nachname: string) => void;
}

export function BewerberNameKopf({
  vorname,
  nachname,
  darfBearbeiten,
  onSpeichern,
}: BewerberNameKopfProps) {
  const [bearbeitet, setBearbeitet] = useState(false);
  const [entwurfVor, setEntwurfVor] = useState(vorname);
  const [entwurfNach, setEntwurfNach] = useState(nachname);

  /*
   * Ändert sich der Bewerber unter der offenen Bearbeitung, etwa weil jemand
   * in der Liste einen anderen anklickt, darf der angefangene Entwurf nicht
   * auf den neuen übergehen. Sonst trüge der nächste Bewerber den halb
   * getippten Namen des vorigen.
   */
  useEffect(() => {
    setBearbeitet(false);
    setEntwurfVor(vorname);
    setEntwurfNach(nachname);
  }, [vorname, nachname]);

  const voll = `${vorname ?? ""} ${nachname ?? ""}`.trim();

  if (!bearbeitet) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[22px] sm:text-[28px] font-semibold tracking-tight text-foreground break-words">
          {tarnName(voll, "bewerber") || "Ohne Namen"}
        </h1>
        {darfBearbeiten && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Namen bearbeiten"
            title="Namen bearbeiten"
            onClick={() => setBearbeitet(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  const uebernehmen = () => {
    onSpeichern(entwurfVor.trim(), entwurfNach.trim());
    setBearbeitet(false);
  };

  const verwerfen = () => {
    setEntwurfVor(vorname);
    setEntwurfNach(nachname);
    setBearbeitet(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={entwurfVor}
        onChange={(e) => setEntwurfVor(e.target.value)}
        // Die Eingabetaste bestätigt, Escape verwirft. Wer einen Namen
        // korrigiert, greift dabei selten zur Maus.
        onKeyDown={(e) => {
          if (e.key === "Enter") uebernehmen();
          if (e.key === "Escape") verwerfen();
        }}
        className="h-9 w-full text-lg font-semibold sm:max-w-[180px]"
        placeholder="Vorname"
        aria-label="Vorname"
        autoFocus
      />
      <Input
        value={entwurfNach}
        onChange={(e) => setEntwurfNach(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") uebernehmen();
          if (e.key === "Escape") verwerfen();
        }}
        className="h-9 w-full text-lg font-semibold sm:max-w-[200px]"
        placeholder="Nachname"
        aria-label="Nachname"
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-emerald-600 hover:text-emerald-700"
        aria-label="Namen übernehmen"
        title="Übernehmen"
        onClick={uebernehmen}
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Bearbeiten abbrechen"
        title="Abbrechen"
        onClick={verwerfen}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
