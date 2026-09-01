"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiClientError } from "@/lib/client/api";
import { createVault, unlockVault } from "@/lib/client/crypto";
import type { VaultEnvelope, VaultPreferences } from "@/lib/shared/types";
import { AuthScreen } from "@/components/auth-screen";
import { VaultDashboard } from "@/components/vault-dashboard";
import { BrandMark } from "@/components/brand-mark";

const defaultPreferences: VaultPreferences = {
  autoLockMinutes: 10,
  backgroundLockMinutes: 5,
  clipboardClearSeconds: 30,
  viewMode: "compact",
  sortMode: "favorite",
};

type Phase = "loading" | "setup" | "login" | "locked" | "unlocked";

interface AuthStateResponse {
  setupRequired: boolean;
  authenticated: boolean;
  user?: { username: string; createdAt: string; passwordChangedAt: string };
  envelope?: VaultEnvelope;
  preferences?: VaultPreferences;
}

interface AuthResponse {
  authenticated: true;
  user: { username: string; createdAt: string; passwordChangedAt: string };
  envelope: VaultEnvelope;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError || error instanceof Error) return error.message;
  return "操作失败，请稍后重试";
}

export function VisualTwoFactorApp() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [username, setUsername] = useState("");
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [preferences, setPreferences] = useState<VaultPreferences>(defaultPreferences);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<AuthStateResponse>("/api/auth/state")
      .then((state) => {
        if (!active) return;
        if (state.setupRequired) {
          setPhase("setup");
          return;
        }
        if (!state.authenticated || !state.user) {
          setPhase("login");
          return;
        }
        setUsername(state.user.username);
        setPreferences(state.preferences || defaultPreferences);
        setPhase("locked");
      })
      .catch((error) => {
        if (!active) return;
        toast.error("无法连接保险库", { description: errorMessage(error) });
        setPhase("login");
      });
    return () => {
      active = false;
    };
  }, []);

  const lock = useCallback(() => {
    setVaultKey(null);
    setPhase((current) => (current === "unlocked" ? "locked" : current));
  }, []);

  useEffect(() => {
    if (phase !== "unlocked") return;
    let timer = window.setTimeout(lock, preferences.autoLockMinutes * 60_000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, preferences.autoLockMinutes * 60_000);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [lock, phase, preferences.autoLockMinutes]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        backgroundAt.current = Date.now();
        return;
      }
      if (
        phase === "unlocked" &&
        preferences.backgroundLockMinutes > 0 &&
        backgroundAt.current &&
        Date.now() - backgroundAt.current >= preferences.backgroundLockMinutes * 60_000
      ) {
        lock();
        toast("保险库已自动锁定");
      }
      backgroundAt.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [lock, phase, preferences.backgroundLockMinutes]);

  const handleSetup = async (nextUsername: string, password: string) => {
    const created = await createVault(password);
    const response = await apiFetch<AuthResponse>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ username: nextUsername, password, envelope: created.envelope }),
    });
    localStorage.setItem("visual2fa:last-username", response.user.username);
    setUsername(response.user.username);
    setVaultKey(created.key);
    setPhase("unlocked");
    toast.success("私人保险库已创建", { description: "建议现在导出第一份加密备份。" });
  };

  const handleLogin = async (nextUsername: string, password: string) => {
    const response = await apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: nextUsername, password }),
    });
    const key = await unlockVault(password, response.envelope);
    localStorage.setItem("visual2fa:last-username", response.user.username);
    setUsername(response.user.username);
    setVaultKey(key);
    setPhase("unlocked");
  };

  const handleUnlock = async (_username: string, password: string) => {
    const response = await apiFetch<{ envelope: VaultEnvelope }>("/api/auth/reauth", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    const key = await unlockVault(password, response.envelope);
    setVaultKey(key);
    setPhase("unlocked");
  };

  const logout = useCallback(async () => {
    try {
      await apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } catch {
      // The local vault must lock even if the network is unavailable.
    }
    setVaultKey(null);
    setUsername("");
    setPhase("login");
  }, []);

  if (phase === "loading") {
    return (
      <main className="loading-screen">
        <BrandMark />
        <div className="loading-instrument" aria-label="正在校准保险库">
          <span />
        </div>
        <p>CALIBRATING PRIVATE VAULT</p>
      </main>
    );
  }

  if (phase !== "unlocked" || !vaultKey) {
    return (
      <AuthScreen
        mode={phase === "setup" ? "setup" : phase === "locked" ? "locked" : "login"}
        username={username}
        onSubmit={phase === "setup" ? handleSetup : phase === "locked" ? handleUnlock : handleLogin}
        onLogout={phase === "locked" ? logout : undefined}
      />
    );
  }

  return (
    <VaultDashboard
      username={username}
      vaultKey={vaultKey}
      preferences={preferences}
      onPreferencesChange={setPreferences}
      onLock={lock}
      onLogout={logout}
    />
  );
}
