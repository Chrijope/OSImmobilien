import { MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface PortalVp {
  name?: string;
  email?: string;
  avatar_url?: string;
}

interface Props {
  vp: PortalVp | null;
  compact?: boolean;
}

/**
 * Persönlicher VP-Anker: Avatar + Name + „Frag {Vorname}"-Chat-Button.
 * Wird oben im Portal-Header und optional unten auf jeder Seite gezeigt.
 */
export function PortalVpContact({ vp, compact }: Props) {
  const { t } = useTranslation();
  const firstName = (vp?.name || "").split(" ")[0] || "";
  const initials = (vp?.name || "VP")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (compact) {
    return (
      <Link
        to="/kunde/chat"
        className="group inline-flex items-center gap-2 text-sm hover:text-[hsl(var(--portal-akzent))] transition-colors"
        title={vp?.name ? t("portal.vp.chat_with", { name: vp.name }) : t("portal.vp.open_chat")}
      >
        <MessageCircle className="h-4 w-4 text-foreground/70 group-hover:text-[hsl(var(--portal-akzent))]" />
        <span className="hidden sm:inline">
          {firstName ? t("portal.vp.ask_first", { name: firstName }) : t("portal.vp.chat_short")}
        </span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <Avatar className="h-12 w-12 ring-2 ring-[hsl(var(--portal-akzent)/0.35)]">
        <AvatarImage src={vp?.avatar_url} alt={vp?.name || t("portal.vp.role")} />
        <AvatarFallback className="bg-[hsl(var(--portal-akzent))] text-[hsl(var(--primary-foreground))]">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wide text-foreground/50">
          {t("portal.vp.your_partner")}
        </div>
        <div className="font-medium truncate">{vp?.name || t("portal.vp.being_assigned")}</div>
      </div>
      <Link
        to="/kunde/chat"
        className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--portal-akzent))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))] hover:brightness-95 transition"
      >
        <MessageCircle className="h-4 w-4" />
        {firstName ? t("portal.vp.ask_first", { name: firstName }) : t("portal.vp.message")}
      </Link>
    </div>
  );
}