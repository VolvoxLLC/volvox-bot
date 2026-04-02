import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import {
  EmbedBuilder,
  EmbedPreview,
  defaultEmbedConfig,
  getTotalCharCount,
  CHAR_LIMITS,
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

  it('calls onChange when title is edited', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    const titleInput = screen.getByPlaceholderText('Embed title...');
    await user.type(titleInput, 'Hello');
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.title).toContain('o'); // last char typed
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

  it('updates color via hex input', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({ color: '#FFF' });
    const hexInput = screen.getByPlaceholderText('#5865F2');
    await user.type(hexInput, '0');
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.color).toBe('#FFF0');
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

  // ── Thumbnail selector ────────────────────────────────────────

  it('selects thumbnail type and shows custom URL input', async () => {
    const user = userEvent.setup();
    const { onChange, rerender } = renderBuilder();
    await user.click(screen.getByText('Custom URL'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnailType: 'custom' }),
    );

    // Re-render with custom type to see URL input
    const updatedConfig = { ...defaultEmbedConfig(), thumbnailType: 'custom' as const };
    rerender(
      <EmbedBuilder value={updatedConfig} onChange={onChange} variables={[]} />,
    );
    expect(screen.getByPlaceholderText('https://example.com/thumbnail.png')).toBeInTheDocument();
  });

  // ── Field management ──────────────────────────────────────────

  it('adds a field', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    await user.click(screen.getByText('Add Field'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [{ name: '', value: '', inline: false }],
      }),
    );
  });

  it('removes a field', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({
      fields: [
        { name: 'Field 1', value: 'Val 1', inline: false },
        { name: 'Field 2', value: 'Val 2', inline: true },
      ],
    });

    const removeButtons = screen.getAllByLabelText('Remove field');
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [{ name: 'Field 2', value: 'Val 2', inline: true }],
      }),
    );
  });

  it('reorders fields up', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({
      fields: [
        { name: 'A', value: '1', inline: false },
        { name: 'B', value: '2', inline: false },
      ],
    });

    const upButtons = screen.getAllByLabelText('Move field up');
    // Click up on second field (index 1)
    await user.click(upButtons[1]);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.fields[0].name).toBe('B');
    expect(lastCall.fields[1].name).toBe('A');
  });

  it('reorders fields down', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({
      fields: [
        { name: 'A', value: '1', inline: false },
        { name: 'B', value: '2', inline: false },
      ],
    });

    const downButtons = screen.getAllByLabelText('Move field down');
    // Click down on first field
    await user.click(downButtons[0]);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.fields[0].name).toBe('B');
    expect(lastCall.fields[1].name).toBe('A');
  });

  it('toggles field inline', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder({
      fields: [{ name: 'Test', value: 'Val', inline: false }],
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
    // Find the Show Timestamp switch - it's the one not in a field editor
    const switches = screen.getAllByRole('switch');
    const timestampSwitch = switches[switches.length - 1]; // last switch is timestamp
    await user.click(timestampSwitch);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showTimestamp: true }),
    );
  });

  // ── Character limit indicators ────────────────────────────────

  it('shows character counts', () => {
    renderBuilder({ title: 'Hello', description: 'World' });
    const charCounts = screen.getAllByTestId('char-count');
    // Should have title, description, footer, and total char counts
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
    await user.click(varButtons[0]); // click the first one (title section)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Hello {{username}}' }),
    );
  });

  // ── Footer ────────────────────────────────────────────────────

  it('updates footer text', async () => {
    const user = userEvent.setup();
    const { onChange } = renderBuilder();
    const footerInput = screen.getByPlaceholderText('Footer text...');
    await user.type(footerInput, 'My footer');
    expect(onChange).toHaveBeenCalled();
  });
});

// ── Preview component ─────────────────────────────────────────────

describe('EmbedPreview', () => {
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
        { name: 'Level', value: '42', inline: true },
        { name: 'XP', value: '1000', inline: true },
      ],
    };
    render(<EmbedPreview config={config} />);
    const fieldsContainer = screen.getByTestId('embed-preview-fields');
    expect(fieldsContainer).toHaveTextContent('Level');
    expect(fieldsContainer).toHaveTextContent('42');
  });

  it('renders accent color bar', () => {
    const config = { ...defaultEmbedConfig(), title: 'Test', color: '#FF0000' };
    render(<EmbedPreview config={config} />);
    const colorBar = screen.getByTestId('embed-color-bar');
    expect(colorBar).toHaveStyle({ backgroundColor: '#FF0000' });
  });

  it('renders footer with timestamp', () => {
    const config = {
      ...defaultEmbedConfig(),
      footerText: 'Bot Footer',
      showTimestamp: true,
    };
    render(<EmbedPreview config={config} />);
    const footer = screen.getByTestId('embed-preview-footer');
    expect(footer).toHaveTextContent('Bot Footer');
    expect(footer).toHaveTextContent('Today at 12:00 PM');
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
});

// ── Utility functions ─────────────────────────────────────────────

describe('getTotalCharCount', () => {
  it('sums all character counts', () => {
    const config: EmbedConfig = {
      ...defaultEmbedConfig(),
      title: 'abc',         // 3
      description: 'defgh', // 5
      footerText: 'ij',     // 2
      fields: [
        { name: 'kl', value: 'mno', inline: false }, // 2 + 3
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
