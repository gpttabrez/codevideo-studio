export type Result<T, E = Error> =
  | {ok: true; value: T}
  | {ok: false; error: E};

export function ok<T>(value: T): Result<T, never> {
  return {ok: true, value};
}

export function err<E>(error: E): Result<never, E> {
  return {ok: false, error};
}

export function createId(prefix = 'id'): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function secondsToFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}

export function formatTimecode(seconds: number, fps: number): string {
  const totalFrames = Math.max(0, secondsToFrames(seconds, fps));
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
