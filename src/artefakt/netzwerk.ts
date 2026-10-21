/*
 * Als erstes Modul geladen (src/artefakt/main.tsx): Netzwerk nur noch zu Dateien des Bündels.
 * Absolute Pfade wie "/fonts/…" (jsPDF, pdfBranding.ts) werden relativ, damit
 * die Seite auch in einem Unterpfad läuft. Fremde Adressen (Adresssuche o. ä.)
 * werden verworfen, nichts verlässt den Browser.
 */
(() => {
  const original = window.fetch.bind(window);
  window.fetch = (eingabe: RequestInfo | URL, init?: RequestInit) => {
    const roh = typeof eingabe === "string" ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url;
    if (roh.startsWith("/") && !roh.startsWith("//")) return original(`.${roh}`, init);
    if (/^(data|blob):/.test(roh)) return original(eingabe, init);
    let url: URL;
    try {
      url = new URL(roh, document.baseURI);
    } catch {
      return Promise.reject(new TypeError("Ungültige Adresse"));
    }
    if (url.origin === window.location.origin) return original(eingabe, init);
    return Promise.reject(new TypeError("Externe Aufrufe sind in dieser Fassung abgeschaltet"));
  };
})();

export {};
