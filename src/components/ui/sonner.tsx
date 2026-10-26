import { Toaster as Sonner, toast } from "sonner";
import { useOptionalUser } from "@/contexts/UserContext";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/*
 * Die einzige Ausgabe für Rückmeldungen (A5, 26.10.2026): eine Glaskapsel
 * oben in der Mitte, wie Hinweise unter iOS. Hell und Dunkel folgen dem CRM
 * (`darkMode` aus dem UserContext), nicht der Systemeinstellung; vorher hing
 * das an `next-themes`, das hier nie eingerichtet war. Das Glas selbst setzt
 * `styles/design-liquid.css`, Abschnitt 7.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const dunkel = useOptionalUser()?.darkMode ?? false;

  return (
    <Sonner
      theme={dunkel ? "dark" : "light"}
      position="top-center"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
