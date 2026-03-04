'use client';

import { motion, useInView } from 'framer-motion';
import { ArrowRight, Bot, MessageSquare, Sparkles, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InviteButton } from './InviteButton';

/** Typewriter effect hook */
function useTypewriter(text: string, speed = 100, delay = 500) {
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
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [text, speed, delay]);

  return { displayText, isComplete };
}

/** Blinking cursor component */
function BlinkingCursor() {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-3 h-8 bg-terminal-green dark:bg-terminal-green ml-1 terminal-cursor"
    />
  );
}

/** Mock chat preview showing bot interaction */
function ChatPreview() {
  const messages = [
    { id: 'user-1', role: 'user', content: '!help' },
    {
      id: 'bot-1',
      role: 'bot',
      content: "Hey! I'm Volvox Bot. I can help with moderation, AI chat, and more!",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2, duration: 0.6 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex items-center gap-2 ml-4 text-xs text-muted-foreground">
            <Terminal className="w-3.5 h-3.5" />
            <span>volvox-bot</span>
          </div>
        </div>

        {/* Chat messages */}
        <div className="p-4 space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'bot' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-discord flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`px-3 py-2 rounded-lg text-sm ${
                  msg.role === 'user' ? 'bg-discord text-white' : 'bg-muted text-foreground'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                  U
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.5 }}
            className="flex gap-3"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-discord flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="px-3 py-2 rounded-lg bg-muted">
              <div className="flex gap-1">
                <motion.span
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
                  className="w-2 h-2 rounded-full bg-muted-foreground"
                />
                <motion.span
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
                  className="w-2 h-2 rounded-full bg-muted-foreground"
                />
                <motion.span
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
                  className="w-2 h-2 rounded-full bg-muted-foreground"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

export function Hero() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const { displayText, isComplete } = useTypewriter('volvox-bot', 80, 300);

  return (
    <section ref={ref} className="relative overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      <div className="container relative">
        <div className="flex flex-col items-center justify-center gap-8 py-20 md:py-32 text-center">
          {/* Terminal-style headline with typewriter effect */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center font-mono text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground"
          >
            <span className="text-terminal-green">&gt;</span> {displayText}
            {!isComplete && <BlinkingCursor />}
          </motion.h1>

          {/* Subheadline - fades in after typing completes */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={isComplete ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-[42rem] leading-normal text-muted-foreground text-lg sm:text-xl sm:leading-8"
          >
            The AI-powered Discord bot for modern communities.
            <br />
            Moderation, AI chat, dynamic welcomes — all in one place.
          </motion.p>

          {/* CTA buttons - slide up with stagger */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isComplete ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col gap-4 sm:flex-row"
          >
            <InviteButton size="lg" className="gap-2" />
            <Button variant="outline" size="lg" asChild>
              <Link href="/login">
                <MessageSquare className="mr-2 h-4 w-4" />
                Open Dashboard
              </Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <a
                href="https://github.com/VolvoxLLC/volvox-bot"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </motion.div>

          {/* Chat preview mockup */}
          <ChatPreview />
        </div>
      </div>
    </section>
  );
}
