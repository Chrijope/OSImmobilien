import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/*
 * Die Auswahlfläche gleitet zum gewählten Reiter wie ein Segmentschalter bei
 * Apple (01.11.2026). Hier wird nur gemessen; Fläche und Feder stehen in
 * `styles/bewegung.css`. Leisten mit Unterstrich (bg-transparent) bleiben, wie
 * sie sind.
 */
function useGleiter(liste: React.RefObject<HTMLDivElement>, aktiv: boolean) {
  React.useLayoutEffect(() => {
    const el = liste.current;
    if (!el || !aktiv || typeof ResizeObserver === "undefined") return;
    const setzen = () => {
      const tab = el.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      const l = el.getBoundingClientRect();
      const t = tab?.getBoundingClientRect();
      if (!t || t.width === 0) {
        el.removeAttribute("data-gleiter");
        return;
      }
      el.style.setProperty("--tab-x", `${t.left - l.left + el.scrollLeft - el.clientLeft}px`);
      el.style.setProperty("--tab-y", `${t.top - l.top + el.scrollTop - el.clientTop}px`);
      el.style.setProperty("--tab-w", `${t.width}px`);
      el.style.setProperty("--tab-h", `${t.height}px`);
      if (!el.hasAttribute("data-gleiter")) el.style.setProperty("--tab-r", getComputedStyle(tab!).borderRadius);
      el.setAttribute("data-gleiter", "");
    };
    setzen();
    const mo = new MutationObserver(setzen);
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
    const ro = new ResizeObserver(setzen);
    ro.observe(el);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [liste, aktiv]);
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const liste = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => liste.current as HTMLDivElement);
  useGleiter(liste, !/\bbg-transparent\b/.test(className ?? ""));
  return (
    <TabsPrimitive.List
      ref={liste}
      className={cn(
        "relative inline-flex h-10 items-center justify-center rounded-xl bg-muted/60 p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium tracking-tight ring-offset-background transition-all data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
