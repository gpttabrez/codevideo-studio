import type {Scene, Timeline, TimelineClip, TimelineTrack} from '@codevideo/project-schema';

export function getTotalDuration(timeline: Timeline): number {
  return timeline.tracks.reduce((max, track) => {
    const trackEnd = track.clips.reduce(
      (end, clip) => Math.max(end, clip.start + clip.duration),
      0,
    );
    return Math.max(max, trackEnd);
  }, 0);
}

export function getTrack(timeline: Timeline, trackId: string): TimelineTrack | undefined {
  return timeline.tracks.find(track => track.id === trackId);
}

export function frameToPixel(frame: number, fps: number, zoom: number): number {
  return (frame / fps) * zoom;
}

export function pixelToFrame(pixel: number, fps: number, zoom: number): number {
  return Math.round((pixel / zoom) * fps);
}

export function getActiveClip(track: TimelineTrack, time: number): TimelineClip | undefined {
  return track.clips.find(
    clip => time >= clip.start && time < clip.start + clip.duration,
  );
}

export function getClipsInRange(
  track: TimelineTrack,
  start: number,
  end: number,
): TimelineClip[] {
  return track.clips.filter(
    clip => clip.start < end && clip.start + clip.duration > start,
  );
}

export function syncScenesToTimeline(timeline: Timeline, scenes: Scene[]): Timeline {
  const sorted = [...scenes].sort((a, b) => a.order - b.order);
  let cursor = 0;
  const clips: TimelineClip[] = sorted.map(scene => {
    const clip: TimelineClip = {
      id: `scene-clip-${scene.id}`,
      name: scene.name,
      start: cursor,
      duration: scene.duration,
      color: '#6d5efc',
      refId: scene.id,
    };
    cursor += scene.duration;
    return clip;
  });

  const hasSceneTrack = timeline.tracks.some(track => track.kind === 'scene');
  const tracks = hasSceneTrack
    ? timeline.tracks.map(track =>
        track.kind === 'scene' ? {...track, clips} : track,
      )
    : [
        {
          id: 'track-scenes',
          name: 'Scenes',
          kind: 'scene' as const,
          muted: false,
          locked: false,
          visible: true,
          clips,
        },
        ...timeline.tracks,
      ];

  return {...timeline, tracks};
}

export function updateClip(
  timeline: Timeline,
  trackId: string,
  clipId: string,
  patch: Partial<Pick<TimelineClip, 'start' | 'duration' | 'name' | 'color'>>,
): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map(track =>
      track.id !== trackId || track.locked
        ? track
        : {
            ...track,
            clips: track.clips.map(clip =>
              clip.id === clipId ? {...clip, ...patch} : clip,
            ),
          },
    ),
  };
}

export function addClip(timeline: Timeline, trackId: string, clip: TimelineClip): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map(track =>
      track.id === trackId ? {...track, clips: [...track.clips, clip]} : track,
    ),
  };
}

export function removeClip(timeline: Timeline, trackId: string, clipId: string): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map(track =>
      track.id === trackId
        ? {...track, clips: track.clips.filter(clip => clip.id !== clipId)}
        : track,
    ),
  };
}

export function splitClip(
  timeline: Timeline,
  trackId: string,
  clipId: string,
  atTime: number,
): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map(track => {
      if (track.id !== trackId) return track;
      const clips: TimelineClip[] = [];
      for (const clip of track.clips) {
        if (clip.id !== clipId || atTime <= clip.start || atTime >= clip.start + clip.duration) {
          clips.push(clip);
          continue;
        }
        clips.push({...clip, duration: atTime - clip.start});
        clips.push({
          ...clip,
          id: `${clip.id}-split-${clips.length}`,
          name: `${clip.name} (2)`,
          start: atTime,
          duration: clip.start + clip.duration - atTime,
        });
      }
      return {...track, clips};
    }),
  };
}

export interface RulerTick {
  time: number;
  label: string;
  pixel: number;
}

export function getRulerTicks(duration: number, zoom: number): RulerTick[] {
  const interval = zoom > 140 ? 1 : zoom > 70 ? 2 : 5;
  const ticks: RulerTick[] = [];
  for (let time = 0; time <= duration; time += interval) {
    ticks.push({time, label: `${time}s`, pixel: time * zoom});
  }
  return ticks;
}
