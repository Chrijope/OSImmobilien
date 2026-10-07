import { useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";

/**
 * Diagonales, halbtransparentes Wasserzeichen für Listenansichten
 * (Kontakte, Leads, CRM-Übersichten). Zeigt User-Kürzel + Zeitstempel,
 * damit Screenshots forensisch zugeordnet werden können.
 *
 * Angezeigt wird das Wasserzeichen ausschließlich auf Routen, die
 * größere Datenlisten enthalten (siehe {@link WATERMARK_ROUTES}).
 * Auf Detailseiten, Einstellungen etc. bleibt es unsichtbar.
 */
const WATERMARK_ROUTES = [
  "/kontakte",
  "/alle-kontakte",
  "/lead-verwaltung",
  "/leadverwaltung",
  "/leads",
  "/neukunden",
  "/bestandskunden",
  "/pipeline",
  "/abwicklung",
  "/follow-up",
  "/followup",
];

function useNowLabel() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export function ListenWatermark() {
  const { user, authUser } = useUser();
  const path = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "";
  const active = WATERMARK_ROUTES.some((r) => path.startsWith(r));
  const stamp = useNowLabel();
  if (!active) return null;
  const label = `${user?.name || "User"} · ${(authUser?.id || "").slice(0, 8)} · ${stamp}`;
  // 4x4-Raster, damit das Wasserzeichen jede Bildschirm-Kachel abdeckt.
  const tiles = Array.from({ length: 16 });
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden select-none"
      style={{ mixBlendMode: "multiply" }}
    >
      <div className="grid h-full w-full grid-cols-4 grid-rows-4">
        {tiles.map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            <span
              className="whitespace-nowrap text-[11px] font-mono text-foreground/[0.06]"
              style={{ transform: "rotate(-30deg)" }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ListenWatermark;