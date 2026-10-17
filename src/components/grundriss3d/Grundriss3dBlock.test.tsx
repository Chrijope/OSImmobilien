import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { Grundriss3dBlock, schwachesGeraet } from "./Grundriss3dBlock";
import { WE03_PLAN } from "./beispielWe03";

const ORDNER = "src/components/grundriss3d";

describe("3D nur bei Bedarf laden", () => {
  it("three.js steckt nur in Ansicht, Szene, Außenhülle und Standbild, die lazy geladen werden", () => {
    const mitThree = readdirSync(ORDNER)
      .filter((d) => /\.(ts|tsx)$/.test(d) && !/\.test\./.test(d))
      .filter((d) => /from "three(\/|")/.test(readFileSync(`${ORDNER}/${d}`, "utf8")));
    expect(mitThree.sort()).toEqual(["Grundriss3dAnsicht.tsx", "aussen.ts", "standbild.ts", "szene.ts"]);
  });

  it("Seiten und Exposé binden nur den leichten Block ein, die Ansicht nur dynamisch", () => {
    const block = readFileSync(`${ORDNER}/Grundriss3dBlock.tsx`, "utf8");
    expect(block).toMatch(/lazy\(ladeAnsicht\)/);
    expect(block).toMatch(/import\("\.\/Grundriss3dAnsicht"\)/);
    expect(block).not.toMatch(/^import [^t].*from "\.\/Grundriss3dAnsicht"/m);
    for (const datei of ["src/pages/ObjektDetail.tsx", "src/pages/WohnungDetail.tsx", "src/components/expose/ExposeAnsicht.tsx", "src/lib/exposeDruck/bilder.ts"]) {
      const text = readFileSync(datei, "utf8");
      expect(text, datei).not.toMatch(/from "three"|from "[^"]*grundriss3d\/(szene|Grundriss3dAnsicht|standbild)"/);
    }
    expect(readFileSync("src/lib/exposeDruck/bilder.ts", "utf8")).toMatch(/await import\("@\/components\/grundriss3d\/standbild"\)/);
  });

  it("zeigt ohne WebGL den 2D-Grundriss mit Räumen und Flächen (jsdom kann kein WebGL)", () => {
    render(<Grundriss3dBlock einheiten={[{ plan: WE03_PLAN, titel: "WE 03" }]} />);
    const bild = screen.getByRole("img", { name: /WE 03/ });
    expect(bild.getAttribute("aria-label")).toMatch(/Bad 5,\d\d m²/);
    expect(screen.getByText(/Darstellung schematisch/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /3D/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("hält schwache Geräte für den 2D-Start fest", () => {
    expect(schwachesGeraet({ hardwareConcurrency: 2, deviceMemory: 8 })).toBe(true);
    expect(schwachesGeraet({ hardwareConcurrency: 8, deviceMemory: 1 })).toBe(true);
    expect(schwachesGeraet({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(schwachesGeraet({})).toBe(false);
  });
});
