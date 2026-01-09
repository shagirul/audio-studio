import React, { useEffect, useMemo, useRef, useState } from "react";
import { Knob } from "./components/Knob";
import { Waveform } from "./components/Waveform";
import {
  BAND_FREQS,
  makeFlat,
  PRESETS,
  type EqState,
  type PresetId,
} from "./utils/eq.ts";
import { makeCompDefault, type CompressorState } from "./utils/compressor.ts";
import {
  denoiseStateFromStrength,
  denoiseStrengthFromState,
  makeDenoiseDefault,
  type DenoiseState,
} from "./utils/denoise.ts";
import type { EffectsPayload } from "../types/electron-api";

type AudioSelection = {
  filePath: string;
  meta: any;
} | null;

function getNiceFileName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function secondsToPretty(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

export default function App() {
  const [audio, setAudio] = useState<AudioSelection>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // File bytes (for sampling noise) + decoded PCM cache.
  const fileBytesRef = useRef<ArrayBuffer | null>(null);
  const decodedBufRef = useRef<AudioBuffer | null>(null);
  const [noiseSampleInfo, setNoiseSampleInfo] = useState<{
    startSeconds: number;
    endSeconds: number;
    noiseFloorDb: number;
  } | null>(null);
  const [denoiseNote, setDenoiseNote] = useState<string | null>(null);

  const [eqEnabled, setEqEnabled] = useState(true);
  const [eq, setEq] = useState<EqState>(() => makeFlat());
  const [preset, setPreset] = useState<PresetId>("flat");

  const [compEnabled, setCompEnabled] = useState(true);
  const [comp, setComp] = useState<CompressorState>(() => makeCompDefault());

  const [denoiseEnabled, setDenoiseEnabled] = useState(false);
  const [denoise, setDenoise] = useState<DenoiseState>(() =>
    makeDenoiseDefault()
  );
  const [denoiseAdvanced, setDenoiseAdvanced] = useState(false);
  const [denoiseStrength, setDenoiseStrength] = useState(() =>
    denoiseStrengthFromState(makeDenoiseDefault())
  );

  const [waveUrl, setWaveUrl] = useState<string | null>(null);
  const [waveBusy, setWaveBusy] = useState(false);
  const lastWaveSigRef = useRef("");
  const waveReqIdRef = useRef(0);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);

  // Optional FFmpeg preview (for denoise, since WebAudio preview doesn't include FFmpeg filters)
  const [ffPreviewUrl, setFfPreviewUrl] = useState<string | null>(null);
  const ffPreviewElRef = useRef<HTMLAudioElement | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);

  const durationSeconds = useMemo(() => {
    const fmt = (audio as any)?.meta?.format;
    const d = fmt?.duration ? Number(fmt.duration) : NaN;
    return Number.isFinite(d) ? d : NaN;
  }, [audio]);

  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);

  const effects: EffectsPayload = useMemo(
    () => ({
      denoiseEnabled,
      denoise,
      eqEnabled,
      eq,
      compEnabled,
      comp,
    }),
    [denoiseEnabled, denoise, eqEnabled, eq, compEnabled, comp]
  );

  // --- WebAudio graph (EQ + compressor only) ---
  const ctxRef = useRef<AudioContext | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const preampRef = useRef<GainNode | null>(null);
  const eqNodesRef = useRef<BiquadFilterNode[]>([]);
  const compNodeRef = useRef<DynamicsCompressorNode | null>(null);
  const makeupRef = useRef<GainNode | null>(null);

  const ensureAudioGraph = () => {
    if (!audioElRef.current) return;
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      srcNodeRef.current = ctxRef.current.createMediaElementSource(
        audioElRef.current
      );
      preampRef.current = ctxRef.current.createGain();

      eqNodesRef.current = BAND_FREQS.map((f) => {
        const n = ctxRef.current!.createBiquadFilter();
        n.type = "peaking";
        n.frequency.value = f;
        n.Q.value = 1;
        n.gain.value = 0;
        return n;
      });

      compNodeRef.current = ctxRef.current.createDynamicsCompressor();
      makeupRef.current = ctxRef.current.createGain();
      makeupRef.current.gain.value = 1;

      reconnectGraph();
    }
  };

  const reconnectGraph = () => {
    const ctx = ctxRef.current;
    const src = srcNodeRef.current;
    const pre = preampRef.current;
    const eqs = eqNodesRef.current;
    const compN = compNodeRef.current;
    const makeup = makeupRef.current;
    if (!ctx || !src || !pre || !compN || !makeup) return;

    // Disconnect everything first.
    try {
      src.disconnect();
      pre.disconnect();
      eqs.forEach((n) => n.disconnect());
      compN.disconnect();
      makeup.disconnect();
    } catch {}

    // Build chain: src -> preamp -> (EQ?) -> (Comp?) -> makeup -> destination
    let head: AudioNode = src;
    head.connect(pre);
    head = pre;

    if (eqEnabled) {
      // chain through eq filters
      eqs.forEach((n, idx) => {
        if (idx === 0) head.connect(n);
        else eqs[idx - 1]!.connect(n);
      });
      head = eqs[eqs.length - 1]!;
    }

    if (compEnabled) {
      head.connect(compN);
      head = compN;
    }

    head.connect(makeup);
    makeup.connect(ctx.destination);
  };

  const updateEqParams = () => {
    if (!preampRef.current) return;
    preampRef.current.gain.value = eqEnabled ? dbToGain(eq.preampDb) : 1;
    const nodes = eqNodesRef.current;
    nodes.forEach((n, i) => {
      const g = eq.bands[i]?.gainDb ?? 0;
      n.gain.value = eqEnabled ? g : 0;
    });
  };

  const updateCompParams = () => {
    const n = compNodeRef.current;
    const makeup = makeupRef.current;
    if (!n || !makeup) return;
    // WebAudio uses seconds for attack/release
    n.threshold.value = comp.thresholdDb;
    n.ratio.value = comp.ratio;
    n.attack.value = comp.attackMs / 1000;
    n.release.value = comp.releaseMs / 1000;
    n.knee.value = comp.kneeDb;
    makeup.gain.value = compEnabled ? dbToGain(comp.makeupDb) : 1;
  };

  useEffect(() => {
    updateEqParams();
    reconnectGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eq, eqEnabled]);

  useEffect(() => {
    updateCompParams();
    reconnectGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp, compEnabled]);

  // --- Waveform regeneration (FFmpeg, debounced) ---
  useEffect(() => {
    if (!audio) return;
    const sig = `${audio.filePath}|${JSON.stringify(effects)}`;
    if (sig === lastWaveSigRef.current) return;

    const firstForFile = !lastWaveSigRef.current.startsWith(
      `${audio.filePath}|`
    );
    const delayMs = firstForFile ? 0 : 280;
    const reqId = ++waveReqIdRef.current;

    const t = setTimeout(async () => {
      try {
        setWaveBusy(true);
        const wf = await window.api.renderWaveform({
          inputPath: audio.filePath,
          width: 1800,
          height: 220,
          effects,
        });
        if (waveReqIdRef.current !== reqId) return;
        lastWaveSigRef.current = sig;
        setWaveUrl(`data:${wf.mime};base64,${wf.dataBase64}`);
      } catch {
        // Non-fatal. Keep old waveform.
      } finally {
        if (waveReqIdRef.current === reqId) setWaveBusy(false);
      }
    }, delayMs);

    return () => clearTimeout(t);
  }, [audio?.filePath, effects]);

  const loadAudioFromPath = async (
    filePath: string,
    meta: any,
    options?: { resetSelection?: boolean }
  ) => {
    setAudio({ filePath, meta });
    setWaveUrl(null);
    lastWaveSigRef.current = "";
    setPos(0);
    setPlaying(false);

    const f = await window.api.readFileBase64({ filePath });
    const bin = atob(f.dataBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    fileBytesRef.current = bytes.buffer.slice(0, bytes.byteLength);
    decodedBufRef.current = null;

    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
    setAudioUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return blobUrl;
    });

    if (options?.resetSelection) {
      const d = meta?.format?.duration ? Number(meta.format.duration) : NaN;
      const dur = Number.isFinite(d) ? d : 0;
      setSelStart(0);
      setSelEnd(dur);
    }
  };

  const onPickFile = async () => {
    const res = await window.api.selectAudio();
    if (!res) return;
    await loadAudioFromPath(res.filePath, res.meta, { resetSelection: true });
    setNoiseSampleInfo(null);
    setDenoiseNote(null);
    setDenoise((prev) => ({ ...prev, noiseFloorDb: -50 }));
  };

  const ensureDecodedBuffer = async (): Promise<AudioBuffer> => {
    if (decodedBufRef.current) return decodedBufRef.current;
    if (!fileBytesRef.current) throw new Error("No audio loaded");
    ensureAudioGraph();
    const ctx = ctxRef.current;
    if (!ctx) throw new Error("AudioContext not available");
    const ab = fileBytesRef.current.slice(0);
    const buf = await ctx.decodeAudioData(ab);
    decodedBufRef.current = buf;
    return buf;
  };

  const computeNoiseFloorDbFromSelection = async (
    startSeconds: number,
    endSeconds: number
  ): Promise<number> => {
    const buf = await ensureDecodedBuffer();
    const sr = buf.sampleRate;
    const ch = buf.numberOfChannels;
    const start = Math.max(0, Math.min(startSeconds, endSeconds));
    const end = Math.max(start, Math.max(startSeconds, endSeconds));
    const s0 = Math.max(0, Math.min(buf.length - 1, Math.floor(start * sr)));
    const s1 = Math.max(s0 + 1, Math.min(buf.length, Math.floor(end * sr)));
    const n = s1 - s0;

    // RMS over all channels.
    let sumSq = 0;
    for (let c = 0; c < ch; c++) {
      const data = buf.getChannelData(c);
      for (let i = s0; i < s1; i++) {
        const v = data[i];
        sumSq += v * v;
      }
    }
    const rms = Math.sqrt(sumSq / (n * ch));
    const db = 20 * Math.log10(Math.max(1e-9, rms));
    // FFmpeg afftdn noise_floor expects [-80,-20].
    return clamp(db, -80, -20);
  };

  const onPresetChange = (id: PresetId) => {
    setPreset(id);
    const next = PRESETS[id].state;
    setEq({
      preampDb: next.preampDb,
      limiter: next.limiter,
      bands: next.bands.map((b) => ({ ...b })),
    });
  };

  const setBandGain = (freq: number, gainDb: number) => {
    setEq((prev) => ({
      ...prev,
      bands: prev.bands.map((b) => (b.freq === freq ? { ...b, gainDb } : b)),
    }));
  };

  const onPlayToggle = async () => {
    if (!audioElRef.current) return;
    ensureAudioGraph();
    if (ctxRef.current?.state === "suspended") await ctxRef.current.resume();

    if (audioElRef.current.paused) {
      // play from current selection start if outside selection
      if (
        audioElRef.current.currentTime < selStart ||
        audioElRef.current.currentTime > selEnd
      ) {
        audioElRef.current.currentTime = selStart;
      }
      await audioElRef.current.play();
    } else {
      audioElRef.current.pause();
    }
  };

  const onTimeUpdate = () => {
    const el = audioElRef.current;
    if (!el) return;
    setPos(el.currentTime);
    setPlaying(!el.paused);
    if (Number.isFinite(selEnd) && el.currentTime >= selEnd && !el.paused) {
      el.pause();
    }
  };

  const onSeek = (t: number) => {
    const el = audioElRef.current;
    if (!el) return;
    el.currentTime = clamp(
      t,
      0,
      Number.isFinite(durationSeconds) ? durationSeconds : t
    );
    setPos(el.currentTime);
  };

  const onSelectionChange = (a: number, b: number) => {
    const end = Number.isFinite(durationSeconds)
      ? durationSeconds
      : Math.max(a, b);
    const na = clamp(a, 0, end);
    const nb = clamp(b, 0, end);
    setSelStart(na);
    setSelEnd(nb);
  };

  const onSelectAll = () => {
    const end = Number.isFinite(durationSeconds) ? durationSeconds : 0;
    setSelStart(0);
    setSelEnd(end);
  };

  const onExport = async () => {
    if (!audio) return;
    const defaultName =
      getNiceFileName(audio.filePath).replace(/\.[^/.]+$/, "") +
      "-processed.mp3";
    const outputPath = await window.api.chooseExportPath({ defaultName });
    if (!outputPath) return;
    await window.api.exportAudio({
      inputPath: audio.filePath,
      outputPath,
      effects,
      range: {
        startSeconds: Math.min(selStart, selEnd),
        endSeconds: Math.max(selStart, selEnd),
      },
    });
  };

  const onCaptureNoise = async () => {
    if (!audio) return;
    setDenoiseNote(null);
    try {
      const start = Math.min(selStart, selEnd);
      const end = Math.max(selStart, selEnd);
      const dur = end - start;
      if (!Number.isFinite(dur) || dur < 0.05) {
        setDenoiseNote(
          "Select at least ~0.05s of “noise only” audio, then click Capture."
        );
        return;
      }
      if (dur > 10) {
        setDenoiseNote(
          "Noise sample is very long; 0.2–3s is usually enough (but we will still sample it)."
        );
      }
      const nf = await computeNoiseFloorDbFromSelection(start, end);
      setNoiseSampleInfo({
        startSeconds: start,
        endSeconds: end,
        noiseFloorDb: nf,
      });
      setDenoise((prev) => ({ ...prev, noiseFloorDb: nf }));
      setDenoiseEnabled(true);
      setDenoiseNote(
        `Captured noise floor ~ ${nf.toFixed(1)} dBFS from ${start.toFixed(
          2
        )}s–${end.toFixed(2)}s.`
      );
    } catch (e: any) {
      setDenoiseNote(String(e?.message ?? e));
    }
  };

  const onFfPreview = async () => {
    if (!audio) return;
    const start = Math.min(selStart, selEnd);
    const dur = clamp(Math.max(selEnd, selStart) - start, 0.5, 20);
    const res = await window.api.renderPreview({
      inputPath: audio.filePath,
      effects,
      startSeconds: start,
      durationSeconds: dur,
    });
    const bin = atob(res.dataBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: res.mime }));
    setFfPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return blobUrl;
    });
    // autoplay
    setTimeout(() => ffPreviewElRef.current?.play().catch(() => {}), 30);
  };

  const onDenoiseStrengthChange = (value: number) => {
    setDenoiseStrength(value);
    setDenoise((prev) => denoiseStateFromStrength(value, prev));
  };

  const updateDenoiseAdvanced = (
    updater: (prev: DenoiseState) => DenoiseState
  ) => {
    setDenoise((prev) => {
      const next = updater(prev);
      setDenoiseStrength(denoiseStrengthFromState(next));
      return next;
    });
  };

  const onToggleDenoiseAdvanced = (checked: boolean) => {
    if (checked) {
      setDenoise((prev) => denoiseStateFromStrength(denoiseStrength, prev));
    } else {
      setDenoiseStrength(denoiseStrengthFromState(denoise));
    }
    setDenoiseAdvanced(checked);
  };

  const onApplyDenoise = async () => {
    if (!audio) return;
    const start = Math.min(selStart, selEnd);
    const end = Math.max(selStart, selEnd);
    if (end - start < 0.01) {
      setDenoiseNote("Select a non-zero region before applying denoise.");
      return;
    }
    setApplyBusy(true);
    setDenoiseNote(null);
    try {
      const res = await window.api.applyDenoiseSelection({
        inputPath: audio.filePath,
        startSeconds: start,
        endSeconds: end,
        denoise: { ...denoise, outputNoiseOnly: false },
      });
      await loadAudioFromPath(res.filePath, res.meta, { resetSelection: false });
      setDenoiseEnabled(false);
      setDenoise((prev) => ({ ...prev, outputNoiseOnly: false }));
      setDenoiseNote(
        `Applied denoise to ${start.toFixed(2)}s–${end.toFixed(2)}s.`
      );
    } catch (e: any) {
      setDenoiseNote(String(e?.message ?? e));
    } finally {
      setApplyBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="title">FFmpeg EQ Studio</div>
          <div className="sub">
            Live preview (WebAudio) + export & waveform (FFmpeg) — Denoise
            (sampled afftdn) → EQ → Compressor
          </div>
        </div>

        <div className="row">
          <button className="btn" onClick={onPickFile}>
            Choose audio…
          </button>
          <button className="btn" onClick={() => onPresetChange("flat")}>
            Reset EQ
          </button>
          <button className="btn" onClick={onExport} disabled={!audio}>
            Export…
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <div className="pill">
              <span
                className="small"
                style={{ fontWeight: 900, letterSpacing: "0.08em" }}
              >
                FILE
              </span>
              <b>
                {audio ? getNiceFileName(audio.filePath) : "No file selected"}
              </b>
            </div>
            <div className="pill">
              <span
                className="small"
                style={{ fontWeight: 900, letterSpacing: "0.08em" }}
              >
                DURATION
              </span>
              <b>
                {Number.isFinite(durationSeconds)
                  ? secondsToPretty(durationSeconds)
                  : "—"}
              </b>
            </div>
          </div>

          <div className="pill">
            <span
              className="small"
              style={{ fontWeight: 900, letterSpacing: "0.08em" }}
            >
              LIVE PREVIEW
            </span>
            <button className="btn" onClick={onPlayToggle} disabled={!audioUrl}>
              {playing ? "Pause" : "Play"}
            </button>
            <span className="small">
              {secondsToPretty(pos)} /{" "}
              {Number.isFinite(durationSeconds)
                ? secondsToPretty(durationSeconds)
                : "—"}
            </span>
          </div>
        </div>

        <audio
          ref={audioElRef}
          src={audioUrl ?? undefined}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          style={{ display: "none" }}
        />

        <div className="hr" />

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="pill">
            <span
              className="small"
              style={{ fontWeight: 900, letterSpacing: "0.08em" }}
            >
              SELECTION
            </span>
            <b>{secondsToPretty(Math.min(selStart, selEnd))}</b>
            <span className="small">to</span>
            <b>{secondsToPretty(Math.max(selStart, selEnd))}</b>
            <span className="small">
              (
              {secondsToPretty(
                Math.max(
                  0,
                  Math.max(selStart, selEnd) - Math.min(selStart, selEnd)
                )
              )}
              )
            </span>
          </div>

          <div className="row">
            <div className="pill">
              <span className="small">Start</span>
              <input
                type="number"
                value={Math.min(selStart, selEnd).toFixed(2)}
                step={0.1}
                min={0}
                onChange={(e) =>
                  onSelectionChange(
                    Number(e.target.value),
                    Math.max(selStart, selEnd)
                  )
                }
                style={{ width: 110 }}
              />
              <span className="small">End</span>
              <input
                type="number"
                value={Math.max(selStart, selEnd).toFixed(2)}
                step={0.1}
                min={0}
                onChange={(e) =>
                  onSelectionChange(
                    Math.min(selStart, selEnd),
                    Number(e.target.value)
                  )
                }
                style={{ width: 110 }}
              />
            </div>
            <button className="btn" onClick={onSelectAll} disabled={!audio}>
              Select all
            </button>
          </div>
        </div>

        {waveBusy && (
          <div
            className="small"
            style={{ opacity: 0.75, marginLeft: 4, marginTop: 8 }}
          >
            Updating waveform…
          </div>
        )}

        <Waveform
          imageUrl={waveUrl}
          durationSeconds={
            Number.isFinite(durationSeconds) ? durationSeconds : 0
          }
          selStart={Math.min(selStart, selEnd)}
          selEnd={Math.max(selStart, selEnd)}
          playheadSeconds={pos}
          onSelectionChange={onSelectionChange}
          onSeek={onSeek}
        />

        <div className="small" style={{ marginTop: 10 }}>
          Drag the left/right stubs to set a selection. Click to seek. Drag
          inside the selection to move it. Drag the playhead line to scrub.
        </div>

        <div className="hr" />

        {/* DENOISE */}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="sectionTitle">CLEAN UP (DENOISE)</div>
          <div className="row">
            <label className="pill" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={denoiseEnabled}
                onChange={(e) => setDenoiseEnabled(e.target.checked)}
              />
              <b>Denoiser</b>
              <span className="small">(FFmpeg afftdn)</span>
            </label>

            <label className="pill" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={denoise.outputNoiseOnly}
                onChange={(e) =>
                  updateDenoiseAdvanced((p) => ({
                    ...p,
                    outputNoiseOnly: e.target.checked,
                  }))
                }
                disabled={!denoiseEnabled}
              />
              <b>Output noise only</b>
            </label>

            <label className="pill" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={denoiseAdvanced}
                onChange={(e) => onToggleDenoiseAdvanced(e.target.checked)}
                disabled={!denoiseEnabled}
              />
              <b>Advanced controls</b>
            </label>

            <button className="btn" onClick={onCaptureNoise} disabled={!audio}>
              Capture noise (from selection)
            </button>
            <button className="btn" onClick={onFfPreview} disabled={!audio}>
              Preview with FFmpeg (selection)
            </button>
            <button
              className="btn"
              onClick={onApplyDenoise}
              disabled={!audio || !denoiseEnabled || applyBusy}
            >
              {applyBusy ? "Applying…" : "Apply denoise"}
            </button>
          </div>
        </div>

        <div className="row" style={{ alignItems: "flex-start" }}>
          {!denoiseAdvanced && (
            <Knob
              label="Denoise amount"
              value={denoiseStrength}
              min={0}
              max={100}
              step={1}
              onChange={onDenoiseStrengthChange}
            />
          )}
          {denoiseAdvanced && (
            <>
              <Knob
                label="Freq scale"
                value={denoise.freqScale}
                min={0.2}
                max={2.0}
                step={0.01}
                onChange={(v) =>
                  updateDenoiseAdvanced((p) => ({ ...p, freqScale: v }))
                }
              />
              <Knob
                label="Smoothing"
                value={denoise.smoothing}
                min={0}
                max={50}
                step={1}
                onChange={(v) =>
                  updateDenoiseAdvanced((p) => ({ ...p, smoothing: v }))
                }
              />
              <Knob
                label="Amount"
                value={denoise.amount}
                min={0}
                max={40}
                step={0.5}
                onChange={(v) =>
                  updateDenoiseAdvanced((p) => ({ ...p, amount: v }))
                }
              />
            </>
          )}

          <div className="small" style={{ maxWidth: 640, lineHeight: 1.35 }}>
            <div>
              Step 1: select a <b>noise-only</b> section using the stubs, then
              click <b>Capture noise</b>. This estimates the noise floor (dBFS)
              and calibrates <b>afftdn</b>.
            </div>
            <div style={{ marginTop: 8 }}>
              Noise floor:&nbsp;
              <span
                style={{ color: "rgba(231,237,245,0.82)", fontWeight: 800 }}
              >
                {noiseSampleInfo
                  ? `${noiseSampleInfo.noiseFloorDb.toFixed(
                      1
                    )} dBFS (from ${noiseSampleInfo.startSeconds.toFixed(
                      2
                    )}s–${noiseSampleInfo.endSeconds.toFixed(2)}s)`
                  : `${denoise.noiseFloorDb.toFixed(
                      1
                    )} dBFS (default until you capture a sample)`}
              </span>
            </div>
            <div style={{ marginTop: 8, opacity: 0.85 }}>
              Note: denoise is applied in the <b>FFmpeg chain</b> (waveform +
              export). Use <b>Preview with FFmpeg</b> to hear it.
            </div>
            {denoiseNote && (
              <div
                style={{
                  marginTop: 8,
                  color: "rgba(255,190,190,0.95)",
                  fontWeight: 800,
                }}
              >
                {denoiseNote}
              </div>
            )}
          </div>
        </div>

        {ffPreviewUrl && (
          <div style={{ marginTop: 10 }}>
            <audio ref={ffPreviewElRef} controls src={ffPreviewUrl} />
          </div>
        )}

        <div className="hr" />

        {/* EQ */}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="sectionTitle">EQUALIZER</div>
          <div className="row">
            <label className="pill" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={eqEnabled}
                onChange={(e) => setEqEnabled(e.target.checked)}
              />
              <b>On</b>
            </label>
            <label className="pill" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={eq.limiter}
                onChange={(e) =>
                  setEq((prev) => ({ ...prev, limiter: e.target.checked }))
                }
              />
              <b>Limiter</b>
            </label>
            <div className="pill">
              <span className="small">Preset</span>
              <select
                value={preset}
                onChange={(e) => onPresetChange(e.target.value as PresetId)}
              >
                {Object.entries(PRESETS).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="row">
          <Knob
            label="Preamp"
            value={eq.preampDb}
            min={-12}
            max={12}
            step={0.5}
            unit=" dB"
            onChange={(v) => setEq((prev) => ({ ...prev, preampDb: v }))}
          />
        </div>

        <div className="grid8" style={{ marginTop: 4 }}>
          {BAND_FREQS.map((f, idx) => (
            <Knob
              key={f}
              label={f >= 1000 ? `${f / 1000}k` : `${f}`}
              value={eq.bands[idx]?.gainDb ?? 0}
              min={-12}
              max={12}
              step={0.5}
              unit=" dB"
              onChange={(v) => setBandGain(f, v)}
            />
          ))}
        </div>

        <div className="hr" />

        {/* COMP */}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="sectionTitle">COMPRESSOR</div>
          <label className="pill" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={compEnabled}
              onChange={(e) => setCompEnabled(e.target.checked)}
            />
            <b>On</b>
          </label>
        </div>

        <div className="row" style={{ gap: 18, marginTop: 2 }}>
          <Knob
            label="Threshold"
            value={comp.thresholdDb}
            min={-60}
            max={0}
            step={1}
            unit=" dB"
            onChange={(v) => setComp((p) => ({ ...p, thresholdDb: v }))}
          />
          <Knob
            label="Ratio"
            value={comp.ratio}
            min={1}
            max={12}
            step={0.1}
            unit=":1"
            onChange={(v) => setComp((p) => ({ ...p, ratio: v }))}
          />
          <Knob
            label="Attack"
            value={comp.attackMs}
            min={0.1}
            max={100}
            step={0.1}
            unit=" ms"
            onChange={(v) => setComp((p) => ({ ...p, attackMs: v }))}
          />
          <Knob
            label="Release"
            value={comp.releaseMs}
            min={10}
            max={1000}
            step={1}
            unit=" ms"
            onChange={(v) => setComp((p) => ({ ...p, releaseMs: v }))}
          />
          <Knob
            label="Knee"
            value={comp.kneeDb}
            min={0}
            max={20}
            step={0.5}
            unit=" dB"
            onChange={(v) => setComp((p) => ({ ...p, kneeDb: v }))}
          />
          <Knob
            label="Makeup"
            value={comp.makeupDb}
            min={-12}
            max={12}
            step={0.5}
            unit=" dB"
            onChange={(v) => setComp((p) => ({ ...p, makeupDb: v }))}
          />
        </div>
      </div>
    </div>
  );
}
