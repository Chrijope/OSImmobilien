// Ein Absatz im Lehrtext, lange Absätze zunächst gekürzt.
//
// Reine Darstellung. Der Text bleibt Zeichen für Zeichen derselbe, und die
// Begriffserkennung läuft unverändert einmal über den vollständigen Absatz.
// Gekürzt wird erst deren Ergebnis, siehe `akademieAbsatzKuerzung`.
//
// Der Knopf sitzt im Textfluss und nicht in einer eigenen Zeile: Ein
// abgesetzter Knopf unter jedem langen Absatz wäre selbst wieder eine
// Sammlung von Kästen, und genau davon gibt es schon genug.
//
// In allen drei Lernpfaden gleich. Der Profi sieht die längeren Seiten, weil
// bei ihm zusätzlich Profi-Tipps, Gold-Nuggets und Advanced-Übungen stehen,
// er gewinnt beim Überfliegen also am meisten. Und wer wirklich alles lesen
// will, klappt einmal auf und bleibt aufgeklappt.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BegriffsSegment } from "@/lib/akademieBegriffeErkennung";
import { kuerzeAbsatz } from "@/lib/akademieAbsatzKuerzung";
import { BegriffsText } from "@/components/vertriebsakademie/BegriffsText";

export function AkademieAbsatz({ segmente, vollerText = false }: { segmente: BegriffsSegment[] | null | undefined; vollerText?: boolean }) {
  const [offen, setOffen] = useState(false);
  const gekuerzt = useMemo(() => kuerzeAbsatz(segmente), [segmente]);

  if (!segmente || segmente.length === 0) return null;

  if (vollerText || !gekuerzt.gekuerzt) {
    return (
      <p className="text-sm leading-relaxed">
        <BegriffsText segmente={segmente} />
      </p>
    );
  }

  return (
    <p className="text-sm leading-relaxed">
      <BegriffsText segmente={offen ? segmente : gekuerzt.sichtbar} />{" "}
      <Button
        variant="link"
        size="sm"
        aria-expanded={offen}
        onClick={() => setOffen((v) => !v)}
        className="h-auto p-0 align-baseline text-sm font-medium"
      >
        {offen ? "Weniger" : "Weiterlesen"}
      </Button>
    </p>
  );
}
