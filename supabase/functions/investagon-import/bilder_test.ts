import { strToU8, zipSync } from "https://esm.sh/fflate@0.8.2";
import { leererBildBericht, uebernimmBilder } from "./bilder.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
Deno.test("ZIP: alle Fotos, private Unterlagen, stabile Zuordnung und Paketfortschritt", async () => {
  const rows: Record<string, Record<string, unknown>[]> = {
    objekte: [{ id: "obj-1", meta: {} }],
    wohnungen: [{ id: "w-1", we_nr: "1", objekt_id: "obj-1" }],
    objekt_bilder: [],
    wohnungs_bilder: [],
    objekt_dokumente: [],
    wohnungs_dokumente: [],
  };
  const uploads: { bucket: string; path: string }[] = [];
  const db = {
    from(table: string) {
      let filters: Record<string, unknown> = {};
      let action = "select";
      let values: Record<string, unknown> = {};
      let single = false;
      const query = {
        select() {
          return query;
        },
        eq(k: string, v: unknown) {
          filters[k] = v;
          return query;
        },
        match(v: Record<string, unknown>) {
          filters = { ...filters, ...v };
          return query;
        },
        in() {
          return query;
        },
        limit() {
          return query;
        },
        single() {
          single = true;
          return query;
        },
        update(v: Record<string, unknown>) {
          action = "update";
          values = v;
          return query;
        },
        insert(v: Record<string, unknown>) {
          action = "insert";
          values = v;
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          const found = rows[table].filter((row) =>
            Object.entries(filters).every(([k, v]) => row[k] === v)
          );
          if (action === "insert") {
            rows[table].push({
              id: `${table}-${rows[table].length}`,
              ...values,
            });
          }
          if (action === "update") {
            found.forEach((row) => Object.assign(row, values));
          }
          return Promise.resolve(
            resolve({ data: single ? found[0] : found, error: null }),
          );
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          list: () => Promise.resolve({ data: [], error: null }),
          upload: (path: string) => {
            uploads.push({ bucket, path });
            return Promise.resolve({ error: null });
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://storage.example/${bucket}/${path}` },
          }),
        };
      },
    },
  };
  const photos = Array.from(
    { length: 35 },
    (_, i) => ({ filename: `foto-${i}.jpg` }),
  );
  const files: Record<string, Uint8Array> = {
    "expose.pdf": strToU8("PDF"),
    "mietvertrag-scan.jpg": strToU8("private scan"),
  };
  photos.forEach((p) => {
    files[p.filename] = strToU8("photo");
  });
  const zip = zipSync(files);
  const fetchOriginal = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (() => {
    requests++;
    return Promise.resolve(
      new Response(new Uint8Array(zip).buffer, { status: 200 }),
    );
  }) as typeof fetch;
  try {
    const quelle = {
      zugang: {
        token: "synthetic",
        orgId: "synthetic",
        basis: "https://api.investagon.com",
        name: "Test",
        slot: "",
        platz: 1,
      },
      projektRoh: {},
      einheiten: [{ we: "1", propertyId: "uuid-1", roh: { photos } }],
    };
    const bericht = leererBildBericht();
    const fehler: string[] = [];
    const run = () =>
      uebernimmBilder({
        db: db as unknown as Parameters<typeof uebernimmBilder>[0]["db"],
        objektId: "obj-1",
        slug: "projekt-1",
        projektName: "Test",
        quelle,
        frist: Date.now() + 60_000,
        bericht,
        fehler,
      });
    assert(await run(), "Import muss vollständig sein");
    assert(fehler.length === 0, fehler.join("; "));
    assert(
      Boolean(rows.objekte[0].bild_url),
      "Objektkachel muss ein Titelbild erhalten",
    );
    assert(
      rows.wohnungs_bilder.length === 35,
      "Alle 35 Fotos statt 30 müssen ankommen",
    );
    assert(
      rows.wohnungs_dokumente.length === 2,
      "PDF und unbekannter Bildscan bleiben Dokumente",
    );
    assert(
      rows.wohnungs_dokumente.every((d) =>
        (d as { kategorie?: string }).kategorie === "wohnungsunterlagen"
      ),
      "Unterlagen einer Wohnung sind Wohnungsunterlagen, nicht pauschal intern",
    );
    assert(
      uploads.filter((u) => u.bucket === "investagon-dokumente").length === 2,
      "Dokumente gehören in privaten Speicher",
    );
    assert(
      uploads.filter((u) => u.bucket === "objekt-medien").length === 35,
      "Nur bestätigte Fotos öffentlich speichern",
    );
    assert(await run(), "Fortsetzung muss vollständig sein");
    assert(
      requests === 1,
      "Bereits abgeschlossenes Paket darf nicht erneut heruntergeladen werden",
    );
    assert(
      rows.wohnungs_bilder.length === 35 &&
        rows.wohnungs_dokumente.length === 2,
      "Keine Dubletten beim Wiederholen",
    );
    // Tatsächliche Antwortform laut Diagnose: Projektfotos als URLs, PDFs separat; ZIPs haben keine Fotos.
    const projektFotos = Array.from(
      { length: 11 },
      (_, i) => ({
        filename:
          `https://tool.investagon.com/uploads/properties/large/p-${i}.jpeg`,
        position: i,
      }),
    );
    const projektFiles = [{
      id: 101,
      filename: "https://tool.investagon.com/uploads/files/expose.pdf",
      title: "Exposé",
      original_filename: "expose.pdf",
    }];
    const wohnungsFiles = [{
      id: 102,
      filename: "https://tool.investagon.com/uploads/files/unit.pdf",
      title: "Grundriss",
      original_filename: "unit.pdf",
    }];
    const urls: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      assert(
        !new Headers(init?.headers).has("Authorization"),
        "Öffentliche Medien erhalten keine API-Zugangsdaten",
      );
      assert(
        !url.includes("documents.zip"),
        "Bei vollständigen Dateiadressen kein Paket mit geerbten Dubletten laden",
      );
      return Promise.resolve(
        new Response("fixture", {
          status: 200,
          headers: {
            "Content-Type": url.endsWith(".jpeg")
              ? "image/jpeg"
              : "application/pdf",
          },
        }),
      );
    }) as typeof fetch;
    const direkteQuelle = {
      ...quelle,
      projektRoh: {
        api_project_id: "project-uuid",
        photos: projektFotos,
        files: projektFiles,
      },
      einheiten: [{
        we: "1",
        propertyId: "uuid-1",
        roh: { photos: [], files: wohnungsFiles },
      }],
    };
    const direktBericht = leererBildBericht();
    const direktRun = () =>
      uebernimmBilder({
        db: db as unknown as Parameters<typeof uebernimmBilder>[0]["db"],
        objektId: "obj-1",
        slug: "projekt-1",
        projektName: "Test",
        quelle: direkteQuelle,
        frist: Date.now() + 60_000,
        bericht: direktBericht,
        fehler,
      });
    assert(await direktRun(), "Direkte Medien vollständig übernehmen");
    assert(
      rows.objekt_bilder.length === 11,
      "Elf Projektfotos müssen in der Objektgalerie stehen",
    );
    assert(
      rows.objekt_dokumente.length === 1,
      "Projekt-PDF muss dem Projekt gehören",
    );
    assert(
      rows.wohnungs_dokumente.length === 3,
      "Wohnungs-PDF ergänzt die zwei vorhandenen privaten Dokumente",
    );
    assert(urls.length === 13, "Elf Fotos und zwei Dokumente, kein ZIP");
    assert(await direktRun(), "Direkte Medien wiederholt prüfen");
    assert(
      urls.length === 13,
      "Bereits verarbeitete direkte Dateien nicht erneut laden",
    );
    assert(fehler.length === 0, fehler.join("; "));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

