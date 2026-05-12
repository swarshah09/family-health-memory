import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

type Props = {
  /** Path starting with /api/... */
  audioPath: string;
  token: string | null;
};

export default function VoiceLogAudio({ audioPath, token }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const base = API_BASE_URL.replace(/\/$/, "");
    const href = audioPath.startsWith("http") ? audioPath : `${base}${audioPath}`;

    (async () => {
      try {
        const res = await fetch(href, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error(`audio ${res.status}`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setUrl(objectUrl);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioPath, token]);

  if (state === "error") {
    return <p className="text-[10px] text-muted-foreground mt-1">Audio playback unavailable.</p>;
  }
  if (state === "loading" || !url) {
    return <p className="text-[10px] text-muted-foreground mt-1">Loading original recording…</p>;
  }
  return <audio controls preload="metadata" className="w-full max-w-sm mt-2 h-9" src={url} />;
}
