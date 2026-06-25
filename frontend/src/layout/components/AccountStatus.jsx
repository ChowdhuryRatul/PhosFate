import { useEffect, useState } from "react";
import {
  accountLoginUrl,
  fetchAccountSession,
  logoutSession,
  supportsSharedAccountCookies,
} from "../accountClient";

const ACCOUNT_SESSION_EVENT = "structf-account-session-change";

export default function AccountStatus() {
  const [session, setSession] = useState(null);
  const [loadState, setLoadState] = useState("idle");

  const supported = supportsSharedAccountCookies();

  async function loadSession(signal) {
    setLoadState("loading");
    try {
      const nextSession = await fetchAccountSession(signal);
      setSession(nextSession);
      window.dispatchEvent(
        new CustomEvent(ACCOUNT_SESSION_EVENT, { detail: nextSession }),
      );
      setLoadState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setSession(null);
      window.dispatchEvent(
        new CustomEvent(ACCOUNT_SESSION_EVENT, { detail: null }),
      );
      setLoadState("error");
    }
  }

  useEffect(() => {
    if (!supported) {
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      loadSession(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [supported]);

  async function handleLogout() {
    setLoadState("loading");
    try {
      await logoutSession();
      await loadSession();
    } catch {
      setLoadState("error");
    }
  }

  if (!supported) {
    return null;
  }

  if (session?.mode === "user" && session.user) {
    return (
      <button className="account-pill" type="button" onClick={handleLogout} title={session.user.email}>
        {loadState === "loading" ? "Signing out" : "Sign out"}
      </button>
    );
  }

  if (loadState === "error") {
    return (
      <button className="account-pill" type="button" onClick={() => loadSession()}>
        Retry
      </button>
    );
  }

  return (
    <a className="account-pill" href={accountLoginUrl()}>
      {loadState === "loading" ? "Checking..." : "Sign in"}
    </a>
  );
}
