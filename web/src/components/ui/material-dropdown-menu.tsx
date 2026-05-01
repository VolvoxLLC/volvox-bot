'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

// --- 0. DRILL-DOWN CONTEXT ENGINE ---
type DrilldownContextType = {
  activePage: string;
  history: string[];
  navigate: (page: string) => void;
  goBack: () => void;
  menuHeight: number;
  setMenuHeight: (h: number) => void;
};

const DrilldownContext = React.createContext<DrilldownContextType | null>(null);

// --- 1. INTERNAL RIPPLE ENGINE ---
const MINIMUM_PRESS_MS = 300;
const INITIAL_ORIGIN_SCALE = 0.2;
const PADDING = 10;
const SOFT_EDGE_MINIMUM_SIZE = 75;
const SOFT_EDGE_CONTAINER_RATIO = 0.35;
const ANIMATION_FILL = 'forwards';
const EASING_STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';

const useInternalRipple = (disabled = false) => {
  const [pressed, setPressed] = React.useState(false);
  const surfaceRef = React.useRef<HTMLElement>(null);
  const rippleRef = React.useRef<HTMLDivElement>(null);
  const growAnimationRef = React.useRef<Animation | null>(null);

  const startPressAnimation = (event?: React.PointerEvent | React.KeyboardEvent) => {
    if (disabled || !surfaceRef.current || !rippleRef.current) return;
    setPressed(true);
    growAnimationRef.current?.cancel();

    const rect = surfaceRef.current.getBoundingClientRect();
    const maxDim = Math.max(rect.width, rect.height);
    const softEdgeSize = Math.max(SOFT_EDGE_CONTAINER_RATIO * maxDim, SOFT_EDGE_MINIMUM_SIZE);
    const initialSize = Math.floor(maxDim * INITIAL_ORIGIN_SCALE);
    const hypotenuse = Math.sqrt(rect.width ** 2 + rect.height ** 2);
    const maxRadius = hypotenuse + PADDING;
    const duration = Math.min(Math.max(400, hypotenuse * 1.5), 1000);
    const scale = (maxRadius + softEdgeSize) / initialSize;

    const endPoint = { x: (rect.width - initialSize) / 2, y: (rect.height - initialSize) / 2 };
    let startPoint = endPoint;
    if (event && 'clientX' in event) {
      startPoint = {
        x: (event as React.PointerEvent).clientX - rect.left - initialSize / 2,
        y: (event as React.PointerEvent).clientY - rect.top - initialSize / 2,
      };
    }

    rippleRef.current.style.width = `${initialSize}px`;
    rippleRef.current.style.height = `${initialSize}px`;

    if (typeof rippleRef.current.animate !== 'function') {
      rippleRef.current.style.transform = `translate(${endPoint.x}px, ${endPoint.y}px) scale(${scale})`;
      return;
    }

    growAnimationRef.current = rippleRef.current.animate(
      [
        { transform: `translate(${startPoint.x}px, ${startPoint.y}px) scale(1)` },
        { transform: `translate(${endPoint.x}px, ${endPoint.y}px) scale(${scale})` },
      ],
      { duration, easing: EASING_STANDARD, fill: ANIMATION_FILL },
    );
  };

  const endPressAnimation = async () => {
    const animation = growAnimationRef.current;
    if (
      animation &&
      typeof animation.currentTime === 'number' &&
      animation.currentTime < MINIMUM_PRESS_MS
    ) {
      await new Promise((r) => setTimeout(r, MINIMUM_PRESS_MS - (animation.currentTime as number)));
    }
    setPressed(false);
  };

  return {
    surfaceRef,
    rippleRef,
    pressed,
    events: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button === 0) startPressAnimation(e);
      },
      onPointerUp: endPressAnimation,
      onPointerLeave: endPressAnimation,
      onPointerCancel: endPressAnimation,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          startPressAnimation();
          setTimeout(endPressAnimation, MINIMUM_PRESS_MS);
        }
      },
    },
  };
};

const RippleLayer = React.forwardRef<
  HTMLElement,
  { pressed: boolean; rippleRef: React.RefObject<HTMLDivElement | null> }
