/**
 * Renders a simple empty-state container with a heading and an optional description.
 *
 * @param title - Text to display inside the heading (`h2`)
 * @param description - Optional text to display inside a paragraph (`p`) when provided
 * @returns A React element containing the empty-state markup
 */
export function MockEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
