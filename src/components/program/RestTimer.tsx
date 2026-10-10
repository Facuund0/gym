"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

/** "90s", "2'", "1:30", "2 min" → segundos */
export function parseRest(rest: string | null | undefined): number | null {
  if (!rest) return null;
  const s = rest.trim().toLowerCase();
  let m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:[.,]\d+)?)\s*(?:'|min|m)\.?$/.exec(s);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * 60);
  m = /^(\d+)\s*(?:s|seg|"|'')?$/.exec(s);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Temporizador de descanso flotante con vibración y beep al terminar.
 * Para reiniciarlo con otro tiempo, el padre le cambia la `key`.
 */
export function RestTimer({ seconds, onClose }: { seconds: number; onClose: () => void }) {
  const [left, setLeft] = useState(seconds);
  const endAt = useRef(0);

  useEffect(() => {
    endAt.current = Date.now() + seconds * 1000;
    const id = setInterval(() => {
      const l = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        clearInterval(id);
        navigator.vibrate?.([300, 100, 300]);
        try {
          const ctx = new AudioContext();
          const o = ctx.createOscillator();
          o.frequency.value = 880;
          o.connect(ctx.destination);
          o.start();
          o.stop(ctx.currentTime + 0.35);
        } catch {
          /* sin audio */
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [seconds]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className="fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between rounded-2xl border border-brand/40 bg-surface p-3 shadow-2xl">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted">Descanso</p>
        <p className={cn("font-display text-4xl font-bold tabular-nums", left === 0 && "text-ok")}>
          {left === 0 ? "¡Dale!" : `${mm}:${ss}`}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-xl bg-surface-2 px-3 py-2 text-sm"
          onClick={() => {
            endAt.current += 15000;
            setLeft((l) => l + 15);
          }}
        >
          +15s
        </button>
        <button className="rounded-xl bg-surface-2 px-3 py-2 text-sm" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
