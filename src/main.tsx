// ─────────────────────────────────────────────────────────────────────────────
// AUTH-SESSION-RESET FÜR INVITE-/RECOVERY-LINKS
// MUSS VOR JEDEM Supabase-Import laufen, weil der Supabase-Client beim Erst-
// Import bereits versucht, eine eventuell im LocalStorage persistierte alte
// Session per refresh_token wiederherzustellen. Wenn ein anderer Nutzer (z. B.
// ein Kunden-Portal-Tester) im selben Browser eingeloggt war und gleichzeitig
// ein frisch eingeladener Nutzer auf "Einladung annehmen" klickt, würde sonst
// die alte Refresh-Token-Session die per URL-Hash mitgelieferte Invite-Session
// überschreiben → der Invite-Link würde stattdessen das Passwort des ALTEN
// Nutzers ändern und ihn ins fremde Portal werfen.
// Lösung: Vor dem ersten Supabase-Init alle `sb-*`-Auth-Keys löschen, sobald
// die aktuelle URL ein Invite-/Recovery-/Signup-Token enthält.
(() => {
  try {
    const path = window.location.pathname;
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const looksLikeAuthCallback =
      path === "/reset-password" ||
      path === "/portal-aktivieren" ||
      hash.includes("access_token=") ||
      hash.includes("type=invite") ||
      hash.includes("type=recovery") ||
      hash.includes("type=signup") ||
      /[?&]type=(invite|recovery|signup)\b/.test(search) ||
      /[?&]token_hash=/.test(search);
    if (!looksLikeAuthCallback) return;
    // Alle Supabase-Auth-Keys im LocalStorage entfernen, damit kein alter
    // Refresh-Token die neue Invite-Session überschreibt.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("sb-") || k.includes("supabase.auth")) {
        try { localStorage.removeItem(k); } catch {}
      }
    }
    try { sessionStorage.clear(); } catch {}
  } catch {
    // Best-effort – niemals den App-Start blockieren
  }
})();

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
/*
  Das Aussehen des CRM. Die Datei haengt vollstaendig an `[data-design="neu"]`
  am Wurzelelement, und dieses Merkmal steht fest in `index.html`.

  Es steht dort und nicht hier, damit es schon im ausgelieferten HTML sitzt,
  bevor irgendein Skript laeuft. Wuerde es erst hier gesetzt, blitzte beim
  Laden kurz das alte Aussehen auf.

  Die Trennung bleibt trotzdem bestehen: Wer das neue Aussehen loswerden will,
  entfernt das Merkmal in `index.html`, und das CRM sieht wieder aus wie
  vorher. Der Waechter in `design-neu.test.ts` sorgt dafuer, dass das so
  bleibt.
*/
import "./styles/design-neu.css";
/*
  Liquid Glass, die zweite Schicht. Sie haengt an `data-glas="an"` und
  ergaenzt die erste, statt sie zu ersetzen: Farben, Radien und Schatten
  bleiben die der Markenrichtlinie, nur Flaechen und Kanten aendern sich.
  Ohne das Merkmal in `index.html` ist diese Datei wirkungslos.
*/
import "./styles/design-glas.css";
/*
  Liquid Glass, die dritte Schicht. Sie haengt an `data-glas="liquid"` und
  loest die zweite ab, wenn sie gilt. Seit dem 23.09.2026 gilt sie fuer alle,
  siehe `lib/designSchalter.ts`. Ohne das Merkmal ist diese Datei wirkungslos.
*/
import "./styles/design-liquid.css";
import "./i18n";
import { runLocalStorageMigration } from "./lib/localStorageMigration";
import { wendeDesignAn } from "./lib/designSchalter";

import { einbettungErlaubt } from "./lib/einbettungsschutz";
import { EinbettungsHinweis } from "./components/EinbettungsHinweis";

runLocalStorageMigration();
wendeDesignAn();

// Schutz gegen Einbetten in fremde Seiten. Lovable sendet keine Header wie
// X-Frame-Options, deshalb wird hier vor dem ersten Zeichnen geprüft. Die
// erlaubten Einbetter stehen in lib/einbettungsschutz.ts.
createRoot(document.getElementById("root")!).render(einbettungErlaubt() ? <App /> : <EinbettungsHinweis />);
