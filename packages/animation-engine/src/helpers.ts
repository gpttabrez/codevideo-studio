import {all, tween, waitFor} from '@motion-canvas/core';
import type {ThreadGenerator, TimingFunction} from '@motion-canvas/core';
import type {Line, Node, View2D} from '@motion-canvas/2d';
import {lerp} from '@codevideo/shared';

export interface CameraTarget {
  x?: number;
  y?: number;
  zoom?: number;
  rotation?: number;
}

export function* fadeIn(
  node: Node,
  seconds = 0.5,
  delaySeconds = 0,
): ThreadGenerator {
  if (delaySeconds > 0) yield* waitFor(delaySeconds);
  node.opacity(0);
  yield* node.opacity(1, seconds);
}

export function* fadeOut(node: Node, seconds = 0.5): ThreadGenerator {
  yield* node.opacity(0, seconds);
}

export function* slideIn(
  node: Node,
  offset: {x?: number; y?: number},
  seconds = 0.7,
  timing: TimingFunction = value => value,
): ThreadGenerator {
  const targetX = node.position.x();
  const targetY = node.position.y();
  const startOpacity = node.opacity();
  node.position(targetX + (offset.x ?? 0), targetY + (offset.y ?? 0));
  node.opacity(0);
  yield* all(
    node.position([targetX, targetY], seconds, timing),
    node.opacity(startOpacity || 1, seconds, timing),
  );
}

export function* cameraMove(
  view: View2D,
  target: CameraTarget,
  seconds = 1,
  timing: TimingFunction = value => value,
): ThreadGenerator {
  const startX = view.position.x();
  const startY = view.position.y();
  const startZoom = view.scale.x();
  const startRotation = view.rotation();

  yield* tween(seconds, progress => {
    const t = timing(progress);
    view.position(
      lerp(startX, target.x ?? startX, t),
      lerp(startY, target.y ?? startY, t),
    );
    view.scale(lerp(startZoom, target.zoom ?? startZoom, t));
    view.rotation(lerp(startRotation, target.rotation ?? startRotation, t));
  });
}

export function* drawPath(
  line: Line,
  seconds = 1,
  timing: TimingFunction = value => value,
): ThreadGenerator {
  const finalEnd = line.end();
  line.end(0);
  yield* tween(seconds, progress => {
    line.end(lerp(0, finalEnd, timing(progress)));
  });
}

export function* pulse(
  node: Node,
  scale = 1.12,
  seconds = 0.4,
): ThreadGenerator {
  const base = node.scale.x();
  yield* node.scale(scale, seconds / 2);
  yield* node.scale(base, seconds / 2);
}

export function* typeText(
  textNode: Node & {text: (value: string) => void},
  value: string,
  seconds = 1,
): ThreadGenerator {
  textNode.text('');
  const charactersPerSecond = Math.max(1, value.length / Math.max(0.01, seconds));
  let shown = 0;
  yield* tween(seconds, (_progress, time) => {
    const next = Math.min(value.length, Math.floor(time * charactersPerSecond));
    if (next !== shown) {
      shown = next;
      textNode.text(value.slice(0, shown));
    }
  });
  textNode.text(value);
}
