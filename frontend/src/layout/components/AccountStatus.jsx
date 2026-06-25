import { useEffect, useState } from "react";
import {
  accountLoginUrl,
  fetchAccountSession,
  supportsSharedAccountCookies,
} from "../accountClient";

export default function AccountStatus() {
  const [session, setSession] = useState(null);
  const [loadState, setLoadState] = useState("idle");

  const supported = supportsSharedAccountCookies();

  async function loadSession(signal) {
    setLoadState("loading");
    try {
      const nextSession = await fetchAccountSession(signal);
      setSession(nextSession);
      setLoadState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setSession(null);
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

  if (!supported) {
    return null;
  }

  if (session?.mode === "user" && session.user) {
    return (
      <a className="account-pill" href={accountLoginUrl} title={session.user.email}>
        Account
      </a>
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
    <a className="account-pill" href={accountLoginUrl}>
      {loadState === "loading" ? "Checking..." : "Sign in"}
    </a>
  );
}
