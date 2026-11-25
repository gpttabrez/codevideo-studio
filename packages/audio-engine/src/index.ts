import {createId} from '@codevideo/shared';

export interface SubtitleCueLike {
  id?: string;
  start: number;
  end: number;
  text: string;
}

export function secondsToSamples(seconds: number, sampleRate: number): number {
  return Math.max(0, Math.floor(seconds * sampleRate));
}

export function createSilentWav(
  seconds: number,
  sampleRate = 48_000,
  channels = 1,
): Uint8Array {
  const frameCount = secondsToSamples(seconds, sampleRate);
  const dataBytes = frameCount * channels * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeText = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataBytes, true);

  return new Uint8Array(buffer);
}

export function mixSamples(tracks: Float32Array[]): Float32Array {
  const length = tracks.reduce((max, track) => Math.max(max, track.length), 0);
  const result = new Float32Array(length);
  for (const track of tracks) {
    for (let index = 0; index < track.length; index += 1) {
      result[index] = (result[index] ?? 0) + (track[index] ?? 0);
    }
  }
  return result;
}

export function mixTracks(
  tracks: Array<{samples: Float32Array; volume: number; startSeconds: number}>,
  sampleRate: number,
): Float32Array {
  const endSeconds = tracks.reduce(
    (max, track) => Math.max(max, track.startSeconds + track.samples.length / sampleRate),
    0,
  );
  const result = new Float32Array(secondsToSamples(endSeconds, sampleRate));
  for (const track of tracks) {
    const offset = secondsToSamples(track.startSeconds, sampleRate);
    for (let index = 0; index < track.samples.length; index += 1) {
      const target = offset + index;
      if (target < result.length) {
        result[target] = (result[target] ?? 0) + (track.samples[index] ?? 0) * track.volume;
      }
    }
  }
  return normalizeSamples(result);
}

export function normalizeSamples(samples: Float32Array, peak = 0.95): Float32Array {
  let max = 0;
  for (const sample of samples) {
    max = Math.max(max, Math.abs(sample));
  }
  if (max === 0 || max <= peak) return samples;
  const factor = peak / max;
  return samples.map(sample => sample * factor);
}

export function formatSrtTime(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const secs = Math.floor(milliseconds / 1000) % 60;
  const ms = milliseconds % 1000;
  const pad = (value: number, length = 2) => value.toString().padStart(length, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
}

export function subtitlesToSrt(cues: SubtitleCueLike[]): string {
  return cues
    .map((cue, index) => {
      return `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`;
    })
    .join('\n');
}

export function srtToSubtitles(srt: string): SubtitleCueLike[] {
  const blocks = srt.trim().split(/\r?\n\r?\n/).filter(Boolean);
  return blocks.flatMap(block => {
    const lines = block.split(/\r?\n/);
    const timing = lines[1] ?? '';
    const match = timing.match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/,
    );
    if (!match) return [];
    const toSeconds = (
      hours: string,
      minutes: string,
      secs: string,
      ms: string,
    ) =>
      Number(hours) * 3600 + Number(minutes) * 60 + Number(secs) + Number(ms) / 1000;
    return [
      {
        id: createId('cue'),
        start: toSeconds(match[1]!, match[2]!, match[3]!, match[4]!),
        end: toSeconds(match[5]!, match[6]!, match[7]!, match[8]!),
        text: lines.slice(2).join(' '),
      },
    ];
  });
}