/** Nachbildung von Tabellen und Speicher, nur so weit `uebernimmBilder` sie braucht. */
function testDb(rows: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let filters: Record<string, unknown> = {};
      let action = "select";
      let values: Record<string, unknown> = {};
      let single = false;
      const query = {
        select: () => query,
        eq(k: string, v: unknown) {
          filters[k] = v;
          return query;
        },
        match(v: Record<string, unknown>) {
          filters = { ...filters, ...v };
          return query;
        },
        in: () => query,
        limit: () => query,
        single() {
          single = true;
          return query;
        },
        update(v: Record<string, unknown>) {
          action = "update";
          values = v;
          return query;
        },
        insert(v: Record<string, unknown>) {
          action = "insert";
          values = v;
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          const found = rows[table].filter((row) =>
            Object.entries(filters).every(([k, v]) => row[k] === v)
          );
          if (action === "insert") {
            rows[table].push({
              id: `${table}-${rows[table].length}`,
              ...values,
            });
          }
          if (action === "update") {
            found.forEach((row) => Object.assign(row, values));
          }
          return Promise.resolve(
            resolve({ data: single ? found[0] : found, error: null }),
          );
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          list: () => Promise.resolve({ data: [], error: null }),
          upload: () => Promise.resolve({ error: null }),
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://storage.example/${bucket}/${path}` },
          }),
        };
      },
    },
  } as unknown as Parameters<typeof uebernimmBilder>[0]["db"];
}

