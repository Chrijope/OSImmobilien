import * as React from "react";
import { toast as sonner, type ExternalToast } from "sonner";

/*
 * Ein Rückmeldesystem (A5, 26.10.2026).
 *
 * Bisher liefen zwei Systeme nebeneinander: dieser Radix-Toast und Sonner.
 * Meldungen sahen je nach Aufrufer verschieden aus und konnten sich
 * überdecken. Jetzt ist `toast` nur noch eine Weiche auf Sonner. Die rund 180
 * Aufrufer bleiben, wie sie sind: `title`, `description`, `variant`,
 * `duration` und ein Aktionsknopf (`ToastAction` oder `Button` mit `onClick`)
 * werden übersetzt; aus dem Knopf wird eine Sonner-Aktion, etwa „Rückgängig“.
 */

export interface ToastEingabe {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive" | null;
  /** Ein Knopf wie `<ToastAction onClick={…}>Rückgängig</ToastAction>`. */
  action?: React.ReactNode;
  duration?: number;
  className?: string;
}

/** Beschriftung und Klick aus dem Aktionsknopf lesen, sonst keine Aktion. */
export function aktionAus(element: React.ReactNode): ExternalToast["action"] | undefined {
  if (!React.isValidElement(element)) return undefined;
  const props = element.props as { children?: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void };
  if (typeof props.onClick !== "function" || props.children == null) return undefined;
  const klick = props.onClick;
  return { label: props.children, onClick: (e) => klick(e) };
}

function optionen(p: ToastEingabe, id?: string | number): ExternalToast {
  const action = aktionAus(p.action);
  return {
    ...(id !== undefined ? { id } : {}),
    ...(p.description != null ? { description: p.description } : {}),
    ...(p.duration != null ? { duration: p.duration } : {}),
    ...(action ? { action } : {}),
    ...(p.className ? { className: p.className } : {}),
  };
}

function zeige(p: ToastEingabe, id?: string | number): string | number {
  const titel = p.title ?? "";
  return p.variant === "destructive" ? sonner.error(titel, optionen(p, id)) : sonner(titel, optionen(p, id));
}

function toast(p: ToastEingabe) {
  const id = zeige(p);
  return {
    id: String(id),
    dismiss: () => sonner.dismiss(id),
    update: (neu: ToastEingabe) => { zeige(neu, id); },
  };
}

/** Wie bisher, nur ohne eigene Liste: Die Meldungen hält Sonner. */
function useToast() {
  return {
    toasts: [] as never[],
    toast,
    dismiss: (toastId?: string) => { sonner.dismiss(toastId); },
  };
}

export { useToast, toast };
