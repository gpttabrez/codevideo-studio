import {createDefaultProject} from '@codevideo/project-schema';
import {describe, expect, it} from 'vitest';
import {
  frameToPixel,
  getActiveClip,
  getRulerTicks,
  getTotalDuration,
  pixelToFrame,
  splitClip,
  syncScenesToTimeline,
  updateClip,
} from './index.js';

describe('timeline engine', () => {
  it('computes total duration and converts frames to pixels', () => {
    const project = createDefaultProject();
    const duration = getTotalDuration(project.timeline);
    expect(duration).toBeCloseTo(11.5);
    expect(frameToPixel(30, 30, 60)).toBe(60);
    expect(pixelToFrame(60, 30, 60)).toBe(30);
  });

  it('finds the active clip at a given time', () => {
    const project = createDefaultProject();
    const sceneTrack = project.timeline.tracks.find(track => track.kind === 'scene');
    expect(sceneTrack).toBeDefined();
    expect(getActiveClip(sceneTrack!, 1)?.name).toBe('Intro');
    expect(getActiveClip(sceneTrack!, 7)?.name).toBe('Feature highlight');
  });

  it('synchronizes scene edits back into the timeline', () => {
    const project = createDefaultProject();
    const scenes = project.scenes.map(scene => ({...scene, duration: 4}));
    const timeline = syncScenesToTimeline(project.timeline, scenes);
    expect(getTotalDuration(timeline)).toBe(8);
  });

  it('updates and splits clips', () => {
    const project = createDefaultProject();
    const track = project.timeline.tracks.find(track => track.kind === 'scene')!;
    const clip = track.clips[0]!;
    const moved = updateClip(project.timeline, track.id, clip.id, {start: 2});
    expect(moved.tracks[0]?.clips[0]?.start).toBe(2);
    const split = splitClip(project.timeline, track.id, clip.id, 2);
    expect(split.tracks[0]?.clips).toHaveLength(3);
  });

  it('builds ruler ticks', () => {
    expect(getRulerTicks(10, 100).map(tick => tick.label)).toEqual([
      '0s',
      '2s',
      '4s',
      '6s',
      '8s',
      '10s',
    ]);
  });
});
