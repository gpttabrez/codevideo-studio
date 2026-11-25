import {Circle, Rect, Txt} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, waitFor} from '@motion-canvas/core';
import {cameraMove, fadeIn} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');
  const card = createRef<Rect>();
  const title = createRef<Txt>();
  const subtitle = createRef<Txt>();
  const orb = createRef<Circle>();

  view.add(new Rect({width: 820, height: 340, radius: 28, fill: '#151c30', stroke: '#334155', lineWidth: 2, opacity: 0, ref: card}));
  view.add(new Circle({size: 130, fill: '#6d5efc', x: -500, y: -240, opacity: 0, ref: orb}));
  view.add(new Txt({text: 'Your title', fontSize: 72, fontWeight: 800, fill: '#f8fafc', y: -36, opacity: 0, ref: title}));
  view.add(new Txt({text: 'Your subtitle', fontSize: 28, fill: '#94a3b8', y: 64, opacity: 0, ref: subtitle}));

  yield* all(fadeIn(card(), 0.6), fadeIn(title(), 0.6, 0.15), fadeIn(subtitle(), 0.6, 0.3), orb().opacity(1, 0.6));
  yield* cameraMove(view, {x: 35, y: 15, zoom: 1.06, rotation: -1.5}, 2.4, easeInOutCubic);
  yield* waitFor(0.8);
});
