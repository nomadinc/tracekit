export type ProfitRequestState<T> = {
  key: string | null;
  data: T | null;
  loading: boolean;
  error: string | null;
};

export class ProfitRequestController<T> {
  private listener: (() => void) | null = null;

  subscribe(listener: () => void) {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  private notify() {
    this.listener?.();
  }

  private generation = 0;
  private activeKey: string | null = null;
  private controller: AbortController | null = null;
  private state: ProfitRequestState<T> = {
    key: null,
    data: null,
    loading: false,
    error: null,
  };

  snapshot(key: string, authorized: boolean): ProfitRequestState<T> {
    if (!authorized || this.activeKey !== key) {
      return {
        key: null,
        data: null,
        loading: false,
        error: null,
      };
    }

    return { ...this.state };
  }

  invalidate() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.activeKey = null;
    this.state = {
      key: null,
      data: null,
      loading: false,
      error: null,
    };
    this.notify();
  }

  activate(
    key: string,
    authorized: boolean,
    request: (signal: AbortSignal) => Promise<T>
  ): Promise<void> {
    return this.start(key, authorized, request).done;
  }

  start(
    key: string,
    authorized: boolean,
    request: (signal: AbortSignal) => Promise<T>
  ): { done: Promise<void>; cancel: () => void } {
    this.invalidate();

    if (!authorized) {
      return { done: Promise.resolve(), cancel: () => {} };
    }

    this.activeKey = key;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;

    this.state = {
      key,
      data: null,
      loading: true,
      error: null,
    };
    this.notify();

    const done = (async () => {
    try {
      const data = await request(controller.signal);

      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        this.activeKey !== key
      ) return;

      this.state = {
        key,
        data,
        loading: false,
        error: null,
      };
      this.notify();
    } catch (error) {
      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        this.activeKey !== key
      ) return;

      this.state = {
        key,
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "Unavailable",
      };
      this.notify();
    }
    })();

    return {
      done,
      cancel: () => {
        if (
          this.generation === generation &&
          this.activeKey === key &&
          this.controller === controller
        ) {
          this.invalidate();
        }
      },
    };
  }

  dispose() {
    this.invalidate();
  }
}
