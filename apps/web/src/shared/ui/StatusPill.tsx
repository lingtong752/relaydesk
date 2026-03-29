interface StatusPillProps {
  className?: string;
  label: string;
}

export function StatusPill({ className, label }: StatusPillProps): JSX.Element {
  return <div className={className ? `connection-pill ${className}` : "connection-pill"}>{label}</div>;
}
