import type { SessionUser } from "../../shared/types/auth";
import { useRequestUiStore } from "~/stores/requestUi";

export function useAuth() {
  const app = useNuxtApp(),
    ui = useRequestUiStore();
  const user = useState<SessionUser | null>("auth-user", () => null);
  const checked = useState("auth-checked", () => false);
  const version = useState("auth-version", () => 0);
  const loggingOut = useState("auth-logging-out", () => false);
  const requestFetch = useRequestFetch();
  async function refreshSession() {
    const started = version.value;
    const session = await requestFetch<{ user: SessionUser | null }>(
      "/api/auth/session",
      { retry: 0 },
    );
    if (started === version.value && !loggingOut.value) {
      if (!session.user && user.value) accept(session);
      else {
        user.value = session.user;
        checked.value = true;
      }
    }
  }
  function accept(session: { user: SessionUser | null }) {
    version.value++;
    app.runWithContext(() => clearNuxtData());
    ui.$reset();
    user.value = session.user;
    checked.value = true;
  }
  async function expire() {
    accept({ user: null });
    await app.runWithContext(() =>
      navigateTo(
        { path: "/login", query: { expired: "1" } },
        { replace: true, external: true },
      ),
    );
  }
  async function login(email: string, password: string) {
    const session = await $fetch<{ user: SessionUser }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
      retry: 0,
    });
    accept(session);
  }
  async function register(input: {
    name: string;
    company: string;
    email: string;
    password: string;
  }) {
    const session = await $fetch<{ user: SessionUser }>("/api/auth/register", {
      method: "POST",
      body: input,
      retry: 0,
    });
    accept(session);
  }
  async function logout() {
    if (loggingOut.value) return;
    loggingOut.value = true;
    version.value++;
    try {
      await $fetch("/api/auth/logout", { method: "POST", retry: 0 });
      accept({ user: null });
      if (import.meta.client)
        try {
          for (const key of Object.keys(sessionStorage))
            if (key.startsWith("workflow-day5-draft:"))
              sessionStorage.removeItem(key);
        } catch {}
      await app.runWithContext(() =>
        navigateTo("/login", { replace: true, external: true }),
      );
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        error.statusCode === 401
      )
        await expire();
      else throw error;
    } finally {
      loggingOut.value = false;
    }
  }
  async function updateUser(input: { name: string; email: string }) {
    const started = version.value;
    const api = await app.runWithContext(() => useApi());
    const session = await api<{ user: SessionUser }>("/api/auth/profile", {
      method: "PATCH",
      body: input,
      retry: 0,
    });
    if (version.value === started) user.value = session.user;
  }
  return {
    user,
    checked,
    version,
    loggingOut,
    expire,
    refreshSession,
    login,
    register,
    logout,
    updateUser,
  };
}
