import {describe, expect, it} from 'vitest';
import {
  createSilentWav,
  formatSrtTime,
  mixTracks,
  srtToSubtitles,
  subtitlesToSrt,
} from './index.js';

describe('audio engine', () => {
  it('creates a valid PCM WAV header', () => {
    const wav = createSilentWav(1, 8000);
    const text = String.fromCharCode(...wav.slice(0, 4));
    expect(text).toBe('RIFF');
    expect(wav.length).toBe(44 + 8000 * 2);
  });

  it('mixes and normalizes tracks with offsets', () => {
    const result = mixTracks(
      [
        {samples: new Float32Array([1, 1]), volume: 0.5, startSeconds: 0},
        {samples: new Float32Array([1]), volume: 0.5, startSeconds: 0.125},
      ],
      8,
    );
    expect(result[0]).toBeCloseTo(0.475);
    expect(result[1]).toBeCloseTo(0.95);
  });

  it('round-trips subtitles through SRT', () => {
    const srt = subtitlesToSrt([
      {start: 1.25, end: 2.5, text: 'Hello world'},
    ]);
    expect(srt).toContain('00:00:01,250 --> 00:00:02,500');
    const cues = srtToSubtitles(srt);
    expect(cues[0]?.text).toBe('Hello world');
    expect(cues[0]?.start).toBeCloseTo(1.25);
    expect(formatSrtTime(3661)).toBe('01:01:01,000');
  });
});
