import { useState } from 'react';
import type { ManagedListItem } from '@veritas-kanban/shared';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { DndContext, closestCenter } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortableList } from '@/hooks/useSortableList';
import { SortableListItem } from './SortableListItem';

export interface ManagedListManagerProps<T extends ManagedListItem> {
  title: string;
  items: T[];
  isLoading: boolean;
  onCreate: (input: any) => Promise<any>;
  onUpdate: (id: string, patch: any) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
  onReorder: (ids: string[]) => Promise<any>;
  renderExtraFields?: (
    item: T,
    onChange: (patch: Partial<T>) => void
  ) => React.ReactNode;
  newItemDefaults?: Partial<T>;
  canDeleteCheck?: (id: string) => Promise<{
    allowed: boolean;
    referenceCount: number;
    isDefault: boolean;
  }>;
}

export function ManagedListManager<T extends ManagedListItem>({
  title,
  items,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  renderExtraFields,
  newItemDefaults,
  canDeleteCheck,
}: ManagedListManagerProps<T>) {
  const [newItemLabel, setNewItemLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { localItems, sensors, handleDragEnd, handleMoveUp, handleMoveDown } =
    useSortableList({
      items,
      onReorder,
    });

  const handleCreate = async () => {
    if (!newItemLabel.trim()) return;

    setIsCreating(true);
    try {
      await onCreate({
        label: newItemLabel.trim(),
        ...newItemDefaults,
      });
      setNewItemLabel('');
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading {title.toLowerCase()}...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={localItems.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {localItems.map((item, index) => (
            <SortableListItem
              key={item.id}
              item={item}
              index={index}
              totalItems={localItems.length}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              renderExtraFields={renderExtraFields}
              canDeleteCheck={canDeleteCheck}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="flex gap-2">
        <Input
          placeholder="New item name..."
          value={newItemLabel}
          onChange={(e) => setNewItemLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
          }}
          disabled={isCreating}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={!newItemLabel.trim() || isCreating}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
