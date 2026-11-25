import {createId, nowIso} from '@codevideo/shared';
import type {
  Character,
  Project,
  ProjectSettings,
  Scene,
  Timeline,
} from './schema.js';
import {projectVersion} from './schema.js';

export const INTRO_SOURCE = `import {Circle, Rect, Txt} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, waitFor} from '@motion-canvas/core';
import {cameraMove, fadeIn} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');

  const card = createRef<Rect>();
  const title = createRef<Txt>();
  const subtitle = createRef<Txt>();
  const orb = createRef<Circle>();

  view.add(
    new Rect({
      width: 820,
      height: 340,
      radius: 28,
      fill: '#151c30',
      stroke: '#334155',
      lineWidth: 2,
      opacity: 0,
      ref: card,
    }),
  );
  view.add(
    new Circle({
      size: 130,
      fill: '#6d5efc',
      x: -500,
      y: -240,
      opacity: 0,
      ref: orb,
    }),
  );
  view.add(
    new Txt({
      text: 'CodeVideo Studio',
      fill: '#f8fafc',
      fontFamily: 'Inter, Segoe UI, sans-serif',
      fontSize: 72,
      fontWeight: 800,
      y: -36,
      opacity: 0,
      ref: title,
    }),
  );
  view.add(
    new Txt({
      text: 'Animate ideas with TypeScript',
      fill: '#94a3b8',
      fontFamily: 'Inter, Segoe UI, sans-serif',
      fontSize: 28,
      y: 64,
      opacity: 0,
      ref: subtitle,
    }),
  );

  yield* all(
    fadeIn(card(), 0.6),
    fadeIn(title(), 0.6, 0.15),
    fadeIn(subtitle(), 0.6, 0.3),
    orb().opacity(1, 0.6),
  );

  yield* cameraMove(
    view,
    {x: 35, y: 15, zoom: 1.06, rotation: -1.5},
    2.4,
    easeInOutCubic,
  );
  yield* all(
    orb().position([520, 250], 1.6, easeInOutCubic),
    title().position([30, -50], 1.6, easeInOutCubic),
  );
  yield* waitFor(0.8);
});
`;

export const FEATURE_SOURCE = `import {Circle, Line, Txt} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, waitFor} from '@motion-canvas/core';
import {fadeIn, cameraMove, drawPath} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');

  const heading = createRef<Txt>();
  const path = createRef<Line>();
  const dot = createRef<Circle>();

  view.add(
    new Txt({
      text: 'Code. Animate. Render.',
      fill: '#e2e8f0',
      fontFamily: 'Inter, Segoe UI, sans-serif',
      fontSize: 56,
      fontWeight: 700,
      y: -240,
      opacity: 0,
      ref: heading,
    }),
  );
  view.add(
    new Line({
      points: [
        [-380, 40],
        [-120, -80],
        [140, 100],
        [400, -30],
      ],
      stroke: '#6d5efc',
      lineWidth: 6,
      radius: 8,
      end: 0,
      ref: path,
    }),
  );
  view.add(
    new Circle({size: 28, fill: '#22d3ee', x: -380, y: 40, ref: dot}),
  );

  yield* fadeIn(heading(), 0.5);
  yield* all(
    drawPath(path(), 1.6, easeInOutCubic),
    dot().position([-120, -80], 0.55, easeInOutCubic),
  );
  yield* all(
    dot().position([140, 100], 0.55, easeInOutCubic),
    cameraMove(view, {x: -20, zoom: 1.04}, 0.55, easeInOutCubic),
  );
  yield* dot().position([400, -30], 0.55, easeInOutCubic);
  yield* waitFor(0.6);
});
`;

export const EMPTY_SOURCE = `import {Txt} from '@motion-canvas/2d';
import {createRef} from '@motion-canvas/core';
import {fadeIn} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');
  const label = createRef<Txt>();
  view.add(
    new Txt({
      text: 'New scene',
      fill: '#e2e8f0',
      fontSize: 48,
      ref: label,
      opacity: 0,
    }),
  );
  yield* fadeIn(label(), 0.5);
});
`;

export function createDefaultSettings(): ProjectSettings {
  return {
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#0b1020',
    resolutionPreset: '1920x1080',
  };
}

export function createDefaultScene(
  name: string,
  order: number,
  source: string,
  duration: number,
): Scene {
  return {
    id: createId('scene'),
    name,
    order,
    duration,
    source,
    background: '#0b1020',
    transition: 'fade',
    transitionDuration: 0.4,
    elements: [],
  };
}

export function createDefaultTimeline(scenes: Scene[]): Timeline {
  let cursor = 0;
  const clips = scenes.map(scene => {
    const clip = {
      id: createId('clip'),
      name: scene.name,
      start: cursor,
      duration: scene.duration,
      color: '#6d5efc',
      refId: scene.id,
    };
    cursor += scene.duration;
    return clip;
  });

  return {
    playhead: 0,
    zoom: 60,
    tracks: [
      {
        id: createId('track'),
        name: 'Scenes',
        kind: 'scene',
        muted: false,
        locked: false,
        visible: true,
        clips,
      },
      {
        id: createId('track'),
        name: 'Characters',
        kind: 'character',
        muted: false,
        locked: false,
        visible: true,
        clips: [],
      },
      {
        id: createId('track'),
        name: 'Audio',
        kind: 'audio',
        muted: false,
        locked: false,
        visible: true,
        clips: [],
      },
      {
        id: createId('track'),
        name: 'Subtitles',
        kind: 'subtitle',
        muted: false,
        locked: false,
        visible: true,
        clips: [],
      },
    ],
  };
}

export function createDefaultProject(name = 'Untitled video'): Project {
  const now = nowIso();
  const scenes = [
    createDefaultScene('Intro', 0, INTRO_SOURCE, 6),
    createDefaultScene('Feature highlight', 1, FEATURE_SOURCE, 5.5),
  ];

  return {
    id: createId('project'),
    name,
    description: '',
    version: projectVersion,
    engine: 'python',
    createdAt: now,
    updatedAt: now,
    settings: createDefaultSettings(),
    scenes,
    characters: [] as Character[],
    assets: [],
    audio: [],
    subtitles: [],
    timeline: createDefaultTimeline(scenes),
    metadata: {
      author: '',
      tags: [],
      thumbnail: '',
    },
  };
}
