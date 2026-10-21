#!/usr/bin/env node
/*
 * Folien-PDF der Beratungspräsentation (21.10.2026).
 *
 * Quelle sind dieselben Folien wie im CRM und im Artefakt: die Druckansicht
 * /vorschau/beratung-druck (nur `npm run dev`). Das Skript öffnet sie in
 * Chrome ohne Fenster, macht aus jedem Abschnitt eine Seite 1440 x 810 px
 * (16:9), passt zu hohe Folien per CSS-Zoom ein (Text bleibt Vektor), setzt
 * die Fußzeile (OS-Zeichen, Kapitel, „n / N“) und druckt als PDF.
 *
 * Aufruf:
 *   node scripts/beratung-pdf/erzeuge.mjs [ausgabe.pdf] [--url http://localhost:8080]
 *
 * Ohne --url startet es selbst einen Vite-Server und beendet ihn danach.
 * Chrome: Google Chrome aus /Applications, sonst Umgebungsvariable CHROME.
 * Keine zusätzliche Abhängigkeit: Chrome wird über das DevTools-Protokoll
 * mit dem WebSocket von Node (ab Version 22) gesteuert.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ROUTE = "/vorschau/beratung-druck";
const BREITE = 1440;
const HOEHE = 810;

const argumente = process.argv.slice(2);
const urlIndex = argumente.indexOf("--url");
const fremdeUrl = urlIndex >= 0 ? argumente[urlIndex + 1] : null;
const pfad = argumente.find((a, i) => !a.startsWith("--") && (urlIndex < 0 || i !== urlIndex + 1));
const ausgabe = resolve(pfad ?? join(WURZEL, "dist-pdf/Beratungspraesentation.pdf"));

const CHROME =
  process.env.CHROME ||
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
if (!CHROME) {
  console.error("Kein Chrome gefunden. Pfad über die Umgebungsvariable CHROME angeben.");
  process.exit(1);
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wartet, bis die Adresse antwortet. */
async function warteAufServer(url, sekunden) {
  for (let i = 0; i < sekunden * 2; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* noch nicht da */
    }
    await warte(500);
  }
  throw new Error(`Server unter ${url} antwortet nicht.`);
}