>(({ pressed, rippleRef }, ref) => (
  <div
    ref={(node) => {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
    }}
    className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none z-0"
  >
    <div className="absolute inset-0 bg-current opacity-0 transition-opacity duration-200 group-hover:opacity-[0.08] group-data-[highlighted]:opacity-[0.08]" />
    <div
      ref={rippleRef}
      className="absolute rounded-full opacity-0 bg-current"
      style={{
        background:
          'radial-gradient(closest-side, currentColor max(calc(100% - 70px), 65%), transparent 100%)',
        transition: 'opacity 375ms linear',
        opacity: pressed ? '0.12' : '0',
        transitionDuration: pressed ? '100ms' : '375ms',
      }}
    />
  </div>
));

// --- 2. SSR COMPATIBLE CINEMATIC STYLES ---
const M3Styles = () => (
  <style>{`
    /* --- OPENING SWEEPS --- */
    @keyframes m3-sweep-down { 0% { clip-path: inset(0 0 100% 0 round var(--m3-menu-radius, 24px)); } 100% { clip-path: inset(0 0 0 0 round var(--m3-menu-radius, 24px)); } }
    @keyframes m3-sweep-up { 0% { clip-path: inset(100% 0 0 0 round var(--m3-menu-radius, 24px)); } 100% { clip-path: inset(0 0 0 0 round var(--m3-menu-radius, 24px)); } }
    @keyframes m3-sweep-right { 0% { clip-path: inset(0 100% 0 0 round var(--m3-menu-radius, 24px)); } 100% { clip-path: inset(0 0 0 0 round var(--m3-menu-radius, 24px)); } }
    @keyframes m3-sweep-left { 0% { clip-path: inset(0 0 0 100% round var(--m3-menu-radius, 24px)); } 100% { clip-path: inset(0 0 0 0 round var(--m3-menu-radius, 24px)); } }
    
    /* --- CLOSING SWEEPS (Symmetrical Reverse) --- */
    @keyframes m3-sweep-out-up { 0% { clip-path: inset(0 0 0 0 round var(--m3-menu-radius, 24px)); opacity: 1; } 100% { clip-path: inset(0 0 100% 0 round var(--m3-menu-radius, 24px)); opacity: 0; } }
    @keyframes m3-sweep-out-down { 0% { clip-path: inset(0 0 0 0 round var(--m3-menu-radius, 24px)); opacity: 1; } 100% { clip-path: inset(100% 0 0 0 round var(--m3-menu-radius, 24px)); opacity: 0; } }
    @keyframes m3-sweep-out-left { 0% { clip-path: inset(0 0 0 0 round var(--m3-menu-radius, 24px)); opacity: 1; } 100% { clip-path: inset(0 100% 0 0 round var(--m3-menu-radius, 24px)); opacity: 0; } }
    @keyframes m3-sweep-out-right { 0% { clip-path: inset(0 0 0 0 round var(--m3-menu-radius, 24px)); opacity: 1; } 100% { clip-path: inset(0 0 0 100% round var(--m3-menu-radius, 24px)); opacity: 0; } }

    /* --- ITEM ANIMATIONS --- */
    @keyframes m3-item-cinematic { 
      0% { opacity: 0; transform: translateY(8px) scale(0.98); filter: blur(4px); } 
      100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } 
    }
    @keyframes m3-item-exit { 
      0% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } 
      100% { opacity: 0; transform: translateY(4px) scale(0.95); filter: blur(2px); } 
    }

    /* --- CONTENT STATE MAPPING --- */
    .m3-content[data-state="open"] { opacity: 1; }
    .m3-content[data-state="closed"] { opacity: 0; transition: opacity 200ms linear; }

    .m3-content[data-state="open"][data-side="bottom"] { animation: m3-sweep-down 400ms cubic-bezier(0.1, 0.8, 0.2, 1) forwards; }
    .m3-content[data-state="open"][data-side="top"] { animation: m3-sweep-up 400ms cubic-bezier(0.1, 0.8, 0.2, 1) forwards; }
    .m3-content[data-state="open"][data-side="right"] { animation: m3-sweep-right 400ms cubic-bezier(0.1, 0.8, 0.2, 1) forwards; }
    .m3-content[data-state="open"][data-side="left"] { animation: m3-sweep-left 400ms cubic-bezier(0.1, 0.8, 0.2, 1) forwards; }

    .m3-content[data-state="closed"][data-side="bottom"] { animation: m3-sweep-out-up 300ms cubic-bezier(0.4, 0, 1, 1) forwards; }
    .m3-content[data-state="closed"][data-side="top"] { animation: m3-sweep-out-down 300ms cubic-bezier(0.4, 0, 1, 1) forwards; }
    .m3-content[data-state="closed"][data-side="right"] { animation: m3-sweep-out-left 300ms cubic-bezier(0.4, 0, 1, 1) forwards; }
    .m3-content[data-state="closed"][data-side="left"] { animation: m3-sweep-out-right 300ms cubic-bezier(0.4, 0, 1, 1) forwards; }
    
    /* --- ITEM STAGGERING --- */
    .m3-content[data-state="open"] .m3-item-enter { opacity: 0; animation: m3-item-cinematic 350ms cubic-bezier(0.1, 0.8, 0.2, 1) forwards; }
    .m3-content[data-state="closed"] .m3-item-enter { animation: m3-item-exit 200ms cubic-bezier(0.4, 0, 1, 1) forwards; }

    .m3-content .m3-item-enter:nth-child(1) { animation-delay: 40ms; }
    .m3-content .m3-item-enter:nth-child(2) { animation-delay: 70ms; }
    .m3-content .m3-item-enter:nth-child(3) { animation-delay: 100ms; }
    .m3-content .m3-item-enter:nth-child(4) { animation-delay: 130ms; }
    .m3-content .m3-item-enter:nth-child(n+5) { animation-delay: 160ms; }
  `}</style>
);

