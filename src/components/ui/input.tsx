import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-input bg-card px-3.5 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow focus-visible:shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
          className,
        )}
        data-ui="field"
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
