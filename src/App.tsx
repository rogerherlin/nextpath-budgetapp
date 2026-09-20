import { useEffect, useState, type ReactNode } from "react";
import {
  loadFirebaseAuth,
  onProfileReady,
  signOutUser,
  subscribeAuth,
  type ClientUser,
} from "./authClient";
import { setAuthTokenGetter } from "./authToken";
import { clientFetch } from "./clientFetch";
import { hydrateFromServer } from "./clientStore";
import type { Actor, BudgetSummary, MeProfile, UserProfile } from "./types";
import { BudgetScreen } from "./ui/BudgetScreen";
import { BusyOverlay } from "./ui/BusyOverlay";
import { HomeScreen } from "./ui/HomeScreen";
import { LoginScreen } from "./ui/LoginScreen";

function withBusyOverlay(page: ReactNode) {
  return (
    <>
      <BusyOverlay />
      {page}
    </>
  );
}

function actorFromMe(me: MeProfile): Actor {
  return {
    profile: {
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      canUseFromText: me.canUseFromText,
      createdAt: me.createdAt,
    },
    isModerator: me.isModerator,
  };
}

function isMeProfile(value: unknown): value is MeProfile {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "email" in value &&
    "displayName" in value &&
    "canUseFromText" in value &&
    "createdAt" in value &&
    "isModerator" in value &&
    typeof value.isModerator === "boolean"
  );
}

function SessionBar({ me }: { me: MeProfile }) {
  return (
    <header className="session-bar">
      <span className="session-bar__who">
        <span className="session-bar__name">{me.displayName}</span>
        <span className="session-bar__email">{me.email}</span>
      </span>
      <button
        className="button button--secondary"
        type="button"
        onClick={() => void signOutUser()}
      >
        Sign out
      </button>
    </header>
  );
}

export function App() {
  const [user, setUser] = useState<ClientUser | null | undefined>(undefined);
  const [me, setMe] = useState<MeProfile | null>(null);
  const [summaries, setSummaries] = useState<BudgetSummary[]>([]);
  const [household, setHousehold] = useState<UserProfile[]>([]);
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    void loadFirebaseAuth()
      .then(() => {
        unsubscribe = subscribeAuth((next) => {
          setUser(next);
        });
      })
      .catch(() => {
        setUser(null);
      });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user === undefined || user === null) {
      setAuthTokenGetter(async () => null);
      setMe(null);
      setReady(false);
      setBudgetId(null);
      setHousehold([]);
      setSummaries([]);
      return;
    }
    const current = user;
    setAuthTokenGetter(() => current.getIdToken());
    let cancelled = false;
    async function loadProfile() {
      const meResponse = await clientFetch("/api/me", {
        headers: { Authorization: `Bearer ${await current.getIdToken()}` },
      });
      const meData: unknown = await meResponse.json();
      if (cancelled) {
        return;
      }
      if (!meResponse.ok || !isMeProfile(meData)) {
        setMe(null);
        setReady(false);
        return;
      }
      setMe(meData);
      const hydrated = await hydrateFromServer(() => current.getIdToken());
      if (cancelled) {
        return;
      }
      if (!hydrated.ok) {
        setLoadError(hydrated.error);
        return;
      }
      setSummaries(hydrated.summaries);
      if (meData.isModerator) {
        const adminResponse = await clientFetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${await current.getIdToken()}` },
        });
        const adminData: unknown = await adminResponse.json();
        if (
          !cancelled &&
          adminResponse.ok &&
          typeof adminData === "object" &&
          adminData !== null &&
          "users" in adminData &&
          Array.isArray(adminData.users)
        ) {
          setHousehold(adminData.users as UserProfile[]);
        }
      } else {
        setHousehold([]);
      }
      setLoadError(null);
      setReady(true);
    }
    void loadProfile();
    const stop = onProfileReady(() => {
      void loadProfile();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [user]);

  if (user === undefined) {
    return withBusyOverlay(<main />);
  }

  if (user === null || me === null || !ready) {
    return withBusyOverlay(
      <main>
        <LoginScreen />
      </main>,
    );
  }

  if (loadError) {
    return withBusyOverlay(
      <main>
        <h1>Budgets</h1>
        <p>{loadError}</p>
      </main>,
    );
  }

  const actor = actorFromMe(me);

  if (budgetId) {
    return withBusyOverlay(
      <main>
        <SessionBar me={me} />
        <BudgetScreen
          budgetId={budgetId}
          me={me}
          onBack={() => setBudgetId(null)}
        />
      </main>,
    );
  }

  return withBusyOverlay(
    <main>
      <SessionBar me={me} />
      <h1>Budgets</h1>
      <HomeScreen
        actor={actor}
        summaries={summaries}
        household={household}
        getIdToken={() => user.getIdToken()}
        onSummariesChange={setSummaries}
        onOpen={setBudgetId}
        onDeleteUser={async (userId) => {
          const token = await user.getIdToken();
          await clientFetch(`/api/admin/users/${userId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          const adminResponse = await clientFetch("/api/admin/users", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const adminData: unknown = await adminResponse.json();
          if (
            adminResponse.ok &&
            typeof adminData === "object" &&
            adminData !== null &&
            "users" in adminData &&
            Array.isArray(adminData.users)
          ) {
            setHousehold(adminData.users as UserProfile[]);
          }
          const hydrated = await hydrateFromServer(() => user.getIdToken());
          if (hydrated.ok) {
            setSummaries(hydrated.summaries);
          }
        }}
        onToggleFromText={async (userId, canUse) => {
          const token = await user.getIdToken();
          await clientFetch(`/api/admin/users/${userId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ canUseFromText: canUse }),
          });
          const adminResponse = await clientFetch("/api/admin/users", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const adminData: unknown = await adminResponse.json();
          if (
            adminResponse.ok &&
            typeof adminData === "object" &&
            adminData !== null &&
            "users" in adminData &&
            Array.isArray(adminData.users)
          ) {
            setHousehold(adminData.users as UserProfile[]);
          }
        }}
      />
    </main>,
  );
}
