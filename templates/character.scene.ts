import {Img, Txt} from '@motion-canvas/2d';
import {all, createRef, waitFor} from '@motion-canvas/core';
import {fadeIn, typeText} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');
  const portrait = createRef<Img>();
  const caption = createRef<Txt>();
  view.add(new Img({src: 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22520%22%3E%3Crect width=%22320%22 height=%22520%22 rx=%2224%22 fill=%22%236d5efc%22/%3E%3C/svg%3E', height: 520, x: -320, opacity: 0, ref: portrait}));
  view.add(new Txt({text: '', fontSize: 34, fill: '#f8fafc', x: 120, width: 520, ref: caption}));
  yield* all(fadeIn(portrait(), 0.5), typeText(caption(), 'Meet your presenter.', 1.2));
  yield* waitFor(1.5);
});
