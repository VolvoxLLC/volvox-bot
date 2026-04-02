import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordMarkdownEditor } from '@/components/ui/discord-markdown-editor';
import {
  parseDiscordMarkdown,
  wrapSelection,
  insertAtCursor,
  wrapLine,
} from '@/lib/discord-markdown';

// ---------------------------------------------------------------------------
// Unit tests for discord-markdown parser utilities
// ---------------------------------------------------------------------------

describe('parseDiscordMarkdown', () => {
  it('renders bold text', () => {
    expect(parseDiscordMarkdown('**hello**')).toContain('<strong>hello</strong>');
  });

  it('renders italic text', () => {
    expect(parseDiscordMarkdown('*hello*')).toContain('<em>hello</em>');
  });

  it('renders underline text', () => {
    expect(parseDiscordMarkdown('__hello__')).toContain('<u>hello</u>');
  });

  it('renders strikethrough text', () => {
    expect(parseDiscordMarkdown('~~hello~~')).toContain('<s>hello</s>');
  });

  it('renders inline code', () => {
    expect(parseDiscordMarkdown('`code`')).toContain('<code>code</code>');
  });

  it('preserves markdown markers inside inline code', () => {
    expect(parseDiscordMarkdown('`**bold**`')).toContain('<code>**bold**</code>');
    expect(parseDiscordMarkdown('`**bold**`')).not.toContain('<code><strong>bold</strong></code>');
  });

  it('renders code blocks', () => {
    const result = parseDiscordMarkdown('```js\nconsole.log("hi")\n```');
    expect(result).toContain('<pre><code data-lang="js">');
    expect(result).toContain('console.log');
  });

  it('renders spoiler text', () => {
    expect(parseDiscordMarkdown('||spoiler||')).toContain('class="discord-spoiler');
  });

  it('renders headings', () => {
    expect(parseDiscordMarkdown('# Title')).toContain('<h1>Title</h1>');
    expect(parseDiscordMarkdown('## Subtitle')).toContain('<h2>Subtitle</h2>');
    expect(parseDiscordMarkdown('### Small')).toContain('<h3>Small</h3>');
  });

  it('renders block quotes', () => {
    expect(parseDiscordMarkdown('> quoted text')).toContain('<blockquote>quoted text</blockquote>');
  });

  it('renders unordered lists', () => {
    const result = parseDiscordMarkdown('- item one\n- item two');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item one</li>');
    expect(result).toContain('<li>item two</li>');
    expect(result).toContain('</ul>');
  });

  it('renders ordered lists', () => {
    const result = parseDiscordMarkdown('1. first\n2. second');
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>first</li>');
    expect(result).toContain('<li>second</li>');
    expect(result).toContain('</ol>');
  });

  it('renders template variables', () => {
    const result = parseDiscordMarkdown('Hello {{username}}!');
    expect(result).toContain('class="discord-variable');
    expect(result).toContain('data-variable="username"');
  });

  it('escapes HTML to prevent XSS', () => {
    const result = parseDiscordMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });
});

describe('wrapSelection', () => {
  it('wraps selected text with prefix and suffix', () => {
    const result = wrapSelection('hello world', 6, 11, '**', '**');
    expect(result.text).toBe('hello **world**');
    expect(result.selectionStart).toBe(8);
    expect(result.selectionEnd).toBe(13);
  });

  it('inserts markers at cursor when no selection', () => {
    const result = wrapSelection('hello', 5, 5, '**', '**');
    expect(result.text).toBe('hello****');
  });
});

describe('insertAtCursor', () => {
  it('inserts text at cursor position', () => {
    const result = insertAtCursor('hello world', 5, ' beautiful');
    expect(result.text).toBe('hello beautiful world');
    expect(result.cursorPos).toBe(15);
  });
});

