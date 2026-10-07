import { describe, it, expect } from "vitest";
import {
  VERTRIEBSAKADEMIE_KAPITEL,
  aufgabenFuerPfad,
  type AkademieAufgabe,
} from "@/lib/vertriebsakademieContent";

const alleAufgaben: { slug: string; secId: string; a: AkademieAufgabe }[] =
  VERTRIEBSAKADEMIE_KAPITEL.flatMap((k) =>
    k.sections.flatMap((sec) =>
      (sec.aufgaben ?? []).map((a) => ({ slug: k.slug, secId: sec.id, a })),
    ),
  );

function alleTexte(o: unknown): string[] {
  if (typeof o === "string") return [o];
  if (Array.isArray(o)) return o.flatMap(alleTexte);
  if (o && typeof o === "object") return Object.values(o).flatMap(alleTexte);
  return [];
}

describe("Aufgabenbestand", () => {
  it("es gibt Aufgaben in der Breite, nicht nur in einem Kapitel", () => {
    const mitAufgaben = VERTRIEBSAKADEMIE_KAPITEL.filter((k) =>
      k.sections.some((sec) => (sec.aufgaben ?? []).length > 0),
    );
    expect(alleAufgaben.length).toBeGreaterThan(200);
    expect(mitAufgaben.length).toBeGreaterThanOrEqual(16);
  });

  it("jede Aufgaben-ID ist innerhalb ihres Kapitels eindeutig", () => {
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
      const ids = kap.sections.flatMap((sec) => (sec.aufgaben ?? []).map((a) => a.id));
      expect(new Set(ids).size, `Kapitel ${kap.slug}`).toBe(ids.length);
    }
  });

  it("beide Lernpfade bekommen Aufgaben", () => {
    const qe = alleAufgaben.filter((x) => (x.a.pfad ?? "beide") !== "profi");
    const pro = alleAufgaben.filter((x) => (x.a.pfad ?? "beide") !== "quereinsteiger");
    expect(qe.length).toBeGreaterThan(100);
    expect(pro.length).toBeGreaterThan(100);
  });

  it("der Modus 'alle' zeigt jede Aufgabe", () => {
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
      for (const sec of kap.sections) {
        expect(aufgabenFuerPfad(sec, "alle").length).toBe((sec.aufgaben ?? []).length);
      }
    }
  });

  it("Quizfragen zeigen auf eine gueltige Option und haben eine Aufloesung", () => {
    for (const { slug, a } of alleAufgaben) {
      if (a.typ !== "quiz") continue;
      for (const f of a.fragen) {
        expect(f.optionen.length, `${slug}/${a.id}`).toBeGreaterThanOrEqual(2);
        expect(new Set(f.optionen).size, `${slug}/${a.id}`).toBe(f.optionen.length);
        expect(f.korrekt, `${slug}/${a.id}`).toBeGreaterThanOrEqual(0);
        expect(f.korrekt, `${slug}/${a.id}`).toBeLessThan(f.optionen.length);
        expect(f.aufloesung.trim().length, `${slug}/${a.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("Sprungziele zeigen auf einen Abschnitt desselben Kapitels", () => {
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
      const ids = new Set(kap.sections.map((s) => s.id));
      const fragen = [
        ...kap.sections.flatMap((sec) =>
          (sec.aufgaben ?? []).flatMap((a) => (a.typ === "quiz" ? a.fragen : [])),
        ),
        ...(kap.abschlusstest?.fragen ?? []),
      ];
      for (const f of fragen) {
        if (f.sprungZuAbschnitt) {
          expect(ids.has(f.sprungZuAbschnitt), `${kap.slug} -> ${f.sprungZuAbschnitt}`).toBe(true);
        }
      }
    }
  });

  it("Sortieraufgaben haben mindestens drei verschiedene Schritte", () => {
    for (const { slug, a } of alleAufgaben) {
      if (a.typ !== "sortieren") continue;
      expect(a.schritte.length, `${slug}/${a.id}`).toBeGreaterThanOrEqual(3);
      expect(new Set(a.schritte).size, `${slug}/${a.id}`).toBe(a.schritte.length);
    }
  });

  it("Zuordnungen sind eindeutig und Ablenker sind wirklich falsch", () => {
    for (const { slug, a } of alleAufgaben) {
      if (a.typ !== "zuordnen") continue;
      const links = a.paare.map((p) => p.links);
      const rechts = a.paare.map((p) => p.rechts);
      expect(new Set(links).size, `${slug}/${a.id}`).toBe(links.length);
      expect(new Set(rechts).size, `${slug}/${a.id}`).toBe(rechts.length);
      for (const ab of a.ablenker ?? []) {
        expect(rechts.includes(ab), `${slug}/${a.id}: Ablenker ist richtige Karte`).toBe(false);
      }
    }
  });

  it("Rechenaufgaben haben Zielwert, Einheit und einen Rechenweg", () => {
    for (const { slug, a } of alleAufgaben) {
      if (a.typ !== "rechnen") continue;
      expect(Number.isFinite(a.zielwert), `${slug}/${a.id}`).toBe(true);
      expect(a.rechenweg.zeilen.length, `${slug}/${a.id}`).toBeGreaterThan(0);
      expect(a.fall.trim().length, `${slug}/${a.id}`).toBeGreaterThan(0);
      expect(a.gesucht.trim().length, `${slug}/${a.id}`).toBeGreaterThan(0);
    }
  });

  it("Szenarien sind vollstaendig verdrahtet und enden irgendwo", () => {
    for (const { slug, a } of alleAufgaben) {
      if (a.typ !== "szenario") continue;
      const ids = new Set(a.szenen.map((s) => s.id));
      expect(ids.has(a.startSzene), `${slug}/${a.id}: Startszene fehlt`).toBe(true);
      expect(ids.size, `${slug}/${a.id}: doppelte Szenen-IDs`).toBe(a.szenen.length);
      let enden = 0;
      for (const s of a.szenen) {
        if (!s.optionen?.length) {
          enden++;
          expect(s.fazit, `${slug}/${a.id}/${s.id}: Ende ohne Fazit`).toBeTruthy();
        }
        for (const o of s.optionen ?? []) {
          if (o.weiterZu) {
            expect(ids.has(o.weiterZu), `${slug}/${a.id}: ${o.weiterZu} fehlt`).toBe(true);
          }
        }
      }
      expect(enden, `${slug}/${a.id}: kein Ende`).toBeGreaterThan(0);
    }
  });

  it("jedes Szenario ist ohne schwache Wahl loesbar", () => {
    for (const { slug, a } of alleAufgaben) {
      if (a.typ !== "szenario") continue;
      const nachId = Object.fromEntries(a.szenen.map((s) => [s.id, s]));
      const besucht = new Set<string>();
      const erreichbaresEnde = (id: string): boolean => {
        if (besucht.has(id)) return false;
        besucht.add(id);
        const s = nachId[id];
        if (!s) return false;
        if (!s.optionen?.length) return true;
        return s.optionen.some(
          (o) => o.bewertung !== "schwach" && (!o.weiterZu || erreichbaresEnde(o.weiterZu)),
        );
      };
      expect(erreichbaresEnde(a.startSzene), `${slug}/${a.id}`).toBe(true);
    }
  });

  it("Abschlusstests decken die Kapitel ab", () => {
    const mitTest = VERTRIEBSAKADEMIE_KAPITEL.filter((k) => k.abschlusstest);
    expect(mitTest.length).toBeGreaterThanOrEqual(16);
    for (const kap of mitTest) {
      expect(kap.abschlusstest!.fragen.length, kap.slug).toBeGreaterThanOrEqual(5);
    }
  });

  it("Abwaegungsfaelle haben mindestens zwei vertretbare Wege", () => {
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
      const fall = kap.abwaegungsfall;
      if (!fall) continue;
      expect(fall.wege.length, kap.slug).toBeGreaterThanOrEqual(2);
      expect(new Set(fall.wege.map((w) => w.id)).size, kap.slug).toBe(fall.wege.length);
    }
  });

  it("kein Gedankenstrich in den neuen Aufgabentexten", () => {
    const treffer: string[] = [];
    for (const { slug, a } of alleAufgaben) {
      for (const t of alleTexte(a)) {
        if (t.includes("—") || t.includes("–")) treffer.push(`${slug}/${a.id}`);
      }
    }
    expect(treffer).toEqual([]);
  });
});

describe("Grafikbestand", () => {
  const alleVisuals = VERTRIEBSAKADEMIE_KAPITEL.flatMap((k) =>
    k.sections.flatMap((sec) => (sec.visuals ?? []).map((v) => ({ slug: k.slug, secId: sec.id, v }))),
  );

  it("die meisten Abschnitte tragen inzwischen ein visuelles Element", () => {
    const mit = VERTRIEBSAKADEMIE_KAPITEL.flatMap((k) => k.sections).filter(
      (sec) => (sec.visuals ?? []).length > 0,
    ).length;
    const gesamt = VERTRIEBSAKADEMIE_KAPITEL.flatMap((k) => k.sections).length;
    expect(mit / gesamt).toBeGreaterThan(0.7);
  });

  it("KPI-Reihen haben hoechstens vier Kacheln und immer Label und Wert", () => {
    for (const { slug, secId, v } of alleVisuals) {
      if (!v.kpis) continue;
      expect(v.kpis.length, `${slug}/${secId}`).toBeLessThanOrEqual(4);
      for (const k of v.kpis) {
        expect(k.label.trim().length, `${slug}/${secId}`).toBeGreaterThan(0);
        expect(String(k.wert).trim().length, `${slug}/${secId}`).toBeGreaterThan(0);
      }
    }
  });

  it("Beispielrechnungen haben eine Ergebniszeile", () => {
    for (const { slug, secId, v } of alleVisuals) {
      if (!v.beispielrechnung) continue;
      const zeilen = v.beispielrechnung.zeilen;
      expect(zeilen.length, `${slug}/${secId}`).toBeGreaterThan(1);
      expect(zeilen.some((z) => z.ergebnis), `${slug}/${secId}: keine Ergebniszeile`).toBe(true);
    }
  });

  it("Donuts haben mindestens zwei Segmente mit positiven Werten", () => {
    for (const { slug, secId, v } of alleVisuals) {
      if (!v.donut) continue;
      expect(v.donut.daten.length, `${slug}/${secId}`).toBeGreaterThanOrEqual(2);
      for (const d of v.donut.daten) {
        expect(d.wert, `${slug}/${secId}`).toBeGreaterThan(0);
      }
    }
  });

  it("Barcharts bleiben unter ihrem eigenen Maximalwert", () => {
    for (const { slug, secId, v } of alleVisuals) {
      if (!v.barchart?.maxWert) continue;
      for (const d of v.barchart.daten) {
        expect(d.wert, `${slug}/${secId}: ${d.label}`).toBeLessThanOrEqual(v.barchart.maxWert);
      }
    }
  });

  it("Vergleiche haben auf beiden Seiten Punkte", () => {
    for (const { slug, secId, v } of alleVisuals) {
      if (!v.vergleich) continue;
      expect(v.vergleich.optionA.punkte.length, `${slug}/${secId}`).toBeGreaterThan(0);
      expect(v.vergleich.optionB.punkte.length, `${slug}/${secId}`).toBeGreaterThan(0);
    }
  });

  it("Grunderwerbsteuer wird ueberall mit den aktuellen Saetzen genannt", () => {
    // Sachsen liegt seit 2023 bei 5,5 Prozent, Thueringen seit 2024 bei 5,0.
    // Fruehere Fassungen fuehrten beide falsch.
    const texte = alleTexte(VERTRIEBSAKADEMIE_KAPITEL);
    const falsch = texte.filter(
      (t) =>
        (/Bayern und Sachsen/.test(t) && /3,5/.test(t)) ||
        (/Bayern, Sachsen/.test(t) && /3,5/.test(t)),
    );
    expect(falsch).toEqual([]);
  });
});
