import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { istOeffentlicheSeite } from "@/lib/cookieEinwilligung";

const STORAGE_KEY = "mi_last_route";
/** Schluessel im localStorage, damit die Startwelle des Caches (routenTabellen.ts) dieselbe Seite annimmt. */
export const LETZTE_ROUTE_SCHLUESSEL = STORAGE_KEY;

// Routen, die NIE als "letzte Seite" gespeichert oder wiederhergestellt werden sollen
const EXCLUDED_PREFIXES = [
  "/login",
  "/reset-password",
  "/portal-aktivieren",
  "/aktivieren",
  "/sa/",
  "/sa-mobile-sign",
  "/signatur",
  "/unsubscribe",
  "/mobile-scan/",
  "/bewerben/",
  "/analyse",
  "/expose/",
  "/vp/",
  "/karriere",
  "/partner-werden",
  "/impressum",
  "/datenschutz",
  "/kundenansicht/",
  /* Der Kundenlink zur Objektübersicht (Kundenansicht, 23.09.2026). */
  "/immobilie/",
  /* Bewusst als Praefix: Er schliesst auch die beiden Fenster des
     Bewerber-Videocalls aus (/closing-moderation und
     /closing-praesentation-entwurf). Sie gehen als eigener Tab auf und
     sollen nach einem Neuladen des CRM nicht wieder erscheinen. */
  "/closing",
  "/beratungspraesentation",
  "/selbstauskunft",
  "/objekt-akquise",
  /* Oeffentliche Zielseite bezahlter Anzeigen. Wer sie besucht und danach das
     CRM oeffnet, soll nicht auf dem Rechner landen.
     ACHTUNG fuer spaeter: Der deutsche Steuerrechner unter "/steuer" gehoert
     aus demselben Grund hierher, laesst sich aber NICHT als Praefix "/steuer"
     eintragen. Das wuerde auch die interne Seite "/steuerrechner" erfassen,
     und die soll gemerkt werden. Dafuer braucht es einen genauen Abgleich
     statt eines Praefixes. */
  "/expats-calculator",
];

/*
 * „Als Kunde ansehen“ öffnet `/objekte/<id>/kundenansicht` beziehungsweise
 * `/objekte/<id>/einheiten/<we>/kundenansicht` in einem eigenen Tab, ohne
 * CRM-Leiste. Seit dem 23.09.2026 gilt dasselbe für das interne Exposé unter
 * `…/expose`. Als Präfix lässt sich das nicht fassen, `/objekte/` soll
 * gemerkt werden. Deshalb der genaue Abgleich am Ende des Pfads.
 */
const EIGENER_TAB_OHNE_RAHMEN = /^\/objekte\/[^/?#]+(?:\/einheiten\/[^/?#]+)?\/(?:kundenansicht|expose)(?:[?#]|$)/;

/*
 * Dazu alle oeffentlichen Seiten aus `istOeffentlicheSeite`, also genau die mit
 * dem Cookie-Banner. Seit dem 26.09.2026: Die Liste oben liess etwa
 * `/steuer`, `/links`, `/termin/...` und die Bewerberseiten mit ihrem
 * Schluessel in der Adresse durch. Fuer den Besucher einer oeffentlichen Seite
 * ist dieser Merker nicht noetig, er dient nur dem Wiedereinstieg ins CRM.
 * Ohne Einwilligung darf er deshalb dort nichts ablegen (§ 25 TDDDG). Der
 * Abgleich nach ganzen Pfadabschnitten loest nebenbei den Fall `/steuer`
 * gegen `/steuerrechner` aus dem Kommentar oben.
 */
const isExcluded = (path: string) =>
  EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(p)) ||
  EIGENER_TAB_OHNE_RAHMEN.test(path) ||
  istOeffentlicheSeite(path);
export const istVomRoutenspeicherAusgenommen = isExcluded;

/**
 * Merkt sich bei jeder Navigation die zuletzt geöffnete Seite (inkl. Query + Hash).
 * Beim initialen Mount (z. B. nach einem Hart-Reload) wird – wenn der Nutzer auf "/"
 * landet – automatisch zur zuletzt geöffneten Seite zurück navigiert.
 */
export const LastRouteMemory = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const restoredRef = useRef(false);

  // Restore beim ersten Mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const current = location.pathname + location.search + location.hash;
      // Nur restoren, wenn der Nutzer auf der Startseite ohne Query landet
      if (location.pathname !== "/" || location.search || location.hash) return;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved !== current && !isExcluded(saved) && saved.startsWith("/")) {
        navigate(saved, { replace: true });
      }
    } catch {
      /* localStorage nicht verfügbar */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bei jeder Navigation speichern
  useEffect(() => {
    try {
      const full = location.pathname + location.search + location.hash;
      if (isExcluded(location.pathname)) return;
      localStorage.setItem(STORAGE_KEY, full);
    } catch {
      /* ignore */
    }
  }, [location.pathname, location.search, location.hash]);

  return null;
};

export default LastRouteMemory;