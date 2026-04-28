export function MockEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
