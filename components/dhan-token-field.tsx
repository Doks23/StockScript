"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";

/**
 * A Dhan token is valid for 24 hours, and re-pasting it for every sync of the
 * day is the single most tedious part of the routine. So it is kept in this
 * browser's localStorage until it expires, and never sent anywhere but Dhan's
 * own API through our own route - the server still refuses to store it.
 */
const STORAGE_KEY = "stockscript.dhan.token";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type StoredToken = { token: string; savedAt: number; expiresAt: number };

function readStored(): StoredToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredToken>;
    if (typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") {
      return null;
    }
    // An expired token would only produce a confusing 401 later, so drop it
    // here and let the field ask for a fresh one.
    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as StoredToken;
  } catch {
    return null;
  }
}

/**
 * Token state shared by both sync panels: remembered for 24 hours, replaceable
 * at any time.
 */
export function useDhanToken() {
  const [accessToken, setAccessToken] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  /** Until the first read, we do not know whether a saved token exists. */
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setAccessToken(stored.token);
      setExpiresAt(stored.expiresAt);
    }
    setIsRestored(true);
  }, []);

  /** Called once a request has proved the token actually works. */
  const remember = useCallback((token: string) => {
    const value = token.trim();
    if (!value) return;
    const record: StoredToken = {
      token: value,
      savedAt: Date.now(),
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
      setExpiresAt(record.expiresAt);
    } catch {
      // Private browsing, quota, or a blocked store - the sync itself still
      // works, the token just will not survive the reload.
    }
  }, []);

  const forget = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do - the in-memory token is cleared either way.
    }
    setAccessToken("");
    setExpiresAt(null);
  }, []);

  return { accessToken, setAccessToken, expiresAt, isRestored, remember, forget };
}

function formatExpiry(expiresAt: number) {
  return new Date(expiresAt).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DhanTokenField({
  id,
  accessToken,
  onChange,
  expiresAt,
  onForget,
}: {
  id: string;
  accessToken: string;
  onChange: (value: string) => void;
  expiresAt: number | null;
  onForget: () => void;
}) {
  const isRemembered = expiresAt !== null && accessToken.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-ink" htmlFor={id}>
          Dhan access token
        </label>
        {isRemembered && (
          <button
            type="button"
            onClick={onForget}
            className="shrink-0 text-xs text-muted underline hover:text-ink"
          >
            Use a different token
          </button>
        )}
      </div>

      <input
        id={id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={accessToken}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste your 24-hour access token"
        className="w-full rounded-lg border border-line px-3 py-2 font-mono text-sm outline-none focus:border-accent"
      />

      {isRemembered ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <KeyRound className="h-3.5 w-3.5" />
          Remembered in this browser until {formatExpiry(expiresAt)}. Paste over it to
          switch tokens.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5" />
          Kept in this browser for 24 hours so you do not paste it every sync. Never
          saved on the server, never logged.
        </p>
      )}

      <a
        href="https://web.dhan.co"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
      >
        Get a token: web.dhan.co &rarr; My Profile &rarr; Access DhanHQ APIs
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