// --- 3. EXPORTED COMPONENTS ---

const DropdownMenu = ({
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>) => {
  const [activePage, setActivePage] = React.useState('main');
  const [history, setHistory] = React.useState(['main']);
  const [menuHeight, setMenuHeight] = React.useState(0);

  const navigate = React.useCallback((page: string) => {
    setActivePage(page);
    setHistory((prev) => [...prev, page]);
  }, []);

  const goBack = React.useCallback(() => {
    setHistory((prev) => {
      if (prev.length <= 1) return prev;
      const newHistory = prev.slice(0, -1);
      setActivePage(newHistory[newHistory.length - 1]);
      return newHistory;
    });
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTimeout(() => {
        setActivePage('main');
        setHistory(['main']);
      }, 300);
    }
    onOpenChange?.(open);
  };

  return (
    <DrilldownContext.Provider
      value={{ activePage, history, navigate, goBack, menuHeight, setMenuHeight }}
    >
      <DropdownMenuPrimitive.Root onOpenChange={handleOpenChange} {...props} />
    </DrilldownContext.Provider>
  );
};

const DropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(({ children, className, ...props }, ref) => {
  const { surfaceRef, rippleRef, pressed, events } = useInternalRipple();
  return (
    <DropdownMenuPrimitive.Trigger ref={ref} asChild {...props}>
      <button
        className={cn(
          'group relative overflow-hidden outline-none flex items-center justify-center rounded-xl transition-all',
          className,
        )}
        {...events}
      >
        <RippleLayer ref={surfaceRef} rippleRef={rippleRef} pressed={pressed} />
        <div className="relative z-10 flex w-full h-full items-center justify-center gap-[inherit] pointer-events-none">
          {children}
        </div>
      </button>
    </DropdownMenuPrimitive.Trigger>
  );
});

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 8, children, ...props }, ref) => {
  const ctx = React.useContext(DrilldownContext);
  const isDrilldown = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && child.type === DropdownMenuPage,
  );

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        style={
          {
            height: isDrilldown && ctx?.menuHeight ? `${ctx.menuHeight}px` : undefined,
            transition: isDrilldown
              ? 'height 350ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms linear'
              : 'opacity 200ms linear',
            '--m3-menu-radius': className?.includes('rounded-')
              ? className.match(/rounded-\[([^\]]+)\]/)?.[1] || '24px'
              : '24px',
            ...props.style,
          } as React.CSSProperties
        }
        className={cn(
          'm3-content z-50 rounded-3xl bg-popover/95 backdrop-blur-xl text-popover-foreground shadow-[0px_8px_32px_rgba(0,0,0,0.12)] border border-border/20 outline-none overflow-hidden relative py-0',
          'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
          className,
        )}
        {...props}
      >
        <M3Styles />
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
});

