import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Sprache = "de" | "en";

const LANGS: Array<{ code: Sprache; label: string; short: string }> = [
  { code: "de", label: "Deutsch", short: "DE" },
  { code: "en", label: "English", short: "EN" },
];

/**
 * Sprachumschalter (DE/EN).
 *
 * Ohne Props schaltet er die i18n-Sprache des Kundenportals, persistiert in
 * LocalStorage unter `moreimmo-crm-lang`. Das ist nur die Anzeige in diesem
 * Browser: Die Profilsprache des Kunden, nach der Mails und Dokumente gehen,
 * ändert er nie (Plan Kundensprache, Entscheidung 3). Das Portal zeigt dazu
 * im Menü einen kurzen Satz über `hinweis`.
 *
 * Mit `value` und `onChange` ist er gesteuert und fasst i18n nicht an. So
 * nutzt ihn die Beratungspräsentation: Sie hat ihre eigene, je Nutzer
 * gemerkte Sprache und soll das Portal nicht mit umschalten.
 */
export function LanguageToggle({
  value,
  onChange,
  label,
  hinweis,
  className,
}: {
  value?: Sprache;
  onChange?: (sprache: Sprache) => void;
  /** Beschriftung für Tooltip und Bildschirmleser, im gesteuerten Fall Pflicht der Aufrufer. */
  label?: string;
  /** Kurzer Satz unter den Sprachen, etwa welche Sprache Mails und Dokumente haben. */
  hinweis?: ReactNode;
  className?: string;
} = {}) {
  const { i18n, t } = useTranslation();
  const gesteuert = value !== undefined && onChange !== undefined;
  const current = gesteuert ? value : (i18n.resolvedLanguage || i18n.language || "de").slice(0, 2);
  const currentLang = LANGS.find((l) => l.code === current) ?? LANGS[0];
  const beschriftung = label ?? t("portal.header.language");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 h-9 px-2.5 hover:text-[hsl(var(--portal-akzent))] transition-colors text-xs font-medium",
            className,
          )}
          title={beschriftung}
          aria-label={beschriftung}
          data-testid="sprachwechsel"
        >
          <Globe className="h-4 w-4 text-foreground/70" />
          <span>{currentLang.short}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={hinweis ? "w-60" : "w-40"}>
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => (gesteuert ? onChange(l.code) : i18n.changeLanguage(l.code))}
            className={cn("flex items-center gap-2", l.code === current && "font-semibold")}
          >
            <span className="text-xs tracking-wider text-muted-foreground w-6">{l.short}</span>
            <span className="flex-1">{l.label}</span>
          </DropdownMenuItem>
        ))}
        {hinweis && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs leading-snug text-muted-foreground" data-testid="sprachwechsel-hinweis">
              {hinweis}
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
