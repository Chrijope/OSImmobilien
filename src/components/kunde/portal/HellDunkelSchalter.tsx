import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUser } from "@/contexts/UserContext";
import { istLiquidGlas } from "@/lib/designSchalter";

/**
 * Hell oder dunkel im Kundenportal, derselbe Schalter wie in der Kopfzeile des
 * CRM (`HeaderBar.tsx`) und derselbe Zustand (`toggleDarkMode` im
 * `UserContext`).
 *
 * Nur mit Liquid Glass: Erst `styles/kundenportal-liquid.css` gibt dem Portal
 * die dunklen Tokens des CRM. Ohne Liquid Glass blieben die Flaechen hell,
 * waehrend einzelne `dark:`-Klassen schon umschalten, und das Portal saehe
 * halb dunkel aus. Mit `?design=heute` gibt es den Schalter deshalb nicht.
 */
export function HellDunkelSchalter() {
  const { darkMode, toggleDarkMode } = useUser();
  const { t } = useTranslation();
  if (!istLiquidGlas()) return null;

  const beschriftung = darkMode ? t("portal.header.light_mode") : t("portal.header.dark_mode");
  return (
    <button
      type="button"
      onClick={toggleDarkMode}
      className="inline-flex items-center justify-center h-9 w-9 hover:text-[hsl(var(--portal-akzent))] transition-colors"
      title={beschriftung}
      aria-label={beschriftung}
      aria-pressed={darkMode}
    >
      {darkMode ? <Sun className="h-4 w-4 text-foreground/70" /> : <Moon className="h-4 w-4 text-foreground/70" />}
    </button>
  );
}