const DropdownMenuItem = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    delayDuration?: number;
    enterAnimation?: boolean;
  }
>(
  (
    { className, inset, children, delayDuration = 250, enterAnimation = true, asChild, ...props },
    ref,
  ) => {
    const { surfaceRef, rippleRef, pressed, events } = useInternalRipple(props.disabled);
    const itemClassName = cn(
      'group relative flex cursor-pointer select-none min-h-[48px] text-sm font-medium tracking-[0.01em] outline-none transition-colors',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-40 overflow-hidden rounded-none',
      asChild ? 'items-center' : 'items-stretch px-0',
      enterAnimation && 'm3-item-enter',
      className,
    );

    const handleSelect = (e: Event) => {
      if (delayDuration > 0) {
        e.preventDefault();
        setTimeout(() => props.onSelect?.(e), delayDuration);
      } else props.onSelect?.(e);
    };

    let itemChildren = (
      <div className={cn('relative flex flex-1 items-center px-4', inset && 'pl-12')}>
        <RippleLayer ref={surfaceRef} rippleRef={rippleRef} pressed={pressed} />
        <span className="relative z-10 flex w-full items-center gap-3 pointer-events-none">
          {children}
        </span>
      </div>
    );

    if (asChild) {
      const childArray = React.Children.toArray(children);
      const child = childArray.length === 1 ? childArray[0] : null;
      if (!React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
        throw new Error('DropdownMenuItem with asChild requires a single React element child.');
      }

      itemChildren = React.cloneElement(child, {
        className: cn(itemClassName, 'w-full px-4', inset && 'pl-12', child.props.className),
        children: (
          <>
            <RippleLayer ref={surfaceRef} rippleRef={rippleRef} pressed={pressed} />
            <span className="relative z-10 flex w-full items-center gap-3 pointer-events-none">
              {child.props.children}
            </span>
          </>
        ),
      });
    }

    return (
      <DropdownMenuPrimitive.Item
        ref={(node) => {
          (surfaceRef as React.MutableRefObject<HTMLElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
        }}
        asChild={asChild}
        className={asChild ? undefined : itemClassName}
        {...events}
        {...props}
        onSelect={handleSelect}
      >
        {itemChildren}
      </DropdownMenuPrimitive.Item>
    );
  },
);

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
    delayDuration?: number;
    enterAnimation?: boolean;
  }
