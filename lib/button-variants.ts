import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none active:translate-y-px select-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_var(--primary)] hover:bg-[var(--hover)] hover:shadow-[0_10px_22px_-10px_var(--primary)]",
        outline:
          "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary aria-expanded:bg-secondary",
        secondary:
          "bg-secondary text-primary hover:bg-secondary/70 aria-expanded:bg-secondary/70",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive: "bg-destructive text-white hover:brightness-95",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "min-h-11 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "min-h-9 gap-1 px-2 text-xs in-data-[slot=button-group]:rounded-full has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-10 gap-1 px-4 text-sm in-data-[slot=button-group]:rounded-full has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        lg: "min-h-12 gap-2 px-7 text-base has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6",
        icon: "h-11 w-11",
        "icon-xs":
          "h-9 w-9 in-data-[slot=button-group]:rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "h-10 w-10 in-data-[slot=button-group]:rounded-full",
        "icon-lg": "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
