/**
 * Die Wettbewerbsseite darf nur zeigen, was die Datenbank auch erlaubt.
 *
 * `src/pages/Wettbewerb.tsx` hat bis zum 16.09.2026 die Knoepfe zum Anlegen,
 * Bearbeiten und Loeschen fuer `admin`, `vertriebsleiter` und `backoffice`
 * eingeblendet. Die Zugriffsregeln auf `wettbewerb_challenges` verlangen aber
 * `is_admin_role`, also `admin` oder `inhaber`. Vertriebsleitung und
 * Backoffice bekamen beim Klick eine Ablehnung der Datenbank und daraus eine
 * Fehlermeldung fuer etwas, das sie gar nicht falsch gemacht hatten.
 *
 * Dieselbe Fehlerklasse gab es schon auf den Seiten Unterlagen und
 * Praesentation. Dieser Test haelt die beiden Seiten aneinander: die
 * Oberflaeche und die Regel, die im Ernstfall entscheidet.
 *
 * Soll die Vertriebsleitung kuenftig mitreden duerfen, ist das eine fachliche
 * Entscheidung. Sie braucht zuerst eine Migration. Nur die Zeile im Frontend
 * zu erweitern stellt den alten, kaputten Zustand wieder her, und genau davor
 * faellt dieser Test um.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONEN = join(process.cwd(), "supabase", "migrations");

const seite = readFileSync(join(process.cwd(), "src", "pages", "Wettbewerb.tsx"), "utf8");

/** Migrationen in Laufreihenfolge, ohne die iCloud-Kopien. */
function alleMigrationen(): string[] {
  return readdirSync(MIGRATIONEN)
    .filter((n) => n.endsWith(".sql"))
    .filter((n) => !/ \d+\.sql$/.test(n))
    .sort();
}

/**
 * Die zeitlich letzte Regel je Schreibart auf `wettbewerb_challenges`.
 *
 * Spaetere Migrationen ersetzen fruehere, deshalb zaehlt nur der letzte
 * Treffer. Genau hier wird sonst falsch gelesen: Wer die erste gefundene
 * Policy nimmt, landet bei der Fassung vom 14.03.2026, die noch jedem alles
 * erlaubte.
 */
function letzteRegeln(): Record<string, string> {
  const gefunden: Record<string, string> = {};
  for (const name of alleMigrationen()) {
    const text = readFileSync(join(MIGRATIONEN, name), "utf8");
    const muster =
      /CREATE\s+POLICY\s+"[^"]+"\s+ON\s+public\.wettbewerb_challenges\s+FOR\s+(INSERT|UPDATE|DELETE)\s+TO\s+authenticated\s+(?:USING|WITH\s+CHECK)\s*\(([^;]*?)\)\s*;/gi;
    let treffer: RegExpExecArray | null;
    while ((treffer = muster.exec(text)) !== null) {
      gefunden[treffer[1].toUpperCase()] = treffer[2].trim();
    }
  }
  return gefunden;
}

describe("Zugriffsregeln auf wettbewerb_challenges", () => {
  it("Anlegen, Bearbeiten und Loeschen verlangen is_admin_role", () => {
    const regeln = letzteRegeln();

    expect(Object.keys(regeln).sort()).toEqual(["DELETE", "INSERT", "UPDATE"]);
    for (const art of ["INSERT", "UPDATE", "DELETE"]) {
      expect(regeln[art]).toContain("is_admin_role");
      // `true` hiesse: jeder Angemeldete darf. Das war die alte Fassung.
      expect(regeln[art]).not.toBe("true");
    }
  });

  it("is_admin_role meint genau admin und inhaber", () => {
    const text = readFileSync(
      join(MIGRATIONEN, "20260316100512_8d4bf896-65f0-4c74-83f2-826648e86731.sql"),
      "utf8",
    );
    const rumpf = text.slice(text.indexOf("FUNCTION public.is_admin_role"));
    expect(rumpf).toMatch(/role IN \('admin', 'inhaber'\)/);
  });
});

describe("Wettbewerb.tsx gleicht sich an die Datenbank an", () => {
  it("canEdit nennt nur die Rollen, die auch schreiben duerfen", () => {
    expect(seite).toMatch(/const canEdit = \["admin", "inhaber"\]\.includes\(user\.role\)/);
  });

  it("Vertriebsleitung und Backoffice sehen die Knoepfe nicht mehr", () => {
    const zeile = seite.split("\n").find((z) => z.includes("const canEdit ="));
    expect(zeile).toBeDefined();
    expect(zeile).not.toContain("vertriebsleiter");
    expect(zeile).not.toContain("backoffice");
  });

  it("der Grund steht als Kommentar daneben", () => {
    // Ohne die Begruendung ist die naechste Erweiterung nur eine Frage der
    // Zeit. Der Kommentar nennt die Migration, die die Grenze zieht.
    const vorCanEdit = seite.slice(0, seite.indexOf("const canEdit ="));
    expect(vorCanEdit).toContain("is_admin_role");
    expect(vorCanEdit).toContain("20260316192547");
    expect(vorCanEdit).toContain("Migration");
  });
});
