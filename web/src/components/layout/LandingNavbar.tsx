'use client';

import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { InviteButton } from '@/components/landing/InviteButton';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';

export function LandingNavbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolled(latest > 20);
  });

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    const navbarHeight = window.innerWidth >= 768 ? 192 : 96;
    const top = element.getBoundingClientRect().top + window.scrollY - navbarHeight;
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top, behavior: isReduced ? 'auto' : 'smooth' });
  }, []);

  return (
    <>
      <div
        className={cn(
          'fixed inset-x-0 top-0 z-40 h-24 pointer-events-none select-none transition-opacity duration-500 md:h-48',
          isMobile ? 'opacity-100' : scrolled ? 'opacity-0' : 'opacity-100',
        )}
      >
        <div className="absolute inset-0 backdrop-blur-[4px] [mask-image:linear-gradient(to_bottom,black_0%,transparent_100%)]" />
        <div className="absolute inset-0 hidden backdrop-blur-[8px] [mask-image:linear-gradient(to_bottom,black_0%,transparent_60%)] md:block" />
        <div className="absolute inset-0 hidden backdrop-blur-[12px] [mask-image:linear-gradient(to_bottom,black_0%,transparent_30%)] md:block" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/20 to-transparent" />
      </div>

      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 flex justify-center transition-all duration-500 pointer-events-none',
          isMobile ? 'pt-0' : scrolled ? 'pt-2' : 'pt-0',
        )}
      >
        <motion.nav
          layout
          initial={{ width: '100%', borderRadius: '0px', y: 0 }}
          animate={{
            width: !isMobile && scrolled ? 'min(90%, 950px)' : '100%',
            borderRadius: !isMobile && scrolled ? '9999px' : '0px',
            y: 0,
            backgroundColor:
              !isMobile && scrolled ? 'hsl(var(--background) / 0.05)' : 'transparent',
            borderColor: !isMobile && scrolled ? 'hsl(var(--border) / 0.1)' : 'transparent',
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            'pointer-events-auto relative flex items-center justify-between px-4 py-3 md:py-3 transition-all',
            !isMobile && scrolled
              ? 'border backdrop-blur-[20px] saturate-[180%] bg-card/60 dark:bg-card/40'
              : 'border-transparent bg-transparent',
          )}
          style={{
            boxShadow:
              !isMobile && scrolled
                ? '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                : 'none',
          }}
        >
          {/* Logo Section */}
          <div className="relative z-10 flex shrink-0 items-center justify-center rounded-full pl-1 outline-none">
            <button
              type="button"
              onClick={() => {
                const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                window.scrollTo({ top: 0, behavior: isReduced ? 'auto' : 'smooth' });
              }}
              className="group flex cursor-pointer items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full ring-offset-background"
            >
              <motion.div
                layout
                className="relative h-8 w-8 overflow-hidden rounded-full border border-white/10 drop-shadow-md transition-colors group-hover:border-primary/50 md:h-9 md:w-9"
              >
                <Image
                  src="/icon-192.png"
                  alt="Volvox Logo"
                  fill
                  className="object-cover"
                  sizes="36px"
                />
              </motion.div>
              <span
                className={cn(
                  'text-lg font-bold tracking-tight text-foreground transition-opacity duration-300 md:text-xl',
                  !isMobile && scrolled && 'md:block hidden',
                )}
              >
                Volvox<span className="text-primary">.Bot</span>
              </span>
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden flex-1 justify-center items-center gap-1 md:flex px-4 overflow-hidden">
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              className="inline-block px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground active:scale-95 rounded-full shrink-0"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('pricing')}
              className="inline-block px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground active:scale-95 rounded-full shrink-0"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('dashboard')}
              className="inline-block px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground active:scale-95 rounded-full shrink-0"
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('compare')}
              className="inline-block px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground active:scale-95 rounded-full shrink-0"
            >
              Compare
            </button>
          </div>

          {/* Actions & Mobile Toggle */}
          <div className="relative z-10 flex shrink-0 items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <ThemeToggle />
              <Button
                variant="outline"
                className="h-9 rounded-full border-border/40 text-foreground shadow-sm bg-transparent backdrop-blur-md"
                asChild
              >
                <Link href="/login">Sign In</Link>
              </Button>
              <InviteButton size="sm" className="h-9 rounded-full px-5" />
            </div>

            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center rounded-full p-2 text-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground md:hidden outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="top"
                className="rounded-b-[2rem] p-6 shadow-2xl border-b border-border/10 outline-none"
              >
                <SheetHeader className="mb-6">
                  <SheetTitle className="text-left font-bold tracking-tight text-xl">
                    Menu
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2">
                  <SheetClose asChild>
                    <button
                      type="button"
                      onClick={() => scrollToSection('features')}
                      className="flex w-full items-center justify-between rounded-xl p-4 text-left font-medium text-foreground transition-colors hover:bg-muted/50"
                    >
                      Features
                    </button>
                  </SheetClose>
                  <SheetClose asChild>
                    <button
                      type="button"
                      onClick={() => scrollToSection('pricing')}
                      className="flex w-full items-center justify-between rounded-xl p-4 text-left font-medium text-foreground transition-colors hover:bg-muted/50"
                    >
                      Pricing
                    </button>
                  </SheetClose>
                  <SheetClose asChild>
                    <button
                      type="button"
                      onClick={() => scrollToSection('dashboard')}
                      className="flex w-full items-center justify-between rounded-xl p-4 text-left font-medium text-foreground transition-colors hover:bg-muted/50"
                    >
                      Dashboard
                    </button>
                  </SheetClose>
                  <SheetClose asChild>
                    <button
                      type="button"
                      onClick={() => scrollToSection('compare')}
                      className="flex w-full items-center justify-between rounded-xl p-4 text-left font-medium text-foreground transition-colors hover:bg-muted/50"
                    >
                      Compare
                    </button>
                  </SheetClose>
                </div>
                <div className="mt-8 flex flex-col gap-3">
                  <div className="flex items-center justify-between px-4">
                    <span className="text-sm font-medium text-muted-foreground">Theme</span>
                    <ThemeToggle />
                  </div>
                  <Button variant="outline" className="h-12 w-full rounded-full" asChild>
                    <Link href="/login">Sign In</Link>
                  </Button>
                  <SheetClose asChild>
                    <div className="w-full h-12 [&>a]:w-full [&>button]:w-full [&>a]:h-full [&>button]:h-full [&>a]:rounded-full [&>button]:rounded-full flex">
                      <InviteButton size="lg" />
                    </div>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </motion.nav>
      </header>
    </>
  );
}
