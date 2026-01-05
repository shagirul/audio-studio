import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

// These packages are CommonJS; keep typings loose.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath: string = require('ffmpeg-static');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobePkg: any = require('ffprobe-static');
const ffprobePath: string = ffprobePkg?.path;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function runProcess(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} failed (${code}):\n${stderr || stdout}`));
    });
  });
}

async function probeAudio(filePath: string) {
  if (!ffprobePath) throw new Error('ffprobe-static path missing');
  const { stdout } = await runProcess(ffprobePath, [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath
  ]);
  return JSON.parse(stdout);
}

function guessMime(fp: string): string {
  const ext = path.extname(fp).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  if (ext === '.ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function buildAudioFilter(effects: any, opts?: { allowMissingModel?: boolean }): { chain: string; warning?: string } {
  const parts: string[] = [];
  let warning: string | undefined;

  // DENOISE (sample-calibrated FFT denoise via afftdn) - before EQ + compressor
  if (effects?.denoiseEnabled) {
    const d = effects?.denoise ?? {};
    const nf = clamp(Number(d.noiseFloorDb ?? -50), -80, -20);
    const nr = clamp(Number(d.amount ?? 12), 0.01, 97);
    const gs = Math.round(clamp(Number(d.smoothing ?? 0), 0, 50));
    const bm = clamp(Number(d.freqScale ?? 1.25), 0.2, 5);
    const om = d.outputNoiseOnly ? 'noise' : 'output';
    parts.push(`afftdn=nr=${nr.toFixed(3)}:nf=${nf.toFixed(1)}:gs=${gs}:bm=${bm.toFixed(2)}:om=${om}`);
  }

  // EQ
  if (effects?.eqEnabled) {
    const eq = effects.eq;
    const preampDb = Number(eq?.preampDb ?? 0);
    if (preampDb !== 0) parts.push(`volume=${preampDb}dB`);

    const bands = Array.isArray(eq?.bands) ? eq.bands : [];
    for (const b of bands) {
      const f = Number(b.freq);
      const g = Number(b.gainDb ?? 0);
      if (!Number.isFinite(f) || !Number.isFinite(g)) continue;
      parts.push(`equalizer=f=${f}:t=q:w=1:g=${g}`);
    }
  }

  // COMPRESSOR
  if (effects?.compEnabled) {
    const c = effects.comp || {};
    const thresholdDb = Number(c.thresholdDb ?? -24);
    const ratio = Number(c.ratio ?? 2);
    const attackMs = Number(c.attackMs ?? 15);
    const releaseMs = Number(c.releaseMs ?? 200);
    const makeupDb = Number(c.makeupDb ?? 0);
    const kneeDb = Number(c.kneeDb ?? 1);
    const thresholdLin = Math.max(1e-6, Math.min(1, dbToLin(thresholdDb)));
    const makeupLin = Math.max(0, dbToLin(makeupDb));

    parts.push(
      `acompressor=threshold=${thresholdLin.toFixed(6)}:ratio=${ratio.toFixed(2)}:attack=${attackMs.toFixed(1)}:release=${releaseMs.toFixed(
        1
      )}:makeup=${makeupLin.toFixed(6)}:knee=${kneeDb.toFixed(1)}`
    );
  }

  // LIMITER (last)
  if (effects?.eq?.limiter) {
    parts.push('alimiter=limit=0.98');
  }

  return { chain: parts.join(','), warning };
}

ipcMain.handle('selectAudio', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Choose audio',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg'] }]
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const filePath = res.filePaths[0]!;
  const meta = await probeAudio(filePath);
  return { filePath, meta };
});

ipcMain.handle('readFileBase64', async (_evt, payload: { filePath: string }) => {
  const buf = await fs.readFile(payload.filePath);
  return { mime: guessMime(payload.filePath), dataBase64: buf.toString('base64') };
});

ipcMain.handle('chooseExportPath', async (_evt, payload: { defaultName: string }) => {
  const res = await dialog.showSaveDialog({
    title: 'Export audio',
    defaultPath: payload.defaultName,
    filters: [{ name: 'MP3', extensions: ['mp3'] }, { name: 'WAV', extensions: ['wav'] }]
  });
  if (res.canceled) return null;
  return res.filePath ?? null;
});

ipcMain.handle(
  'exportAudio',
  async (
    _evt,
    payload: { inputPath: string; outputPath: string; effects: any; range?: { startSeconds: number; endSeconds: number } }
  ) => {
    if (!ffmpegPath) throw new Error('ffmpeg-static path missing');
    const { chain } = buildAudioFilter(payload.effects);

    const args: string[] = ['-y'];
    const start = payload.range?.startSeconds;
    const end = payload.range?.endSeconds;
    if (typeof start === 'number' && typeof end === 'number' && end > start) {
      args.push('-ss', String(start.toFixed(3)), '-t', String((end - start).toFixed(3)));
    }
    args.push('-i', payload.inputPath);
    if (chain) args.push('-af', chain);

    const ext = path.extname(payload.outputPath).toLowerCase();
    if (ext === '.wav') {
      args.push('-c:a', 'pcm_s16le', payload.outputPath);
    } else {
      args.push('-c:a', 'libmp3lame', '-q:a', '2', payload.outputPath);
    }

    await runProcess(ffmpegPath, args);
  }
);

ipcMain.handle(
  'renderWaveform',
  async (_evt, payload: { inputPath: string; width?: number; height?: number; effects?: any }) => {
    if (!ffmpegPath) throw new Error('ffmpeg-static path missing');
    const w = payload.width ?? 1800;
    const h = payload.height ?? 220;
    const tmp = path.join(app.getPath('temp'), `ffeq-wave-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);

    const { chain } = buildAudioFilter(payload.effects ?? {}, { allowMissingModel: true });
    const fullChain = [chain, 'aformat=channel_layouts=mono', 'aresample=8000', `showwavespic=s=${w}x${h}:colors=white`]
      .filter(Boolean)
      .join(',');

    const args = ['-y', '-i', payload.inputPath, '-filter_complex', fullChain, '-frames:v', '1', tmp];
    await runProcess(ffmpegPath, args);
    const buf = await fs.readFile(tmp);
    await fs.unlink(tmp).catch(() => {});
    return { mime: 'image/png' as const, dataBase64: buf.toString('base64') };
  }
);

ipcMain.handle(
  'renderPreview',
  async (
    _evt,
    payload: { inputPath: string; effects: any; startSeconds: number; durationSeconds: number }
  ) => {
    if (!ffmpegPath) throw new Error('ffmpeg-static path missing');
    const { chain } = buildAudioFilter(payload.effects);
    const tmp = path.join(app.getPath('temp'), `ffeq-prev-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
    const args: string[] = [
      '-y',
      '-ss',
      String(payload.startSeconds.toFixed(3)),
      '-t',
      String(payload.durationSeconds.toFixed(3)),
      '-i',
      payload.inputPath
    ];
    if (chain) args.push('-af', chain);
    args.push('-c:a', 'pcm_s16le', tmp);
    await runProcess(ffmpegPath, args);
    const buf = await fs.readFile(tmp);
    await fs.unlink(tmp).catch(() => {});
    return { mime: 'audio/wav', dataBase64: buf.toString('base64') };
  }
);
