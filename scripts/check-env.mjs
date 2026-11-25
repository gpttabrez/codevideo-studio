import {execFileSync} from 'node:child_process';

function has(command, args = ['--version']) {
  try {
    execFileSync(command, args, {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
}

const checks = [
  ['Node.js 22+', has('node') && Number(process.versions.node.split('.')[0]) >= 22],
  ['pnpm 10+', has('pnpm')],
  ['ffmpeg', has('ffmpeg')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'ok  ' : 'MISS'} ${label}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nInstall the missing tools before running CodeVideo Studio.');
  process.exit(1);
}
