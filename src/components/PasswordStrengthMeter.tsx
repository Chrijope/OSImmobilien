import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, ShieldAlert, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PasswordStrengthResult } from "@/lib/passwordSecurity";
import { cn } from "@/lib/utils";
import { zahlText } from "@/lib/sprachFormat";
import { portalSprache } from "@/i18n/portalSprache";

interface Props {
  password: string;
  userInputs?: string[];
  onResult?: (r: { strength: PasswordStrengthResult; pwnedCount: number; ok: boolean }) => void;
}

/**
 * Laedt die Passwortpruefung erst bei Bedarf nach.
 *
 * Hinter `@/lib/passwordSecurity` haengen die Woerterbuecher von zxcvbn. Das
 * Paket wiegt rund 1,7 MB unkomprimiert und rund 800 KB gzip, also fast das
 * Doppelte des gesamten Startpakets der Anwendung. Es haengt an genau den drei
 * Seiten, die ein neuer Kunde oder Partner zuerst sieht, oft auf dem Handy:
 * Aktivieren, Passwort zuruecksetzen und Kundeneinstellungen.
 *
 * Deshalb wird hier bewusst dynamisch nachgeladen, erst beim ersten Zeichen im
 * Passwortfeld. Niemand tippt ein Passwort in unter einer Sekunde, der Balken
 * ist also rechtzeitig da. Bitte nicht der Einfachheit halber wieder in einen
 * statischen Import zurueckbauen, sonst wachsen diese drei Seiten wieder um
 * das Vielfache ihrer eigenen Groesse.
 *
 * Das Versprechen wird modulweit gemerkt, damit pro Sitzung nur einmal geladen
 * wird und nicht pro Tastendruck.
 */
let passwortModul: Promise<typeof import("@/lib/passwordSecurity")> | null = null;
function passwortPruefungLaden() {
  if (!passwortModul) passwortModul = import("@/lib/passwordSecurity");
  return passwortModul;
}

const COLORS = [
  "bg-red-500",
  "bg-red-400",
  "bg-amber-400",
  "bg-lime-500",
  "bg-emerald-500",
];

const SEGMENTE = 5;

/**
 * Bewertung eines leeren Feldes. zxcvbn liefert fuer den leeren String
 * ebenfalls Stufe 0, deshalb kann sie ohne das Woerterbuch gemeldet werden.
 * Eine Funktion und keine Konstante, damit die Beschriftung der gerade
 * angezeigten Sprache folgt.
 */
const leereBewertung = (label: string): PasswordStrengthResult => ({
  score: 0,
  label,
  feedback: [],
  acceptable: false,
});

export const PasswordStrengthMeter = ({ password, userInputs = [], onResult }: Props) => {
  const { t, i18n } = useTranslation();
  // Wechselt die Anzeigesprache, wird neu bewertet, damit Stufe und Hinweise
  // in der neuen Sprache stehen. Die Bewertung selbst aendert sich dadurch nicht.
  const sprache = i18n.resolvedLanguage || i18n.language;
  // null bedeutet: es liegt noch keine Bewertung vor, das Modul laedt gerade.
  const [strength, setStrength] = useState<PasswordStrengthResult | null>(null);
  const [pwned, setPwned] = useState<number | null>(password ? null : 0);
  const [checking, setChecking] = useState(false);
  // Die Nutzereingaben stehen in einer Ref, damit ein neues Array bei jedem
  // Rendern den Effekt nicht unnoetig erneut ausloest.
  const userInputsRef = useRef(userInputs);
  userInputsRef.current = userInputs;
  const userInputsSchluessel = userInputs.join("|");
  // Auch der Rueckruf steht in einer Ref. Die aufrufenden Seiten uebergeben ihn
  // als Pfeilfunktion direkt im JSX, er hat also bei jedem Rendern eine neue
  // Identitaet. Haengt der Melde-Effekt weiter unten an dieser Identitaet, dreht
  // sich das Ganze im Kreis: Effekt meldet, die Seite setzt ihren Zustand, es
  // wird neu gerendert, der Rueckruf ist neu, der Effekt laeuft wieder. React
  // meldet das als "Maximum update depth exceeded".
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!password) {
      setStrength(leereBewertung(t("auth.passwort.staerke_0")));
      return;
    }
    // Bei schnellem Tippen laufen mehrere Auswertungen gleichzeitig. Der Merker
    // sorgt dafuer, dass nur die zuletzt gestartete ihr Ergebnis setzt, sonst
    // koennte eine veraltete Auswertung die neuere ueberschreiben.
    let abgebrochen = false;
    (async () => {
      const { evaluatePassword } = await passwortPruefungLaden();
      const bewertung = await evaluatePassword(password, userInputsRef.current);
      if (abgebrochen) return;
      setStrength(bewertung);
    })();
    return () => {
      abgebrochen = true;
    };
    // t haengt an der Sprache, die schon in den Abhaengigkeiten steht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, userInputsSchluessel, sprache]);

  useEffect(() => {
    if (!password || password.length < 6) {
      setPwned(0);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const handle = setTimeout(async () => {
      const { checkPasswordPwned } = await passwortPruefungLaden();
      const c = await checkPasswordPwned(password);
      if (!cancelled) {
        setPwned(c);
        setChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [password]);

  useEffect(() => {
    // Ohne fertige Bewertung wird nichts gemeldet. Ein Zwischenstand koennte
    // sonst faelschlich "nicht in Ordnung" bedeuten und einen Absende-Knopf
    // gesperrt lassen.
    if (!strength) return;
    const pwnedCount = pwned ?? 0;
    onResultRef.current?.({
      strength,
      pwnedCount,
      ok: !!password && strength.acceptable && pwnedCount === 0 && !checking,
    });
  }, [strength, pwned, checking, password]);

  if (!password) return null;

  // Kurzer Ladezustand, solange das Woerterbuch beim ersten Zeichen geholt wird.
  if (!strength) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex gap-1">
          {Array.from({ length: SEGMENTE }).map((_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full bg-muted" />
          ))}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("auth.passwort.pruefe")}
        </div>
      </div>
    );
  }

  const segments = SEGMENTE;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-1">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= strength.score ? COLORS[strength.score] : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">
          {t("auth.passwort.staerke")} <span className="font-medium text-foreground">{strength.label}</span>
        </span>
        {checking ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("auth.passwort.pruefe_leak")}
          </span>
        ) : pwned && pwned > 0 ? (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <ShieldAlert className="h-3.5 w-3.5" /> {t("auth.passwort.im_leak", { anzahl: zahlText(pwned, portalSprache()) })}
          </span>
        ) : strength.acceptable ? (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("auth.passwort.sicher")}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> {t("auth.passwort.zu_schwach")}
          </span>
        )}
      </div>
      {strength.feedback.length > 0 && !strength.acceptable && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
          {strength.feedback.slice(0, 3).map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PasswordStrengthMeter;