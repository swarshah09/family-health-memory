import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import type { FamilyActivityEvent } from "@/context/AppContext";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Home,
  Users,
  Shield,
  Inbox,
  Lock,
  ChevronRight,
  UserPlus,
  KeyRound,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatActivityAction } from "@/lib/collaboration-roles";
import { toastFromCaughtError } from "@/lib/toast-errors";
import { isHeadUser } from "@/lib/collaboration-roles";
import { useAppHub } from "@/lib/hub-outlet";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

type JoinReq = { id: string; email: string; name: string; createdAt: string };
type AccessReq = {
  id: string;
  requesterUserId: string;
  targetMemberId: string;
  requestedPermission: "VIEW_ONLY" | "CONTRIBUTOR" | "FULL_ACCESS";
  createdAt: string;
};
type Grant = {
  id: string;
  memberProfileId: string;
  permission: string;
};
type WorkspacePayload = {
  family: { familyId: string; name: string; createdByUserId: string; createdAt: string } | null;
  members: Array<{ id: string; name: string; age: number; relationship: string }>;
  joinRequests: JoinReq[];
  accessRequests: AccessReq[];
  myGrants: Grant[];
  activity: FamilyActivityEvent[];
};

export default function FamilyWorkspacePage() {
  const navigate = useNavigate();
  const { user, members, familyUsers, loadFamilyUsers, refreshJoinRequestInbox } = useApp();
  const inFamilyHub = useAppHub()?.hub === "family";
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessOpen, setAccessOpen] = useState(false);
  const [activityShowCount, setActivityShowCount] = useState(5);
  const [targetMemberId, setTargetMemberId] = useState<string>("");
  const [requestedPermission, setRequestedPermission] = useState<"VIEW_ONLY" | "CONTRIBUTOR" | "FULL_ACCESS">(
    "VIEW_ONLY"
  );

  const isHead = isHeadUser(user);

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const token = localStorage.getItem("fhm_access_token");
    const headers = new Headers(init.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  }, []);

  const load = useCallback(async () => {
    if (!user?.familyId) return;
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/families/${user.familyId}/workspace`);
      if (!res.ok) throw new Error("Failed to load workspace");
      const json = (await res.json()) as WorkspacePayload;
      setData(json);
    } catch (e) {
      toastFromCaughtError(e, "Family page unavailable", "Try refreshing in a moment.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user?.familyId, authFetch]);

  useEffect(() => {
    if (!user?.familyId) return;
    void load();
    void loadFamilyUsers({ familyId: user.familyId }).catch(() => {});
    // Intentionally omit `loadFamilyUsers` from deps: it is not memoized in AppProvider and gets a
    // new reference on every context re-render (e.g. voice-log polling), which would refetch
    // workspace repeatedly and hit the API rate limiter (429).
  }, [user?.familyId, load]);

  const approveJoin = async (id: string) => {
    if (!user?.familyId) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/families/${user.familyId}/join-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer" })
      });
      if (!res.ok) throw new Error("Approve failed");
      toast.success("New member added to your workspace");
      await load();
      void refreshJoinRequestInbox();
    } catch (e) {
      toastFromCaughtError(e, "Could not approve", "Try again or check the request.");
    }
  };

  const rejectJoin = async (id: string) => {
    if (!user?.familyId) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/families/${user.familyId}/join-requests/${id}/reject`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Reject failed");
      toast.message("Request declined");
      await load();
      void refreshJoinRequestInbox();
    } catch (e) {
      toastFromCaughtError(e, "Could not update request", "");
    }
  };

  const approveAccess = async (id: string) => {
    if (!user?.familyId) return;
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/families/${user.familyId}/member-access-requests/${id}/approve`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Approve failed");
      toast.success("Sharing permission granted");
      await load();
    } catch (e) {
      toastFromCaughtError(e, "Could not approve access", "");
    }
  };

  const rejectAccess = async (id: string) => {
    if (!user?.familyId) return;
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/families/${user.familyId}/member-access-requests/${id}/reject`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Reject failed");
      toast.message("Access request declined");
      await load();
    } catch (e) {
      toastFromCaughtError(e, "Could not update request", "");
    }
  };

  const submitAccessRequest = async () => {
    if (!user?.familyId || !targetMemberId) {
      toast.error("Choose a family member profile");
      return;
    }
    try {
      const res = await authFetch(`${API_BASE_URL}/api/families/${user.familyId}/member-access-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMemberId, requestedPermission })
      });
      if (!res.ok) throw new Error("Request failed");
      toast.success("Request sent to your family organizer");
      setAccessOpen(false);
      setTargetMemberId("");
      await load();
    } catch (e) {
      toastFromCaughtError(e, "Request not sent", "");
    }
  };

  const displayName = data?.family?.name || user?.familyName || "Your family workspace";
  const memberLabel = (id: string) => members.find((m) => m.id === id)?.name || "Member";
  const userLabel = (id: string) => familyUsers.find((u) => u.id === id)?.name || "Teammate";

  return (
    <div className="app-shell app-safe-bottom min-h-screen bg-background">
      <div className={`px-5 border-b border-border/40 bg-card/40 ${inFamilyHub ? "pt-4 pb-4" : "pt-10 pb-4"}`}>
        <div className="flex items-center gap-3">
          {!inFamilyHub && (
            <button
              type="button"
              onClick={() => navigate("/")}
              className="p-2 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/15">
            <Home className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-foreground text-lg truncate">{displayName}</h1>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3 w-3 shrink-0" />
              Private workspace · {user?.workspaceRole === "member" ? "Member" : "Organizer"}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-6 max-w-lg mx-auto">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading your workspace…</p>
        ) : (
          <>
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Profiles you can open</h2>
              </div>
              <div className="space-y-2">
                {members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No profiles yet. Add someone from the dashboard.</p>
                ) : (
                  members.map((m) => (
                    <motion.button
                      key={m.id}
                      type="button"
                      onClick={() => navigate(`/member/${m.id}`)}
                      className="w-full flex items-center justify-between rounded-2xl border border-border/50 bg-card/50 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                      whileTap={{ scale: 0.99 }}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {m.age}y · {m.relationship}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </motion.button>
                  ))
                )}
              </div>
            </section>

            {user?.workspaceRole === "member" || user?.role !== "owner" ? (
              <section className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Need broader access?</h2>
                  </div>
                  <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm" variant="outline" className="text-xs rounded-xl">
                        Request access
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md rounded-2xl">
                      <DialogHeader>
                        <DialogTitle>Request log access</DialogTitle>
                      </DialogHeader>
                      <p className="text-xs text-muted-foreground">
                        Your organizer reviews every request. Choose a permission level that fits how you&apos;ll help.
                      </p>
                      <div className="space-y-3 py-2">
                        <Select value={targetMemberId || undefined} onValueChange={setTargetMemberId}>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Profile" />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={requestedPermission}
                          onValueChange={(v) =>
                            setRequestedPermission(v as "VIEW_ONLY" | "CONTRIBUTOR" | "FULL_ACCESS")
                          }
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="VIEW_ONLY">View only</SelectItem>
                            <SelectItem value="CONTRIBUTOR">Contributor (add logs)</SelectItem>
                            <SelectItem value="FULL_ACCESS">Full access (manage logs)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setAccessOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="button" onClick={() => void submitAccessRequest()}>
                          Send request
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                {data?.myGrants && data.myGrants.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                    {data.myGrants.map((g) => (
                      <li key={g.id}>
                        <span className="text-foreground/90 font-medium">{memberLabel(g.memberProfileId)}</span> —{" "}
                        {g.permission.replace("_", " ").toLowerCase()}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Until you have approved access, you&apos;ll mainly see notes you added yourself.
                  </p>
                )}
              </section>
            ) : null}

            {isHead ? (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Join requests</h2>
                </div>
                {data?.joinRequests && data.joinRequests.length > 0 ? (
                  <div className="space-y-2">
                    {data.joinRequests.map((jr) => (
                      <div
                        key={jr.id}
                        className="rounded-2xl border border-border/50 bg-card/50 p-3 flex flex-col gap-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{jr.name}</p>
                          <p className="text-[11px] text-muted-foreground">{jr.email}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="rounded-lg text-xs" onClick={() => void approveJoin(jr.id)}>
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-xs"
                            onClick={() => void rejectJoin(jr.id)}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No pending requests.</p>
                )}
              </section>
            ) : null}

            {isHead && data?.accessRequests && data.accessRequests.length > 0 ? (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Log sharing requests</h2>
                </div>
                <div className="space-y-2">
                  {data.accessRequests.map((ar) => (
                    <div key={ar.id} className="rounded-2xl border border-border/50 bg-card/50 p-3 space-y-2">
                      <p className="text-xs text-foreground">
                        <span className="font-medium">{userLabel(ar.requesterUserId)}</span> asked for{" "}
                        <span className="font-medium">{ar.requestedPermission.replace("_", " ").toLowerCase()}</span>{" "}
                        on <span className="font-medium">{memberLabel(ar.targetMemberId)}</span>
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" className="rounded-lg text-xs" onClick={() => void approveAccess(ar.id)}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg text-xs"
                          onClick={() => void rejectAccess(ar.id)}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <details
              className="rounded-2xl border border-border/40 bg-card/30 overflow-hidden group"
              onToggle={(e) => {
                const el = e.currentTarget;
                if (!el.open) setActivityShowCount(5);
              }}
            >
              <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2 min-w-0">
                  <Inbox className="h-4 w-4 text-muted-foreground shrink-0" />
                  <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
                  {(data?.activity || []).length > 0 ? (
                    <span className="text-[10px] tabular-nums text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full shrink-0">
                      {(data?.activity || []).length}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="group-open:hidden">Expand</span>
                  <span className="hidden group-open:inline">Collapse</span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t border-border/30">
                <div className="max-h-[min(50vh,280px)] overflow-y-auto divide-y divide-border/30">
                  {(data?.activity || []).length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground text-center">
                      Activity will appear as your family uses the app.
                    </p>
                  ) : (
                    (data?.activity || []).slice(0, activityShowCount).map((ev) => (
                      <div key={ev.id} className="px-3 py-2.5 text-[11px] bg-card/30">
                        <p className="text-foreground/90">
                          <span className="font-medium">{ev.contributorName}</span>{" "}
                          <span className="text-muted-foreground">{formatActivityAction(ev.action)}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(ev.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                {(data?.activity || []).length > activityShowCount ? (
                  <div className="px-3 py-2 border-t border-border/20">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full h-9 text-xs rounded-xl text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        setActivityShowCount((c) => Math.min(c + 10, (data?.activity || []).length));
                      }}
                    >
                      Show more ({(data?.activity || []).length - activityShowCount})
                    </Button>
                  </div>
                ) : null}
                {(data?.activity || []).length > 5 && activityShowCount > 5 ? (
                  <div className="px-3 pb-3 -mt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-[11px] rounded-xl text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        setActivityShowCount(5);
                      }}
                    >
                      Show less
                    </Button>
                  </div>
                ) : null}
              </div>
            </details>

            <details className="rounded-2xl border border-border/40 bg-muted/15 p-3">
              <summary className="text-xs font-medium text-foreground cursor-pointer">Advanced · family invite code</summary>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
                Share this only with people you trust. They need it when sending a join request.
              </p>
              <button
                type="button"
                title="Copy family invite code"
                onClick={() => {
                  const id = user?.familyId;
                  if (!id) return;
                  void navigator.clipboard
                    .writeText(id)
                    .then(() => toast.success("Code copied"))
                    .catch(() => toast.error("Could not copy"));
                }}
                className="mt-2 font-sans tabular-nums tracking-tight text-xs text-foreground select-all rounded-lg px-2 py-1.5 w-full text-left hover:bg-primary/10 border border-border/50 transition-colors"
              >
                {user?.familyId}
              </button>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