>(({ className, children, checked, delayDuration = 250, enterAnimation = true, ...props }, ref) => {
  const { surfaceRef, rippleRef, pressed, events } = useInternalRipple(props.disabled);
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={(node) => {
        (surfaceRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={cn(
        'group relative flex cursor-pointer select-none items-stretch px-0 min-h-[48px] text-sm font-medium tracking-[0.01em] outline-none transition-colors',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40 overflow-hidden rounded-none',
        enterAnimation && 'm3-item-enter',
        className,
      )}
      checked={checked}
      {...events}
      {...props}
      onSelect={(e) => {
        if (delayDuration > 0) {
          e.preventDefault();
          setTimeout(() => props.onSelect?.(e), delayDuration);
        } else props.onSelect?.(e);
      }}
    >
      <div className="relative flex flex-1 items-center px-4">
        <RippleLayer ref={surfaceRef} rippleRef={rippleRef} pressed={pressed} />
        <span className="relative z-10 flex w-full items-center gap-3 pointer-events-none">
          <span className="flex h-5 w-5 items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator>
              <Check className="h-4 w-4" />
            </DropdownMenuPrimitive.ItemIndicator>
          </span>
          {children}
        </span>
      </div>
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> & {
    delayDuration?: number;
    enterAnimation?: boolean;
  }
>(({ className, children, delayDuration = 250, enterAnimation = true, ...props }, ref) => {
  const { surfaceRef, rippleRef, pressed, events } = useInternalRipple(props.disabled);
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={(node) => {
        (surfaceRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={cn(
        'group relative flex cursor-pointer select-none items-stretch px-0 min-h-[48px] text-sm font-medium tracking-[0.01em] outline-none transition-colors',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40 overflow-hidden rounded-none',
        enterAnimation && 'm3-item-enter',
        className,
      )}
      {...events}
      {...props}
      onSelect={(e) => {
        if (delayDuration > 0) {
          e.preventDefault();
          setTimeout(() => props.onSelect?.(e), delayDuration);
        } else props.onSelect?.(e);
      }}
    >
      <div className="relative flex flex-1 items-center px-4">
        <RippleLayer ref={surfaceRef} rippleRef={rippleRef} pressed={pressed} />
        <span className="relative z-10 flex w-full items-center gap-3 pointer-events-none">
          <span className="flex h-5 w-5 items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator>
              <Circle className="h-2.5 w-2.5 fill-current" />
            </DropdownMenuPrimitive.ItemIndicator>
          </span>
          {children}
        </span>
      </div>
    </DropdownMenuPrimitive.RadioItem>
  );
});

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn(
      'h-[1px] w-full m3-item-enter my-0',
      'bg-gradient-to-r from-transparent via-border to-transparent opacity-80 my-0.5',
      className,
    )}
    {...props}
  />
));

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      'px-5 py-4 text-[10px] font-black tracking-[0.15em] text-primary/80 uppercase m3-item-enter',
      inset && 'pl-12',
      className,
    )}
    {...props}
  />
));

const DropdownMenuInternalBack = () => {
  const ctx = React.useContext(DrilldownContext);
  return (
    <DropdownMenuItem
      delayDuration={0}
      onSelect={(e) => {
        e.preventDefault();
        ctx?.goBack();
      }}
      enterAnimation={false}
    >
      <ChevronLeft className="w-5 h-5 text-foreground" />
      <span>Back</span>
    </DropdownMenuItem>
  );
};

const DropdownMenuPage = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { id: string }
>(({ id, children, className, ...props }, ref) => {
  const ctx = React.useContext(DrilldownContext);
  if (!ctx) throw new Error('DropdownMenuPage must be used within DropdownMenu');

  const { activePage, history, setMenuHeight } = ctx;
  const isActive = activePage === id;
  const isLeft = history.includes(id) && !isActive;
  const localRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isActive && localRef.current) {
      const observer = new ResizeObserver((entries) => {
        setMenuHeight(entries[0].borderBoxSize?.[0]?.blockSize ?? entries[0].contentRect.height);
      });
      observer.observe(localRef.current);
      return () => observer.disconnect();
    }
  }, [isActive, setMenuHeight]);

  return (
    <div
      ref={(node) => {
        (localRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={cn(
        'w-full absolute top-0 left-0 transition-all duration-350 ease-[cubic-bezier(0.2,0,0,1)] py-0',
        isActive
          ? 'translate-x-0 opacity-100 blur-0 pointer-events-auto'
          : isLeft
            ? '-translate-x-[30%] opacity-0 blur-[4px] pointer-events-none'
            : 'translate-x-[30%] opacity-0 blur-[4px] pointer-events-none',
        className,
      )}
      {...props}
    >
      {id !== 'main' && <DropdownMenuInternalBack />}
      {children}
    </div>
  );
});

const DropdownMenuPageTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuItem> & { targetId: string }
>(({ targetId, children, ...props }, ref) => {
  const ctx = React.useContext(DrilldownContext);
  return (
    <DropdownMenuItem
      ref={ref}
      delayDuration={0}
      onSelect={(e) => {
        e.preventDefault();
        ctx?.navigate(targetId);
      }}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto w-4 h-4 text-muted-foreground opacity-70" />
    </DropdownMenuItem>
  );
});

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPage,
  DropdownMenuPageTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
