import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigDiffModal } from '@/components/dashboard/config-diff-modal';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  original: { ai: { enabled: false }, welcome: { enabled: true } },
  modified: { ai: { enabled: true }, welcome: { enabled: true } },
  changedSections: ['ai'],
  onConfirm: vi.fn(),
  onRevertSection: vi.fn(),
  saving: false,
};

describe('ConfigDiffModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog when open', () => {
    render(<ConfigDiffModal {...baseProps} />);
    expect(screen.getByText('Review Changes Before Saving')).toBeInTheDocument();
  });

  it('shows changed sections as badges', () => {
    render(<ConfigDiffModal {...baseProps} changedSections={['ai', 'welcome']} />);
    expect(screen.getByText('ai')).toBeInTheDocument();
    expect(screen.getByText('welcome')).toBeInTheDocument();
  });

  it('calls onRevertSection with section name when revert button clicked', async () => {
    const user = userEvent.setup();
    const onRevertSection = vi.fn();
    render(<ConfigDiffModal {...baseProps} onRevertSection={onRevertSection} />);
    await user.click(screen.getByRole('button', { name: 'Revert ai changes' }));
    expect(onRevertSection).toHaveBeenCalledWith('ai');
  });

  it('calls onConfirm when "Confirm Save" button clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfigDiffModal {...baseProps} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: /confirm save/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ConfigDiffModal {...baseProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables buttons while saving', () => {
    render(<ConfigDiffModal {...baseProps} saving={true} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revert ai changes' })).toBeDisabled();
  });

  it('shows "Saving..." text while saving', () => {
    render(<ConfigDiffModal {...baseProps} saving={true} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
  });

  it('does not render changed sections fieldset when changedSections is empty', () => {
    render(<ConfigDiffModal {...baseProps} changedSections={[]} />);
    // No badges rendered
    expect(screen.queryByText('ai')).not.toBeInTheDocument();
  });
});
