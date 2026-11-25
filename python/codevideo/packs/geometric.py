import math

import cairo


def render(ctx, progress, element):
    palette = element.get("props", {}).get("palette", {})
    primary = palette.get("primary", "#6d5efc")
    secondary = palette.get("secondary", "#22d3ee")
    ctx.save()
    ctx.rotate(progress * math.tau * 0.25)
    for index in range(6):
        angle = math.tau * index / 6
        radius = 58 + 12 * math.sin(progress * math.pi + index)
        ctx.set_source_rgba(*hex_rgb(primary if index % 2 == 0 else secondary), 0.82)
        ctx.arc(math.cos(angle) * radius, math.sin(angle) * radius, 18, 0, math.tau)
        ctx.fill()
    ctx.set_source_rgba(1, 1, 1, 0.9)
    ctx.set_line_width(3)
    ctx.arc(0, 0, 42 + 10 * progress, 0, math.tau)
    ctx.stroke()
    ctx.restore()


def hex_rgb(value):
    text = str(value).lstrip("#")
    if len(text) != 6:
        return (0.43, 0.37, 0.99)
    return tuple(int(text[i:i + 2], 16) / 255 for i in (0, 2, 4))
