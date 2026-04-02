/**
 * Discord Markdown Parser
 *
 * Converts Discord-flavored markdown to HTML for preview rendering.
 * Supports: bold, italic, underline, strikethrough, code, code blocks,
 * spoilers, block quotes, headings (H1-H3), and template variables.
 */

/** Escape HTML entities to prevent XSS in preview */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Parse Discord markdown to HTML */
export function parseDiscordMarkdown(input: string): string {
  // Split into code blocks and non-code-block segments
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const segments: { type: 'text' | 'codeblock'; content: string; lang?: string }[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: input.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'codeblock', content: match[2], lang: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < input.length) {
    segments.push({ type: 'text', content: input.slice(lastIndex) });
  }

  return segments
    .map((seg) => {
      if (seg.type === 'codeblock') {
        const langAttr = seg.lang ? ` data-lang="${escapeHtml(seg.lang)}"` : '';
        return `<pre><code${langAttr}>${escapeHtml(seg.content)}</code></pre>`;
      }
      return parseInlineAndBlocks(seg.content);
    })
    .join('');
}

/** Parse block-level and inline markdown (non-code-block content) */
function parseInlineAndBlocks(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
      const level = headingMatch[1].length;
      result.push(`<h${level}>${parseInline(escapeHtml(headingMatch[2]))}</h${level}>`);
      continue;
    }

    // Block quotes
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
      result.push(`<blockquote>${parseInline(escapeHtml(quoteMatch[1]))}</blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (inList === 'ol') {
        result.push('</ol>');
        inList = null;
      }
      if (inList !== 'ul') {
        result.push('<ul>');
        inList = 'ul';
      }
      result.push(`<li>${parseInline(escapeHtml(ulMatch[1]))}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList === 'ul') {
        result.push('</ul>');
        inList = null;
      }
      if (inList !== 'ol') {
        result.push('<ol>');
        inList = 'ol';
      }
      result.push(`<li>${parseInline(escapeHtml(olMatch[1]))}</li>`);
      continue;
    }

    // Close any open list
    if (inList) {
      result.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }

    // Regular line
    if (line.trim() === '') {
      result.push('<br/>');
    } else {
      result.push(`<p>${parseInline(escapeHtml(line))}</p>`);
    }
  }

  if (inList) {
    result.push(inList === 'ul' ? '</ul>' : '</ol>');
  }

  return result.join('');
}

/** Parse inline markdown formatting */
function parseInline(text: string): string {
  // Inline code (must be first to prevent inner parsing)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold + Italic (***text***)
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold (**text**)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (*text*)
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Underline (__text__)
  text = text.replace(/__(.+?)__/g, '<u>$1</u>');

  // Strikethrough (~~text~~)
  text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Spoiler (||text||)
  text = text.replace(/\|\|(.+?)\|\|/g, '<span class="discord-spoiler">$1</span>');

  // Template variables ({{var}})
  text = text.replace(
    /\{\{(\w+)\}\}/g,
    '<span class="discord-variable" data-variable="$1">{{$1}}</span>',
  );

  return text;
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
