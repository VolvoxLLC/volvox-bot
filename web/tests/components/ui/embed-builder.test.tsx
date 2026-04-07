import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAR_LIMITS,
  EmbedBuilder,
  EmbedPreview,
  defaultEmbedConfig,
  formatPreviewTimestamp,
  getTotalCharCount,
  type EmbedConfig,
} from '@/components/ui/embed-builder';

function renderBuilder(overrides: Partial<EmbedConfig> = {}, variables: string[] = []) {
  const config = { ...defaultEmbedConfig(), ...overrides };
  const onChange = vi.fn();
  const result = render(
    <EmbedBuilder value={config} onChange={onChange} variables={variables} />,
  );
  return { config, onChange, ...result };
}

function renderControlledBuilder(
  overrides: Partial<EmbedConfig> = {},
  variables: string[] = [],
  onChange = vi.fn(),
) {
  const initialValue = { ...defaultEmbedConfig(), ...overrides };

  function Wrapper() {
    const [value, setValue] = React.useState(initialValue);
    return (
      <EmbedBuilder
        value={value}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
        variables={variables}
      />
    );
  }

  const result = render(<Wrapper />);
  return { onChange, ...result };
}

describe('EmbedBuilder', () => {
  // ── Rendering ──────────────────────────────────────────────────

  it('renders editor and preview panels', () => {
    renderBuilder();
    expect(screen.getByText('Embed Editor')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('shows empty state when no content', () => {
    renderBuilder();
    expect(screen.getByText('Start editing to see a preview')).toBeInTheDocument();
  });

  // ── Title editing ─────────────────────────────────────────────

  it('calls onChange with the full title when title is edited', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Wrapper() {
      const [value, setValue] = React.useState(defaultEmbedConfig());
      return (
        <EmbedBuilder
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          variables={[]}
        />
      );
    }

    render(<Wrapper />);

    const titleInput = screen.getByPlaceholderText('Embed title...');
    await user.type(titleInput, 'Hello');
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.title).toBe('Hello');
  });

  // ── Description editing ───────────────────────────────────────

  it('calls onChange when description is edited', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    const descInput = screen.getByPlaceholderText(/Embed description/);
    await user.type(descInput, 'Test');
    expect(onChange).toHaveBeenCalled();
  });

  // ── Color picker ──────────────────────────────────────────────

  it('selects a preset color', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    const greenBtn = screen.getByLabelText('Color #57F287');
    await user.click(greenBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ color: '#57F287' }),
    );
  });

  it('normalizes custom hex input and only commits valid colors', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({ color: '#5865F2' });
    const hexInput = screen.getByPlaceholderText('#5865F2');

    await user.clear(hexInput);
    await user.type(hexInput, 'abc123');

    expect(hexInput).toHaveValue('#ABC123');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#ABC123' }),
    );
  });

  // ── Format selector ───────────────────────────────────────────

  it('switches format', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    await user.click(screen.getByText('Text Only'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'text' }),
    );
  });

  it('marks the selected format button as pressed', () => {
    renderBuilder({ format: 'embed' });
    expect(screen.getByRole('button', { name: 'Embed Only' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Text Only' })).toHaveAttribute('aria-pressed', 'false');
  });

  // ── Thumbnail selector ────────────────────────────────────────

  it('selects thumbnail type and shows custom URL input', async () => {
    const user = userEvent.setup();
    const { onChange, rerender } = renderBuilder();
    await user.click(screen.getByText('Custom URL'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnailType: 'custom' }),
    );

    const updatedConfig = { ...defaultEmbedConfig(), thumbnailType: 'custom' as const };
    rerender(
      <EmbedBuilder value={updatedConfig} onChange={onChange} variables={[]} />,
    );
    expect(screen.getByPlaceholderText('https://example.com/thumbnail.png')).toBeInTheDocument();
  });

  it('marks the selected thumbnail type button as pressed', () => {
    renderBuilder({ thumbnailType: 'server_icon' });
    expect(screen.getByRole('button', { name: 'Server Icon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'false');
  });

  // ── Field management ──────────────────────────────────────────

  it('adds a field with a stable id', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    await user.click(screen.getByText('Add Field'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [
          expect.objectContaining({ id: expect.any(String), name: '', value: '', inline: false }),
        ],
      }),
    );
  });

  it('removes a field', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({
      fields: [
        { id: 'field-1', name: 'Field 1', value: 'Val 1', inline: false },
        { id: 'field-2', name: 'Field 2', value: 'Val 2', inline: true },
      ],
    });

    const removeButtons = screen.getAllByLabelText('Remove field');
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [{ id: 'field-2', name: 'Field 2', value: 'Val 2', inline: true }],
      }),
    );
  });

  it('reorders fields up', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({
      fields: [
        { id: 'field-a', name: 'A', value: '1', inline: false },
        { id: 'field-b', name: 'B', value: '2', inline: false },
      ],
    });

    const upButtons = screen.getAllByLabelText('Move field up');
    await user.click(upButtons[1]);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.fields[0].name).toBe('B');
    expect(lastCall.fields[1].name).toBe('A');
    expect(lastCall.fields[0].id).toBe('field-b');
    expect(lastCall.fields[1].id).toBe('field-a');
  });

  it('reorders fields down', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({
      fields: [
        { id: 'field-a', name: 'A', value: '1', inline: false },
        { id: 'field-b', name: 'B', value: '2', inline: false },
      ],
    });

    const downButtons = screen.getAllByLabelText('Move field down');
    await user.click(downButtons[0]);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.fields[0].name).toBe('B');
    expect(lastCall.fields[1].name).toBe('A');
    expect(lastCall.fields[0].id).toBe('field-b');
    expect(lastCall.fields[1].id).toBe('field-a');
  });

  it('toggles field inline', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({
      fields: [{ id: 'field-1', name: 'Test', value: 'Val', inline: false }],
    });

    const inlineSwitch = screen.getByRole('switch', { name: /field 1 inline/i });
    await user.click(inlineSwitch);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [expect.objectContaining({ inline: true })],
      }),
    );
  });

  // ── Timestamp toggle ──────────────────────────────────────────

  it('toggles timestamp', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    const timestampSwitch = screen.getByRole('switch', {
      name: /show timestamp/i,
    });
    await user.click(timestampSwitch);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showTimestamp: true }),
    );
  });

  // ── Character limit indicators ────────────────────────────────

  it('shows character counts', () => {
    renderBuilder({ title: 'Hello', description: 'World' });
    const charCounts = screen.getAllByTestId('char-count');
    expect(charCounts.length).toBeGreaterThanOrEqual(3);
  });

  // ── Variable template support ─────────────────────────────────

  it('renders variable buttons when variables provided', () => {
    renderBuilder({}, ['username', 'level']);
    const varButtons = screen.getAllByText(/{{username}}/);
    expect(varButtons.length).toBeGreaterThan(0);
  });

  it('inserts variable into title on click', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({ title: 'Hello ' }, ['username']);
    const varButtons = screen.getAllByText('{{username}}');
    await user.click(varButtons[0]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Hello {{username}}' }),
    );
  });

  it('inserts variable into field value on click', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder(
      {
        fields: [{ id: 'field-1', name: 'Level', value: 'Current ', inline: false }],
      },
      ['username'],
    );

    const fieldEditor = screen.getByText('Field 1').closest('div[class*="space-y-2"]');
    expect(fieldEditor).not.toBeNull();
    const valueGroup = within(fieldEditor as HTMLElement).getByPlaceholderText('Field value').closest('div');
    expect(valueGroup).not.toBeNull();

    await user.click(within(valueGroup as HTMLElement).getByText('{{username}}'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [expect.objectContaining({ value: 'Current {{username}}' })],
      }),
    );
  });

  it('inserts variable into footer text on click', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({ footerText: 'Footer ' }, ['username']);
    const footerInput = screen.getByPlaceholderText('Footer text...');
    const footerSection = footerInput.closest('div');
    expect(footerSection).not.toBeNull();

    await user.click(within(footerSection as HTMLElement).getByText('{{username}}'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ footerText: 'Footer {{username}}' }),
    );
  });

  it('does not insert a partial variable token when the field is near its limit', async () => {
    const user = userEvent.setup();
    const almostFullTitle = 'a'.repeat(CHAR_LIMITS.title - '{{username}}'.length + 2);
    const { onChange } = renderBuilder({ title: almostFullTitle }, ['username']);

    await user.click(screen.getAllByText('{{username}}')[0]);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        title: almostFullTitle,
      }),
    );
  });

  it('hydrates missing field ids only once for the same field payload', () => {
    const onChange = vi.fn();
    const value = {
      ...defaultEmbedConfig(),
      fields: [{ name: 'Level', value: '42', inline: false }],
    };

    const { rerender } = render(<EmbedBuilder value={value} onChange={onChange} variables={[]} />);
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(<EmbedBuilder value={{ ...value }} onChange={onChange} variables={[]} />);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // ── Footer ────────────────────────────────────────────────────

  it('updates footer text', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    const footerInput = screen.getByPlaceholderText('Footer text...');
    await user.type(footerInput, 'My footer');
    expect(onChange).toHaveBeenCalled();
  });

  it('does not emit title updates that would exceed the total embed character cap', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlledBuilder({
      ...defaultEmbedConfig(),
      description: 'd'.repeat(4096),
      footerText: 'f'.repeat(1900),
    });

    await user.type(screen.getByPlaceholderText('Embed title...'), 'abcdef');

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.title).toBe('abcd');
    expect(getTotalCharCount(lastCall)).toBe(CHAR_LIMITS.total);
  });

  it('trims field edits to stay within the total embed character cap', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlledBuilder({
      ...defaultEmbedConfig(),
      title: 't'.repeat(256),
      description: 'd'.repeat(4096),
      footerText: 'f'.repeat(1647),
      fields: [{ id: 'field-1', name: '', value: '', inline: false }],
    });

    await user.type(screen.getByPlaceholderText('Field name'), 'abcdef');

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.fields[0].name).toBe('a');
    expect(getTotalCharCount(lastCall)).toBeLessThanOrEqual(CHAR_LIMITS.total);
  });
});

