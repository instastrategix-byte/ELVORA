import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,filter] duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gold text-accent-fg shadow-[0_1px_0_rgb(255_255_255/0.35)_inset,0_10px_24px_-12px_var(--glow)] hover:brightness-110 hover:shadow-[0_1px_0_rgb(255_255_255/0.35)_inset,0_14px_32px_-10px_var(--glow)]",
        secondary: "bg-surface-2 text-fg hover:bg-surface-3",
        outline: "border border-border-strong bg-surface/40 text-fg backdrop-blur hover:border-accent hover:text-accent",
        ghost: "text-fg hover:bg-surface-2",
        danger: "bg-danger text-white hover:opacity-90",
        link: "rounded-none px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3.5 text-sm",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), variant === "link" && "h-auto px-0", className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
