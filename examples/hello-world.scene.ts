import {Circle, Rect, Txt} from '@motion-canvas/2d';
import {all, createRef, easeOutCubic, waitFor} from '@motion-canvas/core';
import {fadeIn, slideIn} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');

  const card = createRef<Rect>();
  const title = createRef<Txt>();
  const badge = createRef<Circle>();

  view.add(new Rect({width: 760, height: 300, radius: 24, fill: '#151c30', stroke: '#334155', lineWidth: 2, opacity: 0, ref: card}));
  view.add(new Txt({text: 'Hello from CodeVideo', fontSize: 52, fontWeight: 700, fill: '#f8fafc', opacity: 0, ref: title}));
  view.add(new Circle({size: 28, fill: '#22d3ee', x: 330, y: -110, ref: badge}));

  yield* all(
    fadeIn(card(), 0.5),
    slideIn(title(), [0, 40], 0.6, easeOutCubic),
  );
  yield* waitFor(2);
});