/** Minimaler Client für das DevTools-Protokoll. */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let naechste = 0;
  const offen = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && offen.has(m.id)) {
      const { ok, fehler } = offen.get(m.id);
      offen.delete(m.id);
      m.error ? fehler(new Error(`${m.error.message} ${m.error.data ?? ""}`)) : ok(m.result);
    }
  };
  const bereit = new Promise((ok, fehler) => {
    ws.onopen = ok;
    ws.onerror = fehler;
  });
  const senden = (method, params = {}) =>
    new Promise((ok, fehler) => {
      const id = ++naechste;
      offen.set(id, { ok, fehler });
      ws.send(JSON.stringify({ id, method, params }));
    });
  /** JavaScript in der Seite ausführen, Ergebnis als Wert. */
  const auswerten = async (ausdruck) => {
    const r = await senden("Runtime.evaluate", { expression: ausdruck, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { bereit, senden, auswerten, schliessen: () => ws.close() };
}

/*
 * Läuft in der Seite. Kapitel je Abschnitt (Präfix der id); die Namen wie in
 * der bisherigen PDF. Abschnitte nur zum Eintippen im Gespräch (Kriterien,
 * Antworten-PDF und Portal) gehören nicht in die PDF.
 */
function seitenAufbauen({ breite, hoehe }) {
  const KAPITEL = [
    ["hero", ""],
    // Kapitel-Trennseiten, nur in der Druckansicht (KapitelFolie in BeratungspraesentationHV.tsx)
    ["kapitel-1", "Ihre Ziele"],
    ["kapitel-2", "Das Prinzip"],
    ["kapitel-5", "Sicherheit"],
    ["kapitel-6", "Ihr nächster Schritt"],
    ["heute", "Einführung"],
    ["ziele", "Ihre Ziele"],
    ["rentenluecke", "Ihre Ziele"],
    ["gruppe", "Über uns"],
    ["werwirsind", "Über uns"],
    ["nichtstun", "Das Prinzip"],
    ["prinzip", "Das Prinzip"],
    ["finanzierung", "Das Prinzip"],
    ["konzept", "Das Prinzip"],
    ["steuer-", "Mehr Netto vom Brutto"],
    ["alter-", "Ihre Arbeitsleistung"],
    ["risiken", "Sicherheit"],
    ["weg", "Ihr nächster Schritt"],
    ["rueckblick", "Ihr nächster Schritt"],
    ["schritt", "Ihr nächster Schritt"],
  ];
  const WEGLASSEN = new Set(["kriterien", "termin"]);
  const FUSS = 40;

  const seite = document.querySelector('[data-praesentation="beratung"]');
  if (!seite) throw new Error("Präsentation nicht gefunden");
  // Alles außerhalb der Präsentation (Banner, schwebende Kacheln, Toaster) ausblenden.
  for (let el = seite; el && el !== document.body; el = el.parentElement) {
    for (const g of el.parentElement.children) if (g !== el && g.tagName !== "SCRIPT") g.style.display = "none";
    // Die Hülle der App (main mit h-screen) darf nicht auf eine Bildschirmhöhe begrenzen.
    el.parentElement.style.height = "auto";
    el.parentElement.style.display = "block";
  }

  const stil = document.createElement("style");
  stil.textContent = `
    @page { size: ${breite}px ${hoehe}px; margin: 0; }
    html, body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Bedienelemente: Kopfleiste, Fortschritt, schwebende Knöpfe, Schalter, Eingaben nur fürs Gespräch. */
    .bos > header, .bos > footer, .bos > .fixed, [data-pdf-exclude],
    #hero button, [data-testid="konzept-beide"], [data-testid="dokumente-b"], [data-testid^="konzept-karte-"] > span:last-child,
    [data-ui="card"]:has(#frage-erwartung), #ziele [data-testid="wuensche"] ~ *,
    #schritt div:has(> [data-testid="weiter-zur-selbstauskunft"]), #objektlink-fehlt, [data-testid="vorschau-sprung"] { display: none !important; }
    /* Terminvorschlag als leere Zeilen zum Ausfüllen, ohne den Datumsvorschlag von heute. */
    #schritt input::placeholder { color: transparent; }
    .druck-folie { width: ${breite}px; height: ${hoehe}px; min-height: 0 !important; overflow: hidden; position: relative;
      box-sizing: border-box; break-after: page; break-inside: avoid; padding-top: 48px !important; padding-bottom: ${FUSS + 12}px !important; }
    .druck-fuss { position: absolute; left: 48px; right: 48px; bottom: 14px; height: 22px; display: flex; align-items: center; gap: 14px;
      font: 600 10px/1 system-ui, sans-serif; letter-spacing: 0.22em; text-transform: uppercase; border-top: 1px solid currentColor;
      padding-top: 8px; opacity: 0.75; }
    .druck-fuss img { height: 14px; width: auto; }
    .druck-fuss .nr { margin-left: auto; letter-spacing: 0.08em; }
  `;
  document.head.appendChild(stil);

  const alle = [...seite.querySelectorAll("section[id]")].filter((s) => !s.parentElement.closest("section"));
  const folien = alle.filter((s) => {
    if (WEGLASSEN.has(s.id)) {
      s.style.display = "none";
      return false;
    }
    return true;
  });
  const logos = [...seite.querySelectorAll("header img")].map((i) => i.src);
  const bericht = [];

  folien.forEach((s, i) => {
    s.classList.add("druck-folie");
    // Zu hohe Folien einpassen: Inhalt zoomen, dabei optisch gleich breit lassen.
    const inhalt = [...s.children].filter((c) => getComputedStyle(c).position !== "absolute");
    const passt = () => {
      s.style.height = "auto";
      const h = s.scrollHeight;
      s.style.height = "";
      return h <= hoehe;
    };
    // Erst optisch gleich breit (Text läuft breiter, wird kürzer); Grafiken, die mit der Breite wachsen, passen nur schmal.
    const setze = (zoom, breit) => {
      for (const c of inhalt) {
        c.style.zoom = zoom === 1 ? "" : String(zoom);
        if (c.classList.contains("max-w-6xl")) c.style.maxWidth = breit && zoom < 1 ? `${1152 / zoom}px` : "";
      }
    };
    let zoom = 1;
    while (!passt() && zoom > 0.4) {
      zoom = Math.round((zoom - 0.02) * 100) / 100;
      setze(zoom, true);
      if (!passt()) setze(zoom, false);
    }

    const dunkel = s.id === "hero" || (s.dataset.ton && s.dataset.ton !== "hell");
    const kapitel = (KAPITEL.find(([p]) => s.id === p || (p.endsWith("-") && s.id.startsWith(p))) ?? [, ""])[1];
    const fuss = document.createElement("div");
    fuss.className = "druck-fuss";
    fuss.style.color = dunkel ? "#F3F7F5" : "#14231B";
    const logo = logos[dunkel ? 1 : 0];
    if (logo) {
      const img = document.createElement("img");
      img.src = logo;
      img.alt = "";
      fuss.appendChild(img);
    }
    const k = document.createElement("span");
    k.textContent = kapitel;
    const nr = document.createElement("span");
    nr.className = "nr";
    nr.textContent = `${i + 1} / ${folien.length}`;
    fuss.append(k, nr);
    s.appendChild(fuss);
    bericht.push({ seite: i + 1, id: s.id, kapitel, zoom });
  });
  return bericht;
}

async function main() {
  let server = null;
  let basis = fremdeUrl;
  if (!basis) {
    const port = 5188;
    basis = `http://127.0.0.1:${port}`;
    server = spawn(join(WURZEL, "node_modules/.bin/vite"), ["--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
      cwd: WURZEL,
      stdio: "ignore",
    });
    await warteAufServer(basis, 120);
  }

  const profil = mkdtempSync(join(tmpdir(), "beratung-pdf-"));
  const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profil}`, "--no-first-run", "--hide-scrollbars", "about:blank"], {
    stdio: "ignore",
  });
  const aufraeumen = () => {
    chrome.kill();
    server?.kill();
    try {
      rmSync(profil, { recursive: true, force: true });
    } catch {
      /* egal */
    }
  };

  try {
    // Chrome schreibt den gewählten Port in DevToolsActivePort.
    let port = null;
    for (let i = 0; i < 60 && !port; i++) {
      await warte(250);
      try {
        port = readFileSync(join(profil, "DevToolsActivePort"), "utf8").split("\n")[0];
      } catch {
        /* noch nicht */
      }
    }
    if (!port) throw new Error("Chrome startet nicht.");
    const ziele = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const c = cdp(ziele.find((z) => z.type === "page").webSocketDebuggerUrl);
    await c.bereit;
    await c.senden("Emulation.setDeviceMetricsOverride", { width: BREITE, height: HOEHE, deviceScaleFactor: 1, mobile: false });
    // Ohne Bewegung: Zahlen und Grafiken stehen sofort im Endzustand.
    const merkmale = [
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: "light" },
    ];
    // Gleich im Druckmodus: Dort gelten die Druckregeln der Präsentation, und ein späterer Wechsel würde neu zeichnen.
    await c.senden("Emulation.setEmulatedMedia", { media: "print", features: merkmale });
    await c.senden("Page.navigate", { url: `${basis}${ROUTE}` });

    // Warten, bis die letzte Folie steht, Schriften und Bilder (auch Hintergrundbilder) geladen sind.
    const bereit = `(async () => {
      if (!document.querySelector("#schritt")) return false;
      await document.fonts.ready;
      const urls = [...document.querySelectorAll(".bos *")]
        .map((e) => getComputedStyle(e).backgroundImage)
        .flatMap((b) => [...b.matchAll(/url\\("?([^")]+)"?\\)/g)].map((m) => m[1]));
      await Promise.all([...urls.map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; })),
        ...[...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))]);
      return true;
    })()`;
    let geladen = false;
    for (let i = 0; i < 240 && !geladen; i++) {
      await warte(500);
      geladen = await c.auswerten(bereit).catch(() => false);
    }
    if (!geladen) throw new Error(`Druckansicht ${ROUTE} lädt nicht (läuft der Server im Entwicklungsmodus?).`);

    const bericht = await c.auswerten(`(${seitenAufbauen.toString()})(${JSON.stringify({ breite: BREITE, hoehe: HOEHE })})`);
    await warte(300);

    const { data } = await c.senden("Page.printToPDF", {
      printBackground: true,
      // Zoll bei 96 px je Zoll: 15 x 8,4375 = 1440 x 810 px.
      paperWidth: BREITE / 96,
      paperHeight: HOEHE / 96,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });
    mkdirSync(dirname(ausgabe), { recursive: true });
    writeFileSync(ausgabe, Buffer.from(data, "base64"));
    c.schliessen();

    for (const b of bericht) {
      console.log(`${String(b.seite).padStart(2)}  ${b.id.padEnd(14)} ${(b.kapitel || "–").padEnd(22)} ${b.zoom < 1 ? `eingepasst ${Math.round(b.zoom * 100)} %` : ""}`);
    }
    console.log(`\n${bericht.length} Seiten: ${ausgabe}`);
  } finally {
    aufraeumen();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
