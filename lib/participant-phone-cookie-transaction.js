// Withhold provider session cookies until the canonical participant authority commits.
export function createParticipantPhoneCookieTransaction(cookieStore) {
  const pending = new Map();
  let committed = false;
  return {
    store: {
      getAll() {
        const items = new Map(cookieStore.getAll().map(item => [item.name, item]));
        for (const [name, item] of pending) items.set(name, item);
        return [...items.values()];
      },
      set(name, value, options) {
        if (committed) throw new Error("PHONE_SESSION_ALREADY_COMMITTED");
        pending.set(name, { name, value, options });
      },
    },
    commit(response) {
      if (committed) throw new Error("PHONE_SESSION_ALREADY_COMMITTED");
      for (const { name, value, options } of pending.values()) response.cookies.set(name, value, options);
      committed = true;
    },
  };
}
