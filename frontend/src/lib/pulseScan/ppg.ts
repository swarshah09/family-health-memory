/**
 * Client-side PPG-style processing (wellness estimate only — not diagnostic).
 * Uses timestamped samples, resampling, dual HR estimators, and strict gating so
 * uncertain windows return 0 rather than a misleading BPM.
 */

const TARGET_SAMPLE_HZ = 30;
const HR_MIN = 45;
const HR_MAX = 190;
/** Autocorr vs peak BPM must agree within this to accept a high-confidence reading. */
const MAX_METHOD_DISAGREEMENT_BPM = 10;
/** Minimum confidence to persist a reading (below → heartRate 0). */
const MIN_ACCEPT_CONFIDENCE = 0.52;
/** Trim settling time at start / end of capture (seconds). */
const TRIM_START_SEC = 2.2;
const TRIM_END_SEC = 0.4;

export type PpgSample = { t: number; v: number };

export type PpgAnalysisResult = {
  heartRate: number;
  signalConfidence: number;
  waveformSamples: number[];
  peakCount: number;
};

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

function medianSorted(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function median(arr: number[]): number {
  return medianSorted([...arr].sort((a, b) => a - b));
}

function movingAverage(data: number[], windowSize: number): number[] {
  const w = Math.max(1, Math.floor(windowSize));
  if (w <= 1) return [...data];
  const half = Math.floor(w / 2);
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(data.length - 1, i + half); j++) {
      s += data[j]!;
      c++;
    }
    out.push(s / c);
  }
  return out;
}

function linearDetrend(y: number[]): number[] {
  const n = y.length;
  if (n < 4) return [...y];
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += y[i]!;
    sxx += i * i;
    sxy += i * y[i]!;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return [...y];
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  return y.map((yi, i) => yi - (a * i + b));
}

function despike(y: number[]): number[] {
  if (y.length < 5) return [...y];
  const m = median(y);
  const devs = y.map((x) => Math.abs(x - m));
  const mad = median(devs) || 1e-6;
  const thresh = 5 * mad;
  return y.map((x, i) => {
    if (Math.abs(x - m) <= thresh) return x;
    const a = y[i - 1];
    const b = y[i + 1];
    if (a != null && b != null) return (a + b) / 2;
    return m;
  });
}

/** Resample irregular samples onto a uniform grid (linear interpolation). */
function resampleUniform(samples: PpgSample[], targetHz: number): { y: number[]; sr: number; durationSec: number } {
  if (samples.length < 8) return { y: [], sr: targetHz, durationSec: 0 };
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const t0 = sorted[0]!.t;
  const t1 = sorted[sorted.length - 1]!.t;
  const durationSec = Math.max(0.001, (t1 - t0) / 1000);
  const nOut = Math.max(16, Math.floor(durationSec * targetHz));
  const y: number[] = [];
  for (let k = 0; k < nOut; k++) {
    const t = t0 + (k / Math.max(nOut - 1, 1)) * (t1 - t0);
    let i = 0;
    while (i < sorted.length - 1 && sorted[i + 1]!.t < t) i++;
    const a = sorted[i]!;
    const b = sorted[Math.min(i + 1, sorted.length - 1)]!;
    if (b.t <= a.t) {
      y.push(a.v);
      continue;
    }
    const f = (t - a.t) / (b.t - a.t);
    y.push(a.v * (1 - f) + b.v * f);
  }
  return { y, sr: targetHz, durationSec };
}

function trimSeconds(y: number[], sr: number, trimStart: number, trimEnd: number): number[] {
  const n = y.length;
  const dropStart = Math.min(Math.floor(trimStart * sr), Math.floor(n * 0.35));
  const dropEnd = Math.min(Math.floor(trimEnd * sr), Math.floor(n * 0.15));
  if (n <= dropStart + dropEnd + 32) return y;
  return y.slice(dropStart, n - dropEnd);
}

/** High-pass: subtract long moving average (removes DC / slow drift). */
function highPassMA(y: number[], sr: number, windowSec: number): number[] {
  const win = Math.max(5, Math.min(y.length - 1, Math.floor(sr * windowSec)));
  const low = movingAverage(y, win);
  return y.map((v, i) => v - low[i]!);
}

