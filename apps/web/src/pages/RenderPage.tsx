import {AnimationPreview} from '@codevideo/animation-engine';
import {ProjectSchema} from '@codevideo/project-schema';
import {useEffect, useRef, useState} from 'react';

declare global {
  interface Window {
    __codevideo_renderReady?: boolean;
    __codevideo_renderFrameCount?: number;
    __codevideo_renderFrame?: (frame: number) => Promise<string>;
    __codevideo_renderError?: string;
    __codevideo_renderProject?: unknown;
  }
}

export function RenderPage({jobId}: {jobId: string}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading render job…');

  useEffect(() => {
    let disposed = false;
    let preview: AnimationPreview | null = null;
    window.__codevideo_renderReady = false;
    window.__codevideo_renderError = undefined;

    const run = async () => {
      try {
        if (!window.__codevideo_renderProject) {
          throw new Error('Render project was not supplied by the render worker.');
        }
        const project = ProjectSchema.parse(window.__codevideo_renderProject);
        if (disposed || !containerRef.current) return;

        preview = new AnimationPreview({
          container: containerRef.current,
          onError: error => {
            window.__codevideo_renderError = error.message;
            setStatus(error.message);
          },
        });
        preview.load(project);
        const frameCount = Math.round(
          project.scenes.reduce((sum, scene) => sum + scene.duration, 0) * project.settings.fps,
        );
        window.__codevideo_renderFrameCount = frameCount;
        window.__codevideo_renderFrame = async (frame: number) => {
          if (!preview) throw new Error('Renderer is not ready.');
          preview.pause();
          return preview.renderFrameToDataUrl(frame);
        };
        window.__codevideo_renderReady = true;
        setStatus(`Ready · ${frameCount} frames`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        window.__codevideo_renderError = message;
        setStatus(message);
      }
    };
    void run();

    return () => {
      disposed = true;
      preview?.dispose();
      window.__codevideo_renderReady = false;
      window.__codevideo_renderFrame = undefined;
    };
  }, [jobId]);

  return (
    <div className="h-screen bg-black text-slate-400">
      <div ref={containerRef} className="h-full w-full" />
      <div className="fixed bottom-2 left-2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-slate-500">
        {status}
      </div>
    </div>
  );
}
