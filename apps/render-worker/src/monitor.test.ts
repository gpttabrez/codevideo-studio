import {describe, expect, it, vi} from 'vitest';
import {RenderCancelledError, startJobMonitor} from './monitor.js';

describe('render job monitor', () => {
  it('detects a cancellation requested while rendering', async () => {
    const onCancelled = vi.fn(async () => undefined);
    const onFailure = vi.fn();
    const monitor = startJobMonitor({
      getStatus: async () => 'cancelling',
      intervalMs: 5,
      deadlineMs: 1000,
      onCancelled,
      onFailure,
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    monitor.stop();
    expect(onCancelled).toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(monitor.failure).toBeInstanceOf(RenderCancelledError);
  });

  it('fails a stuck render at the execution deadline', async () => {
    const onFailure = vi.fn();
    const monitor = startJobMonitor({
      getStatus: async () => 'rendering',
      intervalMs: 5,
      deadlineMs: 20,
      onCancelled: async () => undefined,
      onFailure,
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    monitor.stop();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(monitor.failure?.message).toBe('Render exceeded execution time limit.');
  });

  it('stops polling after a terminal failure', async () => {
    const getStatus = vi.fn(async () => 'rendering' as const);
    const monitor = startJobMonitor({
      getStatus,
      intervalMs: 5,
      deadlineMs: 20,
      onCancelled: async () => undefined,
      onFailure: () => undefined,
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    monitor.stop();
    const calls = getStatus.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(getStatus.mock.calls.length).toBe(calls);
  });
});
