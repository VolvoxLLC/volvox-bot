/**
 * Analytics PDF export — browser print-to-PDF approach.
 * Builds a styled HTML report and triggers the browser's print dialog.
 * No external dependencies required.
 */

import { formatNumber, formatUsd } from '@/lib/analytics-utils';
import type { DashboardAnalytics } from '@/types/analytics';

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const text = String(value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildKpiTable(analytics: DashboardAnalytics): string {
  const { kpis } = analytics;
  const rows = [
    ['Total messages', formatNumber(kpis.totalMessages)],
    ['AI requests', formatNumber(kpis.aiRequests)],
    ['AI cost (est.)', formatUsd(kpis.aiCostUsd)],
    ['Active users', formatNumber(kpis.activeUsers)],
    ['New members', formatNumber(kpis.newMembers)],
  ];

  const rowsHtml = rows
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`)
    .join('');

  return `
    <table>
      <thead><tr><th>KPI</th><th>Value</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

function buildChannelTable(analytics: DashboardAnalytics): string {
  const channels = analytics.topChannels ?? analytics.channelActivity;
  if (!channels.length) return '<p class="empty">No channel data for this period.</p>';

  const rowsHtml = channels
    .map(
      (ch) =>
        `<tr><td>${esc(ch.name)}</td><td class="num">${esc(formatNumber(ch.messages))}</td></tr>`,
    )
    .join('');

  return `
    <table>
      <thead><tr><th>Channel</th><th>Messages</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

function buildCommandTable(analytics: DashboardAnalytics): string {
  const items = analytics.commandUsage?.items ?? [];
  if (!items.length) return '<p class="empty">No command usage data for this period.</p>';

  const rowsHtml = items
    .map(
      (entry) =>
        `<tr><td class="mono">/${esc(entry.command)}</td><td class="num">${esc(formatNumber(entry.uses))}</td></tr>`,
    )
    .join('');

  return `
    <table>
      <thead><tr><th>Command</th><th>Uses</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
}

function buildEngagementSection(analytics: DashboardAnalytics): string {
  const ue = analytics.userEngagement;
  if (!ue) return '';

  const rows = [
    ['Tracked users', formatNumber(ue.trackedUsers)],
    ['Total messages sent', formatNumber(ue.totalMessagesSent)],
    ['Total reactions given', formatNumber(ue.totalReactionsGiven)],
    ['Total reactions received', formatNumber(ue.totalReactionsReceived)],
    ['Avg messages / user', ue.avgMessagesPerUser.toFixed(1)],
  ];

  const rowsHtml = rows
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`)
    .join('');

  return `
    <section>
      <h2>User Engagement</h2>
      <table>
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </section>`;
}

function buildXpSection(analytics: DashboardAnalytics): string {
  const xp = analytics.xpEconomy;
  if (!xp) return '';

  const rows = [
    ['Users with XP', formatNumber(xp.totalUsers)],
    ['Total XP distributed', formatNumber(xp.totalXp)],
    ['Average level', xp.avgLevel.toFixed(1)],
    ['Highest level', formatNumber(xp.maxLevel)],
  ];

  const rowsHtml = rows
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`)
    .join('');

  return `
    <section>
      <h2>XP Economy</h2>
      <table>
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </section>`;
}

function buildAiSection(analytics: DashboardAnalytics): string {
  const { byModel, tokens } = analytics.aiUsage;
  if (!byModel.length) return '';

  const rowsHtml = byModel
    .map(
      (m) =>
        `<tr>
          <td>${esc(m.model)}</td>
          <td class="num">${esc(formatNumber(m.requests))}</td>
          <td class="num">${esc(formatNumber(m.promptTokens + m.completionTokens))}</td>
          <td class="num">${esc(formatUsd(m.costUsd))}</td>
        </tr>`,
    )
    .join('');

  return `
    <section>
      <h2>AI Usage by Model</h2>
      <table>
        <thead>
          <tr><th>Model</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p class="note">Total tokens: ${esc(formatNumber(tokens.prompt + tokens.completion))} (${esc(formatNumber(tokens.prompt))} prompt + ${esc(formatNumber(tokens.completion))} completion)</p>
    </section>`;
}

const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111; background: #fff; padding: 24px; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  h2 { font-size: 14px; font-weight: 600; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .meta { font-size: 11px; color: #6b7280; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-weight: 600; font-size: 11px; color: #6b7280; border-bottom: 2px solid #e5e7eb; padding: 4px 8px; }
  td { padding: 4px 8px; border-bottom: 1px solid #f3f4f6; }
  tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: monospace; font-size: 11px; }
  .empty { color: #6b7280; font-style: italic; font-size: 11px; }
  .note { font-size: 11px; color: #6b7280; margin-top: 4px; }
  section { page-break-inside: avoid; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media print {
    body { padding: 0; }
    @page { margin: 1cm; }
  }
`;

export function exportAnalyticsPdf(analytics: DashboardAnalytics): void {
  const from = new Date(analytics.range.from).toLocaleDateString();
  const to = new Date(analytics.range.to).toLocaleDateString();
  const generatedAt = new Date().toLocaleString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Analytics Report — ${esc(analytics.guildId)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <h1>Analytics Report</h1>
  <p class="meta">
    Guild: ${esc(analytics.guildId)} &nbsp;|&nbsp;
    Period: ${esc(from)} – ${esc(to)} &nbsp;|&nbsp;
    Generated: ${esc(generatedAt)}
  </p>

  <div class="grid">
    <section>
      <h2>Key Performance Indicators</h2>
      ${buildKpiTable(analytics)}
    </section>

    <section>
      <h2>Top Channels by Message Volume</h2>
      ${buildChannelTable(analytics)}
    </section>
  </div>

  <div class="grid">
    <section>
      <h2>Command Usage</h2>
      ${buildCommandTable(analytics)}
    </section>

    ${buildEngagementSection(analytics)}
  </div>

  ${buildXpSection(analytics)}
  ${buildAiSection(analytics)}
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return; // blocked by popup blocker — silent fail

  win.document.write(html);
  win.document.close();
  win.focus();
  // Give browser time to render before triggering print
  setTimeout(() => {
    win.print();
    win.close();
  }, 500);
}
