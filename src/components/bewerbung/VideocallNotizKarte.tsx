/**
 * Notizen zum persönlichen Gespräch, direkt im Bewerberprofil.
 *
 * Bis hierher entstand die Notiz nur in der Moderation. Wer das Gespräch ohne
 * das zweite Fenster führt, hatte keine Stelle zum Mitschreiben und musste die
 * Moderation nur wegen eines Textfeldes öffnen. Dieses Feld schreibt in
 * dieselbe Notiz (`erstgespraechSkript.bewerberVideocall.notiz`), es gibt also
 * weiterhin genau einen Text je Gespräch, gleich wo er getippt wurde.
 *
 * Gespeichert wird von selbst: Der Gesprächsstand geht kurz nach der letzten
 * Eingabe in die Datenbank, dazwischen liegt er im Browser.
 */
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { VideocallErfassung } from "@/lib/bewerberVideocall";
import { notizLesen, type ErfassungMitNotiz } from "@/lib/videocallNotiz";

export function VideocallNotizKarte({
  erfassung,
  canEdit,
  onAendern,
}: {
  erfassung: VideocallErfassung;
  canEdit: boolean;
  onAendern: (patch: Partial<ErfassungMitNotiz>) => void;
}) {
  const gespeichert = notizLesen(erfassung);
  const [text, setText] = useState(gespeichert);
  const getippt = useRef(false);

  // Solange hier niemand tippt, folgt das Feld dem gespeicherten Stand, etwa
  // wenn parallel in der Moderation geschrieben wurde.
  useEffect(() => {
    if (!getippt.current) setText(gespeichert);
  }, [gespeichert]);

  if (!canEdit) return null;

  return (
    <Card className="p-4 space-y-2" data-testid="videocall-notiz-eingabe">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Notizen zum Gespräch
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Auch ohne die Moderation. Der Text speichert sich von selbst und steht
          danach in der Akte.
        </p>
      </div>
      <Textarea
        value={text}
        onChange={(e) => {
          getippt.current = true;
          setText(e.target.value);
          onAendern({ notiz: e.target.value });
        }}
        onBlur={() => { getippt.current = false; }}
        rows={6}
        placeholder="Was im Gespräch wichtig war"
        className="text-sm"
      />
    </Card>
  );
}
