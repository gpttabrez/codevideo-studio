import cairo


def render(ctx, progress, element):
    lines = element.get("props", {}).get("lines", ["const video = create();", "video.render();"])
    width = 260
    height = 150
    ctx.save()
    ctx.set_source_rgba(0.05, 0.07, 0.14, 0.96)
    ctx.rounded_rectangle(-width / 2, -height / 2, width, height, 12)
    ctx.fill()
    ctx.set_source_rgba(0.2, 0.24, 0.34, 0.9)
    ctx.set_line_width(2)
    ctx.rounded_rectangle(-width / 2, -height / 2, width, height, 12)
    ctx.stroke()
    colors = [(0.98, 0.42, 0.52), (0.55, 0.83, 0.28), (0.13, 0.83, 0.93)]
    for index in range(3):
        ctx.set_source_rgba(*colors[index], 0.95)
        ctx.arc(-width / 2 + 16 + index * 16, -height / 2 + 16, 4, 0, 6.283185307179586)
        ctx.fill()
    ctx.select_font_face("Consolas", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(11)
    visible = max(1, int(len(lines) * progress))
    for index, line in enumerate(lines[:visible]):
        ctx.set_source_rgba(0.82, 0.88, 0.98, 0.95)
        ctx.move_to(-width / 2 + 16, -height / 2 + 44 + index * 20)
        ctx.show_text(str(line))
    ctx.restore()
