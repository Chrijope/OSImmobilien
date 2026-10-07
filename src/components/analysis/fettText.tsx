import { Fragment, type ReactNode } from "react";

/**
 * Macht aus `**Wort**` in einem Text der Textdatei ein `<strong>`.
 *
 * Die Texte in `analyseTexte.ts` sind reine Zeichenketten, damit die Prüfung
 * auf Vollständigkeit sie lesen kann. Die wenigen Hervorhebungen darin stehen
 * deshalb als `**…**` und werden erst hier zu Markup.
 */
export function fett(text: string, klasse?: string): ReactNode {
  const teile = text.split(/\*\*(.+?)\*\*/g);
  if (teile.length === 1) return text;
  return teile.map((teil, i) =>
    i % 2 === 1 ? (
      <strong key={i} className={klasse}>
        {teil}
      </strong>
    ) : (
      <Fragment key={i}>{teil}</Fragment>
    ),
  );
}
