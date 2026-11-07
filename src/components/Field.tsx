export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="err" ref={(el) => { if (el && message) el.scrollIntoView({ block: "center", behavior: "smooth" }); }}>
      {message}
    </p>
  );
}
