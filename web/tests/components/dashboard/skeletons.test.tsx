import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ChartSkeleton,
  FilterBarSkeleton,
  PageSkeleton,
  SectionSkeleton,
  StatCardGridSkeleton,
  StatCardSkeleton,
  TableSkeleton,
} from '@/components/dashboard/skeletons';

describe('StatCardSkeleton', () => {
  it('renders a card with skeleton placeholders', () => {
    const { container } = render(<StatCardSkeleton />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });
});

describe('StatCardGridSkeleton', () => {
  it('renders default 4 skeleton cards', () => {
    const { container } = render(<StatCardGridSkeleton />);
    // Each StatCardSkeleton has multiple pulse elements; check the grid wrapper
    const grid = container.firstElementChild;
    expect(grid?.children.length).toBe(4);
  });

  it('respects custom count', () => {
    const { container } = render(<StatCardGridSkeleton count={2} />);
    const grid = container.firstElementChild;
    expect(grid?.children.length).toBe(2);
  });
});

describe('SectionSkeleton', () => {
  it('renders heading and content skeletons', () => {
    const { container } = render(<SectionSkeleton />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });
});

describe('FilterBarSkeleton', () => {
  it('renders filter bar placeholders', () => {
    const { container } = render(<FilterBarSkeleton />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });
});

describe('TableSkeleton', () => {
  it('renders default 6 rows with 5 columns', () => {
    const { container } = render(<TableSkeleton />);
    const rows = container.querySelectorAll('.divide-y > div');
    expect(rows.length).toBe(6);
    // Each row should have 5 skeleton cells
    const firstRowSkeletons = rows[0]?.querySelectorAll('.animate-pulse');
    expect(firstRowSkeletons?.length).toBe(5);
  });

  it('respects custom rows and columns', () => {
    const { container } = render(<TableSkeleton rows={3} columns={2} />);
    const rows = container.querySelectorAll('.divide-y > div');
    expect(rows.length).toBe(3);
    const firstRowSkeletons = rows[0]?.querySelectorAll('.animate-pulse');
    expect(firstRowSkeletons?.length).toBe(2);
  });
});

describe('PageSkeleton', () => {
  it('renders header, filter bar, and table skeletons', () => {
    const { container } = render(<PageSkeleton />);
    // Should have many skeleton elements across header + filter + table
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(10);
  });
});

describe('ChartSkeleton', () => {
  it('renders a card with chart placeholder', () => {
    const { container } = render(<ChartSkeleton />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    // Title skeleton + description skeleton + chart area skeleton
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('respects custom height', () => {
    const { container } = render(<ChartSkeleton height={400} />);
    const chartArea = container.querySelector('[style*="height"]');
    expect(chartArea).toBeTruthy();
    expect(chartArea?.getAttribute('style')).toContain('400');
  });
});
