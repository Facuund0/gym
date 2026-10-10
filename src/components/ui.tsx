import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cn(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size = "md",
  className,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4",
        size === "lg" && "h-14 px-6 text-lg",
        variant === "primary" && "bg-brand text-white hover:brightness-110",
        variant === "secondary" && "bg-surface-2 text-text border border-border hover:bg-border/60",
        variant === "ghost" && "text-text hover:bg-surface-2",
        variant === "danger" && "bg-bad/15 text-bad hover:bg-bad/25",
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-border bg-surface p-4", className)}>{children}</div>;
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1 block text-sm font-medium text-muted">
      {children}
      {hint && <span className="ml-1 font-normal opacity-70">· {hint}</span>}
    </span>
  );
}

const fieldBase =
  "w-full rounded-xl border border-border bg-surface-2 px-3 text-text placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/60";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldBase, "h-11", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldBase, "min-h-24 py-2", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(fieldBase, "h-11", props.className)} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "brand" | "ok" | "warn" | "bad"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "brand" && "bg-brand/15 text-brand",
        tone === "ok" && "bg-ok/15 text-ok",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "bad" && "bg-bad/15 text-bad",
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-label="Cargando"
      className={cn("inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
    />
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase leading-none">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-16 text-brand">
      <Spinner className="size-7" />
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{children}</p>;
}
