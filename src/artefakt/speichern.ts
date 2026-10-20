/*
 * Datei an den Nutzer geben. Als claude.ai-Artefakt über die Fähigkeit
 * „downloads“ (der Nutzer bestätigt dort das Speichern), sonst, etwa lokal,
 * über einen normalen Download-Link.
 */
type Downloads = { save: (a: { filename: string; data: Blob }) => Promise<unknown> };

// Früh anfragen: `use()` antwortet erst später, und beim Klick soll die Antwort schon da sein.
let downloads: Downloads | null = null;
try {
  const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<Downloads | null> } }).claude;
  claude?.use?.("downloads").then((d) => { downloads = d; }, () => {});
} catch {
  /* kein Artefakt-Laufzeitsystem */
}

export async function speichereDatei(dateiname: string, blob: Blob): Promise<"gespeichert" | "abgelehnt"> {
  if (downloads) {
    try {
      await downloads.save({ filename: dateiname, data: blob });
      return "gespeichert";
    } catch (e) {
      // Abgelehnt ist eine Entscheidung des Nutzers, kein Fehler.
      if ((e as { code?: string })?.code === "declined") return "abgelehnt";
      console.warn("[Artefakt] downloads nicht nutzbar, normaler Download", e);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "gespeichert";
}
