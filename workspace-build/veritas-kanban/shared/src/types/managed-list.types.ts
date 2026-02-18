// Managed List Types

/** Base interface for managed list items */
export interface ManagedListItem {
  id: string;
  label: string;
  order: number;
  isDefault?: boolean;
  isHidden?: boolean;
  created: string;
  updated: string;
}

/** Configuration options for ManagedListService */
export interface ManagedListServiceOptions {
  filename: string;
  configDir: string;
  defaults: ManagedListItem[];
}

/** Task type configuration with icon and color */
export interface TaskTypeConfig extends ManagedListItem {
  icon: string;    // Lucide icon name (e.g., "Code", "Search")
  color?: string;  // Tailwind border color class (e.g., "border-l-violet-500")
}

/** Project configuration with description and badge color */
export interface ProjectConfig extends ManagedListItem {
  description?: string;
  color?: string;  // Tailwind bg color class for badges (e.g., "bg-blue-500/20")
}

/** Sprint configuration */
export interface SprintConfig extends ManagedListItem {
  description?: string;
}
