interface SectionHeaderProps {
  readonly label: string;
  readonly labelColor: 'primary' | 'secondary' | 'accent';
  readonly title: string;
  readonly subtitle?: string;
  readonly className?: string;
}

const labelColorClasses: Record<string, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  accent: 'text-accent',
};

/**
 * Shared section header with uppercase label, title, and optional subtitle.
 * Used across all landing page sections for consistent visual hierarchy.
 */
export function SectionHeader({ label, labelColor, title, subtitle, className }: SectionHeaderProps) {
  return (
    <div className={`text-center ${className ?? ''}`}>
      <div className={`text-[10px] uppercase tracking-[2.5px] font-bold mb-2 ${labelColorClasses[labelColor]}`}>
        {label}
      </div>
      <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
        {title}
      </h2>
      {subtitle && (
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">{subtitle}</p>
      )}
    </div>
  );
}