/** Rough motion / slip proxy: large frame-to-frame jumps on raw-ish signal. */
function motionArtifactScore(y: number[]): number {
  if (y.length < 10) return 1;
  const diffs: number[] = [];
  for (let i = 1; i < y.length; i++) {
    diffs.push(Math.abs(y[i]! - y[i - 1]!));
  }
  const m = median(diffs);
  const mad = median(diffs.map((d) => Math.abs(d - m))) || 1e-6;
  const spikes = diffs.filter((d) => d > m + 8 * mad).length;
  return Math.min(1, spikes / Math.max(8, y.length * 0.06));
}

/** Autocorrelation peak in plausible HR lag range → BPM + normalized peak strength. */
function hrFromAutocorr(y: number[], sr: number): { bpm: number; strength: number } | null {
  const n = y.length;
  if (n < 80) return null;
  const mu = mean(y);
  const s = stdDev(y) || 1e-9;
  const x = y.map((v) => (v - mu) / s);

  const lagMin = Math.max(3, Math.floor((sr * 60) / HR_MAX));
  const lagMax = Math.min(n - 4, Math.ceil((sr * 60) / HR_MIN));

  let bestLag = 0;
  let bestScore = -Infinity;
  for (let L = lagMin; L <= lagMax; L++) {
    let acc = 0;
    const cap = n - L;
    for (let i = 0; i < cap; i++) acc += x[i]! * x[i + L]!;
    acc /= cap;
    if (acc > bestScore) {
      bestScore = acc;
      bestLag = L;
    }
  }
  if (bestLag < lagMin || bestScore < 0.08) return null;
  const bpm = (60 * sr) / bestLag;
  if (!Number.isFinite(bpm) || bpm < HR_MIN || bpm > HR_MAX) return null;
  return { bpm: Math.round(bpm), strength: Math.min(1, bestScore / 0.45) };
}

/** Peak-based median IBI → BPM + interval CV. */
function hrFromPeaks(y: number[], sr: number): { bpm: number; peaks: number[]; cv: number } | null {
  const n = y.length;
  if (n < 60) return null;

  const sigma = stdDev(y) || 1e-6;
  const z = y.map((v) => v / sigma);
  const smooth = movingAverage(z, Math.max(3, Math.floor(sr * 0.06)));

  const minSep = Math.max(3, Math.floor((sr * 60) / HR_MAX));

  const thrBase = median(smooth.map((v) => Math.abs(v))) * 1.8 + 0.25;
  const thresh = Math.min(1.2, Math.max(0.35, thrBase));

  const peaks: number[] = [];
  for (let i = 2; i < smooth.length - 2; i++) {
    const v = smooth[i]!;
    if (v < thresh) continue;
    if (v <= smooth[i - 1]! || v < smooth[i + 1]!) continue;
    if (v <= smooth[i - 2]! || v <= smooth[i + 2]!) continue;
    if (peaks.length && i - peaks[peaks.length - 1]! < minSep) continue;
    peaks.push(i);
  }

  if (peaks.length < 3) return null;

  const intervals: number[] = [];
  for (let k = 1; k < peaks.length; k++) {
    const dt = (peaks[k]! - peaks[k - 1]!) / sr;
    if (dt > 60 / HR_MAX && dt < 60 / HR_MIN) intervals.push(dt);
  }
  if (intervals.length < 2) return null;

  const sorted = [...intervals].sort((a, b) => a - b);
  const med = medianSorted(sorted);
  const cv = med > 1e-6 ? stdDev(intervals) / med : 1;
  const bpm = 60 / med;
  if (!Number.isFinite(bpm) || bpm < HR_MIN || bpm > HR_MAX) return null;
  return { bpm: Math.round(bpm), peaks, cv };
}

