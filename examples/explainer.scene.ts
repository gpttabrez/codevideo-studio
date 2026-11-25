import {Line, Txt} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, waitFor} from '@motion-canvas/core';
import {drawPath, fadeIn, typeText} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');
  const heading = createRef<Txt>();
  const body = createRef<Txt>();
  const path = createRef<Line>();

  view.add(new Txt({text: 'Three steps', fontSize: 58, fontWeight: 700, fill: '#f8fafc', y: -210, opacity: 0, ref: heading}));
  view.add(new Txt({text: '', fontSize: 26, fill: '#94a3b8', y: 150, ref: body}));
  view.add(new Line({points: [[-300, 30], [-100, -40], [120, 60], [320, -20]], stroke: '#6d5efc', lineWidth: 4, radius: 8, end: 0, ref: path}));

  yield* fadeIn(heading(), 0.5);
  yield* all(drawPath(path(), 1.6, easeInOutCubic), typeText(body(), 'Write. Preview. Render.', 1.4));
  yield* waitFor(1);
});
