/**
 * Client-side image compression using Canvas API.
 * - WebP preferred (JPEG fallback)
 * - EXIF stripped automatically via Canvas re-render
 * - Two variants: compressed (standard delivery) + original (on-demand)
 */

export interface CompressedImage {
  /** Small thumbnail data URL for previews / listings */
  thumbnailDataUrl: string;
  /** Original file (or lightly compressed) for full-size upload */
  originalFile: File;
}

export type ImagePreset = "standard" | "thumbnail" | "avatar" | "logo";

interface PresetConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

const PRESETS: Record<ImagePreset, PresetConfig> = {
  standard:  { maxWidth: 1920, maxHeight: 1920, quality: 0.75 },
  thumbnail: { maxWidth: 400,  maxHeight: 400,  quality: 0.70 },
  avatar:    { maxWidth: 600,  maxHeight: 600,  quality: 0.75 },
  logo:      { maxWidth: 800,  maxHeight: 800,  quality: 0.80 },
};

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;

function isImageLikeFile(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_EXTENSION_RE.test(file.name || "");
}

function isHeicLikeFile(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || "");
}

async function convertHeicToJpegFile(file: File): Promise<File> {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const baseName = (file.name || "image").replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

/** Check if browser supports WebP encoding */
let _supportsWebP: boolean | null = null;
function supportsWebP(): boolean {
  if (_supportsWebP !== null) return _supportsWebP;
  try {
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    _supportsWebP = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    _supportsWebP = false;
  }
  return _supportsWebP;
}

function getOutputFormat(): { mime: string; ext: string } {
  return supportsWebP()
    ? { mime: "image/webp", ext: "webp" }
    : { mime: "image/jpeg", ext: "jpg" };
}

/**
 * Compress an image file using Canvas (strips EXIF automatically).
 * Returns a compressed File ready for upload.
 */
export function compressToFile(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<File> {
  return new Promise(async (resolve) => {
    if (isHeicLikeFile(file)) {
      try {
        const jpeg = await convertHeicToJpegFile(file);
        resolve(await compressToFile(jpeg, maxWidth, maxHeight, quality));
        return;
      } catch {
        resolve(file);
        return;
      }
    }

    // Non-image files pass through
    if (!isImageLikeFile(file)) {
      resolve(file);
      return;
    }

    const drawAndEncode = (source: CanvasImageSource, w: number, h: number) => {
      if (w > maxWidth || h > maxHeight) {
        const ratio = Math.min(maxWidth / w, maxHeight / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, w, h);
      const { mime, ext } = getOutputFormat();
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size === 0) { resolve(file); return; }
          if (blob.size >= file.size) { resolve(file); return; }
          const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
          const compressedFile = new File([blob], `${baseName}.${ext}`, { type: mime });
          if (compressedFile.size === 0) { resolve(file); return; }
          resolve(compressedFile);
        },
        mime,
        quality,
      );
    };

    // Prefer createImageBitmap (decodes HEIC on Safari, AVIF, large images more efficiently).
    if (typeof createImageBitmap === "function") {
      createImageBitmap(file)
        .then((bmp) => {
          try { drawAndEncode(bmp, bmp.width, bmp.height); }
          finally { try { bmp.close?.(); } catch { /* noop */ } }
        })
        .catch(() => loadViaImg());
      return;
    }
    loadViaImg();

    function loadViaImg() {
      const img = new Image();
      const src = URL.createObjectURL(file);
      img.onload = () => {
        try { drawAndEncode(img, img.width, img.height); }
        finally { URL.revokeObjectURL(src); }
      };
      img.onerror = () => { URL.revokeObjectURL(src); resolve(file); };
      img.src = src;
    }
  });
}

/**
 * Compress an image for upload with a named preset.
 * Returns { compressed, original } - compressed for standard delivery, original for on-demand.
 */
