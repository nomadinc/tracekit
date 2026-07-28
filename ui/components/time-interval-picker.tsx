"use client";

import * as React from "react";

type DateRange = {
  from?: Date;
  to?: Date;
};

function fmt(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInputValue(v: string): Date | undefined {
  if (!v) return undefined;
  const [y, m, d] = v.split("-").map((x) => Number(x));
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return isNaN(dt.getTime()) ? undefined : dt;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysInclusive(range: DateRange) {
  if (!range.from || !range.to) return 0;
  const a = startOfDay(range.from).getTime();
  const b = startOfDay(range.to).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

function sameDayRange(a: DateRange, b: DateRange) {
  if (!a.from || !a.to || !b.from || !b.to) return false;
  return (
    startOfDay(a.from).getTime() === startOfDay(b.from).getTime() &&
    startOfDay(a.to).getTime() === startOfDay(b.to).getTime()
  );
}

export function TimeIntervalPicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const [open, setOpen] = React.useState(false);

  // When open, we measure and decide whether to align dropdown left or right
  const [align, setAlign] = React.useState<"left" | "right">("left");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  const now = new Date();

  const [fromStr, setFromStr] = React.useState<string>(() =>
    value.from ? toDateInputValue(value.from) : ""
  );
  const [toStr, setToStr] = React.useState<string>(() =>
    value.to ? toDateInputValue(value.to) : ""
  );

  React.useEffect(() => {
    setFromStr(value.from ? toDateInputValue(value.from) : "");
    setToStr(value.to ? toDateInputValue(value.to) : "");
  }, [value.from, value.to]);

  const presets = [
    {
      label: "Today",
      get: () => ({ from: startOfDay(now), to: endOfDay(now) }),
    },
    {
      label: "Yesterday",
      get: () => {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        return { from: startOfDay(y), to: endOfDay(y) };
      },
    },
    {
      label: "Last 7 Days",
      get: () => {
        const from = new Date(now);
        from.setDate(from.getDate() - 6);
        return { from: startOfDay(from), to: endOfDay(now) };
      },
    },
    {
      label: "Month to Date",
      get: () => {
        const from = new Date(now);
        from.setDate(1);
        return { from: startOfDay(from), to: endOfDay(now) };
      },
    },
  ];

  const summary =
    value.from && value.to
      ? `${fmt(value.from)} → ${fmt(value.to)} • ${daysInclusive(value)} day${
          daysInclusive(value) === 1 ? "" : "s"
        }`
      : "Select time interval…";

  function close() {
    setOpen(false);
  }

  function applyInputs() {
    const from = parseDateInputValue(fromStr);
    const to = parseDateInputValue(toStr);

    if (!from && !to) {
      onChange({});
      close();
      return;
    }

    let f = from ?? to!;
    let t = to ?? from!;

    f = startOfDay(f);
    t = endOfDay(t);

    if (t.getTime() < f.getTime()) {
      const tmpF = f;
      f = startOfDay(t);
      t = endOfDay(tmpF);
    }

    onChange({ from: f, to: t });
    close();
  }

  // Close on outside click + ESC
  React.useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      close();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("touchstart", onDocMouseDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("touchstart", onDocMouseDown as any);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Responsive positioning: if dropdown would overflow right edge, align right
  React.useEffect(() => {
    if (!open) return;

    const decideAlignment = () => {
      const btn = buttonRef.current;
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const vw = window.innerWidth;

      // We will render a dropdown with max width ~ min(360px, vw - 24)
      const desired = Math.min(360, Math.max(260, vw - 24));

      const wouldOverflowRight = rect.left + desired > vw - 12;
      const wouldOverflowLeft = rect.right - desired < 12;

      if (wouldOverflowRight && !wouldOverflowLeft) setAlign("right");
      else setAlign("left");
    };

    decideAlignment();
    window.addEventListener("resize", decideAlignment);
    window.addEventListener("scroll", decideAlignment, true);

    return () => {
      window.removeEventListener("resize", decideAlignment);
      window.removeEventListener("scroll", decideAlignment, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        className="max-w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-white/10 dark:bg-ink/80 dark:text-slate-100 dark:hover:bg-slate-900"
        onClick={() => setOpen((v) => !v)}
      >
        {summary}
      </button>

      {open && (
        <div
          className={[
            "absolute z-20 mt-2 rounded-md border border-slate-200 bg-white p-3 text-slate-900 shadow-lg shadow-slate-900/10 dark:border-white/10 dark:bg-ink dark:text-slate-100 dark:shadow-black/40",
            // clamp width to viewport, but never too tiny
            "w-[min(360px,calc(100vw-24px))] min-w-[260px] space-y-3",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {/* Presets */}
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              PRESETS
            </div>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p) => {
                const presetRange = p.get();
                const selected = sameDayRange(value, presetRange);
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={selected}
                    className={[
                      "rounded border px-2 py-2 text-left text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-60",
                      selected
                        ? "border-teal-500 bg-teal-50 text-teal-800 dark:border-teal-400 dark:bg-teal-400/10 dark:text-teal-200"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:bg-slate-900",
                    ].join(" ")}
                    onClick={() => {
                      const next = presetRange;
                      onChange(next);
                      setFromStr(next.from ? toDateInputValue(next.from) : "");
                      setToStr(next.to ? toDateInputValue(next.to) : "");
                      close();
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom range */}
          <div className="border-t border-slate-200 pt-3 dark:border-white/10">
            <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              CUSTOM RANGE
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                From
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 [color-scheme:light] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark] dark:placeholder:text-slate-500 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
                  value={fromStr}
                  onChange={(e) => setFromStr(e.target.value)}
                />
              </label>

              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                To
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 [color-scheme:light] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark] dark:placeholder:text-slate-500 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
                  value={toStr}
                  onChange={(e) => setToStr(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-white/10 dark:text-slate-200 dark:hover:bg-slate-900"
                onClick={() => {
                  setFromStr("");
                  setToStr("");
                  onChange({});
                  close();
                }}
              >
                Clear
              </button>

              <div className="space-x-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-white/10 dark:text-slate-200 dark:hover:bg-slate-900"
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md border border-teal-700 bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-600 disabled:opacity-80 dark:border-teal-500 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                  onClick={applyInputs}
                  disabled={!fromStr && !toStr}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
