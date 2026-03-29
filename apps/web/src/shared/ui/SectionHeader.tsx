import type { ReactNode } from "react";

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions
}: SectionHeaderProps): JSX.Element {
  return (
    <div className="chat-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h3>{title}</h3>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