export async function compressForUpload(
  file: File,
  preset: ImagePreset = "standard"
): Promise<{ compressed: File; original: File; thumbnailDataUrl: string }> {
  const config = PRESETS[preset];
  const thumbConfig = PRESETS.thumbnail;

  // Generate compressed version
  const compressed = await compressToFile(file, config.maxWidth, config.maxHeight, config.quality);

  // Generate thumbnail data URL for instant preview
  const thumbnailDataUrl = await createThumbnailDataUrl(
    file, thumbConfig.maxWidth, thumbConfig.maxHeight, thumbConfig.quality
  );

  return {
    compressed,
    original: file,
    thumbnailDataUrl,
  };
}

/**
 * Batch compress multiple files.
 */
export async function compressForUploadBatch(
  files: File[],
  preset: ImagePreset = "standard",
  onProgress?: (done: number, total: number) => void
): Promise<Array<{ compressed: File; original: File; thumbnailDataUrl: string }>> {
  const results: Array<{ compressed: File; original: File; thumbnailDataUrl: string }> = [];
  for (let i = 0; i < files.length; i++) {
    results.push(await compressForUpload(files[i], preset));
    onProgress?.(i + 1, files.length);
  }
  return results;
}

/**
 * Re-encode beliebige Bilder zu einem **quadratisch zentriert beschnittenen** Avatar.
 * - Lädt das Bild via <img> (decodiert PNG/JPEG/WebP/GIF; HEIC wird vom Browser
 *   meist NICHT decodiert und löst onerror aus → klare Exception).
 * - Center-Crop auf das kleinere Seitenmaß → Hochformat/Querformat sehen rund/quadratisch gut aus.
 * - Skaliert auf maximal `size` Pixel (default 512) und exportiert WebP (bzw. JPEG-Fallback).
 * - Strippt EXIF, garantiert kleine, browser-darstellbare Datei.
 */
export function compressToSquareAvatar(file: File, size = 512, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file || file.size === 0) {
      reject(new Error("Datei ist leer."));
      return;
    }
    // Bewusst KEINE strikte MIME-/Endungs-Prüfung mehr: iPhones, Scanner,
    // Drittprogramme liefern manchmal leere oder exotische MIME-Typen
    // (z.B. "application/octet-stream") für völlig valide Bilder. Wir
    // versuchen einfach zu decodieren – schlägt das fehl, kommt eine
    // verständliche Fehlermeldung. So sind faktisch alle Dateiformate
    // zulässig, die der Browser (oder unser HEIC-Fallback) lesen kann.
    const nameLower = (file.name || "").toLowerCase();

    const finishFromCanvas = (canvas: HTMLCanvasElement) => {
      const { mime, ext } = getOutputFormat();
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size === 0) { reject(new Error("Bild konnte nicht konvertiert werden.")); return; }
          const baseName = (file.name.replace(/\.[^.]+$/, "") || "avatar").replace(/[^a-zA-Z0-9_-]/g, "_");
          resolve(new File([blob], `${baseName}.${ext}`, { type: mime }));
        },
        mime,
        quality,
      );
    };

    const drawSquare = (source: CanvasImageSource, w: number, h: number) => {
      const srcSize = Math.min(w, h);
      if (!srcSize) { reject(new Error("Bild konnte nicht gelesen werden.")); return; }
      const sx = Math.round((w - srcSize) / 2);
      const sy = Math.round((h - srcSize) / 2);
      const targetSize = Math.min(size, srcSize);
      const canvas = document.createElement("canvas");
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas nicht verfügbar.")); return; }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, sx, sy, srcSize, srcSize, 0, 0, targetSize, targetSize);
      finishFromCanvas(canvas);
    };

    const isHeic =
      /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(nameLower);

    // HEIC/HEIF: zuerst per heic2any in JPEG umwandeln, dann normal verarbeiten.
    const convertHeicAndRetry = async () => {
      try {
        const { default: heic2any } = await import("heic2any");
        const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        const jpegFile = new File(
          [blob],
          (file.name.replace(/\.[^.]+$/, "") || "avatar") + ".jpg",
          { type: "image/jpeg" },
        );
        if (typeof createImageBitmap === "function") {
          try {
            const bmp = await createImageBitmap(jpegFile);
            try { drawSquare(bmp, bmp.width, bmp.height); }
            finally { try { bmp.close?.(); } catch { /* noop */ } }
            return;
          } catch { /* fallthrough */ }
        }
        const img = new Image();
        const src = URL.createObjectURL(jpegFile);
        img.onload = () => { URL.revokeObjectURL(src); drawSquare(img, img.width, img.height); };
        img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("Konvertiertes HEIC konnte nicht gelesen werden.")); };
        img.src = src;
      } catch (e: any) {
        reject(new Error("HEIC-Foto konnte nicht konvertiert werden. Bitte als JPG oder PNG exportieren. (" + (e?.message || e) + ")"));
      }
    };

    if (isHeic) {
      void convertHeicAndRetry();
      return;
    }

    // 1) Versuche createImageBitmap (entschlüsselt HEIC auf Safari, AVIF/große Bilder effizienter).
    if (typeof createImageBitmap === "function") {
      createImageBitmap(file)
        .then((bmp) => {
          try { drawSquare(bmp, bmp.width, bmp.height); }
          finally { try { bmp.close?.(); } catch { /* noop */ } }
        })
        .catch(() => loadViaImgTag());
      return;
    }
    loadViaImgTag();

    function loadViaImgTag() {
      const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      try {
          URL.revokeObjectURL(src);
          drawSquare(img, img.width, img.height);
      } catch (e: any) {
        URL.revokeObjectURL(src);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      // Letzter Fallback: vielleicht ist es doch ein HEIC ohne korrekten MIME/Endung.
      void convertHeicAndRetry();
    };
    img.src = src;
    }
  });
}

