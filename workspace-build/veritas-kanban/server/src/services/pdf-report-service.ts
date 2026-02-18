/**
 * PDF Report Generation Service
 *
 * Generates branded PDF reports from markdown content.
 * Supports templates, brand config (logo, colors, fonts),
 * and multiple report types.
 *
 * Uses HTML → PDF approach via built-in capabilities.
 * For richer output, pptxgenjs is available for PPTX.
 *
 * Inspired by @nateherk's Klouse branded reports.
 */

import { createLogger } from '../lib/logger.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '..', '.veritas-kanban');

const log = createLogger('pdf-reports');

// ─── Types ───────────────────────────────────────────────────────

export interface BrandConfig {
  companyName: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  tagline?: string;
}

export type ReportTemplate = 'audit' | 'summary' | 'analysis' | 'standup' | 'custom';

export interface ReportConfig {
  title: string;
  subtitle?: string;
  template: ReportTemplate;
  /** Markdown content */
  content: string;
  /** Brand overrides (uses default if not provided) */
  brand?: Partial<BrandConfig>;
  /** Include table of contents */
  includeToc?: boolean;
  /** Include timestamp */
  includeTimestamp?: boolean;
  /** Include page numbers */
  includePageNumbers?: boolean;
  /** Author name */
  author?: string;
  /** Additional metadata */
  metadata?: Record<string, string>;
}

export interface GeneratedReport {
  id: string;
  title: string;
  template: ReportTemplate;
  /** HTML content (can be converted to PDF via browser print) */
  htmlPath: string;
  /** Relative path in docs */
  docsPath: string;
  /** File size */
  size: number;
  generatedAt: string;
  brand: BrandConfig;
}

// ─── Default Brand ───────────────────────────────────────────────

const DEFAULT_BRAND: BrandConfig = {
  companyName: 'Veritas Kanban',
  primaryColor: '#8b5cf6',
  secondaryColor: '#1e1b4b',
  accentColor: '#c4b5fd',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
};

// ─── Template Styles ─────────────────────────────────────────────

