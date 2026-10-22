/*
 * Die Dateien, die die PDFs des Rechners zur Laufzeit per fetch holen
 * (pdfBranding.ts: Schrift und Logo), im Bündel als data-Adresse. Die
 * Fassung ist eine einzige HTML-Datei ohne Nebendateien, ein fetch auf
 * "/fonts/…" fände dort nichts. Muss nach "../netzwerk" geladen werden, das
 * den Rest des Netzes sperrt.
 */
import schriftNormal from "../../../public/fonts/PlusJakartaSans-Regular.ttf?inline";
import schriftFett from "../../../public/fonts/PlusJakartaSans-Bold.ttf?inline";
import logo from "../../../public/images/os-real-estate-logo-quer.png?inline";
import logoDunkel from "../../../public/images/os-real-estate-logo-quer-dunkel.png?inline";

const DATEIEN: Record<string, string> = {
  "/fonts/PlusJakartaSans-Regular.ttf": schriftNormal,
  "/fonts/PlusJakartaSans-Bold.ttf": schriftFett,
  "/images/os-real-estate-logo-quer.png": logo,
  "/images/os-real-estate-logo-quer-dunkel.png": logoDunkel,
};

const weiter = window.fetch.bind(window);
window.fetch = (eingabe: RequestInfo | URL, init?: RequestInit) => {
  const roh = typeof eingabe === "string" ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url;
  const pfad = roh.replace(/^\.\//, "/");
  return DATEIEN[pfad] ? weiter(DATEIEN[pfad], init) : weiter(eingabe, init);
};

export {};
