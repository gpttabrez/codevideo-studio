import {chromium} from '../apps/render-worker/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = join(root, 'artifacts', 'e2e');
const apiPort = 45000 + Math.floor(Math.random() * 1000);
const webPort = apiPort + 1;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const childProcesses = [];
const results = [];

await mkdir(evidence, {recursive: true});

const env = {
  ...process.env,
  NODE_ENV: 'production',
  RENDER_DATA_DIR: join(evidence, 'ui-data'),
  RENDER_OUTPUTS_DIR: join(evidence, 'ui-data', 'outputs'),
  ASSET_ROOT: join(evidence, 'ui-data', 'assets'),
  RENDER_ASSET_ROOT: join(evidence, 'ui-data', 'assets'),
  CODEVIDEO_PROXY_SECRET: 'ui-proxy-secret',
  CODEVIDEO_WORKER_TOKEN: 'ui-worker-token',
  CODEVIDEO_DEV_USER: 'local',
  API_HOST: '127.0.0.1',
  API_LOGGER: 'false',
  PORT: String(apiPort),
  WEB_ORIGIN: webUrl,
  WEB_URL: webUrl,
  API_PROXY_TARGET: apiUrl,
  WORKER_API_URL: apiUrl,
};

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? env,
    shell: Boolean(options.shell),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`));
  childProcesses.push(child);
  return child;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  results.push(message);
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

try {
  start('api', process.execPath, ['apps/api/dist/index.js']);
  start('web', join(root, 'apps/web/node_modules/.bin/vite.cmd'), ['--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: join(root, 'apps/web'),
    env: {...env, VITE_API_URL: ''},
    shell: true,
  });
  await waitForUrl(`${apiUrl}/api/health`);
  await waitForUrl(webUrl);

  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});

  await page.goto(webUrl, {waitUntil: 'networkidle'});
  await page.getByText('New project').waitFor({timeout: 30000});
  await page.screenshot({path: join(evidence, 'dashboard.png'), fullPage: true});
  assert(true, 'dashboard screenshot captured');

  await page.getByRole('button', {name: 'New project'}).click();
  await page.getByLabel('Project name').fill('Full feature UI project');
  await page.getByRole('button', {name: 'Create', exact: true}).click();
  await page.getByText('Full feature UI project').waitFor({timeout: 30000});
  await page.getByText('Full feature UI project').click();
  await page.waitForURL(/#\/editor\//, {timeout: 30000});
  await page.locator('[data-testid="editor"]').waitFor({timeout: 30000});
  await page.screenshot({path: join(evidence, 'editor.png'), fullPage: true});
  assert(true, 'editor screenshot captured');

  await page.getByRole('button', {name: 'AI Agent'}).click();
  await page.waitForURL(/#\/agent\//, {timeout: 30000});
  await page.locator('[data-testid="agent-studio"]').waitFor({timeout: 30000});
  const blockerVisible = await page.locator('[data-testid="model-blocker"]').isVisible();
  const hasAgentPanel = await page.locator('[data-testid="agent-panel"]').isVisible();
  const hasUploadControls = await page.locator('[data-testid="upload-controls"]').isVisible();
  assert(hasAgentPanel, 'agent panel is visible in the running UI');
  assert(hasUploadControls, 'upload controls are visible in the running UI');
  assert(blockerVisible, 'model blocker is visible because no real provider is configured');
  await page.screenshot({path: join(evidence, 'agent.png'), fullPage: true});
  assert(true, 'agent screenshot captured');

  await page.goto(pathToFileURL(join(evidence, 'contact-sheet.png')).href, {waitUntil: 'load'});
  await page.screenshot({path: join(evidence, 'contact-sheet-viewer.png'), fullPage: true});
  assert(true, 'contact sheet viewer screenshot captured');

  await writeFile(join(evidence, 'ui-results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('UI_SCREENSHOTS_RESULT PASS');
} finally {
  for (const child of childProcesses.reverse()) {
    if (!child.killed) child.kill('SIGTERM');
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const child of childProcesses) {
    if (!child.killed) child.kill('SIGKILL');
  }
}
