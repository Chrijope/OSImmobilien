import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Das Fenster zum Schreiben einer Notiz am Bewerber.
 *
 * ## Warum es ein eigenes Bauteil ist
 *
 * Es gibt zwei Wege hinein: den runden Knopf „Notiz" in der linken Spalte und
 * den Knopf „Notiz schreiben …" im Reiter „Notizen" rechts. Beide sollen
 * dasselbe Fenster öffnen, mit demselben Textfeld und demselben Speicherweg.
 * Zwei Fenster nebeneinander wären der Anfang zweier verschiedener Antworten
 * auf dieselbe Frage, und beim nächsten Mal änderte jemand nur eines.
 *
 * Gespeichert wird nicht hier. `onSpeichern` bekommt den geputzten Text, der
 * Aufrufer kennt den angemeldeten Nutzer und den Weg in den Bestand
 * (`addNotizEntry` in `bewerbungStore`). Es entsteht ausdrücklich kein zweiter
 * Datenweg neben dem, den der Reiter Übersicht bisher benutzt hat.
 */
export function BewerberNotizDialog({
  offen,
  onOffen,
  onSpeichern,
}: {
  offen: boolean;
  onOffen: (offen: boolean) => void;
  onSpeichern: (text: string) => void;
}) {
  const [text, setText] = useState("");

  // Ein neues Fenster beginnt leer. Sonst stünde beim nächsten Öffnen noch der
  // Text von vorhin da, und niemand wüsste, ob er schon gespeichert ist.
  useEffect(() => {
    if (offen) setText("");
  }, [offen]);

  const speichern = () => {
    const sauber = text.trim();
    if (!sauber) return;
    onSpeichern(sauber);
    onOffen(false);
  };

  return (
    <Dialog open={offen} onOpenChange={onOffen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Notiz schreiben</DialogTitle>
          <DialogDescription>
            Die Notiz steht anschließend rechts im Reiter „Notizen", mit Deinem Namen und dem
            Zeitpunkt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            aria-label="Text der Notiz"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Was soll festgehalten werden?"
            className="min-h-[120px] text-sm"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") speichern();
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Tipp: ⌘/Strg + Enter zum Speichern</span>
            <Button type="button" size="sm" onClick={speichern} disabled={!text.trim()}>
              Notiz speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
