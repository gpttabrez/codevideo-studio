import type {RenderJob} from '@codevideo/render-jobs';
import {spawn} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';
import {isAbsolute, relative, resolve} from 'node:path';

const QUALITY_PRESETS = {
  draft: {crf: '28', preset: 'veryfast'},
  standard: {crf: '23', preset: 'medium'},
  high: {crf: '18', preset: 'slow'},
} as const;

function assetRoot(): string {
  return resolve(process.env.RENDER_ASSET_ROOT ?? resolve(process.cwd(), 'data', 'assets'));
}

function resolveAssetFile(reference: string): string {
  const root = assetRoot();
  const token = reference.replace(/^asset:/, '').replace(/^\/api\/assets\//, '');
  const safe = token.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe || safe.includes('..')) throw new Error('Invalid audio asset reference.');
  const direct = resolve(root, safe);
  if (existsSync(direct)) return direct;
  const stem = safe.replace(/\.[^.]+$/, '');
  const match = readdirSync(root).find(name => name.startsWith(`${stem}.`) && !name.includes('..'));
  if (!match) throw new Error(`Audio asset not found: ${stem}`);
  return resolve(root, match);
}

function resolveAudioInput(job: RenderJob): {path: string; startTime: number; duration: number; volume: number} | null {
  const clip = job.project.audio.find(item => !item.muted);
  if (!clip) return null;
  const source = clip.src.trim();
  if (!source) throw new Error('Audio clip has no source.');
  let path: string;
  if (source.startsWith('asset:') || source.startsWith('/api/assets/')) {
    path = resolveAssetFile(source);
  } else if (isAbsolute(source)) {
    path = resolve(source);
    const rel = relative(assetRoot(), path);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('Audio file must be inside the configured asset directory.');
    }
  } else {
    path = resolve(assetRoot(), source);
  }
  if (!existsSync(path)) throw new Error(`Audio file not found: ${path}`);
  return {path, startTime: clip.startTime, duration: clip.duration, volume: clip.volume};
}

export function buildFfmpegArgs(job: RenderJob, inputPattern: string, output: string): string[] {
  const fps = String(job.project.settings.fps);
  const preset = QUALITY_PRESETS[job.quality];
  const audio = resolveAudioInput(job);
  const common = ['-y', '-framerate', fps, '-i', inputPattern];
  if (job.format === 'mp4') {
    if (audio) {
      const delay = Math.round(audio.startTime * 1000);
      const duration = audio.duration > 0 ? audio.duration : 3600;
      const filter = `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,adelay=${delay}:all=1,volume=${audio.volume}[a]`;
      return [
        ...common,
        '-i',
        audio.path,
        '-filter_complex',
        filter,
        '-map',
        '0:v:0',
        '-map',
        '[a]',
        '-c:v',
        'libx264',
        '-preset',
        preset.preset,
        '-crf',
        preset.crf,
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-shortest',
        '-movflags',
        '+faststart',
        output,
      ];
    }
    return [
      ...common,
      '-c:v',
      'libx264',
      '-preset',
      preset.preset,
      '-crf',
      preset.crf,
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      output,
    ];
  }
  if (job.format === 'webm') {
    return [
      ...common,
      '-c:v',
      'libvpx-vp9',
      '-deadline',
      job.quality === 'draft' ? 'realtime' : 'good',
      '-cpu-used',
      job.quality === 'draft' ? '8' : '4',
      '-crf',
      preset.crf,
      '-b:v',
      '0',
      '-pix_fmt',
      'yuv420p',
      output,
    ];
  }
  return [
    ...common,
    '-filter_complex',
    '[0:v]split[a][b];[a]palettegen[p];[b][p]paletteuse',
    '-loop',
    '0',
    output,
  ];
}

export function runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Render was aborted before encoding started.'));
      return;
    }
    const child = spawn('ffmpeg', args, {stdio: ['ignore', 'pipe', 'pipe']});
    let stderr = '';
    let settled = false;
    const abort = () => {
      if (!settled) child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', abort, {once: true});
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(new Error('Render was aborted during encoding.'));
      else if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}
