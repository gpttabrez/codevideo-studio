import math

import cairo


def render(ctx, progress, element):
    palette = element.get("props", {}).get("palette", {})
    body = palette.get("body", "#6d5efc")
    accent = palette.get("accent", "#22d3ee")
    size = 110
    ctx.save()
    ctx.scale(size / 100, size / 100)
    ctx.set_source_rgba(0.04, 0.06, 0.13, 0.9)
    ctx.arc(0, -18, 54, 0, math.tau)
    ctx.fill()
    r, g, b = hex_rgb(body)
    ctx.set_source_rgba(r, g, b, 1)
    ctx.arc(0, -28, 42, 0, math.tau)
    ctx.fill()
    ctx.set_source_rgba(0.04, 0.06, 0.13, 1)
    ctx.arc(-15, -32, 4, 0, math.tau)
    ctx.arc(15, -32, 4, 0, math.tau)
    ctx.fill()
    r, g, b = hex_rgb(accent)
    ctx.set_source_rgba(r, g, b, 0.95)
    ctx.set_line_width(5)
    ctx.arc(0, 18, 34, 0.15 * math.pi, 0.85 * math.pi)
    ctx.stroke()
    ctx.set_source_rgba(r, g, b, 0.35 + 0.4 * progress)
    ctx.arc(0, -28, 52, -0.4 * math.pi, (-0.4 + 1.3 * progress) * math.pi)
    ctx.stroke()
    ctx.restore()


def hex_rgb(value):
    text = str(value).lstrip("#")
    if len(text) != 6:
        return (0.43, 0.37, 0.99)
    return tuple(int(text[i:i + 2], 16) / 255 for i in (0, 2, 4))
