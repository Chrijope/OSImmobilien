import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";

/**
 * Handy-Scan-Seite, Listenansicht: Die in dieser Sitzung hochgeladenen
 * Dokumente stehen mit Haken in der Liste „Hochgeladen“, und „Sitzung
 * abschließen“ ist das letzte Element der Seite. Früher hing der Knopf als
 * fester Balken am unteren Rand und verdeckte das letzte Dokument.
 */

const TOKEN = "a".repeat(32);

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useParams: () => ({ token: TOKEN }) };
});

const rpc = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, storage: { from: () => ({ upload }) } },
}));

const getMobileScanSession = vi.hoisted(() => vi.fn());
const appendMobileScanUpload = vi.hoisted(() => vi.fn());
const completeMobileScanSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mobileScanSessions", () => ({
  getMobileScanSession,
  appendMobileScanUpload,
  completeMobileScanSession,
}));

import { MemoryRouter } from "react-router-dom";
import MobileScan from "./MobileScan";

const DOKUMENTE = ["Personalausweis", "Letzter Gehaltsnachweis", "Schufa-Bonitätsauskunft", "Nachweis Girokonto"];

function sitzung(uploads: string[]) {
  return {
    id: "s1",
    token: TOKEN,
    kontakt_id: "k1",
    investment_id: "i1",
    person: 1,
    block: "bonitaet",
    status: "offen",
    last_doc_typ: null,
    last_upload_at: null,
    meta: {
      docList: [...DOKUMENTE, "Arbeitsvertrag"],
      uploads: uploads.map((docTyp) => ({ docTyp, fileUrl: `x/${docTyp}.pdf`, pages: 1, at: "2026-09-25T10:00:00Z" })),
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    created_at: "2026-09-25T09:00:00Z",
    updated_at: "2026-09-25T09:00:00Z",
  };
}

async function oeffneListe(uploads: string[]) {
  getMobileScanSession.mockResolvedValue(sitzung(uploads));
  let ansicht!: ReturnType<typeof render>;
  await act(async () => {
    // Mit Router: Die Seite liest `?lang=` aus der Adresse (Kundensprache, Etappe 3).
    ansicht = render(<MemoryRouter><MobileScan /></MemoryRouter>);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Scan starten/ }));
  });
  return ansicht;
}

function hochgeladenListe() {
  const titel = screen.getByRole("heading", { name: "Hochgeladen" });
  return titel.closest("section") as HTMLElement;
}

async function pdfHochladen(ansicht: ReturnType<typeof render>, dokument: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(dokument) }));
  });
  const eingabe = ansicht.container.querySelector('input[type="file"]') as HTMLInputElement;
  const datei = new File(["%PDF-1.4"], "nachweis.pdf", { type: "application/pdf" });
  await act(async () => {
    fireEvent.change(eingabe, { target: { files: [datei] } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Kamera fehlt in jsdom, und der Fehlertest wirft absichtlich: beides meldet die Seite per console.error.
  vi.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockResolvedValue({ data: [], error: null });
  upload.mockResolvedValue({ error: null });
  appendMobileScanUpload.mockResolvedValue(undefined);
  completeMobileScanSession.mockResolvedValue(undefined);
});

describe("MobileScan, Liste „Hochgeladen“ und Abschluss", () => {
  it("zeigt jedes Dokument der Sitzung mit Haken, in der Reihenfolge des Hochladens", async () => {
    await oeffneListe(DOKUMENTE);
    const liste = hochgeladenListe();
    const zeilen = within(liste).getAllByRole("listitem");
    expect(zeilen.map((z) => z.textContent)).toEqual(DOKUMENTE);
    for (const zeile of zeilen) {
      expect(within(zeile).getByRole("img", { name: "Hochgeladen" })).toBeTruthy();
    }
    expect(within(liste).getByText("4 Dokumente in dieser Sitzung")).toBeTruthy();
  });

  it("„Sitzung abschließen“ ist das letzte Element, danach kommt nichts mehr", async () => {
    const ansicht = await oeffneListe(DOKUMENTE);
    const knopf = screen.getByRole("button", { name: /Sitzung abschließen/ });
    const seite = ansicht.container.querySelector('[data-lg="seite"]') as HTMLElement;

    // Vom Knopf bis zur Seitenhülle hat keine Ebene ein nachfolgendes Element.
    for (let el: HTMLElement | null = knopf; el && el !== seite; el = el.parentElement) {
      expect(el.nextElementSibling).toBeNull();
      expect(el.className).not.toMatch(/\b(fixed|sticky)\b/);
    }
    // Die Liste steht davor.
    const liste = hochgeladenListe();
    expect(liste.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hängt einen neuen Upload unten an die Liste und zeigt erst Laden, dann den Haken", async () => {
    let fertigMelden!: (w: { error: null }) => void;
    upload.mockReturnValueOnce(new Promise((res) => { fertigMelden = res; }));
    const ansicht = await oeffneListe(["Personalausweis"]);

    await pdfHochladen(ansicht, "Nachweis Girokonto");
    // Zurück zur Liste, während der Upload noch läuft.
    await act(async () => {
      fireEvent.click(ansicht.container.querySelector("header button") as HTMLElement);
    });
    let zeilen = within(hochgeladenListe()).getAllByRole("listitem");
    expect(zeilen.map((z) => z.textContent)).toEqual(["Personalausweis", "Nachweis GirokontoWird hochgeladen …"]);
    expect(within(zeilen[1]).getByRole("img", { name: "Wird hochgeladen" })).toBeTruthy();

    await act(async () => { fertigMelden({ error: null }); });
    zeilen = within(hochgeladenListe()).getAllByRole("listitem");
    expect(within(zeilen[1]).getByRole("img", { name: "Hochgeladen" })).toBeTruthy();
    expect(appendMobileScanUpload).toHaveBeenCalledWith(TOKEN, expect.objectContaining({ docTyp: "Nachweis Girokonto" }));
  });

  it("zeigt bei einem gescheiterten Upload den Fehler statt des Hakens", async () => {
    upload.mockResolvedValueOnce({ error: new Error("Netz weg") });
    const ansicht = await oeffneListe(["Personalausweis"]);

    await pdfHochladen(ansicht, "Nachweis Girokonto");
    await act(async () => {
      fireEvent.click(ansicht.container.querySelector("header button") as HTMLElement);
    });
    const zeilen = within(hochgeladenListe()).getAllByRole("listitem");
    expect(zeilen).toHaveLength(2);
    expect(within(zeilen[1]).getByRole("img", { name: "Fehlgeschlagen" })).toBeTruthy();
    expect(within(zeilen[1]).queryByRole("img", { name: "Hochgeladen" })).toBeNull();
    expect(zeilen[1].textContent).toMatch(/Hochladen fehlgeschlagen/);

    // Ein neuer, gelungener Versuch ersetzt die Fehlerzeile.
    await pdfHochladen(ansicht, "Nachweis Girokonto");
    const danach = within(hochgeladenListe()).getAllByRole("listitem");
    expect(danach).toHaveLength(2);
    expect(within(danach[1]).getByRole("img", { name: "Hochgeladen" })).toBeTruthy();
  });

  it("zeigt ohne Uploads dieser Sitzung keine leere Liste", async () => {
    await oeffneListe([]);
    expect(screen.queryByRole("heading", { name: "Hochgeladen" })).toBeNull();
  });
});
