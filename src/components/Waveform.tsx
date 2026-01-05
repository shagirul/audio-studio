import React, { useMemo, useRef, useState } from 'react';

type DragMode = 'none' | 'left' | 'right' | 'move' | 'seek' | 'playhead';

type Props = {
  imageUrl: string | null;
  durationSeconds: number;
  selStart: number;
  selEnd: number;
  playheadSeconds: number;
  onSelectionChange: (start: number, end: number) => void;
  onSeek: (t: number) => void;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function Waveform({ imageUrl, durationSeconds, selStart, selEnd, playheadSeconds, onSelectionChange, onSeek }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragMode>('none');
  const startRef = useRef({ x: 0, a: 0, b: 0, t: 0 });

  const a = Math.min(selStart, selEnd);
  const b = Math.max(selStart, selEnd);

  const pctA = durationSeconds > 0 ? (a / durationSeconds) * 100 : 0;
  const pctB = durationSeconds > 0 ? (b / durationSeconds) * 100 : 0;
  const pctPlay = durationSeconds > 0 ? (playheadSeconds / durationSeconds) * 100 : 0;

  const xToTime = (clientX: number) => {
    const el = ref.current;
    if (!el || durationSeconds <= 0) return 0;
    const r = el.getBoundingClientRect();
    const px = clamp(clientX - r.left, 0, r.width);
    return (px / r.width) * durationSeconds;
  };

  const begin = (mode: DragMode, e: React.PointerEvent) => {
    ref.current?.setPointerCapture(e.pointerId);
    setDrag(mode);
    startRef.current = { x: e.clientX, a, b, t: playheadSeconds };
  };

  const onBgPointerDown = (e: React.PointerEvent) => {
    // If clicking within selection -> move selection; else seek.
    const t = xToTime(e.clientX);
    if (t >= a && t <= b) {
      begin('move', e);
    } else {
      begin('seek', e);
      onSeek(t);
    }
  };

  const onLeftDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    begin('left', e);
  };
  const onRightDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    begin('right', e);
  };
  const onPlayheadDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    begin('playhead', e);
    onSeek(xToTime(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === 'none') return;
    const t = xToTime(e.clientX);
    const dxT = durationSeconds > 0 ? (xToTime(e.clientX) - xToTime(startRef.current.x)) : 0;
    if (drag === 'seek' || drag === 'playhead') {
      onSeek(t);
      return;
    }
    if (drag === 'left') {
      onSelectionChange(clamp(t, 0, b), b);
      return;
    }
    if (drag === 'right') {
      onSelectionChange(a, clamp(t, a, durationSeconds));
      return;
    }
    if (drag === 'move') {
      const w = startRef.current.b - startRef.current.a;
      let na = startRef.current.a + dxT;
      na = clamp(na, 0, Math.max(0, durationSeconds - w));
      onSelectionChange(na, na + w);
    }
  };

  const onPointerUp = () => setDrag('none');

  const bg = useMemo(() => {
    if (!imageUrl) return null;
    return { backgroundImage: `url(${imageUrl})` };
  }, [imageUrl]);

  return (
    <div className="waveWrap">
      <div
        className="wave"
        ref={ref}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={bg ?? undefined}
      >
        {!imageUrl && <div className="wavePlaceholder">Waveform will appear here…</div>}

        {/* selection overlay */}
        <div className="waveSel" style={{ left: `${pctA}%`, width: `${pctB - pctA}%` }}>
          <div className="waveHandle left" onPointerDown={onLeftDown} />
          <div className="waveHandle right" onPointerDown={onRightDown} />
        </div>

        {/* playhead */}
        <div className="wavePlay" style={{ left: `${pctPlay}%` }} onPointerDown={onPlayheadDown} />
      </div>
    </div>
  );
}
