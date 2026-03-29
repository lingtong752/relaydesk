interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps): JSX.Element {
  return <p className="muted empty-state">{message}</p>;
}
