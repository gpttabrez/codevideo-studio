import {createDefaultProject} from '@codevideo/project-schema';
import {describe, expect, it} from 'vitest';
import {buildFfmpegArgs} from './ffmpeg.js';

describe('ffmpeg command builder', () => {
  const job = {
    id: 'job-1',
    ownerId: 'test-owner',
    project: createDefaultProject(),
    format: 'mp4' as const,
    quality: 'standard' as const,
    status: 'rendering' as const,
    progress: 0,
    message: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('builds an H.264 command', () => {
    const args = buildFfmpegArgs(job, 'frames/frame-%06d.png', 'out.mp4');
    expect(args).toContain('libx264');
    expect(args).toContain('-crf');
    expect(args.at(-1)).toBe('out.mp4');
  });

  it('builds a VP9 command', () => {
    const args = buildFfmpegArgs({...job, format: 'webm'}, 'in.png', 'out.webm');
    expect(args).toContain('libvpx-vp9');
  });

  it('builds a GIF palette command', () => {
    const args = buildFfmpegArgs({...job, format: 'gif'}, 'in.png', 'out.gif');
    expect(args.join(' ')).toContain('palettegen');
    expect(args).toContain('-loop');
  });
});
