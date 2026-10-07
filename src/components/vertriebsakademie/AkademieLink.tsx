import { forwardRef } from "react";
import { Link, type LinkProps, useLocation } from "react-router-dom";
import { akademieZiel } from "@/lib/vertriebsakademieAnsicht";
/** Internal academy links stay in the chosen view; CRM destinations are unchanged. */
export const AkademieLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function AkademieLink({ to, ...props }, ref) {
    const { pathname } = useLocation();
    const target =
      typeof to === "string"
        ? akademieZiel(to, pathname)
        : {
            ...to,
            pathname: to.pathname
              ? akademieZiel(to.pathname, pathname)
              : to.pathname,
          };
    return <Link {...props} to={target} ref={ref} />;
  },
);