describe('wrapLine', () => {
  it('prepends prefix to the current line', () => {
    const result = wrapLine('hello\nworld', 8, '> ');
    expect(result.text).toBe('hello\n> world');
    expect(result.cursorPos).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe('DiscordMarkdownEditor', () => {
  const createDefaultProps = () => ({
    value: '',
    onChange: vi.fn(),
    variables: ['username', 'mention', 'level'],
    maxLength: 2000,
    placeholder: 'Enter your message...',
  });

  let defaultProps: ReturnType<typeof createDefaultProps>;

  beforeEach(() => {
    defaultProps = createDefaultProps();
  });

  it('renders toolbar buttons', () => {
    render(<DiscordMarkdownEditor {...defaultProps} />);
    expect(screen.getByRole('toolbar', { name: /formatting toolbar/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Bold')).toBeInTheDocument();
    expect(screen.getByLabelText('Italic')).toBeInTheDocument();
    expect(screen.getByLabelText('Underline')).toBeInTheDocument();
    expect(screen.getByLabelText('Strikethrough')).toBeInTheDocument();
    expect(screen.getByLabelText('Inline Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Code Block')).toBeInTheDocument();
    expect(screen.getByLabelText('Spoiler')).toBeInTheDocument();
    expect(screen.getByLabelText('Quote')).toBeInTheDocument();
    expect(screen.getByLabelText('Heading 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Heading 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Heading 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Bullet List')).toBeInTheDocument();
    expect(screen.getByLabelText('Numbered List')).toBeInTheDocument();
  });

  it('renders textarea with placeholder', () => {
    render(<DiscordMarkdownEditor {...defaultProps} />);
    expect(screen.getByPlaceholderText('Enter your message...')).toBeInTheDocument();
  });

  it('renders preview section', () => {
    render(<DiscordMarkdownEditor {...defaultProps} value="**bold text**" />);
    expect(screen.getByLabelText('Preview')).toBeInTheDocument();
  });

  it('displays character counter', () => {
    render(<DiscordMarkdownEditor {...defaultProps} value="hello" />);
    expect(screen.getByLabelText('Character count')).toHaveTextContent('5 / 2000');
  });

  it('shows character counter in red when over limit', () => {
    const longText = 'a'.repeat(2001);
    render(<DiscordMarkdownEditor {...defaultProps} value={longText} />);
    const counter = screen.getByLabelText('Character count');
    expect(counter).toHaveTextContent('2001 / 2000');
    expect(counter.className).toContain('text-red-500');
  });

  it('shows variable inserter button', () => {
    render(<DiscordMarkdownEditor {...defaultProps} />);
    expect(screen.getByLabelText('Insert variable')).toBeInTheDocument();
  });

  it('toggles variable dropdown on click', async () => {
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} />);

    const varButton = screen.getByLabelText('Insert variable');
    await user.click(varButton);

    expect(screen.getByText('username')).toBeInTheDocument();
    expect(screen.getByText('mention')).toBeInTheDocument();
    expect(screen.getByText('level')).toBeInTheDocument();
  });

  it('dismisses the variable dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} />);

    await user.click(screen.getByLabelText('Insert variable'));
    expect(screen.getByText('username')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Markdown editor'));
    expect(screen.queryByText('username')).not.toBeInTheDocument();
  });

  it('calls onChange when typing in textarea', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} onChange={onChange} />);

    const textarea = screen.getByPlaceholderText('Enter your message...');
    await user.type(textarea, 'hi');

    expect(onChange).toHaveBeenCalled();
  });

  it('does not render variable button when no variables provided', () => {
    render(<DiscordMarkdownEditor {...defaultProps} variables={[]} />);
    expect(screen.queryByLabelText('Insert variable')).not.toBeInTheDocument();
  });

  it('disables all controls when disabled', () => {
    render(<DiscordMarkdownEditor {...defaultProps} disabled />);
    expect(screen.getByLabelText('Bold')).toBeDisabled();
    expect(screen.getByPlaceholderText('Enter your message...')).toBeDisabled();
    expect(screen.getByLabelText('Insert variable')).toBeDisabled();
  });

  it('renders markdown in preview pane', () => {
    const { container } = render(
      <DiscordMarkdownEditor {...defaultProps} value="**bold** and *italic*" />,
    );
    const preview = container.querySelector('.discord-preview');
    expect(preview?.innerHTML).toContain('<strong>bold</strong>');
    expect(preview?.innerHTML).toContain('<em>italic</em>');
  });

  it('renders template variables as styled badges in preview', () => {
    const { container } = render(
      <DiscordMarkdownEditor {...defaultProps} value="Hello {{username}}!" />,
    );
    const preview = container.querySelector('.discord-preview');
    expect(preview?.innerHTML).toContain('class="discord-variable');
    expect(preview?.innerHTML).toContain('data-variable="username"');
  });

  it('applies bold formatting with Ctrl+B', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} value="hello" onChange={onChange} />);

    const textarea = screen.getByPlaceholderText('Enter your message...') as HTMLTextAreaElement;
    await user.click(textarea);
    textarea.setSelectionRange(0, 5);
    await user.keyboard('{Control>}b{/Control}');

    expect(onChange).toHaveBeenCalledWith('**hello**');
  });

  it('applies italic formatting with Ctrl+I', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} value="hello" onChange={onChange} />);

    const textarea = screen.getByPlaceholderText('Enter your message...') as HTMLTextAreaElement;
    await user.click(textarea);
    textarea.setSelectionRange(0, 5);
    await user.keyboard('{Control>}i{/Control}');

    expect(onChange).toHaveBeenCalledWith('*hello*');
  });

  it('applies underline formatting with Ctrl+U', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscordMarkdownEditor {...defaultProps} value="hello" onChange={onChange} />);

    const textarea = screen.getByPlaceholderText('Enter your message...') as HTMLTextAreaElement;
    await user.click(textarea);
    textarea.setSelectionRange(0, 5);
    await user.keyboard('{Control>}u{/Control}');

    expect(onChange).toHaveBeenCalledWith('__hello__');
  });
});
