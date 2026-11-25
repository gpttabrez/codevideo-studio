import type {RenderStatus} from '@codevideo/render-jobs';

export interface JobMonitorOptions {
  getStatus: () => Promise<RenderStatus>;
  intervalMs: number;
  deadlineMs: number;
  onCancelled: () => Promise<void>;
  onFailure: (error: Error) => void;
}

export interface JobMonitor {
  readonly failure: Error | null;
  check(): Promise<void>;
  stop(): void;
}

export function startJobMonitor(options: JobMonitorOptions): JobMonitor {
  let failure: Error | null = null;
  let checking = false;
  let stopped = false;

  const fail = (error: Error) => {
    if (failure || stopped) return;
    failure = error;
    options.onFailure(error);
  };

  const check = async () => {
    if (stopped || failure || checking) return;
    checking = true;
    try {
      const status = await options.getStatus();
      if (status === 'cancelled' || status === 'cancelling') {
        await options.onCancelled();
        fail(new RenderCancelledError());
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    } finally {
      checking = false;
    }
  };

  const interval = setInterval(() => void check(), options.intervalMs);
  const watchdog = setTimeout(
    () => fail(new Error('Render exceeded execution time limit.')),
    options.deadlineMs,
  );

  return {
    get failure() {
      return failure;
    },
    check,
    stop() {
      stopped = true;
      clearInterval(interval);
      clearTimeout(watchdog);
    },
  };
}

export class RenderCancelledError extends Error {
  constructor() {
    super('Render cancelled');
    this.name = 'RenderCancelledError';
  }
}
