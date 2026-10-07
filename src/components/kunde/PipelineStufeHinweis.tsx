import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

interface Props {
  label: string;
  hinweis: string;
}

/**
 * Cursor-following tooltip that appears on hover AND click.
 * Renders into document.body via portal so it never gets clipped by parent overflow.
 */
export function PipelineStufeHinweis({ label, hinweis }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinnedRef = useRef(false); // true when opened by click (stays open until outside-click)

  useEffect(() => {
    if (!open || !pinnedRef.current) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-pipeline-hinweis]")) {
        pinnedRef.current = false;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const updatePos = (e: React.MouseEvent | MouseEvent) => {
    setPos({ x: e.clientX + 14, y: e.clientY + 18 });
  };

  return (
    <>
      <button
        type="button"
        data-pipeline-hinweis
        className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center"
        aria-label={`Logik-Hinweis ${label}`}
        onMouseEnter={(e) => {
          updatePos(e);
          setOpen(true);
        }}
        onMouseMove={(e) => {
          if (!pinnedRef.current) updatePos(e);
        }}
        onMouseLeave={() => {
          if (!pinnedRef.current) setOpen(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          pinnedRef.current = !pinnedRef.current;
          if (pinnedRef.current) {
            updatePos(e);
            setOpen(true);
          } else {
            setOpen(false);
          }
        }}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open &&
        createPortal(
          <div
            data-pipeline-hinweis
            className="fixed z-[9999] max-w-xs rounded-md border border-border bg-popover text-popover-foreground shadow-lg px-3 py-2 text-xs leading-relaxed pointer-events-none"
            style={{
              left: Math.min(pos.x, window.innerWidth - 320),
              top: Math.min(pos.y, window.innerHeight - 100),
            }}
          >
            <p className="font-semibold mb-1">{label}</p>
            <p className="text-muted-foreground">{hinweis}</p>
          </div>,
          document.body
        )}
    </>
  );
}
