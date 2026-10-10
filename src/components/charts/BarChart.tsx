import { cn } from "@/components/ui";

/** Gráfico de barras liviano (sin librerías) pensado para pantallas chicas. */
export function BarChart({
  labels,
  values,
  format,
  highlight,
  relative = false,
}: {
  labels: string[];
  values: number[];
  format: (v: number) => string;
  highlight?: number;
  /** Si true, la escala arranca cerca del mínimo (útil para peso corporal). */
  relative?: boolean;
}) {
  const nonZero = values.filter((v) => v > 0);
  const max = Math.max(1, ...values);
  const min = relative && nonZero.length ? Math.min(...nonZero) * 0.97 : 0;
  const best = values.indexOf(Math.max(...values));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {values.map((v, i) => {
          const h = v > 0 ? Math.max(4, ((v - min) / Math.max(1e-9, max - min)) * 100) : 2;
          return (
            <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                title={format(v)}
                className={cn(
                  "rounded-t-md transition",
                  i === highlight ? "bg-brand" : v > 0 ? "bg-brand/45" : "bg-surface-2",
                )}
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {labels.map((l, i) => (
          <span key={i} className={cn("flex-1 text-center text-[10px]", i === highlight ? "font-bold text-text" : "text-muted")}>
            {l}
          </span>
        ))}
      </div>
      {values[best] > 0 && (
        <p className="mt-2 text-xs text-muted">
          Mejor semana: {labels[best]} · {format(values[best])}
        </p>
      )}
    </div>
  );
}
