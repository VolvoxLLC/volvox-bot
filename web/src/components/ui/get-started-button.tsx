import { Bot, type LucideIcon } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GetStartedButtonProps extends Omit<ButtonProps, 'children' | 'asChild'> {
  /** Button label text. */
  label?: string;
  /** Lucide icon component shown in the swiper circle. Defaults to Bot. */
  icon?: LucideIcon;
  /** When provided, renders as an anchor tag instead of a button. */
  href?: string;
  /** When true, uses Next.js-style internal link (no target="_blank"). */
  internal?: boolean;
}

/**
 * Animated swiper-style button with a sliding icon reveal on hover.
 * Wraps the shadcn Button so all variant/size props are supported.
 */
export function GetStartedButton({
  label = 'Add to Discord — Free',
  icon: Icon = Bot,
  href,
  internal = false,
  className,
  ...props
}: GetStartedButtonProps) {
  const inner = (
    <>
      <span className="mr-8 transition-opacity duration-500 group-hover:opacity-0">{label}</span>
      <i className="absolute right-1.5 top-1.5 bottom-1.5 rounded-full z-10 grid w-10 place-items-center transition-all duration-500 bg-white/20 group-hover:w-[calc(100%-0.75rem)] group-hover:bg-white/10 group-active:scale-95">
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </i>
    </>
  );

  if (href) {
    return (
      <Button
        className={cn('group relative overflow-hidden', className)}
        size="lg"
        asChild
        {...props}
      >
        <a
          href={href}
          {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        >
          {inner}
        </a>
      </Button>
    );
  }

  return (
    <Button className={cn('group relative overflow-hidden', className)} size="lg" {...props}>
      {inner}
    </Button>
  );
}
