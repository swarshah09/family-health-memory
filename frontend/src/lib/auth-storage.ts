/**
 * Each browser tab gets its own auth session (tab id in sessionStorage, tokens in a
 * per-tab map in localStorage). Unlike a single shared token key, two accounts in two
 * tabs no longer clobber each other on the same origin.
 */

const TAB_ID_KEY = "fhm_tab_id";
const SESSIONS_KEY = "fhm_sessions";

const LEGACY_ACCESS = "fhm_access_token";
const LEGACY_REFRESH = "fhm_refresh_token";
const LEGACY_USER = "fhm_user";

type TabSession = {
  accessToken: string;
  refreshToken: string;
  userJson: string;
};

type SessionMap = Record<string, TabSession>;

function getTabId(): string {
  let id = sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

function readMap(): SessionMap {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SessionMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: SessionMap): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(map));
}

function currentSession(): TabSession | null {
  const map = readMap();
  return map[getTabId()] ?? null;
}

function clearLegacyFlatAuth(): void {
  localStorage.removeItem(LEGACY_ACCESS);
  localStorage.removeItem(LEGACY_REFRESH);
  localStorage.removeItem(LEGACY_USER);
}

/** Move old single-key auth into this tab's slot, then remove shared keys. */
function migrateLegacyFlatAuthOnce(): void {
  if (currentSession()) {
    clearLegacyFlatAuth();
    return;
  }
  const access = localStorage.getItem(LEGACY_ACCESS);
  const refresh = localStorage.getItem(LEGACY_REFRESH);
  const userJson = localStorage.getItem(LEGACY_USER);
  if (access && refresh && userJson) {
    const map = readMap();
    map[getTabId()] = { accessToken: access, refreshToken: refresh, userJson };
    writeMap(map);
  }
  clearLegacyFlatAuth();
}

migrateLegacyFlatAuthOnce();

function patchSession(patch: Partial<TabSession>): void {
  const map = readMap();
  const tabId = getTabId();
  const prev = map[tabId];
  if (!prev && !patch.accessToken) return;
  map[tabId] = {
    accessToken: patch.accessToken ?? prev?.accessToken ?? "",
    refreshToken: patch.refreshToken ?? prev?.refreshToken ?? "",
    userJson: patch.userJson ?? prev?.userJson ?? ""
  };
  writeMap(map);
  clearLegacyFlatAuth();
}

export const authStorage = {
  getAccessToken(): string | null {
    return currentSession()?.accessToken ?? null;
  },

  getRefreshToken(): string | null {
    return currentSession()?.refreshToken ?? null;
  },

  getUserJson(): string | null {
    return currentSession()?.userJson ?? null;
  },

  setAccessToken(token: string): void {
    patchSession({ accessToken: token });
  },

  setRefreshToken(token: string): void {
    patchSession({ refreshToken: token });
  },

  setUserJson(json: string): void {
    patchSession({ userJson: json });
  },

  setSession(access: string, refresh: string, userJson: string): void {
    const map = readMap();
    map[getTabId()] = { accessToken: access, refreshToken: refresh, userJson };
    writeMap(map);
    clearLegacyFlatAuth();
  },

  clear(): void {
    const map = readMap();
    delete map[getTabId()];
    writeMap(map);
    clearLegacyFlatAuth();
  }
};
