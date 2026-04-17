import { describe, expect, it } from 'vitest';
import { inputClasses } from '@/components/dashboard/config-sections/shared';

describe('config-sections shared utilities', () => {
  it('inputClasses contains expected base classes', () => {
    expect(inputClasses).toContain('rounded-md');
    expect(inputClasses).toContain('border');
    expect(inputClasses).toContain('text-sm');
    expect(inputClasses).toContain('disabled:opacity-50');
  });
});