function downsample(values: number[], targetLen: number): number[] {
  if (values.length <= targetLen) return [...values];
  const out: number[] = [];
  for (let k = 0; k < targetLen; k++) {
    const t = (k / (targetLen - 1)) * (values.length - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(values.length - 1, i0 + 1);
    const f = t - i0;
    out.push(values[i0]! * (1 - f) + values[i1]! * f);
  }
  return out;
}

/**
 * Estimate pulse from timestamped luminance samples (finger on camera + light).
 * Returns heartRate 0 when signal quality is too low or estimators disagree.
 */
export function analyzePPGBuffer(samples: PpgSample[]): PpgAnalysisResult {
  const empty: PpgAnalysisResult = {
    heartRate: 0,
    signalConfidence: 0.12,
    waveformSamples: [],
    peakCount: 0
  };

  if (samples.length < 24) return empty;

  const { y: rawY, sr, durationSec } = resampleUniform(samples, TARGET_SAMPLE_HZ);
  if (rawY.length < 90 || durationSec < 10) return empty;

  const motion = motionArtifactScore(rawY);
  if (motion > 0.55) {
    return { ...empty, signalConfidence: 0.18 };
  }

  let y = trimSeconds(rawY, sr, TRIM_START_SEC, TRIM_END_SEC);
  if (y.length < 64) y = rawY;

  y = linearDetrend(y);
  y = despike(y);
  y = highPassMA(y, sr, 2.0);
  const sigma0 = stdDev(y);
  if (sigma0 < 0.35) {
    return { ...empty, signalConfidence: 0.15 };
  }

  const ac = hrFromAutocorr(y, sr);
  const pk = hrFromPeaks(y, sr);

  let heartRate = 0;
  let signalConfidence = 0.2;

  if (ac && pk) {
    const diff = Math.abs(ac.bpm - pk.bpm);
    const agree = diff <= MAX_METHOD_DISAGREEMENT_BPM;
    const stability = Math.max(0, 1 - Math.min(pk.cv, 0.35) / 0.35);
    const acW = ac.strength;
    const pkW = Math.min(1, (1 - Math.min(pk.cv, 0.4) / 0.4) * (pk.peaks.length >= 5 ? 1 : 0.75));

    if (agree) {
      heartRate = Math.round((ac.bpm + pk.bpm) / 2);
      signalConfidence = Math.min(
        0.93,
        0.32 + 0.28 * acW + 0.28 * stability + 0.12 * (1 - motion) + 0.08 * Math.min(pk.peaks.length / 10, 1)
      );
    } else if (acW > 0.55 && pkW > 0.5 && diff <= MAX_METHOD_DISAGREEMENT_BPM + 6) {
      heartRate = Math.round(ac.bpm * 0.45 + pk.bpm * 0.55);
      signalConfidence = Math.min(0.78, 0.35 + 0.2 * acW + 0.15 * stability);
    } else if (acW >= pkW && acW > 0.42) {
      heartRate = ac.bpm;
      signalConfidence = Math.min(0.72, 0.3 + 0.35 * acW);
    } else if (pkW > 0.45 && pk.peaks.length >= 4) {
      heartRate = pk.bpm;
      signalConfidence = Math.min(0.72, 0.28 + 0.35 * pkW * stability);
    }
  } else if (ac && ac.strength > 0.38) {
    heartRate = ac.bpm;
    signalConfidence = Math.min(0.68, 0.3 + 0.38 * ac.strength);
  } else if (pk && pk.peaks.length >= 4 && pk.cv < 0.22) {
    heartRate = pk.bpm;
    signalConfidence = Math.min(0.68, 0.28 + 0.4 * (1 - pk.cv / 0.22));
  }

  if (!Number.isFinite(heartRate) || heartRate < HR_MIN || heartRate > HR_MAX) {
    heartRate = 0;
  }

  signalConfidence *= 1 - motion * 0.35;

  if (heartRate > 0 && signalConfidence < MIN_ACCEPT_CONFIDENCE) {
    heartRate = 0;
    signalConfidence = Math.min(signalConfidence, 0.48);
  }

  const waveSrc = movingAverage(y.map((v) => v / (stdDev(y) || 1)), Math.max(3, Math.floor(sr * 0.04)));
  const maxAbs = Math.max(...waveSrc.map((x) => Math.abs(x)), 1e-6);
  const normalized = downsample(
    waveSrc.map((x) => Math.max(-1, Math.min(1, x / maxAbs))),
    96
  );

  return {
    heartRate,
    signalConfidence: Math.round(Math.max(0, Math.min(1, signalConfidence)) * 1000) / 1000,
    waveformSamples: normalized,
    peakCount: pk?.peaks.length ?? 0
  };
}
