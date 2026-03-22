'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { DashboardAIChatTab } from './DashboardAIChatTab';
import { DashboardModerationTab } from './DashboardModerationTab';
import { DashboardOverviewTab } from './DashboardOverviewTab';
import { DashboardSettingsTab } from './DashboardSettingsTab';
import { ScrollStage } from './ScrollStage';
import { SectionHeader } from './SectionHeader';

type TabId = 'overview' | 'moderation' | 'ai-chat' | 'settings';

const tabs: { readonly id: TabId; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'ai-chat', label: 'AI Chat' },
  { id: 'settings', label: 'Settings' },
];

const tabContent: Record<TabId, React.ReactNode> = {
  'overview': <DashboardOverviewTab />,
  'moderation': <DashboardModerationTab />,
  'ai-chat': <DashboardAIChatTab />,
  'settings': <DashboardSettingsTab />,
};

/**
 * Dashboard preview section for the landing page.
 * Renders a mock browser-style dashboard with switchable tabs
 * showcasing Overview, Moderation, AI Chat, and Settings views.
 */
export function DashboardPreview() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <section className="px-4 py-28 sm:px-6 lg:px-8 bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-5xl">
        <ScrollStage>
          <SectionHeader
            label="THE PRODUCT"
            labelColor="primary"
            title="Your server, at a glance"
            subtitle="Configure everything from the browser. No YAML. No CLI. No documentation rabbit holes."
            className="mb-12"
          />

          {/* Dashboard container */}
          <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/5 overflow-hidden">
            {/* Mock navbar */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-primary" />
                <span className="text-sm font-semibold text-foreground">Volvox</span>
              </div>
              <span className="text-xs text-muted-foreground">My Server</span>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border px-4 py-2 bg-card/80">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-5 min-h-[380px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {tabContent[activeTab]}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </ScrollStage>
      </div>
    </section>
  );
}
