import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface BulkActionsContextValue {
  selectedIds: Set<string>;
  isSelecting: boolean;
  toggleSelecting: () => void;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  toggleGroup: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

const BulkActionsContext = createContext<BulkActionsContextValue | null>(null);

export function BulkActionsProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);

  const toggleSelecting = useCallback(() => {
    setIsSelecting((prev) => {
      if (prev) {
        // Clear selection when exiting selection mode
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  /** Toggle a group of IDs: if all are selected, remove them; otherwise add them. */
  const toggleGroup = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allInGroup = ids.length > 0 && ids.every((id) => next.has(id));
      if (allInGroup) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelecting(false);
  }, []);

  const isSelected = useCallback(
    (id: string) => {
      return selectedIds.has(id);
    },
    [selectedIds]
  );

  const value: BulkActionsContextValue = {
    selectedIds,
    isSelecting,
    toggleSelecting,
    toggleSelect,
    selectAll,
    toggleGroup,
    clearSelection,
    isSelected,
  };

  return <BulkActionsContext.Provider value={value}>{children}</BulkActionsContext.Provider>;
}

// Default values for when hook is used outside provider (e.g., DragOverlay)
const defaultContext: BulkActionsContextValue = {
  selectedIds: new Set(),
  isSelecting: false,
  toggleSelecting: () => {},
  toggleSelect: () => {},
  selectAll: () => {},
  toggleGroup: () => {},
  clearSelection: () => {},
  isSelected: () => false,
};

export function useBulkActions() {
  const context = useContext(BulkActionsContext);
  // Return default context if outside provider (safe for DragOverlay)
  return context || defaultContext;
}
