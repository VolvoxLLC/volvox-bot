type SelectOption = { value: string; label: string };

type MockElement = { type: unknown; props: Record<string, unknown> };

function isMockElement(value: unknown): value is MockElement {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value;
}

function textFromChildren(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join('');
  if (isMockElement(children)) return textFromChildren(children.props.children);
  return '';
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
      typeof child.type === 'function' &&
      child.type.name === 'SelectTrigger' &&
      typeof child.props.id === 'string'
    ) {
      result.id = child.props.id;
    }

    if (
      typeof child.type === 'function' &&
      child.type.name === 'SelectItem' &&
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
  children: React.ReactNode;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  value?: string;
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

export function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SelectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SelectItem({ children }: { children: React.ReactNode; value: string }) {
  return <>{children}</>;
}

export function SelectLabel({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SelectTrigger({ children }: { children: React.ReactNode; id?: string }) {
  return <>{children}</>;
}

export function SelectValue() {
  return null;
}
