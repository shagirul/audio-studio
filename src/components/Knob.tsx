import React, { useMemo, useRef } from 'react';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function Knob({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  onChange,
  disabled = false
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const startRef = useRef({ y: 0, val: 0 });

  const pct = (value - min) / (max - min);
  const angle = -135 + pct * 270;

  const pretty = useMemo(() => {
    const v = Math.round((value + Number.EPSILON) / step) * step;
    const s = (Math.round(v * 100) / 100).toString();
    return unit ? `${s}${unit}` : s;
  }, [value, unit, step]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    ref.current?.setPointerCapture(e.pointerId);
    startRef.current = { y: e.clientY, val: value };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled) return;
    if (!(e.buttons & 1)) return;
    const dy = startRef.current.y - e.clientY;
    const sensitivity = (max - min) / 160;
    const next = clamp(startRef.current.val + dy * sensitivity, min, max);
    const snapped = Math.round(next / step) * step;
    onChange(clamp(snapped, min, max));
  };

  return (
    <div className="knobWrap">
      <div
        className={`knob${disabled ? ' knobDisabled' : ''}`}
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
      >
        <div className="knobDial" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <div className="knobLabel">{label}</div>
      <div className="knobValue">{pretty}</div>
    </div>
  );
}
