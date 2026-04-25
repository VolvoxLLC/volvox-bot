import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-[14px] text-sm font-bold tracking-tight transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_4px_12px_hsl(var(--primary)/0.25),inset_0_1px_1px_hsl(var(--primary-foreground)/0.3)] hover:brightness-110 ring-1 ring-primary-foreground/20',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_4px_12px_hsl(var(--destructive)/0.25),inset_0_1px_1px_hsl(var(--destructive-foreground)/0.3)] hover:bg-destructive/90',
        outline:
          'border border-border/40 bg-card/40 backdrop-blur-md shadow-sm hover:bg-muted/40 hover:border-border/60 text-foreground',
        secondary:
          'bg-muted/30 text-muted-foreground border border-border/20 shadow-inner hover:bg-muted/50 hover:text-foreground',
        ghost: 'hover:bg-primary/10 hover:text-primary',
        link: 'text-primary underline-offset-4 hover:underline',
        discord:
          'bg-[#5865F2] text-white shadow-[0_4px_12px_rgba(88,101,242,0.3),inset_0_1px_1px_rgba(255,255,255,0.2)] hover:bg-[#4752C4]',
      },
      size: {
        default: 'h-11 px-6 py-2',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-14 px-10 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
