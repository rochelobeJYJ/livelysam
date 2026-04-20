#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate the LivelySam launcher icon assets.

The design intentionally stays simple for tiny Windows launcher sizes:
- soft blue-gray rounded square background
- white dashboard window
- pale widget cards inside the window
"""
from __future__ import annotations

from pathlib import Path
import struct
import zlib


ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT_DIR / "assets" / "icons"
BASE_SIZE = 768
ICON_SIZES = [16, 24, 32, 48, 64, 128, 256]


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_color.strip().lstrip("#")
    if len(value) != 6:
        raise ValueError(f"Expected a 6-digit hex color, got: {hex_color}")
    return (
        int(value[0:2], 16),
        int(value[2:4], 16),
        int(value[4:6], 16),
        int(alpha),
    )


def blend_pixel(buffer: bytearray, index: int, src: tuple[int, int, int, int]) -> None:
    src_a = src[3]
    if src_a <= 0:
        return
    if src_a >= 255:
        buffer[index:index + 4] = bytes(src)
        return

    dst_r = buffer[index]
    dst_g = buffer[index + 1]
    dst_b = buffer[index + 2]
    dst_a = buffer[index + 3]

    src_af = src_a / 255.0
    dst_af = dst_a / 255.0
    out_af = src_af + (dst_af * (1.0 - src_af))
    if out_af <= 0:
        buffer[index:index + 4] = b"\x00\x00\x00\x00"
        return

    out_r = int(round(((src[0] * src_af) + (dst_r * dst_af * (1.0 - src_af))) / out_af))
    out_g = int(round(((src[1] * src_af) + (dst_g * dst_af * (1.0 - src_af))) / out_af))
    out_b = int(round(((src[2] * src_af) + (dst_b * dst_af * (1.0 - src_af))) / out_af))
    out_a = int(round(out_af * 255.0))
    buffer[index:index + 4] = bytes((out_r, out_g, out_b, out_a))


def lerp_color(top: tuple[int, int, int, int], bottom: tuple[int, int, int, int], t: float) -> tuple[int, int, int, int]:
    return tuple(
        int(round(top[channel] + ((bottom[channel] - top[channel]) * t)))
        for channel in range(4)
    )


def inside_rounded_rect(px: float, py: float, x1: int, y1: int, x2: int, y2: int, radius: int) -> bool:
    if px < x1 or px >= x2 or py < y1 or py >= y2:
        return False

    inner_left = x1 + radius
    inner_right = x2 - radius
    inner_top = y1 + radius
    inner_bottom = y2 - radius

    dx = 0.0
    dy = 0.0
    if px < inner_left:
        dx = inner_left - px
    elif px > inner_right:
        dx = px - inner_right

    if py < inner_top:
        dy = inner_top - py
    elif py > inner_bottom:
        dy = py - inner_bottom

    return (dx * dx) + (dy * dy) <= (radius * radius)


def draw_rounded_rect(
    buffer: bytearray,
    canvas_size: int,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    radius: int,
    color: tuple[int, int, int, int],
) -> None:
    stride = canvas_size * 4
    for y in range(y1, y2):
        py = y + 0.5
        row_index = y * stride
        for x in range(x1, x2):
            if not inside_rounded_rect(x + 0.5, py, x1, y1, x2, y2, radius):
                continue
            blend_pixel(buffer, row_index + (x * 4), color)


def draw_gradient_rounded_rect(
    buffer: bytearray,
    canvas_size: int,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    radius: int,
    top_color: tuple[int, int, int, int],
    bottom_color: tuple[int, int, int, int],
) -> None:
    height = max(1, y2 - y1)
    stride = canvas_size * 4
    for y in range(y1, y2):
        py = y + 0.5
        tint = lerp_color(top_color, bottom_color, (y - y1) / float(height))
        row_index = y * stride
        for x in range(x1, x2):
            if not inside_rounded_rect(x + 0.5, py, x1, y1, x2, y2, radius):
                continue
            blend_pixel(buffer, row_index + (x * 4), tint)


def downsample_rgba(source: bytearray, source_size: int, target_size: int) -> bytes:
    factor = source_size // target_size
    if factor <= 0 or (source_size % target_size) != 0:
        raise ValueError(f"Cannot downsample {source_size} -> {target_size} with integer blocks.")

    target = bytearray(target_size * target_size * 4)
    source_stride = source_size * 4
    area = factor * factor

    for ty in range(target_size):
        for tx in range(target_size):
            sum_r = 0
            sum_g = 0
            sum_b = 0
            sum_a = 0

            start_y = ty * factor
            start_x = tx * factor
            for oy in range(factor):
                row_index = (start_y + oy) * source_stride
                pixel_index = row_index + (start_x * 4)
                for _ in range(factor):
                    sum_r += source[pixel_index]
                    sum_g += source[pixel_index + 1]
                    sum_b += source[pixel_index + 2]
                    sum_a += source[pixel_index + 3]
                    pixel_index += 4

            out_index = ((ty * target_size) + tx) * 4
            target[out_index] = sum_r // area
            target[out_index + 1] = sum_g // area
            target[out_index + 2] = sum_b // area
            target[out_index + 3] = sum_a // area

    return bytes(target)


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def encode_png(width: int, height: int, rgba_bytes: bytes) -> bytes:
    scanlines = []
    stride = width * 4
    for y in range(height):
        start = y * stride
        scanlines.append(b"\x00" + rgba_bytes[start:start + stride])
    compressed = zlib.compress(b"".join(scanlines), level=9)

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return header + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", compressed) + png_chunk(b"IEND", b"")


def write_png(path: Path, width: int, height: int, rgba_bytes: bytes) -> None:
    path.write_bytes(encode_png(width, height, rgba_bytes))


def write_ico(path: Path, png_images: list[tuple[int, bytes]]) -> None:
    count = len(png_images)
    header = struct.pack("<HHH", 0, 1, count)
    directory = bytearray()
    image_blob = bytearray()
    offset = 6 + (16 * count)

    for size, png_data in png_images:
        width_byte = 0 if size >= 256 else size
        height_byte = 0 if size >= 256 else size
        directory.extend(
            struct.pack(
                "<BBBBHHII",
                width_byte,
                height_byte,
                0,
                0,
                1,
                32,
                len(png_data),
                offset,
            )
        )
        image_blob.extend(png_data)
        offset += len(png_data)

    path.write_bytes(header + directory + image_blob)


def build_icon_canvas() -> bytearray:
    size = BASE_SIZE
    canvas = bytearray(size * size * 4)

    bg_x1, bg_y1, bg_x2, bg_y2, bg_r = 36, 36, size - 36, size - 36, 150
    draw_gradient_rounded_rect(
        canvas,
        size,
        bg_x1,
        bg_y1,
        bg_x2,
        bg_y2,
        bg_r,
        rgba("#F9FCFF"),
        rgba("#D7E6F4"),
    )

    draw_rounded_rect(canvas, size, 48, 48, size - 48, size - 48, 138, rgba("#FFFFFF", 56))

    # Main dashboard panel shadow
    draw_rounded_rect(canvas, size, 158, 182, 630, 590, 92, rgba("#6F8BA4", 38))

    # Dashboard panel border and body
    draw_rounded_rect(canvas, size, 140, 162, 612, 570, 92, rgba("#C8DDF0"))
    draw_rounded_rect(canvas, size, 146, 168, 606, 564, 86, rgba("#FFFFFF"))

    # Header area
    draw_gradient_rounded_rect(canvas, size, 146, 168, 606, 262, 86, rgba("#F3FAFF"), rgba("#E4F2FF"))
    draw_rounded_rect(canvas, size, 182, 208, 202, 228, 10, rgba("#C9E1F6"))
    draw_rounded_rect(canvas, size, 214, 208, 234, 228, 10, rgba("#D8EAF9"))
    draw_rounded_rect(canvas, size, 254, 206, 432, 226, 10, rgba("#D7E8F6"))

    # Sidebar and cards
    draw_gradient_rounded_rect(canvas, size, 180, 286, 280, 518, 32, rgba("#DDF6F0"), rgba("#C8EEDF"))
    draw_gradient_rounded_rect(canvas, size, 304, 286, 570, 386, 34, rgba("#D9ECFF"), rgba("#C4DFFF"))
    draw_gradient_rounded_rect(canvas, size, 304, 414, 570, 518, 34, rgba("#FFE9DA"), rgba("#FFDCC9"))

    # Small internal bars to make the dashboard read better at medium sizes.
    draw_rounded_rect(canvas, size, 198, 314, 252, 330, 8, rgba("#BFE6D6"))
    draw_rounded_rect(canvas, size, 198, 348, 252, 364, 8, rgba("#CBECDD"))
    draw_rounded_rect(canvas, size, 326, 316, 520, 334, 9, rgba("#F8FCFF"))
    draw_rounded_rect(canvas, size, 326, 348, 486, 364, 8, rgba("#EFF7FF"))
    draw_rounded_rect(canvas, size, 326, 444, 526, 462, 9, rgba("#FFF9F4"))
    draw_rounded_rect(canvas, size, 326, 476, 466, 492, 8, rgba("#FFF2E9"))

    return canvas


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    canvas = build_icon_canvas()
    png_images: list[tuple[int, bytes]] = []
    preview_rgba = b""
    preview_size = 256

    for size in ICON_SIZES:
        rgba_bytes = downsample_rgba(canvas, BASE_SIZE, size)
        png_data = encode_png(size, size, rgba_bytes)
        png_images.append((size, png_data))
        if size == preview_size:
            preview_rgba = rgba_bytes

    write_ico(OUTPUT_DIR / "livelysam_launcher.ico", png_images)
    if preview_rgba:
        write_png(OUTPUT_DIR / "livelysam_launcher_256.png", preview_size, preview_size, preview_rgba)


if __name__ == "__main__":
    main()
