export function createDetailRequestCoordinator<T>(
  load: (id: string) => Promise<T>,
  publish: (value: T | null) => void
) {
  let generation = 0;

  return {
    select(id: string | null): Promise<void> {
      const current = ++generation;
      publish(null);

      if (id === null) return Promise.resolve();

      let request: Promise<T>;

      try {
        request = load(id);
      } catch {
        return Promise.resolve();
      }

      return request.then(
        value => {
          if (current === generation) publish(value);
        },
        () => {
          if (current === generation) publish(null);
        }
      );
    },

    dispose() {
      ++generation;
    }
  };
}
