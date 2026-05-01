import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/material-dropdown-menu';

describe('DropdownMenuItem', () => {
  it('uses the child anchor as the menu item when rendered asChild', () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open account menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild>
            <a href="https://docs.volvox.bot" rel="noopener noreferrer" target="_blank">
              Documentation
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const documentationItem = screen.getByRole('menuitem', { name: 'Documentation' });

    expect(documentationItem.tagName).toBe('A');
    expect(documentationItem).toHaveAttribute('href', 'https://docs.volvox.bot');
  });
});
