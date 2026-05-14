/** Client-side PPG-style processing from brightness samples (wellness only; not diagnostic). */

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
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

export type PpgAnalysisResult = {
  heartRate: number;
  signalConfidence: number;
  waveformSamples: number[];
  peakCount: number;
};

/**
 * Estimate pulse rate from a brightness / color channel time series.
 * `durationSec` should match actual wall time of the capture window.
 */
export function analyzePPGBuffer(samples: number[], durationSec: number): PpgAnalysisResult {
  const n = samples.length;
  const empty: PpgAnalysisResult = {
    heartRate: 0,
    signalConfidence: 0.12,
    waveformSamples: [],
    peakCount: 0
  };
  if (n < 45 || durationSec < 8) return empty;

  const sr = (n - 1) / Math.max(durationSec, 0.01);
  const longWin = Math.max(9, Math.floor(sr * 2.2));
  const baseline = movingAverage(samples, longWin);
  const highPass = samples.map((v, i) => v - baseline[i]!);
  const sigma = stdDev(highPass) || 1e-6;
  const z = highPass.map((v) => v / sigma);
  const smooth = movingAverage(z, Math.max(3, Math.floor(sr * 0.08)));

  const minSep = Math.max(4, Math.round(sr * 0.34));
  const thresh = 0.55;
  const peaks: number[] = [];
  for (let i = 2; i < smooth.length - 2; i++) {
    const v = smooth[i]!;
    if (v < thresh) continue;
    if (v <= smooth[i - 1]! || v < smooth[i + 1]!) continue;
    if (v <= smooth[i - 2]! || v <= smooth[i + 2]!) continue;
    if (peaks.length && i - peaks[peaks.length - 1]! < minSep) continue;
    peaks.push(i);
  }

  const intervals: number[] = [];
  for (let k = 1; k < peaks.length; k++) {
    intervals.push((peaks[k]! - peaks[k - 1]!) / sr);
  }

  let heartRate = 0;
  if (intervals.length) {
    const sorted = [...intervals].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)]!;
    if (med > 0.25 && med < 1.8) {
      heartRate = Math.round(60 / med);
    }
  }

  if (!Number.isFinite(heartRate) || heartRate < 42 || heartRate > 195) {
    heartRate = 0;
  }

  const expectedBeats = (durationSec * 72) / 60;
  let signalConfidence = 0.2;
  if (intervals.length >= 2 && heartRate > 0) {
    const meanI = mean(intervals);
    const cv = meanI > 0 ? stdDev(intervals) / meanI : 1;
    const countScore = Math.min(1, peaks.length / Math.max(6, expectedBeats * 0.85));
    const stability = Math.max(0, 1 - Math.min(cv, 0.45) / 0.45);
    signalConfidence = Math.min(0.94, 0.28 + stability * 0.42 + countScore * 0.28);
  } else if (peaks.length >= 1 && heartRate > 0) {
    signalConfidence = 0.38;
  }

  if (heartRate === 0) {
    signalConfidence = Math.min(signalConfidence, 0.32);
  }

  const waveRaw = smooth;
  const maxAbs = Math.max(...waveRaw.map((x) => Math.abs(x)), 1e-6);
  const normalized = downsample(
    waveRaw.map((x) => Math.max(-1, Math.min(1, x / maxAbs))),
    96
  );

  return {
    heartRate,
    signalConfidence: Math.round(signalConfidence * 1000) / 1000,
    waveformSamples: normalized,
    peakCount: peaks.length
  };
}
