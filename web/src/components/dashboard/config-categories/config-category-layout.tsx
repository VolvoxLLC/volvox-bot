'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { type ComponentType, type ReactNode, useMemo } from 'react';
import { CONFIG_NAVIGATION } from '@/components/dashboard/config-workspace/navigation';
import type { ConfigFeatureId } from '@/components/dashboard/config-workspace/types';
import { cn } from '@/lib/utils';
import { ToggleSwitch } from '../toggle-switch';

type TabIcon = ComponentType<{ className?: string }>;

export type ConfigCategoryTab = {
  id: ConfigFeatureId;
  label: string;
  desc: string;
  icon: TabIcon;
};

type ConfigCategoryLayoutProps = {
  featureId: ConfigFeatureId;
  headerTitle?: string;
  toggle?: {
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
    label?: string;
  } | null;
  children: ReactNode;
};

export function ConfigCategoryLayout({
  featureId,
  headerTitle,
  toggle,
  children,
}: ConfigCategoryLayoutProps) {
  const currentTab = useMemo(() => {
    for (const category of CONFIG_NAVIGATION) {
      const tab = category.tabs.find((t) => t.id === featureId);
      if (tab) return tab;
    }
    return null;
  }, [featureId]);

  if (!currentTab) return null;

  const title = headerTitle ?? currentTab.label;
  const toggleLabel = toggle?.label ?? `Enable ${currentTab.label}`;

  return (
    <div className="flex-1 min-w-0 w-full relative pb-12">
      <AnimatePresence mode="wait">
        <motion.div
          key={featureId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl shadow-sm">
            <div className="space-y-1 relative z-10">
              <div className="flex items-center gap-2.5">
                <currentTab.icon className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold tracking-tight text-foreground/90">{title}</h2>
              </div>
              <p className="text-sm font-medium text-muted-foreground">{currentTab.desc}</p>
            </div>

            {toggle && (
              <div className="flex items-center gap-3 shrink-0 rounded-full border border-border/50 bg-background/50 backdrop-blur-md px-4 py-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Status:{' '}
                  <span className={toggle.checked ? 'text-primary ml-1' : 'ml-1'}>
                    {toggle.checked ? 'Active' : 'Disabled'}
                  </span>
                </span>
                <div className="h-4 w-px bg-border max-sm:hidden" />
                <ToggleSwitch
                  checked={toggle.checked}
                  onChange={toggle.onChange}
                  disabled={toggle.disabled}
                  label={toggleLabel}
                />
              </div>
            )}
          </div>

          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
