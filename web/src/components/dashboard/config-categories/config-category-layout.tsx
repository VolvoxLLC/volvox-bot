'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ComponentType, ReactNode } from 'react';
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
  tabs: readonly ConfigCategoryTab[];
  activeTab: ConfigFeatureId;
  onTabChange: (tab: ConfigFeatureId) => void;
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
  tabs,
  activeTab,
  onTabChange,
  headerTitle,
  toggle,
  children,
}: ConfigCategoryLayoutProps) {
  const currentTab = tabs.find((tab) => tab.id === activeTab);

  if (!currentTab) return null;

  const title = headerTitle ?? currentTab.label;
  const toggleLabel = toggle?.label ?? `Enable ${currentTab.label}`;

  return (
    <div className="flex flex-col xl:flex-row gap-6 pb-12 items-start">
      {tabs.length > 1 && (
        <div className="w-full xl:w-56 shrink-0 flex flex-col gap-2 xl:sticky xl:top-24 z-10">
          <div className="settings-tab-bar xl:flex-col xl:p-2 xl:rounded-[24px] xl:bg-muted/20 xl:border-border/40 xl:backdrop-blur-xl overflow-x-auto xl:overflow-visible">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'relative flex items-center gap-3 px-4 py-3 rounded-[12px] xl:rounded-[16px] text-sm font-semibold transition-all duration-300 min-w-fit xl:min-w-0 outline-none',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border border-primary/20'
                      : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/30 border border-transparent',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 w-full relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
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
    </div>
  );
}