function leererBestand(): Record<string, Record<string, unknown>[]> {
  return {
    objekte: [{ id: "obj-1", meta: {} }],
    wohnungen: [{ id: "w-1", we_nr: "1", objekt_id: "obj-1" }],
    objekt_bilder: [],
    wohnungs_bilder: [],
    objekt_dokumente: [],
    wohnungs_dokumente: [],
  };
}

const PDF = "https://tool.investagon.com/uploads/files/";
const TAG = 24 * 60 * 60 * 1000;

function testQuelle() {
  return {
    zugang: {
      token: "synthetic",
      orgId: "synthetic",
      basis: "https://api.investagon.com",
      name: "Test",
      slot: "",
      platz: 1,
    },
    projektRoh: {
      api_project_id: "p-1",
      photos: Array.from({ length: 5 }, (_, i) => ({
        filename:
          `https://tool.investagon.com/uploads/properties/large/p-${i}.jpeg`,
        position: i,
      })),
      files: [{
        id: 201,
        filename: `${PDF}energieausweis.pdf`,
        title: "Energieausweis",
        original_filename: "energieausweis.pdf",
        updated_at: "2026-09-01T10:00:00+02:00",
      }] as Record<string, unknown>[],
    },
    einheiten: [{
      we: "1",
      propertyId: "e-1",
      roh: {
        photos: [],
        files: [{
          id: 202,
          filename: `${PDF}grundriss.pdf`,
          title: "Grundriss",
          original_filename: "grundriss.pdf",
          updated_at: "2026-09-01T10:00:00+02:00",
        }] as Record<string, unknown>[],
      },
    }],
  };
}

