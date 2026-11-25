import {createDefaultProject} from '@codevideo/project-schema';
import {mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  listPythonPacks,
  renderProjectToFrames,
  validatePythonEnvironment,
  verifyPythonPacks,
} from './index.js';

let outputDir: string;

beforeAll(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'codevideo-python-renderer-'));
});

afterAll(async () => {
  await rm(outputDir, {recursive: true, force: true});
});

describe('python renderer', () => {
  it('detects the real Cairo environment', async () => {
    const result = await validatePythonEnvironment();
    expect(result.ok).toBe(true);
    expect(result.message).toContain('cairo-ok');
  });

  it('exposes real Python pack files and verifies their hashes', async () => {
    const packs = await listPythonPacks();
    expect(packs.map(pack => pack.name)).toEqual(['teacher', 'geometric', 'code-window']);
    const expected = Object.fromEntries(packs.map(pack => [pack.name, pack.sha256]));
    expect(await verifyPythonPacks(expected)).toBe(true);
    expect(await verifyPythonPacks({teacher: 'bad-hash'})).toBe(false);
  });

  it('renders real PNG frames from a project', async () => {
    const project = createDefaultProject('Python renderer test');
    project.scenes = project.scenes.slice(0, 1).map(scene => ({
      ...scene,
      duration: 0.2,
      elements: [{
        id: 'char-1',
        name: 'Teacher',
        type: 'character' as const,
        parentId: null,
        transform: {x: 420, y: 120, scaleX: 0.55, scaleY: 0.55, rotation: 0, opacity: 1},
        visible: true,
        locked: false,
        props: {pack: 'teacher'},
      }],
    }));
    const target = join(outputDir, 'frames');
    const progress: number[] = [];
    const result = await renderProjectToFrames(project, {
      outputDir: target,
      onProgress: value => progress.push(value),
    });
    expect(progress.at(-1)).toBe(1);
    expect(result.manifest.engine).toBe('python-cairo');
    expect(result.frames.length).toBeGreaterThan(0);
    expect((await stat(result.frames[0]!)).size).toBeGreaterThan(1000);
    expect(result.manifest.packs.teacher?.sha256).toMatch(/^[a-f0-9]{64}$/);
  }, 60_000);
});