// ── Preview component ─────────────────────────────────────────────

describe('EmbedPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T16:49:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders title in preview', () => {
    const config = { ...defaultEmbedConfig(), title: 'Test Title' };
    render(<EmbedPreview config={config} />);
    expect(screen.getByTestId('embed-preview-title')).toHaveTextContent('Test Title');
  });

  it('renders description with markdown', () => {
    const config = { ...defaultEmbedConfig(), description: '**bold** and *italic*' };
    render(<EmbedPreview config={config} />);
    const desc = screen.getByTestId('embed-preview-description');
    expect(desc.querySelector('strong')).toHaveTextContent('bold');
    expect(desc.querySelector('em')).toHaveTextContent('italic');
  });

  it('renders variables as badges in preview', () => {
    const config = { ...defaultEmbedConfig(), title: 'Hello {{username}}!' };
    render(<EmbedPreview config={config} />);
    const title = screen.getByTestId('embed-preview-title');
    expect(title).toHaveTextContent('username');
  });

  it('renders fields in preview', () => {
    const config = {
      ...defaultEmbedConfig(),
      fields: [
        { id: 'field-1', name: 'Level', value: '42', inline: true },
        { id: 'field-2', name: 'XP', value: '1000', inline: true },
      ],
    };
    render(<EmbedPreview config={config} />);
    const fieldsContainer = screen.getByTestId('embed-preview-fields');
    expect(fieldsContainer).toHaveTextContent('Level');
    expect(fieldsContainer).toHaveTextContent('42');
  });

  it('renders zero-width placeholders for empty field content', () => {
    const config = {
      ...defaultEmbedConfig(),
      fields: [{ id: 'field-1', name: '', value: '', inline: false }],
    };
    render(<EmbedPreview config={config} />);
    const fieldsContainer = screen.getByTestId('embed-preview-fields');
    expect(fieldsContainer).toHaveTextContent('\u200b');
  });

  it('renders accent color bar', () => {
    const config = { ...defaultEmbedConfig(), title: 'Test', color: '#FF0000' };
    render(<EmbedPreview config={config} />);
    const colorBar = screen.getByTestId('embed-color-bar');
    expect(colorBar).toHaveStyle({ backgroundColor: '#FF0000' });
  });

  it('renders footer with a dynamic timestamp', () => {
    const config = {
      ...defaultEmbedConfig(),
      footerText: 'Bot Footer',
      showTimestamp: true,
    };
    render(<EmbedPreview config={config} />);
    const footer = screen.getByTestId('embed-preview-footer');
    expect(footer).toHaveTextContent('Bot Footer');
    expect(footer).toHaveTextContent(
      formatPreviewTimestamp(new Date('2026-04-02T16:49:00Z')),
    );
  });

  it('renders preview when only timestamp is enabled', () => {
    const config = {
      ...defaultEmbedConfig(),
      showTimestamp: true,
    };
    render(<EmbedPreview config={config} />);
    expect(screen.getByTestId('embed-preview-footer')).toBeInTheDocument();
    expect(screen.queryByText('Start editing to see a preview')).not.toBeInTheDocument();
  });

  it('renders thumbnail placeholder for user avatar', () => {
    const config = {
      ...defaultEmbedConfig(),
      title: 'Test',
      thumbnailType: 'user_avatar' as const,
    };
    render(<EmbedPreview config={config} />);
    expect(screen.getByText('Avatar')).toBeInTheDocument();
  });

  it('renders custom thumbnail, embed image, and footer icon with plain img tags', () => {
    const config = {
      ...defaultEmbedConfig(),
      title: 'Test',
      thumbnailType: 'custom' as const,
      thumbnailUrl: 'https://example.com/thumbnail.png',
      imageUrl: 'https://example.com/embed.png',
      footerText: 'Footer',
      footerIconUrl: 'https://example.com/footer.png',
    };

    render(<EmbedPreview config={config} />);

    expect(screen.getByAltText('Thumbnail')).toHaveAttribute(
      'src',
      'https://example.com/thumbnail.png',
    );
    expect(screen.getByAltText('Embed')).toHaveAttribute('src', 'https://example.com/embed.png');
    expect(screen.getByAltText('Footer icon')).toHaveAttribute(
      'src',
      'https://example.com/footer.png',
    );
  });
});

