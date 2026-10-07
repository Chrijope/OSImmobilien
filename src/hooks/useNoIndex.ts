import { useEffect } from "react";

/**
 * Hält eine Seite aus den Suchmaschinen heraus.
 *
 * Gedacht für öffentlich erreichbare Seiten, die zwar jeder mit dem Link
 * öffnen können soll, die aber nicht über eine Google-Suche auffindbar sein
 * dürfen, etwa ein Bewerber-Fragebogen oder die Selbstauskunft. Erreichbar
 * bleiben sie, nur eben nicht auffindbar.
 *
 * Stand 23.09.2026 ruft keine Seite den Haken auf: Die einzige, die ihn
 * nutzte, war die entfernte Closing-Seite.
 *
 * Der Hinweis wird beim Verlassen der Seite wieder entfernt, damit er nicht
 * versehentlich auf der ganzen Anwendung liegen bleibt.
 */
export function useNoIndex(): void {
  useEffect(() => {
    const vorhanden = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (vorhanden) return;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
}
