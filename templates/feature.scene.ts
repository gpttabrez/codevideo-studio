import {Line, Txt} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, waitFor} from '@motion-canvas/core';
import {drawPath, fadeIn} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');
  const heading = createRef<Txt>();
  const path = createRef<Line>();
  view.add(new Txt({text: 'Key benefit', fontSize: 56, fontWeight: 700, fill: '#e2e8f0', y: -240, opacity: 0, ref: heading}));
  view.add(new Line({points: [[-380, 40], [-120, -80], [140, 100], [400, -30]], stroke: '#6d5efc', lineWidth: 5, radius: 10, end: 0, ref: path}));
  yield* fadeIn(heading(), 0.5);
  yield* drawPath(path(), 2.2, easeInOutCubic);
  yield* waitFor(1);
});