// ── Utility functions ─────────────────────────────────────────────

describe('getTotalCharCount', () => {
  it('sums all character counts', () => {
    const config: EmbedConfig = {
      ...defaultEmbedConfig(),
      title: 'abc',
      description: 'defgh',
      footerText: 'ij',
      fields: [
        { id: 'field-1', name: 'kl', value: 'mno', inline: false },
      ],
    };
    expect(getTotalCharCount(config)).toBe(15);
  });

  it('returns 0 for empty config', () => {
    expect(getTotalCharCount(defaultEmbedConfig())).toBe(0);
  });
});

describe('defaultEmbedConfig', () => {
  it('returns valid default config', () => {
    const config = defaultEmbedConfig();
    expect(config.color).toBe('#5865F2');
    expect(config.fields).toEqual([]);
    expect(config.format).toBe('embed');
    expect(config.showTimestamp).toBe(false);
  });
});

describe('CHAR_LIMITS', () => {
  it('has correct limits', () => {
    expect(CHAR_LIMITS.title).toBe(256);
    expect(CHAR_LIMITS.description).toBe(4096);
    expect(CHAR_LIMITS.fieldName).toBe(256);
    expect(CHAR_LIMITS.fieldValue).toBe(1024);
    expect(CHAR_LIMITS.footer).toBe(2048);
    expect(CHAR_LIMITS.total).toBe(6000);
  });
});
