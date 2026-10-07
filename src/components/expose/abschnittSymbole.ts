import {
  Building2, Calculator, CalendarDays, ClipboardList, FileText, Home, LayoutDashboard, Map as MapSymbol, MapPin, Phone, TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { ExposeAbschnittId } from "@/lib/exposeInhalt";

/** Ein Symbol je Abschnitt für die Symbolleiste, am Desktop wie auf dem Handy. */
export const ABSCHNITT_SYMBOLE: Record<ExposeAbschnittId, LucideIcon> = {
  start: Home,
  standort: MapPin,
  mikrolage: MapSymbol,
  objektdaten: ClipboardList,
  grundriss: LayoutDashboard,
  wirtschaftlichkeit: Calculator,
  verwaltung: Building2,
  zeitplan: CalendarDays,
  "chancen-risiken": TrendingUp,
  rechtliches: FileText,
  kontakt: Phone,
};
