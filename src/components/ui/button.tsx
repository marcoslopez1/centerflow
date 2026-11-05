import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Material 3 button family: filled, tonal, outlined, text, elevated, FAB.
const buttonVariants = cva(
  "state-layer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-[0.1px] cursor-pointer transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:shadow-elevation-1",
        tonal: "bg-secondary text-secondary-foreground hover:shadow-elevation-1",
        destructive: "bg-destructive text-destructive-foreground hover:shadow-elevation-1",
        outline: "border border-outline bg-transparent text-primary",
        secondary: "bg-secondary text-secondary-foreground",
        elevated: "bg-surface-low text-primary shadow-elevation-1 hover:shadow-elevation-2",
        ghost: "text-foreground",
        text: "text-primary",
        link: "text-primary underline-offset-4 hover:underline",
        fab: "rounded-2xl bg-primary-container text-on-primary-container shadow-elevation-3",
      },
      size: {
        default: "h-10 px-6",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-8",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-xs": "h-6 w-6",
        fab: "h-14 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
