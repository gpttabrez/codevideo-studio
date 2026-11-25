import {spawn, spawnSync} from 'node:child_process';
import {createDefaultProject, createDefaultTimeline, FEATURE_SOURCE, INTRO_SOURCE} from '../packages/project-schema/dist/index.js';
import {mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const apiPort = 43000 + Math.floor(Math.random() * 1000);
const webPort = apiPort + 1;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const dataDir = await mkdtemp(join(tmpdir(), 'codevideo-smoke-'));
const proxySecret = 'smoke-proxy-secret';
const workerToken = 'smoke-worker-token';
const children = [];

const baseEnv = {
  ...process.env,
  NODE_ENV: 'production',
  RENDER_DATA_DIR: dataDir,
  RENDER_OUTPUTS_DIR: join(dataDir, 'outputs'),
  CODEVIDEO_PROXY_SECRET: proxySecret,
  CODEVIDEO_WORKER_TOKEN: workerToken,
  API_HOST: '127.0.0.1',
  API_LOGGER: 'false',
  PORT: String(apiPort),
  WEB_ORIGIN: webUrl,
  WEB_URL: webUrl,
  API_PROXY_TARGET: apiUrl,
  WORKER_API_URL: apiUrl,
  RENDER_MAX_EXECUTION_MS: '120000',
  RENDER_CANCEL_POLL_MS: '250',
};

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? baseEnv,
    shell: Boolean(options.shell),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`));
  children.push(child);
  return child;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

async function waitForUrl(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function userHeaders(user, extra = {}) {
  return {
    'x-codevideo-proxy-secret': proxySecret,
    'x-codevideo-user': user,
    ...extra,
  };
}

function smokeProject() {
  const project = createDefaultProject('Render smoke fixture');
  project.settings.width = 640;
  project.settings.height = 360;
  project.settings.fps = 30;
  project.settings.resolutionPreset = '1280x720';
  project.scenes = [
    {...project.scenes[0], id: 'smoke-intro', name: 'Intro', order: 0, duration: 0.3, source: INTRO_SOURCE},
    {...project.scenes[1], id: 'smoke-feature', name: 'Feature', order: 1, duration: 0.3, source: FEATURE_SOURCE},
  ];
  project.timeline = createDefaultTimeline(project.scenes);
  return project;
}

async function stopAll() {
  for (const child of children.reverse()) {
    if (!child.killed) child.kill('SIGTERM');
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const child of children) {
    if (!child.killed) child.kill('SIGKILL');
  }
}

try {
  start('api', process.execPath, ['apps/api/dist/index.js']);
  const vitePath = process.platform === 'win32'
    ? resolve(root, 'apps/web/node_modules/.bin/vite.cmd')
    : resolve(root, 'apps/web/node_modules/.bin/vite');
  start('web', vitePath, ['--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: resolve(root, 'apps/web'),
    env: {...baseEnv, VITE_API_URL: ''},
    shell: process.platform === 'win32',
  });
  await waitForUrl(`${apiUrl}/api/health`);
  await waitForUrl(webUrl);
  start('worker', process.execPath, ['apps/render-worker/dist/index.js']);

  const project = smokeProject();
  const created = await fetch(`${apiUrl}/api/render`, {
    method: 'POST',
    headers: userHeaders('alice', {'content-type': 'application/json'}),
    body: JSON.stringify({project, format: 'mp4', quality: 'draft'}),
  });
  assert(created.status === 202, 'API accepts authenticated render submission with HTTP 202');
  const {jobId} = await created.json();
  assert(typeof jobId === 'string' && jobId.length > 0, 'API returns a job id');

  const deadline = Date.now() + 120000;
  let job;
  while (Date.now() < deadline) {
    const response = await fetch(`${apiUrl}/api/render/${jobId}`, {headers: userHeaders('alice')});
    job = await response.json();
    if (job.status === 'complete' || job.status === 'failed') break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(job?.status === 'complete', `worker completes the job with status complete (actual: ${job?.status})`);
  assert(job.outputUrl === `/outputs/${jobId}.mp4`, `API returns outputUrl ${job.outputUrl}`);

  const outputPath = join(dataDir, 'outputs', `${jobId}.mp4`);
  const fileStat = await stat(outputPath);
  assert(fileStat.size > 0, `output file exists with ${fileStat.size} bytes`);

  const probe = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,nb_frames:format=duration',
    '-of', 'json',
    outputPath,
  ], {encoding: 'utf8'});
  assert(probe.status === 0, `ffprobe exits 0 (stderr: ${probe.stderr.trim()})`);
  const metadata = JSON.parse(probe.stdout);
  const video = metadata.streams[0];
  assert(video.codec_name === 'h264', `video codec is h264 (actual: ${video.codec_name})`);
  assert(video.width === 640 && video.height === 360, `video resolution is 640x360 (actual: ${video.width}x${video.height})`);
  const duration = Number(metadata.format.duration);
  assert(Math.abs(duration - 0.6) < 0.15, `video duration is 0.6s (actual: ${duration})`);
  if (video.nb_frames) {
    assert(Number(video.nb_frames) === 18, `video frame count is 18 (actual: ${video.nb_frames})`);
  }

  const ownerDownload = await fetch(`${apiUrl}${job.outputUrl}`, {headers: userHeaders('alice')});
  assert(ownerDownload.status === 200, 'authorized owner can download the output');
  assert(Number(ownerDownload.headers.get('content-length')) === fileStat.size, 'download response length matches the output file');
  const otherDownload = await fetch(`${apiUrl}${job.outputUrl}`, {headers: userHeaders('bob')});
  assert(otherDownload.status === 404, 'different owner receives HTTP 404 for the output');
  const anonymousDownload = await fetch(`${apiUrl}${job.outputUrl}`);
  assert(anonymousDownload.status === 401, 'unauthenticated output request receives HTTP 401');

  console.log('RENDER_SMOKE_RESULT PASS');
} finally {
  await stopAll();
  if (process.env.KEEP_SMOKE_DATA === '1') {
    console.log(`KEPT_SMOKE_DATA ${dataDir}`);
  } else {
    await rm(dataDir, {recursive: true, force: true});
  }
}
