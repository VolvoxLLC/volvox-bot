import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordMarkdownEditor } from '@/components/ui/discord-markdown-editor';
import {
  insertAtCursor,
  parseDiscordMarkdown,
  wrapLine,
  wrapSelection,
} from '@/lib/discord-markdown';

const createDefaultProps = () => ({
  value: '',
  onChange: vi.fn(),
  variables: ['username', 'mention', 'level'],
  maxLength: 2000,
  placeholder: 'Enter your message...',
});

describe('parseDiscordMarkdown', () => {
  const inlineCases = [
    ['renders bold text', '**hello**', '<strong>hello</strong>'],
    ['renders italic text', '*hello*', '<em>hello</em>'],
    ['renders underline text', '__hello__', '<u>hello</u>'],
    ['renders strikethrough text', '~~hello~~', '<s>hello</s>'],
    ['renders inline code', '`code`', '<code>code</code>'],
    ['renders spoiler text', '||spoiler||', 'class="discord-spoiler'],
    ['renders template variables', 'Hello {{username}}!', 'data-variable="username"'],
  ] as const;

  it.each(inlineCases)('%s', (_label, input, expected) => {
    expect(parseDiscordMarkdown(input)).toContain(expected);
  });

  it('does not treat single-brace tokens as variables by default', () => {
    const result = parseDiscordMarkdown('Hello {username}!');
    expect(result).not.toContain('data-variable="username"');
    expect(result).toContain('Hello {username}!');
  });

  it('preserves markdown markers inside inline code', () => {
    const result = parseDiscordMarkdown('`**bold**`');
    expect(result).toContain('<code>**bold**</code>');
    expect(result).not.toContain('<code><strong>bold</strong></code>');
  });

  it('renders code blocks with language metadata when the fence header is multiline', () => {
    const result = parseDiscordMarkdown('```js\nconsole.log("hi")\n```');
    expect(result).toContain('<pre><code data-lang="js">');
    expect(result).toContain('console.log');
  });

  it('preserves same-line fenced content instead of treating it as a language token', () => {
    const result = parseDiscordMarkdown('```hello```');
    expect(result).toContain('<pre><code>hello</code></pre>');
    expect(result).not.toContain('data-lang="hello"');
  });

  it('preserves fenced code that starts with a newline or has an invalid language header', () => {
    expect(parseDiscordMarkdown('```\nline one\n```')).toContain('<pre><code>line one\n</code></pre>');

    const invalidHeader = parseDiscordMarkdown('```bad lang\nline two\n```');
    expect(invalidHeader).toContain('<pre><code>bad lang\nline two\n</code></pre>');
    expect(invalidHeader).not.toContain('data-lang=');
  });

  it('does not render unterminated fenced code as a code block', () => {
    const result = parseDiscordMarkdown('before ```js\nconst x = 1');
    expect(result).not.toContain('<pre><code');
    expect(result).toContain('const x = 1');
  });

  it('keeps underline parsing scoped to markdown content instead of generated HTML attributes', () => {
    const result = parseDiscordMarkdown('**||__secret__||**');
    expect(result).toContain('<strong><span class="discord-spoiler');
    expect(result).toContain('<u>secret</u>');
    expect(result).not.toContain('</span></u>');
  });

  it('renders headings', () => {
    const result = parseDiscordMarkdown('# Title\n## Subtitle\n### Small');
    expect(result).toContain('<h1>Title</h1>');
    expect(result).toContain('<h2>Subtitle</h2>');
    expect(result).toContain('<h3>Small</h3>');
  });

  it('leaves malformed headings, quotes, and empty list markers as paragraphs', () => {
    const result = parseDiscordMarkdown('#\n>quote\n- \n1. ');
    expect(result).toContain('#<br/>');
    expect(result).toContain('&gt;quote<br/>');
    expect(result).toContain('- <br/>');
    expect(result).toContain('1. <br/>');
  });

  it('renders block quotes', () => {
    expect(parseDiscordMarkdown('> quoted text')).toContain('<blockquote>quoted text</blockquote>');
  });

  it('renders an empty block quote', () => {
    expect(parseDiscordMarkdown('>')).toContain('<blockquote></blockquote>');
  });

  it.each([
    ['unordered', '- item one\n- item two', '<ul>', '<li>item one</li>', '<li>item two</li>', '</ul>'],
    ['ordered', '1. first\n2. second', '<ol>', '<li>first</li>', '<li>second</li>', '</ol>'],
  ])('renders %s lists', (_label, input, ...expectedParts) => {
    const result = parseDiscordMarkdown(input);
    expectedParts.forEach((part) => expect(result).toContain(part));
  });

  it('escapes HTML to prevent XSS', () => {
    const result = parseDiscordMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('switches between unordered and ordered list containers', () => {
    expect(parseDiscordMarkdown('- item\n1. first')).toContain('</ul><ol>');
    expect(parseDiscordMarkdown('1. first\n- item')).toContain('</ol><ul>');
  });

  it('respects variable allowlists and rejects malformed variables', () => {
    const result = parseDiscordMarkdown('{{username}} {{unknown}} {{bad-name}}', ['username']);
    expect(result).toContain('data-variable="username"');
    expect(result).toContain('{{unknown}}');
    expect(result).toContain('{{bad-name}}');
    expect(parseDiscordMarkdown('{{}}')).toContain('{{}}');
  });

  it('leaves unclosed inline code and empty inline formats as text', () => {
    const result = parseDiscordMarkdown('before `code\n****');
    expect(result).toContain('before `code<br/>');
    expect(result).toContain('****<br/>');
    expect(result).not.toContain('<code>code');
    expect(result).not.toContain('<strong>');
  });
});

describe('markdown text helpers', () => {
  it('wrapSelection wraps selected text with prefix and suffix', () => {
    const result = wrapSelection('hello world', 6, 11, '**', '**');
    expect(result).toEqual({
      text: 'hello **world**',
      selectionStart: 8,
      selectionEnd: 13,
    });
  });

  it('wrapSelection inserts markers at cursor when no selection', () => {
    expect(wrapSelection('hello', 5, 5, '**', '**').text).toBe('hello****');
  });

  it('insertAtCursor inserts text at cursor position', () => {
    expect(insertAtCursor('hello world', 5, ' beautiful')).toEqual({
      text: 'hello beautiful world',
      cursorPos: 15,
    });
  });

  it('wrapLine prepends a prefix to the current line', () => {
    expect(wrapLine('hello\nworld', 8, '> ')).toEqual({
      text: 'hello\n> world',
      cursorPos: 10,
    });
  });
});

describe('DiscordMarkdownEditor', () => {
  let defaultProps: ReturnType<typeof createDefaultProps>;

  beforeEach(() => {
    defaultProps = createDefaultProps();
  });

  it('renders the full toolbar and main editor UI', () => {
    render(<DiscordMarkdownEditor {...defaultProps} value="**bold text**" />);

    expect(screen.getByRole('toolbar', { name: /formatting toolbar/i })).toBeInTheDocument();

    [
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Inline Code',
      'Code Block',
      'Spoiler',
      'Quote',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bullet List',
      'Numbered List',
      'Insert variable',
      'Preview',
    ].forEach((label) => {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('Enter your message...')).toBeInTheDocument();
  });

  it('displays the character counter', () => {
    render(<DiscordMarkdownEditor {...defaultProps} value="hello" />);
    expect(screen.getByLabelText('Character count')).toHaveTextContent('5 / 2000');
  });

  it('shows the character counter in red when over limit', () => {
    const longText = 'a'.repeat(2001);
    render(<DiscordMarkdownEditor {...defaultProps} value={longText} />);
    const counter = screen.getByLabelText('Character count');
    expect(counter).toHaveTextContent('2001 / 2000');
    expect(counter.className).toContain('text-red-500');
  });

  it('toggles and dismisses the variable dropdown', async () => {
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} />);

    await user.click(screen.getByLabelText('Insert variable'));
    ['username', 'mention', 'level'].forEach((variable) => {
      expect(screen.getByText(variable)).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Markdown editor'));
    expect(screen.queryByText('username')).not.toBeInTheDocument();
  });

  it('calls onChange when typing in the textarea', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} onChange={onChange} />);

    await user.type(screen.getByPlaceholderText('Enter your message...'), 'hi');
    expect(onChange).toHaveBeenCalled();
  });

  it('does not render the variable button when no variables are provided', () => {
    render(<DiscordMarkdownEditor {...defaultProps} variables={[]} />);
    expect(screen.queryByLabelText('Insert variable')).not.toBeInTheDocument();
  });

  it('disables all controls when disabled', () => {
    render(<DiscordMarkdownEditor {...defaultProps} disabled />);
    expect(screen.getByLabelText('Bold')).toBeDisabled();
    expect(screen.getByPlaceholderText('Enter your message...')).toBeDisabled();
    expect(screen.getByLabelText('Insert variable')).toBeDisabled();
  });

  it('renders markdown and template variables in the preview pane', () => {
    const { container } = render(
      <DiscordMarkdownEditor {...defaultProps} value="**bold** and *italic* Hello {{username}}!" />,
    );

    const preview = container.querySelector('.discord-preview');
    expect(preview?.innerHTML).toContain('<strong>bold</strong>');
    expect(preview?.innerHTML).toContain('<em>italic</em>');
    expect(preview?.innerHTML).toContain('class="discord-variable');
    expect(preview?.innerHTML).toContain('data-variable="username"');
  });

  it('keeps the editor and preview panes on the same spacing contract', () => {
    const { container } = render(<DiscordMarkdownEditor {...defaultProps} value="{{username}}\n\nhello there" />);

    const textarea = screen.getByLabelText('Markdown editor');
    const preview = container.querySelector('.discord-preview');
    const panesGrid = textarea.closest('.grid');

    expect(textarea.className).toContain('px-3');
    expect(textarea.className).toContain('py-2');
    expect(textarea.className).toContain('text-sm');
    expect(textarea.className).toContain('leading-relaxed');
    expect(textarea.className).not.toContain('min-h-[200px]');

    expect(preview).not.toBeNull();
    expect(preview?.className).toContain('px-3');
    expect(preview?.className).toContain('py-2');
    expect(preview?.className).toContain('text-sm');
    expect(preview?.className).toContain('leading-relaxed');
    expect(preview?.className).not.toContain('min-h-[200px]');
    expect(preview?.className).toContain('-top-[3px]');
    expect(preview?.className).toContain('md:overflow-x-auto');
    expect(preview?.className).toContain('md:whitespace-nowrap');
    expect(panesGrid?.className).not.toContain('min-h-[200px]');
  });

  it.each([
    ['Ctrl+B', '{Control>}b{/Control}', '**hello**'],
    ['Ctrl+I', '{Control>}i{/Control}', '*hello*'],
    ['Ctrl+U', '{Control>}u{/Control}', '__hello__'],
  ])('applies %s keyboard formatting shortcuts', async (_label, shortcut, expected) => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} value="hello" onChange={onChange} />);

    const textarea = screen.getByPlaceholderText('Enter your message...') as HTMLTextAreaElement;
    await user.click(textarea);
    textarea.setSelectionRange(0, 5);
    await user.keyboard(shortcut);

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('passes maxLength through to the textarea', () => {
    render(<DiscordMarkdownEditor {...defaultProps} maxLength={25} />);
    expect(screen.getByLabelText('Markdown editor')).toHaveAttribute('maxlength', '25');
  });

  it('clamps toolbar edits to maxLength', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} value="hello" onChange={onChange} maxLength={6} />);

    const textarea = screen.getByPlaceholderText('Enter your message...') as HTMLTextAreaElement;
    await user.click(textarea);
    textarea.setSelectionRange(0, 5);
    await user.click(screen.getByLabelText('Bold'));

    expect(onChange).toHaveBeenCalledWith('**hell');
  });

  it('clamps inserted variables to maxLength', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DiscordMarkdownEditor
        {...defaultProps}
        value="hello"
        onChange={onChange}
        maxLength={8}
        variables={['username']}
      />,
    );

    const textarea = screen.getByPlaceholderText('Enter your message...') as HTMLTextAreaElement;
    await user.click(textarea);
    textarea.setSelectionRange(5, 5);

    await user.click(screen.getByLabelText('Insert variable'));
    await user.click(screen.getByText('username'));

    expect(onChange).toHaveBeenCalledWith('hello{{u');
  });

});
