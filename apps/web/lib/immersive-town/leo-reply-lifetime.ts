export const LEO_REPLY_LIFETIME_MS = 30_000;

/**
 * Keep one instance per mounted town. Reply IDs are stable identities: changing
 * text, hiding a reply, or revisiting its ID never grants it another lifetime.
 * `watch` belongs in an effect; return its cleanup to release the active timer.
 */
export function createLeoReplyLifetime() {
  // A null deadline is a permanent dismissal, including automatic expiry.
  const deadlines = new Map<string, number | null>();
  let activeId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  function cancel() {
    generation += 1;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    activeId = null;
  }

  return {
    /** Unseen IDs can render; their clock starts in the first eligible watch. */
    isLive(id: string): boolean {
      const deadline = deadlines.get(id);
      return (
        deadline === undefined || (deadline !== null && Date.now() < deadline)
      );
    },

    dismiss(id: string): void {
      deadlines.set(id, null);
      if (activeId === id) cancel();
    },

    watch(
      id: string | null,
      eligible: boolean,
      onExpire: (id: string) => void,
    ): () => void {
      cancel();
      const watchedGeneration = generation;
      const cleanup = () => {
        // A delayed cleanup from an older effect cannot cancel a newer reply.
        if (generation === watchedGeneration) cancel();
      };
      if (id === null) return cleanup;

      let deadline = deadlines.get(id);
      if (deadline === undefined && eligible) {
        deadline = Date.now() + LEO_REPLY_LIFETIME_MS;
        deadlines.set(id, deadline);
      }
      if (deadline === undefined || deadline === null) return cleanup;

      activeId = id;
      const expire = () => {
        if (
          generation !== watchedGeneration ||
          deadlines.get(id) !== deadline
        ) {
          return;
        }
        deadlines.set(id, null);
        timer = undefined;
        activeId = null;
        onExpire(id);
      };
      const remaining = deadline - Date.now();
      // Once started, the deadline also runs while the bubble is hidden.
      if (remaining <= 0) expire();
      else timer = setTimeout(expire, remaining);
      return cleanup;
    },
  };
}
