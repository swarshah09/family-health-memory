import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { Loader2 } from "lucide-react";

/** Opens the signed-in user's personal health profile (never mixed with People You Track). */
export default function MyHealthPage() {
  const navigate = useNavigate();
  const { user, members } = useApp();

  useEffect(() => {
    const self = members.find((m) => m.linkedUserId === user?.id);
    if (self) {
      navigate(`/member/${self.id}`, { replace: true });
    }
  }, [members, user?.id, navigate]);

  const self = members.find((m) => m.linkedUserId === user?.id);
  if (self) return null;

  return (
    <div className="app-shell flex flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Preparing your personal health space…</p>
    </div>
  );
}
