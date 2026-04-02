/**
 * Discord Markdown Parser
 *
 * Converts Discord-flavored markdown to HTML for preview rendering.
 * Supports: bold, italic, underline, strikethrough, code, code blocks,
 * spoilers, block quotes, headings (H1-H3), and template variables.
 */

interface ParseContext {
  result: string[];
  inList: 'ul' | 'ol' | null;
}

/** Escape HTML entities to prevent XSS in preview */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseCodeBlock(rawContent: string): { content: string; lang?: string } {
  if (rawContent.startsWith('\n')) {
    return { content: rawContent.slice(1) };
  }

  const firstNewlineIndex = rawContent.indexOf('\n');
  if (firstNewlineIndex <= 0) {
    return { content: rawContent };
  }

  const firstLine = rawContent.slice(0, firstNewlineIndex);
  if (!/^[a-zA-Z0-9_+-]+$/.test(firstLine)) {
    return { content: rawContent };
  }

  return {
    content: rawContent.slice(firstNewlineIndex + 1),
    lang: firstLine,
  };
}

/** Parse Discord markdown to HTML */
export function parseDiscordMarkdown(input: string): string {
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const segments: { type: 'text' | 'codeblock'; content: string; lang?: string }[] = [];
  let lastIndex = 0;

  let match = codeBlockRegex.exec(input);
  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: input.slice(lastIndex, match.index) });
    }

    segments.push({
      type: 'codeblock',
      ...parseCodeBlock(match[1]),
    });
    lastIndex = match.index + match[0].length;
    match = codeBlockRegex.exec(input);
  }

  if (lastIndex < input.length) {
    segments.push({ type: 'text', content: input.slice(lastIndex) });
  }

  return segments
    .map((segment) => {
      if (segment.type === 'codeblock') {
        const langAttr = segment.lang ? ` data-lang="${escapeHtml(segment.lang)}"` : '';
        return `<pre><code${langAttr}>${escapeHtml(segment.content)}</code></pre>`;
      }

      return parseInlineAndBlocks(segment.content);
    })
    .join('');
}

function closeList(ctx: ParseContext): void {
  if (!ctx.inList) {
    return;
  }

  ctx.result.push(ctx.inList === 'ul' ? '</ul>' : '</ol>');
  ctx.inList = null;
}

function parseHeading(line: string, ctx: ParseContext): boolean {
  const match = /^(#{1,3})\s+(.+)$/.exec(line);
  if (!match) {
    return false;
  }

  closeList(ctx);
  const level = match[1].length;
  ctx.result.push(`<h${level}>${parseInline(escapeHtml(match[2]))}</h${level}>`);
  return true;
}

function parseBlockQuote(line: string, ctx: ParseContext): boolean {
  const match = /^>\s?(.*)$/.exec(line);
  if (!match) {
    return false;
  }

  closeList(ctx);
  ctx.result.push(`<blockquote>${parseInline(escapeHtml(match[1]))}</blockquote>`);
  return true;
}

function parseUnorderedList(line: string, ctx: ParseContext): boolean {
  const match = /^[-*]\s+(.+)$/.exec(line);
  if (!match) {
    return false;
  }

  if (ctx.inList === 'ol') {
    closeList(ctx);
  }

  if (ctx.inList !== 'ul') {
    ctx.result.push('<ul>');
    ctx.inList = 'ul';
  }

  ctx.result.push(`<li>${parseInline(escapeHtml(match[1]))}</li>`);
  return true;
}

function parseOrderedList(line: string, ctx: ParseContext): boolean {
  const match = /^\d+\.\s+(.+)$/.exec(line);
  if (!match) {
    return false;
  }

  if (ctx.inList === 'ul') {
    closeList(ctx);
  }

  if (ctx.inList !== 'ol') {
    ctx.result.push('<ol>');
    ctx.inList = 'ol';
  }

  ctx.result.push(`<li>${parseInline(escapeHtml(match[1]))}</li>`);
  return true;
}

function parseParagraph(line: string, ctx: ParseContext): void {
  closeList(ctx);

  if (line.trim() === '') {
    ctx.result.push('<br/>');
    return;
  }

  ctx.result.push(`<p>${parseInline(escapeHtml(line))}</p>`);
}

/** Parse block-level and inline markdown (non-code-block content) */
function parseInlineAndBlocks(text: string): string {
  const ctx: ParseContext = { result: [], inList: null };

  for (const line of text.split('\n')) {
    if (parseHeading(line, ctx)) {
      continue;
    }

    if (parseBlockQuote(line, ctx)) {
      continue;
    }

    if (parseUnorderedList(line, ctx)) {
      continue;
    }

    if (parseOrderedList(line, ctx)) {
      continue;
    }

    parseParagraph(line, ctx);
  }

  closeList(ctx);
  return ctx.result.join('');
}

function formatInlineText(text: string): string {
  let formatted = text;

  formatted = formatted.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/__(.+?)__/g, '<u>$1</u>');
  formatted = formatted.replace(/~~(.+?)~~/g, '<s>$1</s>');
  formatted = formatted.replace(
    /\|\|(.+?)\|\|/g,
    '<span class="discord-spoiler inline-block rounded bg-foreground px-1 text-transparent transition-colors hover:text-background">$1</span>',
  );
  formatted = formatted.replace(
    /\{\{(\w+)\}\}/g,
    '<span class="discord-variable inline-flex items-center rounded bg-primary/10 px-1 py-0.5 font-mono text-primary" data-variable="$1">{{$1}}</span>',
  );

  return formatted;
}

/** Parse inline markdown formatting */
function parseInline(text: string): string {
  const segments: { isCode: boolean; content: string }[] = [];
  const inlineCodeRegex = /`([^`]+)`/g;
  let lastIndex = 0;

  let match = inlineCodeRegex.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({ isCode: false, content: text.slice(lastIndex, match.index) });
    }

    segments.push({ isCode: true, content: match[1] });
    lastIndex = inlineCodeRegex.lastIndex;
    match = inlineCodeRegex.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ isCode: false, content: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    return formatInlineText(text);
  }

  return segments
    .map((segment) =>
      segment.isCode ? `<code>${segment.content}</code>` : formatInlineText(segment.content),
    )
    .join('');
}

/** Wrap text with markdown syntax around a selection range */
export function wrapSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
): { text: string; selectionStart: number; selectionEnd: number } {
  const before = text.slice(0, selectionStart);
  const selected = text.slice(selectionStart, selectionEnd);
  const after = text.slice(selectionEnd);

  const newText = `${before}${prefix}${selected}${suffix}${after}`;
  return {
    text: newText,
    selectionStart: selectionStart + prefix.length,
    selectionEnd: selectionEnd + prefix.length,
  };
}

/** Insert text at cursor position */
export function insertAtCursor(
  text: string,
  cursorPos: number,
  insertText: string,
): { text: string; cursorPos: number } {
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);
  return {
    text: `${before}${insertText}${after}`,
    cursorPos: cursorPos + insertText.length,
  };
}

/** Wrap current line with a prefix (for headings, quotes, lists) */
export function wrapLine(
  text: string,
  cursorPos: number,
  prefix: string,
): { text: string; cursorPos: number } {
  const lineStart = text.lastIndexOf('\n', cursorPos - 1) + 1;
  const before = text.slice(0, lineStart);
  const after = text.slice(lineStart);
  return {
    text: `${before}${prefix}${after}`,
    cursorPos: cursorPos + prefix.length,
  };
}
