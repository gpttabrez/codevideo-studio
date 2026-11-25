import {describe, expect, it} from 'vitest';
import {
  clamp,
  createId,
  deepClone,
  formatTimecode,
  framesToSeconds,
  lerp,
  safeJsonParse,
  secondsToFrames,
} from './index.js';

describe('shared utilities', () => {
  it('converts between frames and seconds', () => {
    expect(secondsToFrames(1.5, 30)).toBe(45);
    expect(framesToSeconds(45, 30)).toBe(1.5);
  });

  it('formats timecode', () => {
    expect(formatTimecode(61.5, 30)).toBe('00:01:01:15');
  });

  it('clamps and interpolates', () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it('creates prefixed unique ids', () => {
    const first = createId('scene');
    const second = createId('scene');
    expect(first).toMatch(/^scene_/);
    expect(first).not.toBe(second);
  });

  it('clones and safely parses json', () => {
    const source = {a: [1, 2, 3]};
    const clone = deepClone(source);
    clone.a.push(4);
    expect(source.a).toHaveLength(3);
    expect(safeJsonParse('{bad', {fallback: true})).toEqual({fallback: true});
  });
});
