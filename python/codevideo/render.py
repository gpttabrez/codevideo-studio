import argparse
import hashlib
import importlib.util
import json
import math
import re
import sys
from pathlib import Path

import cairo

ROOT = Path(__file__).resolve().parent
PACKS_DIR = ROOT / "packs"


def rgba(value, fallback=(1.0, 1.0, 1.0, 1.0)):
    text = str(value or "").strip()
    if not text.startswith("#"):
        return fallback
    text = text[1:]
    if len(text) == 6:
        text += "ff"
    if len(text) != 8:
        return fallback
    try:
        return tuple(int(text[i:i + 2], 16) / 255 for i in (0, 2, 4, 6))
    except ValueError:
        return fallback


def set_source(ctx, color, fallback=(1.0, 1.0, 1.0, 1.0)):
    ctx.set_source_rgba(*rgba(color, fallback))


def set_font(ctx, size, weight=400):
    family = "Segoe UI" if sys.platform.startswith("win") else "DejaVu Sans"
    weight_name = "bold" if weight >= 600 else "normal"
    ctx.select_font_face(family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD if weight >= 600 else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size)
    return weight_name


def draw_text(ctx, text, x, y, size, color, weight=400, max_width=None):
    set_font(ctx, size, weight)
    set_source(ctx, color)
    lines = wrap_text(ctx, text, max_width) if max_width else [text]
    line_height = size * 1.25
    for index, line in enumerate(lines):
        ctx.move_to(x, y + index * line_height)
        ctx.show_text(line)


def wrap_text(ctx, text, max_width):
    words = str(text).split()
    if not words:
        return [""]
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if ctx.text_extents(candidate).width <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def scene_text(scene):
    found = re.findall(r"text:\s*['\"]([^'\"]+)['\"]", scene.get("source", ""))
    if not found:
        found = [scene.get("name", "Scene")]
    return found[:4]


def ease_progress(value, mode):
    if mode == "easeInOut":
        return value * value * (3 - 2 * value)
    return value


def camera_state(scene, progress):
    camera = scene.get("camera")
    if not isinstance(camera, dict):
        return 0.0, 0.0, 1.0
    source = camera.get("from") if isinstance(camera.get("from"), dict) else {}
    target = camera.get("to") if isinstance(camera.get("to"), dict) else source
    amount = ease_progress(progress, camera.get("ease", "linear"))
    def lerp(name, fallback):
        return float(source.get(name, fallback)) * (1 - amount) + float(target.get(name, source.get(name, fallback))) * amount
    return lerp("x", 0.0), lerp("y", 0.0), lerp("zoom", 1.0)


def active_captions(project, time_seconds):
    result = []
    for cue in project.get("subtitles", []):
        if not isinstance(cue, dict):
            continue
        start = float(cue.get("start", 0))
        end = float(cue.get("end", start))
        if start <= time_seconds <= end and str(cue.get("text", "")).strip():
            result.append(str(cue["text"]))
    return result


def draw_caption(ctx, width, height, text):
    size = max(18, height * 0.045)
    set_font(ctx, size, 600)
    extents = ctx.text_extents(text)
    box_width = min(width * 0.88, extents.width + width * 0.08)
    box_height = size * 1.9
    x = (width - box_width) / 2
    y = height - box_height - height * 0.07
    ctx.save()
    ctx.set_source_rgba(0.02, 0.03, 0.08, 0.78)
    ctx.rectangle(x, y, box_width, box_height)
    ctx.fill()
    ctx.set_source_rgba(0.42, 0.83, 0.93, 1.0)
    ctx.set_line_width(max(1, height * 0.003))
    ctx.rectangle(x, y, box_width, box_height)
    ctx.stroke()
    draw_text(ctx, text, x + width * 0.04, y + size * 1.25, size, "#f8fafc", 600, box_width - width * 0.08)
    ctx.restore()


def draw_background(ctx, width, height, color, index, progress):
    set_source(ctx, color, (0.04, 0.06, 0.13, 1.0))
    ctx.paint()
    radius = max(width, height) * 0.55
    ctx.save()
    ctx.translate(width * (0.2 + 0.6 * index % 1), height * 0.2)
    gradient = cairo.RadialGradient(0, 0, 0, 0, 0, radius)
    gradient.add_color_stop_rgba(0, 0.42, 0.36, 0.99, 0.22)
    gradient.add_color_stop_rgba(1, 0.42, 0.36, 0.99, 0)
    ctx.set_source(gradient)
    ctx.arc(0, 0, radius, 0, math.tau)
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.translate(width * 0.78, height * (0.72 - 0.1 * progress))
    ctx.set_source_rgba(0.13, 0.83, 0.93, 0.16)
    ctx.arc(0, 0, min(width, height) * 0.24, 0, math.tau)
    ctx.fill()
    ctx.restore()


