import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";

/**
 * Kundenportal, Investment, Bereich „Bonität“: Lädt der Kunde über
 * „Hochladen“ selbst eine Unterlage hoch, blitzte für die Dauer des Uploads
 * „Wird von deinem Vertriebspartner freigeschaltet“ auf, bevor „In Prüfung“
 * kam. Ursache: Die Zeile wurde für den Upload über `disabled` gesperrt,
 * während ihr Status noch "none" war, und genau diese Kombination zeigt den
 * Schloss-Hinweis des Vertriebspartners.
 */

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  rpc: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: mocks.upload, remove: vi.fn(async () => ({ error: null })) }) },
    rpc: mocks.rpc,
    from: () => ({ insert: vi.fn(async () => ({ error: null })) }),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess, info: vi.fn() },
}));

vi.mock("@/components/MobileScanQRDialog", () => ({ MobileScanQRDialog: () => null }));

import i18n from "@/i18n";
import { BonitaetsSection } from "./KundeInvestments";

const VP_HINWEIS = "Wird von deinem Vertriebspartner freigeschaltet";

/** Ein Versprechen, das der Test selbst einlöst, um den Server anzuhalten. */
function angehalten<T>() {
  let einloesen!: (wert: T) => void;
  const versprechen = new Promise<T>((r) => { einloesen = r; });
  return { versprechen, einloesen };
}

const kontakt = { id: "k-1", vorname: "Anna", nachname: "Muster", zustaendig_id: null };

function zeige(invMeta: Record<string, unknown>) {
  return render(
    <BonitaetsSection
      inv={{ id: "inv-1", meta: invMeta }}
      invMeta={invMeta}
      kontakt={kontakt}
      kontaktMeta={{}}
      onRefresh={vi.fn()}
    />,
  );
}

const zeile = (name: string) => {
  const titel = screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === `${name}*`);
  return titel.closest(".border-b") as HTMLElement;
};

/** Wählt im versteckten Datei-Feld eine PDF aus, wie es der Dateidialog tut. */
async function waehlePdf() {
  const feld = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  expect(feld).not.toBeNull();
  const datei = new File(["%PDF-1.4"], "ausweis.pdf", { type: "application/pdf" });
  Object.defineProperty(feld, "files", { value: [datei] });
  await act(async () => { fireEvent.change(feld); });
}

/**
 * Hält jeden Text fest, der während des Tests je im Dokument stand. Auch ein
 * Knoten, der nach wenigen Millisekunden wieder verschwindet, behält seinen
 * Inhalt und landet hier.
 */
function zeichneTexteAuf() {
  const texte: string[] = [];
  const beobachter = new MutationObserver((eintraege) => {
    for (const e of eintraege) {
      e.addedNodes.forEach((n) => texte.push(n.textContent || ""));
      if (e.type === "characterData") texte.push(e.oldValue || "", e.target.textContent || "");
    }
  });
  beobachter.observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
  return { texte, beenden: () => { beobachter.takeRecords().forEach((e) => e.addedNodes.forEach((n) => texte.push(n.textContent || ""))); beobachter.disconnect(); } };
}

beforeAll(async () => {
  await i18n.changeLanguage("de");
});

beforeEach(() => {
  mocks.upload.mockReset();
  mocks.rpc.mockReset();
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
});

afterEach(() => {
  document.body.querySelectorAll('input[type="file"]').forEach((n) => n.remove());
});

describe("Kundenportal, Bonität: Upload durch den Kunden", () => {
  it("zeigt sofort „In Prüfung“ und zu keinem Zeitpunkt den Freigabe-Hinweis des Vertriebspartners", async () => {
    const speicher = angehalten<{ error: null }>();
    const eintrag = angehalten<{ error: null }>();
    mocks.upload.mockReturnValue(speicher.versprechen);
    mocks.rpc.mockReturnValue(eintrag.versprechen);

    zeige({ unterlagenFreigeschaltet: true, docStatuses: {} });
    expect(within(zeile("Personalausweis")).getByText("Fehlt")).toBeInTheDocument();

    const aufnahme = zeichneTexteAuf();
    fireEvent.click(within(zeile("Personalausweis")).getByRole("button", { name: /Hochladen/ }));
    await waehlePdf();

    // Datei unterwegs, der Server hat noch nicht geantwortet.
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(within(zeile("Personalausweis")).getByText("In Prüfung")).toBeInTheDocument();
    expect(within(zeile("Personalausweis")).queryByText(VP_HINWEIS)).toBeNull();
    expect(within(zeile("Personalausweis")).queryByText("Fehlt")).toBeNull();

    // Speicher fertig, Eintrag in der Datenbank steht noch aus.
    await act(async () => { speicher.einloesen({ error: null }); });
    expect(mocks.rpc).toHaveBeenCalledWith("register_unterlage_upload", expect.objectContaining({ _doc_name: "Personalausweis" }));
    expect(within(zeile("Personalausweis")).getByText("In Prüfung")).toBeInTheDocument();
    expect(within(zeile("Personalausweis")).queryByText(VP_HINWEIS)).toBeNull();

    // Alles gespeichert.
    await act(async () => { eintrag.einloesen({ error: null }); });
    expect(within(zeile("Personalausweis")).getByText("In Prüfung")).toBeInTheDocument();
    expect(within(zeile("Personalausweis")).getByRole("button", { name: /Ersetzen/ })).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalled();

    aufnahme.beenden();
    expect(aufnahme.texte.some((t) => t.includes(VP_HINWEIS))).toBe(false);
  });

  it("geht bei einem Fehler zurück auf „Fehlt“ und meldet den Fehler", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "Netz weg" } });

    zeige({ unterlagenFreigeschaltet: true, docStatuses: {} });
    fireEvent.click(within(zeile("Personalausweis")).getByRole("button", { name: /Hochladen/ }));
    await waehlePdf();

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("Netz weg"));
    expect(within(zeile("Personalausweis")).getByText("Fehlt")).toBeInTheDocument();
    expect(within(zeile("Personalausweis")).queryByText("In Prüfung")).toBeNull();
    expect(within(zeile("Personalausweis")).getByRole("button", { name: /Hochladen/ })).toBeInTheDocument();
  });

  it("geht zurück, wenn der Eintrag in der Datenbank scheitert", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ error: { message: "keine Berechtigung" } });

    zeige({ unterlagenFreigeschaltet: true, docStatuses: {} });
    fireEvent.click(within(zeile("Personalausweis")).getByRole("button", { name: /Hochladen/ }));
    await waehlePdf();

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("keine Berechtigung"));
    expect(within(zeile("Personalausweis")).getByText("Fehlt")).toBeInTheDocument();
    expect(within(zeile("Personalausweis")).queryByText("In Prüfung")).toBeNull();
  });

  it("lässt den Hinweis bei Unterlagen stehen, die der Vertriebspartner wirklich noch freischalten muss", () => {
    zeige({ unterlagenFreigeschaltet: false, docStatuses: {} });
    // Personalausweis ist von Anfang an offen, weitere Gehaltsnachweise erst nach der Freischaltung.
    expect(within(zeile("Personalausweis")).queryByText(VP_HINWEIS)).toBeNull();
    expect(within(zeile("Vorletzter Gehaltsnachweis")).getByText(VP_HINWEIS)).toBeInTheDocument();
  });
});
