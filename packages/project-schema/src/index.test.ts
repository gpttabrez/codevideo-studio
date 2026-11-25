import {describe, expect, it} from 'vitest';
import {
  createDefaultProject,
  createDefaultScene,
  deserializeProject,
  EMPTY_SOURCE,
  parseProject,
  serializeProject,
} from './index.js';

describe('project schema', () => {
  it('creates a valid default project with sample scenes', () => {
    const project = createDefaultProject('Demo');
    expect(() => parseProject(project)).not.toThrow();
    expect(project.scenes.length).toBeGreaterThan(0);
    expect(project.scenes[0]?.source).toContain('makeScene2D');
  });

  it('round-trips through JSON without losing animation source', () => {
    const project = createDefaultProject('Round trip');
    const restored = deserializeProject(serializeProject(project));
    expect(restored.scenes.map(scene => scene.source)).toEqual(
      project.scenes.map(scene => scene.source),
    );
    expect(restored.settings.fps).toBe(30);
  });

  it('rejects malformed projects', () => {
    expect(() => parseProject({id: 'p'})).toThrow();
  });

  it('creates a blank scene with runnable source', () => {
    const scene = createDefaultScene('Blank', 2, EMPTY_SOURCE, 4);
    expect(scene.duration).toBe(4);
    expect(scene.source).toContain('fadeIn');
  });
});