def draw_scene(ctx, project, scene, scene_index, progress, time_seconds):
    width = project["settings"]["width"]
    height = project["settings"]["height"]
    camera_x, camera_y, zoom = camera_state(scene, progress)
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.scale(zoom, zoom)
    ctx.translate(-width / 2 - camera_x, -height / 2 - camera_y)
    draw_background(ctx, width, height, scene.get("background") or project["settings"].get("background"), scene_index, progress)
    draw_grid(ctx, width, height)
    texts = scene_text(scene)
    title = texts[0]
    ctx.save()
    ctx.set_source_rgba(0.98, 0.99, 1.0, 0.96)
    ctx.set_line_width(max(2, width * 0.0015))
    ctx.move_to(width * 0.08, height * 0.18)
    ctx.line_to(width * 0.08 + width * 0.16 * min(1.0, progress * 2.5), height * 0.18)
    ctx.stroke()
    draw_text(ctx, title, width * 0.08, height * 0.28, height * 0.075, "#f8fafc", 700, width * 0.78)
    for offset, line in enumerate(texts[1:]):
        draw_text(ctx, line, width * 0.08, height * (0.43 + offset * 0.07), height * 0.032, "#94a3b8", 400, width * 0.72)
    ctx.restore()
    draw_elements(ctx, project, scene, progress)
    ctx.restore()
    captions = active_captions(project, time_seconds)
    if captions:
        draw_caption(ctx, width, height, captions[-1])


def draw_grid(ctx, width, height):
    ctx.save()
    ctx.set_source_rgba(0.55, 0.62, 0.75, 0.08)
    ctx.set_line_width(1)
    spacing = max(48, width // 24)
    for x in range(0, width + 1, spacing):
        ctx.move_to(x, 0)
        ctx.line_to(x, height)
        ctx.stroke()
    for y in range(0, height + 1, spacing):
        ctx.move_to(0, y)
        ctx.line_to(width, y)
        ctx.stroke()
    ctx.restore()


def draw_elements(ctx, project, scene, progress):
    width = project["settings"]["width"]
    height = project["settings"]["height"]
    for element in scene.get("elements", []):
        if not element.get("visible", True):
            continue
        transform = element.get("transform", {})
        x = width / 2 + float(transform.get("x", 0)) * width / 1920
        y = height / 2 + float(transform.get("y", 0)) * height / 1080
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(float(transform.get("rotation", 0)) * math.pi / 180)
        ctx.scale(float(transform.get("scaleX", 1)), float(transform.get("scaleY", 1)))
        ctx.set_source_rgba(1, 1, 1, float(transform.get("opacity", 1)))
        pack_name = element.get("props", {}).get("pack")
        pack = load_pack(pack_name) if pack_name else None
        if pack and hasattr(pack, "render"):
            pack.render(ctx, progress, element)
        else:
            ctx.set_source_rgba(0.43, 0.37, 0.99, 0.85)
            ctx.arc(0, 0, min(width, height) * 0.09, 0, math.tau)
            ctx.fill()
        ctx.restore()


def load_pack(name):
    from packs.registry import PACKS
    info = PACKS.get(name)
    if not info:
        return None
    path = PACKS_DIR / info["file"]
    spec = importlib.util.spec_from_file_location(f"codevideo_pack_{name}", path)
    if not spec or not spec.loader:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--scenes", default="")
    parser.add_argument("--max-frames", type=int, default=0)
    args = parser.parse_args()
    project = json.loads(Path(args.project).read_text(encoding="utf-8"))
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    scenes = sorted(project.get("scenes", []), key=lambda item: item.get("order", 0))
    if args.scenes:
        wanted = set(args.scenes.split(","))
        scenes = [scene for scene in scenes if scene.get("id") in wanted]
    fps = int(project["settings"]["fps"])
    width = int(project["settings"]["width"])
    height = int(project["settings"]["height"])
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
    ctx = cairo.Context(surface)
    total_frames = 0
    rendered_scenes = []
    scene_frames = [max(1, int(round(float(scene.get("duration", 1)) * fps))) for scene in scenes]
    planned_frames = sum(scene_frames)
    if args.max_frames:
        planned_frames = min(planned_frames, args.max_frames)
    scene_start_frames = 0
    for scene_index, scene in enumerate(scenes):
        current_frames = scene_frames[scene_index]
        rendered_scenes.append({"id": scene.get("id"), "frames": current_frames})
        for frame_index in range(current_frames):
            if args.max_frames and total_frames >= args.max_frames:
                break
            progress = (frame_index + 1) / current_frames
            time_seconds = (scene_start_frames + frame_index + 1) / fps
            ctx.save()
            draw_scene(ctx, project, scene, scene_index, progress, time_seconds)
            ctx.restore()
            surface.write_to_png(str(output / f"frame-{total_frames:06d}.png"))
            total_frames += 1
            print(f"PROGRESS {total_frames} {planned_frames}", flush=True)
        scene_start_frames += current_frames
        if args.max_frames and total_frames >= args.max_frames:
            break
    manifest = {
        "engine": "python-cairo",
        "width": width,
        "height": height,
        "fps": fps,
        "frameCount": total_frames,
        "scenes": rendered_scenes,
        "packs": load_pack_manifest(),
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def load_pack_manifest():
    from packs.registry import PACKS
    result = {}
    for name, info in PACKS.items():
        result[name] = {"file": info["file"], "sha256": file_hash(PACKS_DIR / info["file"])}
    return result


if __name__ == "__main__":
    main()
