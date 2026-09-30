"use client";
import { useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Plus, ShieldCheck } from "lucide-react";
export async function requestJson(path: string, body: unknown) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error ?? "The request could not be completed.");
  return data;
}
function LinkSession({
  token,
  onDone,
  onError,
  reconnect,
}: {
  token: string;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
  reconnect: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken) => {
      setBusy(true);
      try {
        if (!reconnect) {
          const r = await requestJson("/api/plaid/exchange", {
            public_token: publicToken,
          });
          if (r.syncPending)
            onError(
              "Bank connected. Initial transactions are still preparing; refresh shortly.",
            );
        }
        await onDone();
      } catch (e) {
        onError(
          e instanceof Error ? e.message : "Could not connect your bank.",
        );
      } finally {
        setBusy(false);
      }
    },
    onExit: (error) => {
      if (error)
        onError(
          error.display_message ??
            "The bank connection could not be completed. Please try again.",
        );
    },
  });
  return (
    <button
      className="button primary"
      disabled={!ready || busy}
      onClick={() => open()}
    >
      <ShieldCheck size={17} />
      {busy
        ? "Saving connection…"
        : reconnect
          ? "Reconnect securely"
          : "Open secure bank connection"}
    </button>
  );
}
export function ConnectBank({
  demo,
  ready,
  onConnected,
  onError,
  institutionId,
}: {
  demo: boolean;
  ready: boolean;
  onConnected: () => Promise<void>;
  onError: (message: string) => void;
  institutionId?: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function prepare() {
    if (demo) {
      onError("Demo uses sample accounts. Sign in to connect your own bank.");
      return;
    }
    if (!ready) {
      onError(
        "Bank connections need Plaid and server database credentials. See the setup guide.",
      );
      return;
    }
    setBusy(true);
    try {
      const data = await requestJson("/api/plaid/link", {
        institution_id: institutionId,
      });
      setToken(data.link_token);
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "Could not start the connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  return token ? (
    <LinkSession
      token={token}
      reconnect={!!institutionId}
      onDone={async () => {
        setToken(null);
        await onConnected();
      }}
      onError={onError}
    />
  ) : (
    <button className="button primary" disabled={busy} onClick={prepare}>
      <Plus size={17} />
      {busy ? "Preparing…" : institutionId ? "Reconnect bank" : "Connect bank"}
    </button>
  );
}
