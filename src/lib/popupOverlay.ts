/**
 * Darstellung der Popups im gesamten Projekt.
 *
 * Projektregel: Ein Popup oeffnet direkt auf der Seite und blendet nichts
 * aus. Kein Abdunkeln, kein Weichzeichner, die Seitenleiste bleibt sichtbar.
 *
 * Das ist seit dem 04.08.2026 die Voreinstellung in `components/ui/dialog.tsx`
 * und `components/ui/alert-dialog.tsx`. Ein neues Popup bekommt es also
 * automatisch, ohne dass jemand daran denken muss.
 *
 * Der Overlay wird nicht entfernt, sondern nur unsichtbar geschaltet. Das ist
 * wichtig, denn er faengt weiterhin die Klicks ab: Ein Klick neben das Popup
 * schliesst es, und man navigiert nicht versehentlich in der Seitenleiste,
 * waehrend ein Formular offen ist.
 *
 * Die Konstante bleibt bestehen, weil sie an vielen Popups steht. Sie ist
 * jetzt eine Wiederholung der Voreinstellung und schadet nicht. Neue Popups
 * brauchen sie nicht mehr.
 */
export const NUR_POPUP_OVERLAY = "bg-transparent backdrop-blur-none";
