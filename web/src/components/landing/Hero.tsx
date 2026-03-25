'use client';

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Bot, MessageSquare, Shield, Sparkles, Terminal, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GetStartedButton } from '@/components/ui/get-started-button';
import { getBotInviteUrl } from '@/lib/discord';

// ─── Typewriter hook (headline) ──────────────────────────────────────────────

function useTypewriter(text: string, speed = 40, delay = 150) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplayText('');
    setIsComplete(false);

    const timeout = setTimeout(() => {
      let index = 0;
      intervalRef.current = setInterval(() => {
        if (index < text.length) {
          setDisplayText(text.slice(0, index + 1));
          index++;
        } else {
          setIsComplete(true);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }, speed);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, speed, delay]);

  return { displayText, isComplete };
}

function BlinkingCursor() {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-[3px] h-[0.9em] bg-primary ml-1 terminal-cursor align-baseline"
    />
  );
}

// ─── Conversation data ───────────────────────────────────────────────────────

type IconType = 'bot' | 'sparkles' | 'shield' | 'zap';

interface ScriptLine {
  role: 'user' | 'bot';
  content: string;
  icon?: IconType;
}

const iconToneClasses: Record<
  IconType,
  {
    avatar: string;
    bubble: string;
    chromeDot: string;
    chromeText: string;
    dots: string;
    slashText: string;
  }
> = {
  bot: {
    avatar: 'bg-primary shadow-[0_0_12px] shadow-primary/30',
    bubble: 'border-primary/18 bg-primary/8',
    chromeDot: 'bg-primary',
    chromeText: 'text-primary',
    dots: 'bg-primary/60',
    slashText: 'text-primary/75',
  },
  sparkles: {
    avatar: 'bg-secondary shadow-[0_0_12px] shadow-secondary/30',
    bubble: 'border-primary/18 bg-primary/8',
    chromeDot: 'bg-secondary',
    chromeText: 'text-secondary',
    dots: 'bg-primary/60',
    slashText: 'text-secondary/80',
  },
  shield: {
    avatar: 'bg-secondary shadow-[0_0_12px] shadow-secondary/30',
    bubble: 'border-primary/18 bg-primary/8',
    chromeDot: 'bg-secondary',
    chromeText: 'text-secondary',
    dots: 'bg-primary/60',
    slashText: 'text-secondary/80',
  },
  zap: {
    avatar: 'bg-accent shadow-[0_0_12px] shadow-accent/30',
    bubble: 'border-primary/18 bg-primary/8',
    chromeDot: 'bg-accent',
    chromeText: 'text-accent',
    dots: 'bg-primary/60',
    slashText: 'text-accent/80',
  },
};

const script: ScriptLine[] = [
  { role: 'user', content: '/help' },
  {
    role: 'bot',
    content: "Hey! I'm Volvox.Bot — your AI-powered Discord companion. What can I help with?",
    icon: 'bot',
  },
  { role: 'user', content: 'Can you moderate my server?' },
  {
    role: 'bot',
    content:
      'Absolutely. I use Claude to detect spam, toxicity, and raids in real-time. Zero config needed.',
    icon: 'shield',
  },
  { role: 'user', content: 'What about AI chat?' },
  {
    role: 'bot',
    content:
      'Just @mention me — I understand context, remember conversations, and actually help your community.',
    icon: 'sparkles',
  },
  { role: 'user', content: 'How fast is setup?' },
  {
    role: 'bot',
    content: 'One click to invite, 30 seconds to configure. Your server is already smarter.',
    icon: 'zap',
  },
];

const typingDotDelays = [0, 0.15, 0.3] as const;

// ─── Sub-components ──────────────────────────────────────────────────────────

function TypingDots({ className }: { className: string }) {
  return (
    <div className="flex gap-1 py-1">
      {typingDotDelays.map((d) => (
        <motion.span
          key={d}
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 0.8, delay: d, ease: 'easeInOut' }}
          className={`w-1.5 h-1.5 rounded-full ${className}`}
        />
      ))}
    </div>
  );
}

