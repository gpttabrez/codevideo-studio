import {outputFile, type RenderJob} from '@codevideo/render-jobs';
import {renderProjectToFrames} from '@codevideo/python-renderer';
import {chromium} from 'playwright';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  claimJob,
  getJobStatus,
  reportCancelled,
  reportComplete,
  reportFailure,
  reportProgress,
  workerApiUrl,
} from './apiClient.js';
import {buildFfmpegArgs, runFfmpeg} from './ffmpeg.js';
import {RenderCancelledError, startJobMonitor} from './monitor.js';

declare global {
  interface Window {
    __codevideo_renderReady?: boolean;
    __codevideo_renderFrameCount?: number;
    __codevideo_renderFrame?: (frame: number) => Promise<string>;
    __codevideo_renderError?: string;
    __codevideo_renderProject?: unknown;
  }
}

const WEB_URL = (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const MAX_RENDER_MS = Number(process.env.RENDER_MAX_EXECUTION_MS ?? 300_000);
const CANCEL_POLL_MS = Number(process.env.RENDER_CANCEL_POLL_MS ?? 1000);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function renderPythonJob(job: RenderJob): Promise<void> {
  const controller = new AbortController();
  let terminalError: Error | null = null;
  const monitor = startJobMonitor({
    getStatus: () => getJobStatus(job.id),
    intervalMs: CANCEL_POLL_MS > 0 ? CANCEL_POLL_MS : 1000,
    deadlineMs: MAX_RENDER_MS > 0 ? MAX_RENDER_MS : 300_000,
    onCancelled: () => reportCancelled(job.id),
    onFailure: error => {
      terminalError = error;
      controller.abort();
    },
  });
  const framesDir = await mkdtemp(join(tmpdir(), 'codevideo-python-frames-'));
  try {
    await reportProgress(job.id, 0.02, 'Preparing Python renderer');
    const result = await renderProjectToFrames(job.project, {
      outputDir: framesDir,
      timeoutMs: MAX_RENDER_MS > 0 ? MAX_RENDER_MS : 300_000,
      onProgress: (progress, message) => {
        void reportProgress(job.id, Math.max(0.02, progress * 0.9), message).catch(() => undefined);
      },
    });
    await monitor.check();
    if (terminalError) throw terminalError;
    if (!result.frames.length) throw new Error('Python renderer produced no frames.');
    await reportProgress(job.id, 0.95, 'Encoding video');
    await runFfmpeg(buildFfmpegArgs(
      job,
      join(framesDir, 'frame-%06d.png'),
      outputFile(job.id, job.format),
    ), controller.signal);
    await monitor.check();
    if (terminalError) throw terminalError;
    await reportComplete(job.id);
  } catch (error) {
    if (terminalError) throw terminalError;
    throw error;
  } finally {
    monitor.stop();
    await rm(framesDir, {recursive: true, force: true});
  }
}

export async function renderJob(job: RenderJob): Promise<void> {
  if (job.project.engine === 'python') {
    await renderPythonJob(job);
    return;
  }
  const startedAt = Date.now();
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      ...(process.env.CHROMIUM_DISABLE_SANDBOX === 'true' ? ['--no-sandbox'] : []),
    ],
  });
  const controller = new AbortController();
  let framesDir: string | null = null;
  let terminalError: Error | null = null;
  const stopBrowser = () => {
    controller.abort();
    void browser.close().catch(() => undefined);
  };
  const monitor = startJobMonitor({
    getStatus: () => getJobStatus(job.id),
    intervalMs: CANCEL_POLL_MS > 0 ? CANCEL_POLL_MS : 1000,
    deadlineMs: MAX_RENDER_MS > 0 ? MAX_RENDER_MS : 300_000,
    onCancelled: () => reportCancelled(job.id),
    onFailure: error => {
      terminalError = error;
      stopBrowser();
    },
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: job.project.settings.width,
        height: job.project.settings.height,
      },
    });
    await page.addInitScript(project => {
      window.__codevideo_renderProject = project;
    }, job.project);
    await page.goto(`${WEB_URL}/#/render/${job.id}`, {waitUntil: 'domcontentloaded'});
    const remaining = Math.max(1000, Math.min(180_000, MAX_RENDER_MS - (Date.now() - startedAt)));
    await page.waitForFunction(
      () => window.__codevideo_renderReady === true || Boolean(window.__codevideo_renderError),
      undefined,
      {timeout: remaining},
    );
    if (terminalError) throw terminalError;
    const renderError = await page.evaluate(() => window.__codevideo_renderError);
    if (renderError) throw new Error(renderError);

    const frameCount = await page.evaluate(() => window.__codevideo_renderFrameCount ?? 0);
    if (!frameCount) throw new Error('Render page reported zero frames.');

    framesDir = await mkdtemp(join(tmpdir(), 'codevideo-frames-'));
    for (let frame = 0; frame < frameCount; frame += 1) {
      await monitor.check();
      if (terminalError) throw terminalError;
      const dataUrl = await page.evaluate(
        index => window.__codevideo_renderFrame?.(index) ?? Promise.reject(new Error('Renderer not ready')),
        frame,
      );
      const base64 = dataUrl.split(',')[1];
      if (!base64) throw new Error(`Frame ${frame} produced an empty image.`);
      await writeFile(
        join(framesDir, `frame-${String(frame).padStart(6, '0')}.png`),
        Buffer.from(base64, 'base64'),
      );
      if (frame % 10 === 0 || frame === frameCount - 1) {
        await reportProgress(job.id, frame / frameCount, `Rendering frame ${frame + 1}/${frameCount}`);
      }
    }

    await monitor.check();
    if (terminalError) throw terminalError;
    await reportProgress(job.id, 0.95, 'Encoding video');
    const output = outputFile(job.id, job.format);
    await runFfmpeg(buildFfmpegArgs(job, join(framesDir, 'frame-%06d.png'), output), controller.signal);
    if (terminalError) throw terminalError;
    await reportComplete(job.id);
  } catch (error) {
    if (terminalError) throw terminalError;
    throw error;
  } finally {
    monitor.stop();
    await browser.close().catch(() => undefined);
    if (framesDir) await rm(framesDir, {recursive: true, force: true});
  }
}

async function loop(): Promise<void> {
  console.log(`[render-worker] waiting for jobs at ${WEB_URL} via ${workerApiUrl()}`);
  for (;;) {
    const job = await claimJob();
    if (!job) {
      await sleep(1500);
      continue;
    }
    console.log(`[render-worker] rendering ${job.id} (${job.format})`);
    try {
      await renderJob(job);
      console.log(`[render-worker] completed ${job.id}`);
    } catch (error) {
      if (error instanceof RenderCancelledError) {
        console.log(`[render-worker] cancelled ${job.id}`);
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[render-worker] failed ${job.id}: ${message}`);
      try {
        await reportFailure(job.id, message);
      } catch (reportError) {
        const reportMessage = reportError instanceof Error ? reportError.message : String(reportError);
        console.error(`[render-worker] could not report failure for ${job.id}: ${reportMessage}`);
      }
    }
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  await loop();
}
