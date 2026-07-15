export function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <span className="field-error">{error}</span>;
}
