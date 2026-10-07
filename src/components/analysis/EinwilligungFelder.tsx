/**
 * Die beiden Einwilligungshaken unter den oeffentlichen Lead-Formularen.
 *
 * Liegt in einer eigenen Datei, weil es zwei Formulare gibt: die Eintragung vor
 * dem Ergebnis (`ErgebnisFreischalten`) und das Interesse-Formular auf der
 * Ergebnisseite (`ResultsPage`). Beide sollen denselben Wortlaut zeigen, sonst
 * steht am Ende in der Datenbank zweimal etwas anderes.
 *
 * Oben der Pflichthaken, darunter der freiwillige. Der freiwillige ist als
 * freiwillig gekennzeichnet, damit niemand ihn fuer eine Bedingung haelt.
 *
 * SPRACHE: Der Wortlaut folgt der Seitensprache (`useSeitenSprache`, ohne
 * Provider Deutsch) oder der ausdruecklich uebergebenen `sprache`. Wer diese
 * Felder zeigt, muss die Einwilligung mit DERSELBEN Sprache an `submit-lead`
 * schicken (`baueLeadEinwilligung(..., sprache)`), sonst traegt der
 * gespeicherte Nachweis einen anderen Wortlaut als den gelesenen.
 */
import { useId } from "react";
import {
  LEAD_EINWILLIGUNG_FEHLT,
  LEAD_EINWILLIGUNG_FEHLT_EN,
  LEAD_EINWILLIGUNG_TEXT,
  LEAD_EINWILLIGUNG_TEXT_EN,
  LEAD_WERBUNG_TEXT,
  LEAD_WERBUNG_TEXT_EN,
} from "@/lib/leadEinwilligung";
import { useSeitenSprache } from "@/components/SeitenSprache";
import { mitSeitenSprache, type Sprache } from "@/lib/seitenSprache";
import { ANALYSE_TEXTE } from "./analyseTexte";

/** Die drei Einwilligungstexte in einer Sprache, fuer Formulare und Tests. */
export function einwilligungsTexte(sprache: Sprache) {
  return sprache === "en"
    ? { pflicht: LEAD_EINWILLIGUNG_TEXT_EN, werbung: LEAD_WERBUNG_TEXT_EN, fehlt: LEAD_EINWILLIGUNG_FEHLT_EN }
    : { pflicht: LEAD_EINWILLIGUNG_TEXT, werbung: LEAD_WERBUNG_TEXT, fehlt: LEAD_EINWILLIGUNG_FEHLT };
}

interface Props {
  einwilligung: boolean;
  onEinwilligung: (wert: boolean) => void;
  werbung: boolean;
  onWerbung: (wert: boolean) => void;
  /** Der Pflichthaken fehlt und der Nutzer hat schon abzuschicken versucht. */
  fehlt?: boolean;
  /** Sprache des Wortlauts. Ohne Angabe die Seitensprache. */
  sprache?: Sprache;
}

const KASTEN =
  "mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--primary))] rounded border-border";

export default function EinwilligungFelder({
  einwilligung,
  onEinwilligung,
  werbung,
  onWerbung,
  fehlt,
  sprache: spracheVorgabe,
}: Props) {
  const seitenSprache = useSeitenSprache();
  const sprache = spracheVorgabe ?? seitenSprache;
  const wortlaut = einwilligungsTexte(sprache);
  const t = ANALYSE_TEXTE[sprache].einwilligung;
  const pflichtId = useId();
  const werbungId = useId();

  return (
    <div className="space-y-2.5 pt-1">
      <div className="flex items-start gap-2.5">
        <input
          id={pflichtId}
          type="checkbox"
          checked={einwilligung}
          onChange={(e) => onEinwilligung(e.target.checked)}
          aria-invalid={fehlt ? true : undefined}
          aria-describedby={fehlt ? `${pflichtId}-fehler` : undefined}
          className={KASTEN}
        />
        <label
          htmlFor={pflichtId}
          className={`text-[11px] leading-relaxed cursor-pointer ${
            fehlt ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {wortlaut.pflicht}{" "}
          {/* Bewusst ein gewoehnlicher Verweis: Die Formulare stehen auch auf
              oeffentlichen Seiten, und der neue Reiter soll die begonnene
              Eintragung nicht wegnehmen. */}
          <a
            href={mitSeitenSprache("/datenschutz", sprache)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {t.datenschutzLink}
          </a>
          . <span aria-hidden="true">*</span>
        </label>
      </div>

      {fehlt && (
        <p id={`${pflichtId}-fehler`} role="alert" className="text-xs text-destructive pl-[26px]">
          {wortlaut.fehlt}
        </p>
      )}

      <div className="flex items-start gap-2.5">
        <input
          id={werbungId}
          type="checkbox"
          checked={werbung}
          onChange={(e) => onWerbung(e.target.checked)}
          className={KASTEN}
        />
        <label
          htmlFor={werbungId}
          className="text-[11px] leading-relaxed text-muted-foreground cursor-pointer"
        >
          {wortlaut.werbung}
        </label>
      </div>
    </div>
  );
}