Deno.test("Unterlagen: vor den Fotos, in jedem Lauf geprüft, nicht jeden Tag neu geladen", async () => {
  const rows = leererBestand();
  const db = testDb(rows);
  const quelle = testQuelle();
  const geladen: string[] = [];
  let rumpfGelesen = false;
  const fetchOriginal = globalThis.fetch;
  const DateOriginal = Date;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    geladen.push(url);
    if (url.endsWith("riesig.pdf")) {
      // Der Kopf kuendigt die Groesse an. Den Rumpf zu lesen waere der Fehler.
      const rumpf = new ReadableStream<Uint8Array>({
        pull(steuerung) {
          rumpfGelesen = true;
          steuerung.enqueue(new Uint8Array(1));
          steuerung.close();
        },
      }, { highWaterMark: 0 });
      return Promise.resolve(
        new Response(rumpf, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(16 * 1024 * 1024),
          },
        }),
      );
    }
    return Promise.resolve(
      new Response("fixture", {
        status: 200,
        headers: {
          "Content-Type": url.endsWith(".jpeg")
            ? "image/jpeg"
            : "application/pdf",
        },
      }),
    );
  }) as typeof fetch;
  const lauf = async () => {
    const fehler: string[] = [];
    const bericht = leererBildBericht();
    const weiter = await uebernimmBilder({
      db,
      objektId: "obj-1",
      slug: "p-1",
      projektName: "Test",
      quelle,
      frist: Date.now() + 60_000,
      fehler,
      bericht,
    });
    assert(weiter, "Lauf muss vollständig sein");
    assert(fehler.length === 0, fehler.join("; "));
    return bericht;
  };
  const pdfs = () => geladen.filter((u) => u.endsWith(".pdf"));

  try {
    await lauf();
    assert(
      geladen.slice(0, 2).every((u) => u.endsWith(".pdf")),
      `Unterlagen müssen vor den Fotos geladen werden: ${geladen.join(", ")}`,
    );
    assert(rows.objekt_dokumente.length === 1, "Objektunterlage fehlt");
    assert(rows.wohnungs_dokumente.length === 1, "Wohnungsunterlage fehlt");

    // Am nächsten Tag: Die Fotos laufen wie bisher erneut durch, die schon
    // gespeicherten Unterlagen werden nur geprüft, nicht neu geladen.
    class Morgen extends DateOriginal {
      constructor(wert?: string | number) {
        super(wert ?? DateOriginal.now() + TAG);
      }
      static override now() {
        return DateOriginal.now() + TAG;
      }
    }
    globalThis.Date = Morgen as unknown as DateConstructor;
    await lauf();
    assert(
      pdfs().length === 2,
      `Unterlagen erneut geladen: ${pdfs().join(", ")}`,
    );
    assert(
      rows.objekt_dokumente.length === 1 &&
        rows.wohnungs_dokumente.length === 1,
      "Keine Dubletten am nächsten Tag",
    );
    globalThis.Date = DateOriginal;

    // Die Zeile verschwindet im CRM, etwa weil der Objektassistent die
    // Unterlagen neu geschrieben hat. Der nächste Lauf holt genau sie zurück.
    rows.objekt_dokumente.length = 0;
    await lauf();
    assert(
      rows.objekt_dokumente.length === 1,
      "Fehlende Objektunterlage nicht nachgezogen",
    );
    assert(
      pdfs().filter((u) => u.endsWith("energieausweis.pdf")).length === 2 &&
        pdfs().filter((u) => u.endsWith("grundriss.pdf")).length === 1,
      `Nur die fehlende Unterlage darf neu geladen werden: ${
        pdfs().join(", ")
      }`,
    );

    // Investagon liefert eine neue Unterlage: Sie kommt im nächsten Lauf.
    quelle.projektRoh.files.push({
      id: 203,
      filename: `${PDF}teilungserklaerung.pdf`,
      title: "Teilungserklärung",
      original_filename: "teilungserklaerung.pdf",
    });
    await lauf();
    assert(
      rows.objekt_dokumente.length === 2,
      "Neue Unterlage nicht übernommen",
    );

    // Eine zu große Unterlage bricht nichts ab und wird nicht ganz geladen.
    quelle.einheiten[0].roh.files.push({
      id: 204,
      filename: `${PDF}riesig.pdf`,
      title: "Riesig",
    });
    const bericht = await lauf();
    assert(bericht.fehlgeschlagen === 0, "Zu große Datei ist kein Fehlschlag");
    assert(!rumpfGelesen, "Rumpf einer angekündigt zu großen Datei gelesen");
    assert(rows.wohnungs_dokumente.length === 1, "Zu große Datei ohne Zeile");
  } finally {
    globalThis.fetch = fetchOriginal;
    globalThis.Date = DateOriginal;
  }
});

Deno.test("Unterlagen: kommen auch an, wenn das Zeitbudget nicht für alle Fotos reicht", async () => {
  const rows = leererBestand();
  const quelle = testQuelle();
  const fetchOriginal = globalThis.fetch;
  const nowOriginal = Date.now;
  // Jeder Abruf kostet zehn Sekunden. Das Budget reicht für drei Abrufe.
  let uhr = nowOriginal();
  const start = uhr;
  Date.now = () => uhr;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    uhr += 10_000;
    return Promise.resolve(
      new Response("fixture", {
        status: 200,
        headers: {
          "Content-Type": String(input).endsWith(".jpeg")
            ? "image/jpeg"
            : "application/pdf",
        },
      }),
    );
  }) as typeof fetch;
  try {
    const fehler: string[] = [];
    const weiter = await uebernimmBilder({
      db: testDb(rows),
      objektId: "obj-1",
      slug: "p-1",
      projektName: "Test",
      quelle,
      frist: start + 25_000,
      fehler,
      bericht: leererBildBericht(),
    });
    assert(!weiter, "Die Zeitgrenze muss den Lauf beenden");
    assert(rows.objekt_bilder.length < 5, "Nicht alle Fotos passen ins Budget");
    assert(
      rows.objekt_dokumente.length === 1 &&
        rows.wohnungs_dokumente.length === 1,
      "Beide Unterlagen müssen trotz knappen Budgets ankommen",
    );
  } finally {
    globalThis.fetch = fetchOriginal;
    Date.now = nowOriginal;
  }
});
