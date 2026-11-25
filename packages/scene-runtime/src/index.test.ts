import {createDefaultProject} from '@codevideo/project-schema';
import {describe, expect, it} from 'vitest';
import {
  buildRenderPlan,
  getSceneAtTime,
  getSceneFrameRanges,
  validateProjectSources,
} from './index.js';

describe('scene runtime', () => {
  it('maps scenes to frame ranges', () => {
    const project = createDefaultProject();
    const ranges = getSceneFrameRanges(project);
    expect(ranges[0]?.startFrame).toBe(0);
    expect(ranges[0]?.endFrame).toBe(180);
    expect(ranges[1]?.startFrame).toBe(180);
    expect(getSceneAtTime(project, 7)?.name).toBe('Feature highlight');
  });

  it('builds a render plan', () => {
    const plan = buildRenderPlan(createDefaultProject());
    expect(plan.fps).toBe(30);
    expect(plan.totalFrames).toBe(345);
  });

  it('validates all project sources', () => {
    const project = createDefaultProject();
    expect(validateProjectSources(project)).toEqual([]);
    project.scenes[0]!.source = "import fs from 'fs';";
    expect(validateProjectSources(project)).toHaveLength(1);
  });
});