function getTemplateCSS(brand: BrandConfig, template: ReportTemplate): string {
  const base = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${brand.fontFamily};
      color: #1a1a2e;
      line-height: 1.6;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 { color: ${brand.primaryColor}; font-size: 28px; margin-bottom: 8px; border-bottom: 3px solid ${brand.primaryColor}; padding-bottom: 12px; }
    h2 { color: ${brand.secondaryColor}; font-size: 22px; margin-top: 32px; margin-bottom: 12px; }
    h3 { color: ${brand.primaryColor}; font-size: 18px; margin-top: 24px; margin-bottom: 8px; }
    p { margin-bottom: 12px; }
    ul, ol { margin-bottom: 12px; padding-left: 24px; }
    li { margin-bottom: 4px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #1e1b4b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; margin-bottom: 16px; }
    pre code { background: none; color: inherit; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: ${brand.primaryColor}; color: white; padding: 10px 12px; text-align: left; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    blockquote { border-left: 4px solid ${brand.accentColor}; padding: 12px 16px; background: ${brand.accentColor}10; margin-bottom: 16px; font-style: italic; }
    hr { border: none; border-top: 2px solid #e5e7eb; margin: 24px 0; }
    a { color: ${brand.primaryColor}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .report-header { margin-bottom: 32px; }
    .report-header .logo { max-height: 48px; margin-bottom: 16px; }
    .report-header .subtitle { color: #6b7280; font-size: 16px; }
    .report-header .meta { color: #9ca3af; font-size: 12px; margin-top: 12px; }
    .report-footer { margin-top: 40px; padding-top: 16px; border-top: 2px solid ${brand.primaryColor}; color: #9ca3af; font-size: 11px; text-align: center; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  `;

  const templateExtras: Record<ReportTemplate, string> = {
    audit: `
      .severity-critical { color: #dc2626; font-weight: bold; }
      .severity-high { color: #ea580c; font-weight: bold; }
      .severity-medium { color: #d97706; }
      .severity-low { color: #65a30d; }
      .finding { background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin-bottom: 12px; border-radius: 0 8px 8px 0; }
    `,
    summary: `
      .metric { display: inline-block; background: ${brand.primaryColor}10; border: 1px solid ${brand.accentColor}; border-radius: 8px; padding: 12px 16px; margin: 4px; text-align: center; min-width: 120px; }
      .metric-value { font-size: 24px; font-weight: bold; color: ${brand.primaryColor}; }
      .metric-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    `,
    analysis: `
      .pro { color: #16a34a; }
      .con { color: #dc2626; }
      .recommendation { background: ${brand.primaryColor}08; border: 1px solid ${brand.accentColor}; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    `,
    standup: `
      .status-done { color: #16a34a; }
      .status-progress { color: #2563eb; }
      .status-blocked { color: #dc2626; }
      .agent-card { background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 8px; border-left: 3px solid ${brand.primaryColor}; }
    `,
    custom: '',
  };

  return base + (templateExtras[template] || '');
}

// ─── Markdown to HTML (basic) ────────────────────────────────────

function markdownToHtml(md: string): string {
  let html = md
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold/italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Paragraphs (lines not already wrapped)
    .replace(/^(?!<[h1-6|li|pre|blockquote|hr|ul|ol|div])(.+)$/gm, '<p>$1</p>');

  // Wrap consecutive li elements in ul
  html = html.replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');

  return html;
}

// ─── Service ─────────────────────────────────────────────────────

class PdfReportService {
  private brandConfig: BrandConfig = { ...DEFAULT_BRAND };
  private reports: GeneratedReport[] = [];
  private loaded = false;

  private get configPath(): string {
    return path.join(DATA_DIR, 'report-brand.json');
  }

  private get reportsPath(): string {
    return path.join(DATA_DIR, 'generated-reports.json');
  }

  private get outputDir(): string {
    return path.join(DATA_DIR, '..', 'docs', 'reports');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.brandConfig = { ...DEFAULT_BRAND, ...JSON.parse(data) };
    } catch {
      // Use defaults
    }
    try {
      const data = await fs.readFile(this.reportsPath, 'utf-8');
      this.reports = JSON.parse(data);
    } catch {
      this.reports = [];
    }
    this.loaded = true;
  }

  /**
   * Get current brand config.
   */
  async getBrand(): Promise<BrandConfig> {
    await this.ensureLoaded();
    return { ...this.brandConfig };
  }

  /**
   * Update brand config.
   */
  async updateBrand(update: Partial<BrandConfig>): Promise<BrandConfig> {
    await this.ensureLoaded();
    this.brandConfig = { ...this.brandConfig, ...update };
    await fs.writeFile(this.configPath, JSON.stringify(this.brandConfig, null, 2));
    return { ...this.brandConfig };
  }

  /**
   * Generate a branded HTML report from markdown.
   * The HTML includes print-optimized CSS for PDF generation via browser.
   */
  async generateReport(config: ReportConfig): Promise<GeneratedReport> {
    await this.ensureLoaded();

    const brand = { ...this.brandConfig, ...config.brand };
    const css = getTemplateCSS(brand, config.template);
    const contentHtml = markdownToHtml(config.content);

    const timestamp = config.includeTimestamp !== false
      ? `<div class="report-header meta">Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>`
      : '';

    const authorLine = config.author ? `<div class="report-header meta">Author: ${config.author}</div>` : '';
    const subtitleLine = config.subtitle ? `<div class="report-header subtitle">${config.subtitle}</div>` : '';

    const logoHtml = brand.logoUrl
      ? `<img src="${brand.logoUrl}" class="logo" alt="${brand.companyName}" />`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title} — ${brand.companyName}</title>
  <style>${css}</style>
</head>
<body>
  <div class="report-header">
    ${logoHtml}
    <h1>${config.title}</h1>
    ${subtitleLine}
    ${timestamp}
    ${authorLine}
  </div>

  <div class="report-content">
    ${contentHtml}
  </div>

  <div class="report-footer">
    ${brand.companyName}${brand.tagline ? ` — ${brand.tagline}` : ''} · Generated by Veritas Kanban
  </div>
</body>
</html>`;

    // Save HTML file
    await fs.mkdir(this.outputDir, { recursive: true });
    const fileName = `${config.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.html`;
    const filePath = path.join(this.outputDir, fileName);
    await fs.writeFile(filePath, html, 'utf-8');

    const stat = await fs.stat(filePath);
    const docsPath = `reports/${fileName}`;

    const report: GeneratedReport = {
      id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: config.title,
      template: config.template,
      htmlPath: filePath,
      docsPath,
      size: stat.size,
      generatedAt: new Date().toISOString(),
      brand,
    };

    this.reports.push(report);
    await fs.writeFile(this.reportsPath, JSON.stringify(this.reports, null, 2));

    log.info({ reportId: report.id, title: config.title, template: config.template }, 'Report generated');
    return report;
  }

  /**
   * List generated reports.
   */
  async listReports(limit = 50): Promise<GeneratedReport[]> {
    await this.ensureLoaded();
    return this.reports
      .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get a specific report.
   */
  async getReport(id: string): Promise<GeneratedReport | null> {
    await this.ensureLoaded();
    return this.reports.find((r) => r.id === id) || null;
  }

  /**
   * Get available templates.
   */
  getTemplates(): Array<{ id: ReportTemplate; name: string; description: string }> {
    return [
      { id: 'audit', name: 'Audit Report', description: 'Security/code audit with findings and recommendations' },
      { id: 'summary', name: 'Summary Report', description: 'Sprint/standup summary with key metrics' },
      { id: 'analysis', name: 'Analysis Report', description: 'Comparison/research analysis with pros/cons' },
      { id: 'standup', name: 'Standup Report', description: 'Daily standup with status updates per agent' },
      { id: 'custom', name: 'Custom Report', description: 'Freeform markdown with brand styling' },
    ];
  }
}

// Singleton
let instance: PdfReportService | null = null;

export function getPdfReportService(): PdfReportService {
  if (!instance) {
    instance = new PdfReportService();
  }
  return instance;
}
