import {validateAnimationSource} from '@codevideo/animation-engine/validation';
import type {Character, Project, Scene, SubtitleCue} from '@codevideo/project-schema';
import {characterToSource} from '@codevideo/character-engine';
import {getTotalDuration, syncScenesToTimeline} from '@codevideo/timeline-engine';

export interface SceneFrameRange {
  scene: Scene;
  index: number;
  startFrame: number;
  endFrame: number;
  startSeconds: number;
  endSeconds: number;
}

export function getSceneFrameRanges(project: Project): SceneFrameRange[] {
  const fps = project.settings.fps;
  const sorted = [...project.scenes].sort((a, b) => a.order - b.order);
  let seconds = 0;
  return sorted.map((scene, index) => {
    const startSeconds = seconds;
    const endSeconds = seconds + scene.duration;
    seconds = endSeconds;
    return {
      scene,
      index,
      startSeconds,
      endSeconds,
      startFrame: Math.round(startSeconds * fps),
      endFrame: Math.round(endSeconds * fps),
    };
  });
}

export function getSceneAtTime(project: Project, time: number): Scene | undefined {
  return getSceneFrameRanges(project).find(
    range => time >= range.startSeconds && time < range.endSeconds,
  )?.scene;
}

export interface RenderPlan {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  totalSeconds: number;
  scenes: SceneFrameRange[];
}

export function buildRenderPlan(project: Project): RenderPlan {
  const scenes = getSceneFrameRanges(project);
  const fps = project.settings.fps;
  const totalSeconds = getTotalDuration(project.timeline) ||
    scenes.reduce((sum, range) => sum + range.scene.duration, 0);
  return {
    width: project.settings.width,
    height: project.settings.height,
    fps,
    totalFrames: Math.round(totalSeconds * fps),
    totalSeconds,
    scenes,
  };
}

export function syncProject(project: Project): Project {
  return {...project, timeline: syncScenesToTimeline(project.timeline, project.scenes)};
}

export function validateProjectSources(project: Project): string[] {
  const errors: string[] = [];
  for (const scene of project.scenes) {
    const result = validateAnimationSource(scene.source);
    if (!result.ok) {
      errors.push(`${scene.name}: ${result.errors.join('; ')}`);
    }
  }
  return errors;
}

export function createCharacterScene(character: Character, name = character.name): Scene {
  return {
    id: `scene-${character.id}`,
    name,
    order: 0,
    duration: 5,
    source: characterToSource({
      id: character.id,
      name: character.name,
      config: {
        height: 1,
        build: 'average',
        hairStyle: 'short',
        expression: character.expression as
          | 'neutral'
          | 'happy'
          | 'sad'
          | 'surprised'
          | 'angry'
          | 'thinking'
          | 'talking',
        palette: character.palette as never,
      },
      parts: {},
      svg: character.svg,
    }),
    background: '#0b1020',
    transition: 'fade',
    transitionDuration: 0.4,
    elements: [],
  };
}

export function createSubtitleSceneSource(cues: SubtitleCue[]): string {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const steps = sorted
    .map(cue => {
      const duration = Math.max(0.2, cue.end - cue.start);
      const text = JSON.stringify(cue.text);
      return `  yield* subtitle().text(${text});\n  yield* subtitle().opacity(1, 0.15);\n  yield* waitFor(${duration.toFixed(3)});\n  yield* subtitle().opacity(0, 0.15);`;
    })
    .join('\n');

  return `import {Txt} from '@motion-canvas/2d';
import {createRef, waitFor} from '@motion-canvas/core';
import {fadeIn} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('transparent');
  const subtitle = createRef<Txt>();
  view.add(
    new Txt({
      text: '',
      fill: '#f8fafc',
      fontSize: 42,
      fontFamily: 'Inter, Segoe UI, sans-serif',
      y: 380,
      stroke: '#0b1020',
      lineWidth: 8,
      opacity: 0,
      ref: subtitle,
    }),
  );
${steps || '  yield* fadeIn(subtitle(), 0.5);'}
});
`;
}
