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

type MarkdownSegment = { type: 'text' | 'codeblock'; content: string; lang?: string };

function splitCodeBlockSegments(input: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let index = 0;

  while (index < input.length) {
    const fenceStart = input.indexOf('```', index);
    if (fenceStart === -1) {
      break;
    }

    const fenceEnd = input.indexOf('```', fenceStart + 3);
    if (fenceEnd === -1) {
      break;
    }

    if (fenceStart > index) {
      segments.push({ type: 'text', content: input.slice(index, fenceStart) });
    }

    segments.push({
      type: 'codeblock',
      ...parseCodeBlock(input.slice(fenceStart + 3, fenceEnd)),
    });
    index = fenceEnd + 3;
  }

  if (index < input.length) {
    segments.push({ type: 'text', content: input.slice(index) });
  }

  return segments;
}

/** Parse Discord markdown to HTML */
export function parseDiscordMarkdown(input: string): string {
  return splitCodeBlockSegments(input)
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
  let level = 0;
  while (level < 3 && line[level] === '#') {
    level += 1;
  }

  if (level === 0 || line[level] !== ' ') {
    return false;
  }

  const content = line.slice(level).trim();
  if (!content) {
    return false;
  }

  closeList(ctx);
  ctx.result.push(`<h${level}>${parseInline(escapeHtml(content))}</h${level}>`);
  return true;
}

function parseBlockQuote(line: string, ctx: ParseContext): boolean {
  if (!line.startsWith('> ') && line !== '>') {
    return false;
  }

  const content = line.length > 2 ? line.slice(2) : '';
  closeList(ctx);
  ctx.result.push(`<blockquote>${parseInline(escapeHtml(content))}</blockquote>`);
  return true;
}

function parseUnorderedList(line: string, ctx: ParseContext): boolean {
  // Discord only supports '-' as an unordered list marker (not '*')
  if (line[0] !== '-' || line[1] !== ' ') {
    return false;
  }

  const content = line.slice(2).trim();
  if (!content) {
    return false;
  }

  if (ctx.inList === 'ol') {
    closeList(ctx);
  }

  if (ctx.inList !== 'ul') {
    ctx.result.push('<ul>');
    ctx.inList = 'ul';
  }

  ctx.result.push(`<li>${parseInline(escapeHtml(content))}</li>`);
  return true;
}

function parseOrderedList(line: string, ctx: ParseContext): boolean {
  let index = 0;
  while (index < line.length && line[index] >= '0' && line[index] <= '9') {
    index += 1;
  }

  if (index === 0 || line[index] !== '.' || line[index + 1] !== ' ') {
    return false;
  }

  const content = line.slice(index + 2).trim();
  if (!content) {
    return false;
  }

  if (ctx.inList === 'ul') {
    closeList(ctx);
  }

  if (ctx.inList !== 'ol') {
    ctx.result.push('<ol>');
    ctx.inList = 'ol';
  }

  ctx.result.push(`<li>${parseInline(escapeHtml(content))}</li>`);
  return true;
}

function parseParagraph(line: string, ctx: ParseContext): void {
  closeList(ctx);

  if (line.trim() === '') {
    ctx.result.push('<br/>');
    return;
  }

  ctx.result.push(`${parseInline(escapeHtml(line))}<br/>`);
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

interface InlineFormatMatch {
  html: string;
  nextIndex: number;
}

function isWordCharacter(char: string | undefined): boolean {
  if (char === undefined || char.length !== 1) {
    return false;
  }

  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

function parseVariableAt(text: string, index: number): InlineFormatMatch | null {
  if (!text.startsWith('{{', index)) {
    return null;
  }

  const end = text.indexOf('}}', index + 2);
  if (end === -1 || end === index + 2) {
    return null;
  }

  const variable = text.slice(index + 2, end);
  for (const char of variable) {
    if (!isWordCharacter(char)) {
      return null;
    }
  }

  return {
    html: `<span class="discord-variable inline-flex items-center rounded bg-primary/10 px-1 py-0.5 font-mono text-primary" data-variable="${variable}">{{${variable}}}</span>`,
    nextIndex: end + 2,
  };
}

function parseDelimitedInlineFormat(
  text: string,
  index: number,
  delimiter: string,
  render: (content: string) => string,
): InlineFormatMatch | null {
  if (!text.startsWith(delimiter, index)) {
    return null;
  }

  const contentStart = index + delimiter.length;
  const closeIndex = text.indexOf(delimiter, contentStart);
  if (closeIndex <= contentStart) {
    return null;
  }

  return {
    html: render(formatInlineText(text.slice(contentStart, closeIndex))),
    nextIndex: closeIndex + delimiter.length,
  };
}

function parseInlineFormatAt(text: string, index: number): InlineFormatMatch | null {
  return (
    parseDelimitedInlineFormat(
      text,
      index,
      '***',
      (content) => `<strong><em>${content}</em></strong>`,
    ) ??
    parseDelimitedInlineFormat(text, index, '**', (content) => `<strong>${content}</strong>`) ??
    parseDelimitedInlineFormat(text, index, '*', (content) => `<em>${content}</em>`) ??
    parseDelimitedInlineFormat(text, index, '__', (content) => `<u>${content}</u>`) ??
    parseDelimitedInlineFormat(text, index, '~~', (content) => `<s>${content}</s>`) ??
    parseDelimitedInlineFormat(
      text,
      index,
      '||',
      (content) =>
        `<span class="discord-spoiler inline-block rounded bg-foreground px-1 text-transparent transition-colors hover:text-background">${content}</span>`,
    ) ??
    parseVariableAt(text, index)
  );
}

function formatInlineText(text: string): string {
  let result = '';
  let index = 0;

  while (index < text.length) {
    let match: InlineFormatMatch | null = null;
    let matchIndex = index;

    while (matchIndex < text.length) {
      match = parseInlineFormatAt(text, matchIndex);
      if (match) {
        break;
      }
      matchIndex += 1;
    }

    if (!match) {
      result += text.slice(index);
      break;
    }

    result += text.slice(index, matchIndex);
    result += match.html;
    index = match.nextIndex;
  }

  return result;
}

/** Parse inline markdown formatting */
function parseInline(text: string): string {
  const segments: { isCode: boolean; content: string }[] = [];
  let index = 0;

  while (index < text.length) {
    const codeStart = text.indexOf('`', index);
    if (codeStart === -1) {
      break;
    }

    const codeEnd = text.indexOf('`', codeStart + 1);
    if (codeEnd === -1) {
      break;
    }

    if (codeStart > index) {
      segments.push({ isCode: false, content: text.slice(index, codeStart) });
    }

    segments.push({ isCode: true, content: text.slice(codeStart + 1, codeEnd) });
    index = codeEnd + 1;
  }

  if (index < text.length) {
    segments.push({ isCode: false, content: text.slice(index) });
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
