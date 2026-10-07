import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { forwardRef, useCallback, useContext } from "react";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/routePrefetch";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, onMouseEnter, onClick, ...props }, ref) => {
    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (typeof to === "string") {
          prefetchRoute(to);
        }
        if (onMouseEnter) {
          (onMouseEnter as any)(e);
        }
      },
      [to, onMouseEnter],
    );

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        // Close mobile sidebar on navigation
        if (window.innerWidth < 768) {
          // Dispatch a custom event that the sidebar listens for
          window.dispatchEvent(new CustomEvent("sidebar-close-mobile"));
        }
        if (onClick) {
          (onClick as any)(e);
        }
      },
      [onClick],
    );

    return (
      <RouterNavLink
        ref={ref}
        to={to}
        onMouseEnter={handleMouseEnter}
        onClick={handleClick}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
