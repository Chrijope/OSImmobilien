import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Extra classes for the wrapper div */
  wrapperClassName?: string;
  /** High-res original URL – loaded only in lightbox */
  originalSrc?: string;
  /** Enable click-to-zoom lightbox */
  enableLightbox?: boolean;
  /**
   * Eager-load: lädt das Bild sofort (kein lazy), zeigt es direkt ohne
   * Skeleton/Fade. Browser-Cache greift beim erneuten Aufruf der Seite,
   * sodass Bilder dann ohne sichtbare Ladezeit erscheinen.
   */
  priority?: boolean;
}

/**
 * Drop-in <img> replacement with:
 * - native lazy loading
 * - skeleton placeholder while loading
 * - fade-in transition on load
 * - optional lightbox for original/full-res images
 */
export function LazyImage({
  src,
  alt = "",
  className,
  wrapperClassName,
  originalSrc,
  enableLightbox = false,
  priority = false,
  ...props
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(priority);
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => {
    setLoaded(true);
    setError(true);
  }, []);

  const canOpenLightbox = enableLightbox && (originalSrc || src) && !error;

  return (
    <>
      <div
        className={cn("relative overflow-hidden", canOpenLightbox && "cursor-zoom-in", wrapperClassName)}
        onClick={canOpenLightbox ? () => setLightboxOpen(true) : undefined}
      >
        {/* Skeleton shown until image loads – nicht im priority-Modus */}
        {!loaded && !priority && (
          <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
        )}

        {!error ? (
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding={priority ? "sync" : "async"}
            {...(priority ? { fetchpriority: "high" as any } : {})}
            onLoad={handleLoad}
            onError={handleError}
            className={cn(
              !priority && "transition-opacity duration-300",
              !priority && (loaded ? "opacity-100" : "opacity-0"),
              className
            )}
            {...props}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <span className="text-muted-foreground text-xs">Bild nicht verfügbar</span>
          </div>
        )}
      </div>

      {/* Lightbox – loads original only when opened */}
      {canOpenLightbox && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 flex items-center justify-center bg-black/95 border-none">
            <img
              src={originalSrc || src}
              alt={alt}
              className="max-w-full max-h-[90vh] object-contain rounded"
              loading="eager"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
