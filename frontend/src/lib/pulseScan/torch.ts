/** Best-effort camera torch (flash); many iOS browsers do not expose it to the web. */

function readTorchCap(track: MediaStreamTrack | undefined): boolean {
  if (!track?.getCapabilities) return false;
  if (track.readyState !== "live") return false;
  try {
    const caps = track.getCapabilities() as { torch?: boolean };
    return caps?.torch === true;
  } catch {
    return false;
  }
}

async function applyTorchOnce(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  if (!readTorchCap(track)) return false;
  try {
    await track.applyConstraints({ torch: on } as MediaTrackConstraints);
    return true;
  } catch {
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      return true;
    } catch {
      return false;
    }
  }
}

function waitForVideoFrame(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const t = window.setTimeout(done, timeoutMs);
    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(t);
        done();
      });
    } else {
      requestAnimationFrame(() => {
        window.clearTimeout(t);
        done();
      });
    }
  });
}

/**
 * Prefer a rear / wide camera that advertises `torch` in getCapabilities (Chrome Android).
 * Falls back to `facingMode: environment` if none report torch up front.
 */
export async function getVideoStreamPreferTorch(): Promise<MediaStream> {
  const openEnv = () =>
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

  const openExact = (deviceId: string) =>
    navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false
    });

  let raw = await navigator.mediaDevices.enumerateDevices();
  let inputs = raw.filter((d) => d.kind === "videoinput");
  if (inputs.length > 0 && inputs.every((d) => !d.label)) {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tmp.getTracks().forEach((t) => t.stop());
    raw = await navigator.mediaDevices.enumerateDevices();
    inputs = raw.filter((d) => d.kind === "videoinput");
  }

  let stream = await openEnv();
  await new Promise((r) => window.setTimeout(r, 100));
  if (readTorchCap(stream.getVideoTracks()[0])) return stream;

  const rank = (label: string) => {
    const l = label.toLowerCase();
    if (/front|user|selfie|facetime|infrared|iris/.test(l)) return 0;
    if (/back|rear|environment|wide|tele|ultra|world/.test(l)) return 2;
    return 1;
  };

  const ranked = [...inputs].sort((a, b) => rank(b.label || "") - rank(a.label || ""));

  for (const dev of ranked.slice(0, 6)) {
    if (!dev.deviceId) continue;
    stream.getTracks().forEach((t) => t.stop());
    try {
      stream = await openExact(dev.deviceId);
      await new Promise((r) => window.setTimeout(r, 120));
      if (readTorchCap(stream.getVideoTracks()[0])) return stream;
    } catch {
      /* try next */
    }
  }

  if (!stream.getVideoTracks().length) {
    stream = await openEnv();
  }
  return stream;
}

/**
 * Turn torch on after stream is attached and playing. Polls capabilities — on some Android
 * devices `torch` only appears after the first frames.
 */
export async function enableTorchRobust(track: MediaStreamTrack, video: HTMLVideoElement): Promise<boolean> {
  try {
    await video.play();
  } catch {
    /* autoplay / gesture */
  }

  await new Promise((r) => window.setTimeout(r, 150));
  await waitForVideoFrame(video, 800);

  for (let i = 0; i < 30; i++) {
    if (await applyTorchOnce(track, true)) return true;
    await new Promise((r) => window.setTimeout(r, 90));
  }
  return false;
}

export async function disableTorch(track: MediaStreamTrack | undefined): Promise<void> {
  if (!track || !readTorchCap(track)) return;
  try {
    await track.applyConstraints({ torch: false } as MediaTrackConstraints);
  } catch {
    try {
      await track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] });
    } catch {
      /* ignore */
    }
  }
}
