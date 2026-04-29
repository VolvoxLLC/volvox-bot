type SelectOption = { value: string; label: string };

type MockElement = { type: unknown; props: Record<string, unknown> };
type SelectComponentName = 'SelectTrigger' | 'SelectItem';

function isMockElement(value: unknown): value is MockElement {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value;
}

function textFromChildren(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join('');
  if (isMockElement(children)) return textFromChildren(children.props.children);
  return '';
}

function selectComponentName(type: unknown): string | undefined {
  if (typeof type !== 'function') return undefined;
  return (type as { displayName?: string; name?: string }).displayName ?? type.name;
}

function isSelectComponent(
  type: unknown,
  component: unknown,
  fallbackName: SelectComponentName,
): boolean {
  return type === component || selectComponentName(type) === fallbackName;
}

export function readSelectChildren(children: unknown): { id?: string; options: SelectOption[] } {
  const result: { id?: string; options: SelectOption[] } = { options: [] };
  const stack = Array.isArray(children) ? [...children] : [children];

  while (stack.length > 0) {
    const child = stack.shift();
    if (Array.isArray(child)) {
      stack.push(...child);
      continue;
    }
    if (!isMockElement(child)) continue;

    if (
      isSelectComponent(child.type, SelectTrigger, 'SelectTrigger') &&
      typeof child.props.id === 'string'
    ) {
      result.id = child.props.id;
    }

    if (
      isSelectComponent(child.type, SelectItem, 'SelectItem') &&
      typeof child.props.value === 'string'
    ) {
      result.options.push({
        value: child.props.value,
        label: textFromChildren(child.props.children),
      });
    }

    const nestedChildren = child.props.children;
    if (Array.isArray(nestedChildren)) {
      stack.push(...nestedChildren);
    } else if (nestedChildren !== undefined) {
      stack.push(nestedChildren);
    }
  }

  return result;
}

export function Select({
  children,
  disabled,
  onValueChange,
  value,
}: {
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
}) {
  const { id, options } = readSelectChildren(children);
  return (
    <select
      id={id}
      disabled={disabled}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {options.length > 0 ? (
        options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))
      ) : (
        <option value="">No visible models configured</option>
      )}
    </select>
  );
}

export function SelectContent({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}

export function SelectGroup({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}

export function SelectItem({
  children,
}: {
  readonly children: React.ReactNode;
  readonly value: string;
}) {
  return <>{children}</>;
}

export function SelectLabel({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}

export function SelectTrigger({ children }: { readonly children: React.ReactNode; readonly id?: string }) {
  return <>{children}</>;
}

export function SelectValue() {
  return null;
}

Select.displayName = 'Select';
SelectContent.displayName = 'SelectContent';
SelectGroup.displayName = 'SelectGroup';
SelectItem.displayName = 'SelectItem';
SelectLabel.displayName = 'SelectLabel';
SelectTrigger.displayName = 'SelectTrigger';
SelectValue.displayName = 'SelectValue';
