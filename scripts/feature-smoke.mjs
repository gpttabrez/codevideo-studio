import {createDefaultProject, createDefaultTimeline} from '../packages/project-schema/dist/index.js';
import {renderProjectToFrames} from '../packages/python-renderer/dist/index.js';
import {spawn, spawnSync} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = join(root, 'artifacts', 'e2e');
const dataDir = await mkdtemp(join(tmpdir(), 'codevideo-feature-'));
const assetRoot = join(dataDir, 'assets');
const apiPort = 44000 + Math.floor(Math.random() * 1000);
const webPort = apiPort + 1;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const proxySecret = 'feature-proxy-secret';
const workerToken = 'feature-worker-token';
const children = [];

await mkdir(evidence, {recursive: true});
await mkdir(assetRoot, {recursive: true});

const baseEnv = {
  ...process.env,
  NODE_ENV: 'production',
  RENDER_DATA_DIR: dataDir,
  RENDER_OUTPUTS_DIR: join(dataDir, 'outputs'),
  ASSET_ROOT: assetRoot,
  RENDER_ASSET_ROOT: assetRoot,
  CODEVIDEO_PROXY_SECRET: proxySecret,
  CODEVIDEO_WORKER_TOKEN: workerToken,
  CODEVIDEO_DEV_USER: 'local',
  API_HOST: '127.0.0.1',
  API_LOGGER: 'false',
  PORT: String(apiPort),
  WEB_ORIGIN: webUrl,
  WEB_URL: webUrl,
  API_PROXY_TARGET: apiUrl,
  WORKER_API_URL: apiUrl,
  RENDER_MAX_EXECUTION_MS: '180000',
  RENDER_CANCEL_POLL_MS: '500',
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

try {
  const audioPath = join(assetRoot, 'tone.wav');
  const generated = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', audioPath,
  ], {encoding: 'utf8'});
  assert(generated.status === 0, `ffmpeg generated a real WAV tone (stderr: ${generated.stderr.trim()})`);

  start('api', process.execPath, ['apps/api/dist/index.js']);
  const vitePath = join(root, 'apps/web/node_modules/.bin/vite.cmd');
  start('web', vitePath, ['--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: join(root, 'apps/web'),
    env: {...baseEnv, VITE_API_URL: ''},
    shell: true,
  });
  await waitForUrl(`${apiUrl}/api/health`);
  await waitForUrl(webUrl);
  start('worker', process.execPath, ['apps/render-worker/dist/index.js']);

  const audioBase64 = (await readFile(audioPath)).toString('base64');
  const uploadedResponse = await fetch(`${apiUrl}/api/assets`, {
    method: 'POST',
    headers: userHeaders('alice', {'content-type': 'application/json'}),
    body: JSON.stringify({name: 'tone.wav', mimeType: 'audio/wav', dataBase64: audioBase64}),
  });
  assert(uploadedResponse.status === 201, `asset upload returns HTTP 201 (actual: ${uploadedResponse.status})`);
  const asset = await uploadedResponse.json();
  assert(asset.src.startsWith('asset:'), `asset source is ${asset.src}`);

  const assetOwner = await fetch(`${apiUrl}${asset.url}`, {headers: userHeaders('alice')});
  assert(assetOwner.status === 200, 'owner can download the uploaded asset');
  const assetOther = await fetch(`${apiUrl}${asset.url}`, {headers: userHeaders('bob')});
  assert(assetOther.status === 404, 'non-owner receives HTTP 404 for the uploaded asset');

  const project = createDefaultProject('Full feature fixture');
  project.engine = 'python';
  project.settings.width = 640;
  project.settings.height = 360;
  project.settings.fps = 30;
  project.scenes = [{
    ...project.scenes[0],
    id: 'feature-scene',
    name: 'Cairo feature scene',
    duration: 1,
    source: 'text: Structured captions come from project.subtitles',
    camera: {
      from: {x: -60, y: 20, zoom: 1},
      to: {x: 60, y: -10, zoom: 1.25},
      ease: 'easeInOut',
    },
    elements: [{
      id: 'char-1',
      name: 'Teacher',
      type: 'character',
      parentId: null,
      transform: {x: 420, y: 120, scaleX: 0.55, scaleY: 0.55, rotation: 0, opacity: 1},
      visible: true,
      locked: false,
      props: {pack: 'teacher'},
    }],
  }];
  project.timeline = createDefaultTimeline(project.scenes);
  project.assets = [{
    id: asset.id,
    name: asset.name,
    type: 'audio',
    url: asset.url,
    mimeType: asset.mimeType,
    size: asset.size,
    createdAt: new Date().toISOString(),
  }];
  project.audio = [{
    id: 'audio-1',
    name: 'Uploaded tone',
    src: asset.src,
    startTime: 0,
    duration: 1,
    volume: 0.6,
    muted: false,
  }];
  project.subtitles = [
    {id: 'sub-1', start: 0, end: 0.5, text: 'Hello from Cairo'},
    {id: 'sub-2', start: 0.5, end: 1, text: 'Camera, captions, and audio'},
  ];

  await writeFile(join(evidence, 'project.json'), JSON.stringify(project, null, 2));

  const framesDir = join(evidence, 'frames');
  await rm(framesDir, {recursive: true, force: true});
  const frames = await renderProjectToFrames(project, {outputDir: framesDir});
  assert(frames.frames.length === 30, `Python renderer produced ${frames.frames.length} real PNG frames`);
  assert(frames.manifest.packs.teacher, 'manifest records the real teacher pack hash');

  const contactSheet = join(evidence, 'contact-sheet.png');
  const sheet = spawnSync('ffmpeg', [
    '-y', '-framerate', '30', '-i', join(framesDir, 'frame-%06d.png'),
    '-vf', 'select=not(mod(n\\,5)),scale=320:180,tile=3x2',
    '-frames:v', '1', '-update', '1', contactSheet,
  ], {encoding: 'utf8'});
  assert(sheet.status === 0, `ffmpeg built the contact sheet (stderr: ${sheet.stderr.trim()})`);
  assert((await stat(contactSheet)).size > 1000, 'contact sheet PNG has real image data');

  const created = await fetch(`${apiUrl}/api/render`, {
    method: 'POST',
    headers: userHeaders('alice', {'content-type': 'application/json'}),
    body: JSON.stringify({project, format: 'mp4', quality: 'draft'}),
  });
  assert(created.status === 202, `render submission returns HTTP 202 (actual: ${created.status})`);
  const {jobId} = await created.json();

  let job;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const response = await fetch(`${apiUrl}/api/render/${jobId}`, {headers: userHeaders('alice')});
    job = await response.json();
    if (job.status === 'complete' || job.status === 'failed') break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(job?.status === 'complete', `render completes (actual: ${job?.status}, error: ${job?.error ?? ''})`);

  const outputPath = join(dataDir, 'outputs', `${jobId}.mp4`);
  const outputSize = (await stat(outputPath)).size;
  assert(outputSize > 10000, `MP4 exists with ${outputSize} bytes`);
  await copyFile(outputPath, join(evidence, 'full-feature.mp4'));

  const probe = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=index,codec_name,codec_type,width,height,nb_frames:format=duration',
    '-of', 'json',
    join(evidence, 'full-feature.mp4'),
  ], {encoding: 'utf8'});
  assert(probe.status === 0, `ffprobe exits 0 (stderr: ${probe.stderr.trim()})`);
  const metadata = JSON.parse(probe.stdout);
  await writeFile(join(evidence, 'ffprobe.json'), JSON.stringify(metadata, null, 2));
  const video = metadata.streams.find(stream => stream.codec_type === 'video');
  const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
  assert(video?.codec_name === 'h264', `video codec is h264 (actual: ${video?.codec_name})`);
  assert(video?.width === 640 && video?.height === 360, 'video resolution is 640x360');
  assert(audioStream?.codec_name === 'aac', `audio codec is aac (actual: ${audioStream?.codec_name})`);
  assert(Math.abs(Number(metadata.format.duration) - 1) < 0.2, `duration is 1s (actual: ${metadata.format.duration})`);

  console.log('FEATURE_SMOKE_RESULT PASS');
} finally {
  for (const child of children.reverse()) {
    if (!child.killed) child.kill('SIGTERM');
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const child of children) {
    if (!child.killed) child.kill('SIGKILL');
  }
  await rm(dataDir, {recursive: true, force: true});
}
