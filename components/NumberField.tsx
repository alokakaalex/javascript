"use client";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  step?: number;
}

export default function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  step = 1,
}: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          step={step}
          onChange={(e) => onChange(e.target.valueAsNumber || 0)}
        />
        {suffix ? (
          <span className="whitespace-nowrap text-xs text-zinc-500">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}