function BotAvatar({ icon = 'bot' }: { icon?: IconType }) {
  const tone = iconToneClasses[icon];
  const icons: Record<IconType, React.ReactNode> = {
    bot: <Bot className="w-4 h-4 text-white" />,
    sparkles: <Sparkles className="w-4 h-4 text-white" />,
    shield: <Shield className="w-4 h-4 text-white" />,
    zap: <Zap className="w-4 h-4 text-white" />,
  };
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.avatar}`}
    >
      {icons[icon]}
    </div>
  );
}

/** Bot message that types out character by character at 18ms/char, then calls onDone */
function BotBubble({ text, onDone }: { text: string; onDone: () => void }) {
  const [charIndex, setCharIndex] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCharIndex((prev) => {
        const next = prev + 1;
        if (next >= text.length && !doneRef.current) {
          doneRef.current = true;
          clearInterval(interval);
          setTimeout(onDone, 150);
        }
        return Math.min(next, text.length);
      });
    }, 18);
    return () => clearInterval(interval);
  }, [text, onDone]);

  const isTyping = charIndex < text.length;

  return (
    <span>
      {text.slice(0, charIndex)}
      {isTyping && (
        <span className="inline-block w-[2px] h-[1em] bg-primary/70 ml-0.5 terminal-cursor align-text-bottom" />
      )}
    </span>
  );
}

// ─── State machine ───────────────────────────────────────────────────────────

type Phase =
  | { kind: 'idle' }
  | { kind: 'show-user'; index: number }
  | { kind: 'after-user'; index: number }
  | { kind: 'show-typing'; index: number }
  | { kind: 'show-bot'; index: number }
  | { kind: 'typing-bot'; index: number }
  | { kind: 'after-bot'; index: number }
  | { kind: 'done' };

interface VisibleMessage {
  key: string;
  role: 'user' | 'bot';
  content: string;
  icon?: IconType;
  isTyping: boolean;
}

function ChatConsole() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const [showDots, setShowDots] = useState(false);
  const [dotsIcon, setDotsIcon] = useState<IconType>('bot');
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageCount = messages.length;
  const activeBotIcon = showDots
    ? dotsIcon
    : ([...messages].reverse().find((message) => message.role === 'bot')?.icon ?? 'bot');
  const activeTone = iconToneClasses[activeBotIcon];

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (!scrollRef.current || (messageCount === 0 && !showDots)) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messageCount, showDots]);

  // Phase machine
  useEffect(() => {
    clearTimer();

    switch (phase.kind) {
      case 'idle':
        if (isInView) {
          timerRef.current = setTimeout(() => setPhase({ kind: 'show-user', index: 0 }), 800);
        }
        break;

      case 'show-user': {
        const line = script[phase.index];
        setMessages((prev) => [
          ...prev,
          { key: `msg-${phase.index}`, role: 'user', content: line.content, isTyping: false },
        ]);
        timerRef.current = setTimeout(
          () => setPhase({ kind: 'after-user', index: phase.index }),
          300,
        );
        break;
      }

      case 'after-user': {
        const nextIdx = phase.index + 1;
        if (nextIdx >= script.length) {
          setPhase({ kind: 'done' });
          break;
        }
        setDotsIcon(script[nextIdx].icon ?? 'bot');
        setShowDots(true);
        timerRef.current = setTimeout(
          () => setPhase({ kind: 'show-bot', index: nextIdx }),
          500 + Math.random() * 300,
        );
        break;
      }

      case 'show-bot': {
        const line = script[phase.index];
        setShowDots(false);
        setMessages((prev) => [
          ...prev,
          {
            key: `msg-${phase.index}`,
            role: 'bot',
            content: line.content,
            icon: line.icon,
            isTyping: true,
          },
        ]);
        setPhase({ kind: 'typing-bot', index: phase.index });
        break;
      }

      case 'typing-bot':
        break;

      case 'after-bot': {
        const nextIdx = phase.index + 1;
        if (nextIdx >= script.length) {
          setPhase({ kind: 'done' });
          break;
        }
        timerRef.current = setTimeout(() => setPhase({ kind: 'show-user', index: nextIdx }), 500);
        break;
      }

      case 'done':
        break;
    }

    return clearTimer;
  }, [phase, isInView, clearTimer]);

  const handleBotDone = useCallback((index: number) => {
    setMessages((prev) =>
      prev.map((m) => (m.key === `msg-${index}` ? { ...m, isTyping: false } : m)),
    );
    setPhase({ kind: 'after-bot', index });
  }, []);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.96, y: 30 }}
      animate={isInView ? { opacity: 1, scale: 1, y: 0 } : {}}
      transition={{ type: 'spring', damping: 25, stiffness: 180, delay: 1.4 }}
      className="w-full max-w-lg mx-auto"
    >
      <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/5 overflow-hidden">
        {/* VS Code-style window chrome with channel context */}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="flex items-center gap-2 ml-3 text-xs text-muted-foreground">
              <Terminal className="w-3.5 h-3.5 text-secondary" />
              <span className="font-medium">volvox-bot</span>
              <span className="text-muted-foreground/50">—</span>
              <span className="text-muted-foreground/70">#general</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full animate-pulse ${activeTone.chromeDot}`} />
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${activeTone.chromeText}`}
            >
              Live
            </span>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="h-[320px] space-y-3 overflow-y-auto p-4 scroll-smooth overscroll-contain md:h-[340px]"
        >
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'bot' && <BotAvatar icon={msg.icon} />}
                <div
                  className={`px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-[16px] rounded-br-[4px]'
                      : `rounded-2xl rounded-bl-md border text-foreground ${iconToneClasses[msg.icon ?? 'bot'].bubble}`
                  }`}
                >
                  {msg.role === 'bot' && msg.isTyping ? (
                    <BotBubble
                      text={msg.content}
                      onDone={() => handleBotDone(Number(msg.key.split('-')[1]))}
                    />
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                    U
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {showDots && (
              <motion.div
                key="dots"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex gap-3"
              >
                <BotAvatar icon={dotsIcon} />
                <div
                  className={`rounded-2xl rounded-bl-md border px-3.5 py-2.5 ${iconToneClasses[dotsIcon].bubble}`}
                >
                  <TypingDots className={iconToneClasses[dotsIcon].dots} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input bar (decorative) */}
        <div className="px-4 py-3 border-t border-border bg-muted/30">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-background border border-border text-sm text-muted-foreground">
            <span className="opacity-50">Type a message...</span>
            <span className={`ml-auto text-[10px] font-mono ${activeTone.slashText}`}>/slash</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Hero export ─────────────────────────────────────────────────────────────

export function Hero() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;
  const botInviteUrl = getBotInviteUrl();
  const { displayText, isComplete } = useTypewriter('volvox-bot', 40, 150);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  const glowY = useSpring(useTransform(scrollYProgress, [0, 1], [0, -80]), {
    damping: 26,
    mass: 0.3,
    stiffness: 180,
  });
  const copyY = useSpring(useTransform(scrollYProgress, [0, 1], [0, -28]), {
    damping: 30,
    mass: 0.35,
    stiffness: 170,
  });
  const copyOpacity = useTransform(scrollYProgress, [0, 0.92], [1, 0.82]);
  const consoleY = useSpring(useTransform(scrollYProgress, [0, 1], [0, 88]), {
    damping: 28,
    mass: 0.34,
    stiffness: 175,
  });
  const consoleScale = useSpring(useTransform(scrollYProgress, [0, 1], [1, 0.96]), {
    damping: 30,
    mass: 0.3,
    stiffness: 180,
  });
  const consoleOpacity = useTransform(scrollYProgress, [0, 0.92], [1, 0.78]);

  return (
    <section
      ref={ref}
      className="relative min-h-screen pt-32 md:pt-[180px] flex flex-col items-center overflow-hidden"
    >
      {/* Background glow */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6 }}
        className="hero-glow absolute -top-[20%] left-1/2 -translate-x-1/2 w-[80vw] h-[80vw] -z-[1] pointer-events-none"
        style={shouldReduceMotion ? undefined : { y: glowY }}
      />

      <div className="text-center max-w-[1100px] px-4 z-[2] pb-16 md:pb-24">
        <motion.div style={shouldReduceMotion ? undefined : { opacity: copyOpacity, y: copyY }}>
          {/* Badge — enters at 100ms */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center py-2 px-4 rounded-full bg-secondary/10 text-secondary text-sm font-semibold mb-8 border border-secondary/20"
          >
            Building the future of Discord communities
          </motion.div>

          {/* Headline — enters at 200ms, typewriter starts at 150ms delay */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="font-[family-name:var(--font-mono)] text-[clamp(2.5rem,6vw,5rem)] leading-[1.1] font-extrabold tracking-[-0.03em] mb-6 text-foreground"
          >
            {displayText}
            {!isComplete && <BlinkingCursor />}
            {isComplete && (
              <>
                <br />
                <span className="text-aurora">AI-powered Discord.</span>
              </>
            )}
          </motion.h1>

          {/* Subheadline — fades in after typewriter completes */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={isComplete ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-[clamp(1rem,2vw,1.25rem)] text-foreground/70 leading-relaxed mb-10 max-w-[700px] mx-auto"
          >
            A software-powered bot for modern communities. Moderation, AI chat, dynamic welcomes,
            and a fully configurable dashboard — all in one place.
          </motion.p>

          {/* CTA Buttons — stagger in after subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isComplete ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col gap-4 sm:flex-row justify-center mb-16"
          >
            {botInviteUrl && (
              <GetStartedButton
                variant="discord"
                label="Add to Server"
                href={botInviteUrl}
                className="rounded-full h-14 px-12 font-bold text-sm tracking-widest uppercase shadow-lg shadow-[var(--color-discord)]/20"
              />
            )}
            <GetStartedButton
              variant="outline"
              icon={MessageSquare}
              label="Open Dashboard"
              href="/login"
              internal
              className="rounded-full h-14 px-8 font-bold text-sm tracking-widest uppercase text-accent border-accent/25 hover:bg-accent/8 hover:border-accent/35"
            />
          </motion.div>
        </motion.div>

        {/* Interactive chat console — enters at 1400ms with spring physics */}
        <motion.div
          className="origin-top"
          style={
            shouldReduceMotion
              ? undefined
              : {
                  opacity: consoleOpacity,
                  scale: consoleScale,
                  y: consoleY,
                }
          }
        >
          <ChatConsole />
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--bg-primary)] to-transparent pointer-events-none" />
    </section>
  );
}
