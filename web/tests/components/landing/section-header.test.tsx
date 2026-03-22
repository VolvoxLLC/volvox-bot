import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionHeader } from '@/components/landing/SectionHeader';

describe('SectionHeader', () => {
  it('should render label, title, and subtitle', () => {
    render(<SectionHeader label="THE PRODUCT" labelColor="primary" title="Your server" subtitle="Configure everything." />);
    expect(screen.getByText('THE PRODUCT')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Your server');
    expect(screen.getByText('Configure everything.')).toBeInTheDocument();
  });

  it('should render without subtitle when not provided', () => {
    render(<SectionHeader label="FEATURES" labelColor="accent" title="Everything you need" />);
    expect(screen.getByText('FEATURES')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Everything you need');
  });
});
