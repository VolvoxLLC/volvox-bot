import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigDiff } from '@/components/dashboard/config-diff';

describe('ConfigDiff', () => {
  it('shows "no changes" when objects are identical', () => {
    const config = { ai: { enabled: true }, welcome: { enabled: false } };
    render(<ConfigDiff original={config} modified={config} />);
    expect(screen.getByText('No changes detected.')).toBeInTheDocument();
  });

  it('renders added/removed line counts when configs differ', () => {
    const original = { ai: { enabled: false } };
    const modified = { ai: { enabled: true } };
    render(<ConfigDiff original={original} modified={modified} />);
    // Added/removed counts should be visible
    expect(screen.getByText(/\+\d+/)).toBeInTheDocument();
    expect(screen.getByText(/-\d+/)).toBeInTheDocument();
  });

  it('uses custom title when provided', () => {
    const config = { ai: { enabled: true } };
    render(<ConfigDiff original={config} modified={{ ai: { enabled: false } }} title="My Custom Title" />);
    expect(screen.getByText('My Custom Title')).toBeInTheDocument();
  });

  it('defaults to "Pending Changes" title', () => {
    const config = { ai: { enabled: true } };
    render(<ConfigDiff original={config} modified={{ ai: { enabled: false } }} />);
    expect(screen.getByText('Pending Changes')).toBeInTheDocument();
  });

  it('shows diff view when configs differ', () => {
    const original = { ai: { enabled: false } };
    const modified = { ai: { enabled: true } };
    render(<ConfigDiff original={original} modified={modified} />);
    expect(screen.getByRole('region', { name: 'Configuration diff' })).toBeInTheDocument();
  });
});
