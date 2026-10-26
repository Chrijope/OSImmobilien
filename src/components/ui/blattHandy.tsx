/**
 * Dialog als Blatt von unten am Handy (A4, 26.10.2026), für `dialog.tsx` und
 * `alert-dialog.tsx` an einer Stelle.
 *
 * Unter 640 px sitzt der Dialog unten, ist oben gerundet, hat einen Griff und
 * fährt mit der Feder (`data-feder`) von unten ein, wie ein Blatt unter iOS.
 * Die Höhe rechnet in `dvh`, damit die Bildschirmtastatur den unteren Rand
 * nicht verdeckt. Abgedunkelt wird nicht, wie bisher. Ab 640 px bleibt alles
 * beim mittigen Dialog. Die Fußzeilenknöpfe bleiben, wo der Dialog sie setzt.
 */
export const BLATT_AM_HANDY = [
  "max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:bottom-0",
  "max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-full max-sm:max-w-none",
  "max-sm:rounded-t-[24px] max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0",
  "max-sm:max-h-[90dvh] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
  // Von unten statt aus der Mitte, ohne Zoom.
  "max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-bottom-full max-sm:data-[state=open]:zoom-in-100",
  "max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-bottom-full max-sm:data-[state=closed]:zoom-out-100",
].join(" ");

/** Der Griff oben am Blatt, nur am Handy, für Vorleseprogramme unsichtbar. */
export function BlattGriff() {
  return <div aria-hidden="true" data-ui="blatt-griff" className="mx-auto -mt-3 h-1.5 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />;
}
