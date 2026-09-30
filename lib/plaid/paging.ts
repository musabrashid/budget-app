export type SyncPage<T> = {
  added: T[];
  modified: T[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
};
export async function collectSync<T extends { transaction_id: string }>(
  cursor: string | null,
  fetchPage: (cursor: string | undefined) => Promise<SyncPage<T>>,
  deadline = Date.now() + 120000,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let next = cursor ?? undefined;
    const changed = new Map<string, T>();
    const removed = new Set<string>();
    try {
      do {
        if (Date.now() > deadline) throw new Error("Sync time limit reached.");
        const page = await fetchPage(next);
        for (const t of [...page.added, ...page.modified]) {
          changed.set(t.transaction_id, t);
          removed.delete(t.transaction_id);
        }
        for (const t of page.removed) {
          removed.add(t.transaction_id);
          changed.delete(t.transaction_id);
        }
        next = page.next_cursor;
        if (!page.has_more)
          return {
            changed: [...changed.values()],
            removed: [...removed],
            cursor: next,
          };
      } while (true);
    } catch (e) {
      const code = (e as { response?: { data?: { error_code?: string } } })
        .response?.data?.error_code;
      if (
        code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" ||
        attempt === 2
      )
        throw e;
    }
  }
  throw new Error("Could not finish syncing.");
}

// Provider request objects may contain secrets. Only log a bounded, known-form error code.
export function providerErrorCode(error: unknown): string | null {
  const code = (
    error as { response?: { data?: { error_code?: unknown } } } | null
  )?.response?.data?.error_code;
  return typeof code === "string" && /^[A-Z0-9_]{1,80}$/.test(code)
    ? code
    : null;
}