// ── Legacy API (backwards compatible) ──

export interface CompressedImageLegacy {
  thumbnailDataUrl: string;
  originalFile: File;
}

/**
 * @deprecated Use compressForUpload instead
 */
export async function compressImage(
  file: File,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<CompressedImageLegacy> {
  const { maxWidth = 400, maxHeight = 400, quality = 0.7 } = options || {};
  const thumbnailDataUrl = await createThumbnailDataUrl(file, maxWidth, maxHeight, quality);
  return { thumbnailDataUrl, originalFile: file };
}

/**
 * Sofort-Komprimierung für Wizards/Drafts:
 * - Erzeugt sowohl ein kleines Thumbnail (für UI-Preview)
 *   als auch eine komprimierte Vollversion (für IndexedDB-Draft + späteren Upload).
 * - HEIC/AVIF/Großbilder werden via createImageBitmap dekodiert.
 * - Nicht-Bilddateien werden unverändert zurückgegeben.
 */
export async function compressImageImmediate(
  file: File,
  preset: ImagePreset = "standard",
): Promise<{ thumbnailDataUrl: string; originalFile: File }> {
  if (!isImageLikeFile(file)) {
    // Non-image: just return as-is with a generic placeholder thumb
    return { thumbnailDataUrl: URL.createObjectURL(file), originalFile: file };
  }
  const workingFile = isHeicLikeFile(file) ? await convertHeicToJpegFile(file) : file;
  const config = PRESETS[preset];
  const compressed = await compressToFile(workingFile, config.maxWidth, config.maxHeight, config.quality);
  const thumb = PRESETS.thumbnail;
  const thumbnailDataUrl = await createThumbnailDataUrl(compressed, thumb.maxWidth, thumb.maxHeight, thumb.quality);
  return { thumbnailDataUrl, originalFile: compressed };
}

/**
 * Create a compressed thumbnail data URL from a File.
 */
export function createThumbnailDataUrl(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Guard: empty file → fall back to FileReader (which will also fail gracefully)
    if (!file || file.size === 0) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;

      if (w > maxWidth || h > maxHeight) {
        const ratio = Math.min(maxWidth / w, maxHeight / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(URL.createObjectURL(file));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const { mime } = getOutputFormat();
      const dataUrl = canvas.toDataURL(mime, quality);
      URL.revokeObjectURL(img.src);
      // Guard: dataURL may be tiny/empty on failure → fall back to original blob URL
      if (!dataUrl || dataUrl.length < 100) {
        resolve(URL.createObjectURL(file));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * @deprecated Use compressForUploadBatch instead
 */
export async function compressImages(
  files: File[],
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<CompressedImageLegacy[]> {
  return Promise.all(files.map(f => compressImage(f, options)));
}
