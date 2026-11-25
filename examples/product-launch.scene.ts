import {Img, Rect, Txt} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, waitFor} from '@motion-canvas/core';
import {cameraMove, fadeIn} from '@codevideo/animation';

const poster = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" rx="24" fill="#6d5efc"/><text x="300" y="215" text-anchor="middle" font-family="sans-serif" font-size="42" fill="white">LAUNCH</text></svg>`);

export default makeScene2D(function* (view) {
  view.fill('#070b16');
  const frame = createRef<Rect>();
  const image = createRef<Img>();
  const label = createRef<Txt>();

  view.add(new Rect({width: 760, height: 500, radius: 20, fill: '#101728', stroke: '#334155', lineWidth: 2, opacity: 0, ref: frame}));
  view.add(new Img({src: poster, width: 520, radius: 12, opacity: 0, ref: image}));
  view.add(new Txt({text: 'Ship your next idea', fontSize: 28, fill: '#22d3ee', y: 190, opacity: 0, ref: label}));

  yield* all(fadeIn(frame(), 0.5), fadeIn(image(), 0.6, 0.1), fadeIn(label(), 0.5, 0.25));
  yield* cameraMove(view, {y: -10, zoom: 1.04, rotation: 1}, 2, easeInOutCubic);
  yield* waitFor(1.2);
});
