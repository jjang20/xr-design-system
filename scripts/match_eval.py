"""Evals for the live Dock and Z-Slider against the Blender lookdev and
Jihoon's review (2026-10-20). Each check is measured from real renders:
scripts/match.mjs --eval draws the beauty frame plus masks (one part, flat
white on black) and the frame with one feature switched off.

Run: node scripts/match.mjs --eval && python3 scripts/match_eval.py
Writes shots/match/eval/report.json and report.md; exits 1 if any check fails.

A check that needs a number from Blender gets it from the lookdev script's
own geometry and camera (lookdev/dock_slider.py), projected exactly, so no
guessing at edges in a path-traced image.
"""
import json, math, os, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

E = Path(os.environ.get('EVAL_DIR', 'shots/match/eval'))   # EVAL_DIR: score an older set of passes
W, H = 1400, 900


def rgb(name):
    return np.asarray(Image.open(E / f'{name}.png').convert('RGB'), dtype=np.float32) / 255


def mask(name, level=None, tol=0.07):
    g = rgb(name).mean(axis=2)
    return g > 0.5 if level is None else np.abs(g - level) < tol


def lum(img):
    lin = np.where(img <= 0.04045, img / 12.92, ((img + 0.055) / 1.055) ** 2.4)
    return lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def dilate(m, r):
    """Square dilation by r px (separable running max)."""
    out = m.copy()
    for axis in (0, 1):
        acc = out.copy()
        for k in range(1, r + 1):
            acc |= np.roll(out, k, axis) | np.roll(out, -k, axis)
        out = acc
    return out


def erode(m, r):
    return ~dilate(~m, r)


# ---------------------------------------------------------------- shape metrics

def bottom_sagitta(m):
    """How far the bottom edge of a mask bows from straight: the largest
    deviation of the edge from the chord through its central 80 percent,
    as a fraction of the mask's width. Positive: the middle sits lower."""
    cols = np.where(m.any(axis=0))[0]
    x0, x1 = cols.min(), cols.max()
    w = x1 - x0
    a, b = int(x0 + 0.1 * w), int(x1 - 0.1 * w)
    xs = np.arange(a, b + 1)
    ys = np.array([np.where(m[:, x])[0].max() for x in xs], dtype=float)
    chord = ys[0] + (ys[-1] - ys[0]) * (xs - a) / max(1, b - a)
    dev = ys - chord
    i = np.argmax(np.abs(dev))
    return float(dev[i] / w), int(w)


def split_columns(m):
    """Masks of separate objects laid out left to right (the Dock's icons),
    split at the empty columns between them."""
    cols = m.any(axis=0)
    out, x = [], 0
    while x < len(cols):
        if cols[x]:
            x0 = x
            while x < len(cols) and cols[x]:
                x += 1
            part = np.zeros_like(m); part[:, x0:x] = m[:, x0:x]
            if part.sum() > 50:
                out.append(part)
        x += 1
    return out


def components(m, min_px=30):
    """Connected pieces of a mask (4-neighbour flood fill), largest first:
    a slanted line of text has letters whose columns overlap, so splitting
    at empty columns would merge them."""
    seen = np.zeros_like(m, dtype=bool)
    out = []
    H_, W_ = m.shape
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]:
            continue
        stack, px = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            px.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < H_ and 0 <= xx < W_ and m[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stack.append((yy, xx))
        if len(px) >= min_px:
            part = np.zeros_like(m, dtype=bool)
            ys, xs = zip(*px)
            part[list(ys), list(xs)] = True
            out.append(part)
    return sorted(out, key=lambda p: -p.sum())


def ellipse_fit(m):
    """IoU of a mask with the ellipse of the same area and second moments,
    and that ellipse's minor/major axis ratio. A sphere seen in perspective
    is an exact ellipse; a rounded square is not."""
    ys, xs = np.nonzero(m)
    cx, cy = xs.mean(), ys.mean()
    cov = np.cov(np.vstack([xs - cx, ys - cy]))
    ev, evec = np.linalg.eigh(cov)
    a, b = 2 * math.sqrt(ev[1]), 2 * math.sqrt(ev[0])
    yy, xx = np.mgrid[0:m.shape[0], 0:m.shape[1]]
    d = np.stack([xx - cx, yy - cy], -1) @ evec
    e = (d[..., 1] / a) ** 2 + (d[..., 0] / b) ** 2 <= 1
    return float((m & e).sum() / (m | e).sum()), float(b / a)


def profile(m, p0, p1, n=120, reach=200):
    """Silhouette width across a mask along the segment p0 -> p1 (px)."""
    p0, p1 = np.array(p0), np.array(p1)
    d = (p1 - p0) / np.linalg.norm(p1 - p0)
    nrm = np.array([-d[1], d[0]])
    out = []
    for t in np.linspace(0, 1, n):
        c = p0 + (p1 - p0) * t
        width = 0
        for sgn in (1, -1):
            k = 0
            while k < reach:
                x, y = (c + nrm * sgn * (k + 1)).round().astype(int)
                if not (0 <= x < m.shape[1] and 0 <= y < m.shape[0]) or not m[y, x]:
                    break
                k += 1
            width += k
        out.append(width + 1 if m[int(round(c[1])), int(round(c[0]))] else 0)
    return np.array(out, dtype=float)


def sharp(img):
    """Pixel-scale detail: the 4-neighbour Laplacian of the grey level."""
    g = img.mean(axis=2)
    return np.abs(4 * g - np.roll(g, 1, 0) - np.roll(g, -1, 0) - np.roll(g, 1, 1) - np.roll(g, -1, 1))


def residual_std(img, region):
    """Spread of a grey image over a region once its best plane (a smooth
    gradient) is taken out: structure, not shading."""
    ys, xs = np.nonzero(region)
    if len(xs) < 50:
        return 0.0
    A = np.stack([np.ones_like(xs), xs, ys], axis=1).astype(np.float64)
    v = img[region].astype(np.float64)
    coef, *_ = np.linalg.lstsq(A, v, rcond=None)
    return float((v - A @ coef).std())


def disc(m, k):
    """The disc of k x a round mask's radius round its centre."""
    ys, xs = np.nonzero(m)
    cy, cx, r = ys.mean(), xs.mean(), math.sqrt(m.sum() / math.pi)
    yy, xx = np.mgrid[0:m.shape[0], 0:m.shape[1]]
    return m & ((yy - cy) ** 2 + (xx - cx) ** 2 <= (k * r) ** 2)


def chroma(px):
    """Median colourfulness of pixels (max - min channel, 0-1)."""
    return float(np.median(px.max(axis=1) - px.min(axis=1)))


def contrast(a, b):
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


# ---------------------------------------------------------------- Blender reference

def blender_shelf_mask():
    """The lookdev shelf (shelf_dock in lookdev/dock_slider.py) projected
    through the lookdev camera: R 0.5 m arc, eye 0.28 m up and 0.48 m back,
    24 degree vertical field, 1400 x 900."""
    R, dist = 0.5, 0.5
    dm = lambda v: v / 1000 * dist
    side, gap, pad = dm(60), dm(18), dm(16)
    L = 5 * side + 4 * gap + 2 * pad
    D, T, lift = side * 1.7, 0.003, dm(10)
    C = np.array([0, -R, 0])
    on_arc = lambda s, t, z: C + np.array([(R + t) * math.sin(s / R), (R + t) * math.cos(s / R), z])
    r = D / 2 * 0.98
    pts = []
    for cx, cy, a0 in ((L / 2 - r, D / 2 - r, 0), (-L / 2 + r, D / 2 - r, 90), (-L / 2 + r, -D / 2 + r, 180), (L / 2 - r, -D / 2 + r, 270)):
        for k in range(17):
            a = math.radians(a0 + 90 * k / 16)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    dense = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int(abs(x1 - x0) / 0.002))
        dense += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n)]
    eye = C + np.array([0, 0.02, 0.28])
    aim = np.array([0, 0, T + lift + side * 0.3])
    f = (aim - eye) / np.linalg.norm(aim - eye)
    right = np.cross(f, [0, 0, 1]); right /= np.linalg.norm(right)
    up = np.cross(right, f)
    focal = H / 2 / math.tan(math.radians(24) / 2)

    def proj(p):
        d = p - eye
        z = d @ f
        return (W / 2 + focal * (d @ right) / z, H / 2 - focal * (d @ up) / z)

    bottom = [proj(on_arc(x, y, 0)) for x, y in dense]
    top = [proj(on_arc(x, y, T)) for x, y in dense]
    im = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(im)
    dr.polygon(bottom, fill=255)
    dr.polygon(top, fill=255)
    for i in range(len(dense)):
        j = (i + 1) % len(dense)
        dr.polygon([bottom[i], bottom[j], top[j], top[i]], fill=255)
    return np.asarray(im) > 127


# ---------------------------------------------------------------- checks

results = []


def check(cid, part, what, value, ok, target, source):
    results.append(dict(id=cid, part=part, what=what, value=value, ok=bool(ok), target=target, source=source))


def changed(a, b, region):
    """Share of a region's pixels that visibly changed (any channel > 6%)."""
    return float(((np.abs(rgb(a) - rgb(b)).max(axis=2) > 0.06) & region).sum() / max(1, region.sum()))


def energy(a, b, region):
    """Mean colour difference between two passes inside a region (0-255)."""
    return float(np.abs(rgb(a) - rgb(b)).mean(axis=2)[region].mean() * 255)


have = lambda n: (E / f'{n}.png').exists()

if have('dock-rest-beauty'):
    shelf = mask('dock-rest-shelf')
    sag, width = bottom_sagitta(shelf)
    ref, _ = bottom_sagitta(blender_shelf_mask())
    check('D1', 'Dock', 'Shelf is visibly curved like the lookdev arc (bottom edge bow / width, live vs Blender)',
          f'{sag:+.3f} vs Blender {ref:+.3f} ({sag / ref:.2f}x)', sag / ref >= 0.8 and sag / ref <= 1.8 and abs(sag) >= 0.015,
          '0.8x to 1.8x of Blender, and at least 1.5% of the width', 'Jihoon: "plate is still straight"; lookdev shelf_dock()')
    for state in ('rest', 'hover'):
        if not have(f'dock-{state}-icons'):
            continue
        each = split_columns(rgb(f'dock-{state}-icons').mean(axis=2) > 0.1)
        fits = [ellipse_fit(m) for m in each]
        iou = min(f[0] for f in fits); ratio = min(f[1] for f in fits)
        if len(each) != 5:
            iou = 0
        check(f'D2{state[0]}', 'Dock', f'Icons are globes: outline is an ellipse ({state})', f'worst IoU {iou:.3f}, axis ratio {ratio:.2f}',
              iou >= 0.975 and ratio >= 0.9, 'IoU with fitted ellipse >= 0.975, axis ratio >= 0.9',
              'Jihoon: "Dock icons should look like literally globe, not rounded square"')
    # Glyph legibility through the globe: the glyph's own pixels, found by
    # switching it off, against the same pixels without it.
    icons = rgb('dock-rest-icons').mean(axis=2) > 0.1
    diff = np.abs(rgb('dock-rest-beauty') - rgb('dock-rest-noglyph')).max(axis=2)
    worst, each = 99, []
    for one in split_columns(icons):
        reg = erode(one, 2)
        g = reg & (diff > 0.25)
        if g.sum() < 20:
            worst = 0; continue
        on, off = lum(rgb('dock-rest-beauty'))[g], lum(rgb('dock-rest-noglyph'))[g]
        each.append(contrast(float(np.median(on)), float(np.median(off))))
        worst = min(worst, each[-1])
    check('D3', 'Dock', 'Glyph inside each globe stays legible (contrast, glyph vs glass behind it)', f'worst {worst:.1f}:1 (' + ', '.join(f'{c:.1f}' for c in each) + ')', worst >= 3,
          '>= 3:1 (WCAG 1.4.11 non-text contrast)', 'accessibility-review skill')
    mirror = mask('dock-rest-mirror') & shelf
    refl = energy('dock-rest-beauty', 'dock-rest-nomirror', mirror) if mirror.any() else 0
    check('D4', 'Dock', 'Icons are visibly mirrored in the shelf (colour change the mirror makes, inside the shelf)', f'{refl:.1f}/255', refl >= 5,
          '>= 5/255 mean (was 14 until round 4; judges 3 and 4 found the mirror competing, so D12 caps it and the glass reflection Jihoon asked for is D5)',
          'lookdev mirror-smooth shelf; judge rounds 3-4')
    glass = (icons | shelf)
    r_now = energy('dock-rest-beauty', 'dock-rest-noreflect', glass)
    r_phys = energy('dock-rest-physical-reflect', 'dock-rest-noreflect', glass)
    check('D5', 'Dock', 'Glass reflections stronger than physical (v4 was physical)', f'{r_now:.1f} vs {r_phys:.1f} ({r_now / max(r_phys, 1e-3):.2f}x)',
          r_phys > 0.5 and r_now >= 1.5 * r_phys, '>= 1.5x', 'Jihoon: "Reflection and distortion value should be larger"')
    d_now = energy('dock-rest-beauty', 'dock-rest-norefract', glass)
    d_phys = energy('dock-rest-physical-refract', 'dock-rest-norefract', glass)
    check('D6', 'Dock', 'Refraction distortion stronger than physical (v4 was physical)', f'{d_now:.1f} vs {d_phys:.1f} ({d_now / max(d_phys, 1e-3):.2f}x)',
          d_phys > 0.5 and d_now >= 1.5 * d_phys, '>= 1.5x', 'Jihoon: "Reflection and distortion value should be larger"')
    dot = mask('dock-rest-dot')
    if dot.any():
        ring = dilate(dot, 14) & ~dilate(dot, 2)
        g = float((lum(rgb('dock-rest-beauty')) - lum(rgb('dock-rest-noglow')))[ring].mean())
    else:
        g = 0
    check('D7', 'Dock', 'Running light glows (light added around the dot by its glow)', f'{g:+.3f}', g >= 0.03,
          '>= +0.03 mean luminance in a 2-14 px ring', 'Jihoon: "Lighting should be glow"')
    # Judge round 2: the mirror images competed with the globes (readable
    # upside-down glyphs). A soft reflection keeps the colour, not the detail.
    if have('dock-rest-flatroom'):
        md = np.abs(lum(rgb('dock-rest-beauty')) - lum(rgb('dock-rest-noglyph')))[mirror]
        on, off = lum(rgb('dock-rest-beauty'))[mirror], lum(rgb('dock-rest-noglyph'))[mirror]
        top = md >= np.percentile(md, 99) if md.size else md
        c = contrast(float(on[top].mean()), float(off[top].mean())) if md.size else 99
        check('D9', 'Dock', 'Mirrored glyphs stay soft: the reflection carries colour, not readable icons', f'{c:.2f}:1 (brightest 1% of glyph pixels)', c <= 1.5,
              '<= 1.5:1', 'Judge round 2: "reflected globes, with readable upside-down icons, compete with the real ones"; lookdev mirror is faint')
        # How much of the room the globes let through: change when the room
        # turns flat grey, inside each globe (glyph left out) over the same
        # change right beside them.
        flat = np.abs(lum(rgb('dock-rest-beauty')) - lum(rgb('dock-rest-flatroom')))
        inner = erode(icons, 4) & ~dilate(diff > 0.1, 3)
        beside = dilate(icons, 30) & ~dilate(icons, 6) & ~dilate(shelf, 2)
        t = float(flat[inner].mean() / max(flat[beside].mean(), 1e-3))
        check('D10', 'Dock', 'Globes are clear glass: the room shows through them', f'{t:.2f} of the room passes', t >= 0.3,
              '>= 0.30 (tinted clear glass; milky glass is lower)', 'Judge round 2: "milky, opaque globes with no refraction"')
    # Judge round 3: hovering pushed the neighbours aside and stretched the
    # shelf. Looking at a target must never move the others (visionOS): the
    # hovered globe grows in place.
    if have('dock-hover-icons'):
        rest_i = split_columns(icons)
        hov_i = split_columns(rgb('dock-hover-icons').mean(axis=2) > 0.1)
        cx = lambda m: float(np.nonzero(m)[1].mean())
        if len(rest_i) == 5 and len(hov_i) == 5:
            move = max(abs(cx(a) - cx(b)) for i, (a, b) in enumerate(zip(rest_i, hov_i)) if i != 2)
        else:
            move = 99.0
        cols = lambda m: np.where(m.any(axis=0))[0]
        sh = mask('dock-hover-shelf')
        stretch = max(abs(int(cols(shelf).min()) - int(cols(sh).min())), abs(int(cols(shelf).max()) - int(cols(sh).max())))
        check('D11', 'Dock', 'Hover grows the globe in place: neighbours and shelf stay put', f'neighbours move {move:.1f} px, shelf ends {stretch} px', move <= 2 and stretch <= 2,
              '<= 2 px each', 'Judge round 3: "hovering pushes the neighbours about 25 px outward and widens the shelf"; lookdev hover keeps them')
        # Hover lights the globe as well as growing it (a sheen on its glass).
        if have('dock-hover-noglyph'):
            gh = np.abs(rgb('dock-hover-beauty') - rgb('dock-hover-noglyph')).max(axis=2) > 0.04
            a_ = erode(rest_i[2], 4) & ~dilate(diff > 0.04, 4)
            b_ = erode(hov_i[2], 4) & ~dilate(gh, 4)
            lift = float(lum(rgb('dock-hover-beauty'))[b_].mean() - lum(rgb('dock-rest-beauty'))[a_].mean())
            ch_r, ch_h = chroma(rgb('dock-rest-beauty')[a_]), chroma(rgb('dock-hover-beauty')[b_])
            check('D20', 'Dock', 'Hover keeps the globe\'s colour (it glows, it does not turn milky)', f'{ch_h / max(ch_r, 1e-3):.2f}x the colour at rest', ch_h >= 0.9 * ch_r,
                  '>= 0.9x', 'Judge round 5: "the green turns milky and loses saturation"')
            check('D14', 'Dock', 'Hover lights the globe, not only scales it', f'{lift:+.3f} mean luminance', lift >= 0.05,
                  '>= +0.05 over the same globe at rest', 'Judge round 3: "there is no highlight, only scale"; round 4: "no rim or brightness cue" at +0.03; apple-design: hover = light, not size alone')
    # Judge round 3: the reflections were a second row of milky half-domes,
    # as big and bright as the globes. A reflection in clear glass is faint
    # and keeps the globe's colour.
    if have('dock-rest-noicons'):
        m_e = energy('dock-rest-beauty', 'dock-rest-nomirror', mirror)
        g_e = energy('dock-rest-beauty', 'dock-rest-noicons', erode(icons, 2))
        dm = rgb('dock-rest-beauty') - rgb('dock-rest-nomirror')
        tint = []
        for one in split_columns(mask('dock-rest-mirror') & shelf)[:4]:   # the four coloured globes
            d = dm[one & (np.abs(dm).max(axis=2) > 0.02)]
            if len(d):
                tint.append(float(np.abs(d.mean(axis=0) - d.mean()).mean() / max(np.abs(d).mean(), 1e-3)))
        t = min(tint) if tint else 0
        check('D12', 'Dock', 'Reflections are faint and coloured, not a second row of globes', f'{m_e / max(g_e, 1e-3):.2f} of the globes\' strength; colour share {t:.2f}',
              m_e <= 0.2 * g_e and t >= 0.15, 'strength <= 0.2 of the globes; colour share (hue in the added light) >= 0.15',
              'Judge round 3: "a second row of milky half-domes, as big and as bright as the globes"; round 4: "almost full size and full saturation ... drop to about 20%"; lookdev mirror is faint')
    # Judge round 3: dirt and ghost icons in every globe. The room seen in
    # the glass should be soft light, not pixel-scale detail: share of
    # pixels where the reflection carries sharp detail (glyph left out).
    refl_d = sharp(np.abs(rgb('dock-rest-beauty') - rgb('dock-rest-noreflect')))
    dirt = [float((refl_d[erode(one, 3) & ~dilate(diff > 0.04, 3)] > 0.04).mean()) for one in split_columns(icons)]
    check('D13', 'Dock', 'Globes are clean: reflections are soft, no fine dirt or ghost icons', 'worst ' + f'{max(dirt):.1%} (' + ', '.join(f'{x:.0%}' for x in dirt) + ')',
          max(dirt) <= 0.05, '<= 5% of each globe has pixel-scale detail in its reflection', 'Judge round 3: "room-reflection artifacts that read as dirt or bugs"')
    # Judge round 4: the globes showed no refracted background, an even
    # body of colour (candy). A ball lens shows the room upside down: light
    # and dark shapes across its middle, beyond the smooth shading.
    # The room's own share: the frame less the same frame with the room
    # turned flat grey, so shading and highlights cancel out.
    ng = lum(rgb('dock-rest-noglyph'))
    room = lum(rgb('dock-rest-beauty')) - lum(rgb('dock-rest-flatroom'))
    struct = []
    for one in split_columns(icons):
        mid = disc(one, 0.75) & ~dilate(diff > 0.04, 3)
        struct.append(residual_std(room, mid))
    check('D15', 'Dock', 'Globes show the room through them (upside down), not an even body of colour',
          'weakest ' + f'{min(struct):.3f} (' + ', '.join(f'{x:.3f}' for x in struct) + ')', min(struct) >= 0.02,
          '>= 0.02 luminance spread across each globe\'s middle after its smooth shading', 'Judge round 4: "the globes read as candy ... no refracted background"')
    # Judge round 4: two or three highlight blobs per globe, one sitting on
    # the glyph and washing it out. One main hotspot, clear of the glyph.
    hot_n, hot_on = [], []
    gl = diff > 0.25
    for one in split_columns(icons):
        spots = components(erode(one, 2) & (ng > 0.8), 4)
        hot_n.append(len(spots))
        hot_on.append(float((spots[0] & dilate(gl, 2)).sum() / spots[0].sum()) if spots else 0.0)
    # Judge round 5: the room's dark door showed as a hard dark band across
    # each globe and read as dirt. The room should read as soft light and
    # shade: the darkest part of a globe's middle stays near its median.
    dark = []
    for one in split_columns(icons):
        mid = disc(one, 0.8) & ~dilate(diff > 0.04, 3)
        v = ng[mid]
        dark.append(float(np.percentile(v, 5) / max(np.median(v), 1e-3)))
    check('D17', 'Dock', 'No dark band inside the globes: the room seen through them is soft light and shade',
          'worst ' + f'{min(dark):.2f} (' + ', '.join(f'{x:.2f}' for x in dark) + ')', min(dark) >= 0.6,
          'darkest 5% of each globe\'s middle >= 0.6x its median light', 'Judge round 5: "the refracted dark room reads as dirt"')
    # Judge round 5: the hotspot sat right above every glyph, touching it.
    # The hotspot is the bright patch round the brightest point inside the
    # globe (the rim's window reflection is left out), at 0.75x its peak.
    gap_ = []
    gy, gx = np.nonzero(gl)
    for one in split_columns(icons):
        d_ = 2 * math.sqrt(one.sum() / math.pi)
        inner = disc(one, 0.8)
        peak = ng[inner].max()
        spot = [c for c in components(inner & (ng >= 0.75 * peak), 1) if (c & inner & (ng == peak)).any()]
        sy, sx = np.nonzero(spot[0] if spot else inner & (ng == peak))
        inside = one[gy, gx]
        dmin = float(np.sqrt((gx[inside][:, None] - sx[None, :]) ** 2 + (gy[inside][:, None] - sy[None, :]) ** 2).min()) if inside.any() else d_
        gap_.append(dmin / d_)
    check('D18', 'Dock', 'The highlight stays clear of the glyph', 'closest ' + f'{min(gap_):.2f} of the globe\'s width (' + ', '.join(f'{x:.2f}' for x in gap_) + ')',
          min(gap_) >= 0.08, '>= 0.08 of the globe\'s width between the hotspot and the glyph', 'Judge round 5: "the same white hotspot directly above every glyph ... touches the top of the ruler"')
    check('D16', 'Dock', 'One main highlight per globe, clear of its glyph',
          f'hotspots per globe {hot_n}; worst share on the glyph {max(hot_on):.0%}', max(hot_n) <= 2 and max(hot_on) <= 0.15,
          '<= 2 hotspots (a key and at most a rim glint); <= 15% of the main one within 2 px of the glyph',
          'Judge round 4: "two or three separate highlight blobs ... a hotspot sits right on the glyph"')
    region = dilate(icons | shelf, 6)
    for state in ('rest', 'hover'):
        if have(f'shown-dock-{state}'):
            c = float(((np.abs(rgb(f'shown-dock-{state}') - np.asarray(Image.open(f'shots/match/live-dock-{state}.png').convert('RGB'), dtype=np.float32) / 255).max(axis=2) > 0.06) & region).sum() / region.sum())
            check(f'D8{state[0]}', 'Dock', f'Change from the version Jihoon last saw is visible ({state})', f'{c:.0%} of the Dock\'s pixels', c >= 0.25,
                  '>= 25% of pixels change by more than 6%', 'Jihoon: "Nothing has changed"')

if have('slider-rest-beauty'):
    geo = json.loads((E / 'slider-rest.json').read_text())
    p0, p1 = geo['axis']
    stem = mask('slider-rest-stem')
    prof = profile(stem, p0, p1)
    # The stem's own width: its waist (the knob's fillet is a long bell, so
    # the middle of the stem is already part of a curve).
    inner = prof[int(len(prof) * 0.1):int(len(prof) * 0.9)]
    core = float(inner[inner > 0].min()) if (inner > 0).any() else 1.0
    ends = (float(prof[:4].max()), float(prof[-4:].max()))
    step = float(np.abs(np.diff(prof[2:-2])).max() / max(core, 1))
    flare = [float((prof[:len(prof) // 2] > 1.15 * core).mean() * 2), float((prof[len(prof) // 2:] > 1.15 * core).mean() * 2)]
    ok = min(ends) >= 1.8 * core and step <= 0.2 and min(flare) >= 0.12
    check('S1', 'Z-Slider', 'Stem joints are curved: the stem flares smoothly into the plate and into the knob',
          f'plate end {ends[0] / core:.1f}x, knob end {ends[1] / core:.1f}x the stem; flare length {flare[0]:.0%} / {flare[1]:.0%}; worst step {step:.2f}',
          ok, 'both ends >= 1.8x the stem, flare over >= 12% of each half, no step > 0.2x the stem', 'Jihoon: "The joints should be curved"')
    knob, plate = mask('slider-rest-knob'), mask('slider-rest-plate')
    glass = knob | plate | stem
    d_now = energy('slider-rest-beauty', 'slider-rest-norefract', knob)
    d_phys = energy('slider-rest-physical-refract', 'slider-rest-norefract', knob)
    check('S2', 'Z-Slider', 'Refraction distortion through the knob stronger than physical (v4 was physical)',
          f'{d_now:.1f} vs {d_phys:.1f} ({d_now / max(d_phys, 1e-3):.2f}x)', d_phys > 0.5 and d_now >= 1.5 * d_phys, '>= 1.5x',
          'Jihoon: "Reflection and distortion value should be larger"')
    r_now = energy('slider-rest-beauty', 'slider-rest-noreflect', glass)
    r_phys = energy('slider-rest-physical-reflect', 'slider-rest-noreflect', glass)
    check('S3', 'Z-Slider', 'Glass reflections stronger than physical (v4 was physical)', f'{r_now:.1f} vs {r_phys:.1f} ({r_now / max(r_phys, 1e-3):.2f}x)',
          r_phys > 0.5 and r_now >= 1.5 * r_phys, '>= 1.5x', 'Jihoon: "Reflection and distortion value should be larger"')
    L, Lng = lum(rgb('slider-rest-beauty')), lum(rgb('slider-rest-noglow'))
    ring = dilate(knob, 30) & ~dilate(knob, 3) & ~plate
    halo = float((L - Lng)[ring].mean()) if ring.any() else 0
    inner = float((L - Lng)[erode(knob | stem, 2)].mean())
    check('S4', 'Z-Slider', 'The lamp glows: light inside the amber glass and a halo around the knob',
          f'inside {inner:+.3f}, halo {halo:+.3f}', inner >= 0.05 and halo >= 0.02, 'inside >= +0.05, halo >= +0.02 mean luminance',
          'Jihoon: "Lighting should be glow"; lookdev knob is lit from within')
    if have('slider-rest-flatroom'):
        flat = np.abs(lum(rgb('slider-rest-beauty')) - lum(rgb('slider-rest-flatroom')))
        face = erode(plate, 4) & ~dilate(knob | stem, 12)
        beside = dilate(plate, 30) & ~dilate(plate, 6) & ~dilate(knob, 40)
        lab = np.abs(rgb('slider-rest-beauty') - rgb('slider-rest-nobubble')).max(axis=2) > 0.02
        beside &= ~dilate(lab, 20)
        t = float(flat[face].mean() / max(flat[beside].mean(), 1e-3))
        check('S7', 'Z-Slider', 'Plate is glass: the room shows through it', f'{t:.2f} of the room passes', t >= 0.45,
              '>= 0.45 (Blender: the face is about 0.6 of the wall\'s light, in the wall\'s hue)', 'Judge round 2: "the plate is an opaque taupe puck"')
        # Judge round 5: the stem read as opaque glossy plastic. Glass lets
        # the room through: the stem's middle changes with the room.
        st = erode(stem & ~dilate(knob, 4), 2) & ~dilate(plate & ~stem, 2)
        ts = float(flat[st].mean() / max(flat[beside].mean(), 1e-3)) if st.any() else 0
        check('S17', 'Z-Slider', 'Stem is amber glass: the room shows through it', f'{ts:.2f} of the room passes', ts >= 0.25,
              '>= 0.25', 'Judge round 5: "the stem is glossy toy plastic"; lookdev stem is translucent amber')
        s8 = changed('slider-rest-beauty', 'slider-rest-nostem', erode(knob, 3))
        check('S8', 'Z-Slider', 'Knob is clear: the stem shows through it', f'{s8:.0%} of the knob changes when the stem is hidden', s8 >= 0.1,
              '>= 10% of the knob (the stem is about a fifth of its width)', 'Judge round 2: "you cannot see the stem through the knob"; lookdev knob shows it')
        L = lum(rgb('slider-rest-beauty'))
        edge = knob & ~erode(knob, 3)
        inside = erode(knob, 3) & ~erode(knob, 9)
        outside = dilate(knob, 5) & ~dilate(knob, 1) & ~dilate(stem, 3)
        dip = min(float(L[inside].mean()), float(L[outside].mean())) - float(L[edge].mean())
        # The halo's own light, in bands outward from the knob: brightest
        # next to it, then falling (a ring further out leaves a dark gap).
        g = L - lum(rgb('slider-rest-noglow'))
        off = dilate(stem | plate, 2)
        bands = [float(g[dilate(knob, b) & ~dilate(knob, a) & ~off].mean()) for a, b in ((1, 6), (6, 16), (16, 30))]
        falls = bands[0] >= bands[1] - 0.01 and bands[1] >= bands[2] - 0.01
        check('S9', 'Z-Slider', 'Knob rim catches light and its glow falls off outward: no dark ring between them',
              f'rim {float(L[edge].mean()):.3f} vs inside {float(L[inside].mean()):.3f} / outside {float(L[outside].mean()):.3f}; glow ' + ' > '.join(f'{b:+.3f}' for b in bands),
              dip <= 0.02 and falls, 'rim no darker than either side; glow bands 1-6, 6-16, 16-30 px non-increasing (0.01 slack)',
              'Judge round 2: "a dark ring sits between the knob and the halo"; lookdev rim light')
    L0 = lum(rgb('slider-rest-nolabel'))
    # The strokes' cores (WCAG measures the text colour, not its anti-aliased edge).
    dl = np.abs(rgb('slider-rest-beauty') - rgb('slider-rest-nolabel')).max(axis=2)
    txt = dl > max(0.25, float(np.percentile(dl[dl > 0.25], 60))) if (dl > 0.25).sum() > 50 else dl > 0.25
    # Every letter, not the median: the room behind the label is uneven.
    # Each letter by itself (the name is lighter than the value, so one
    # threshold over the whole label would keep only the value's strokes).
    each = []
    for g in components(dl > 0.25, 20):
        strokes = g & (dl >= np.percentile(dl[g], 60))
        each.append(contrast(float(np.median(L[strokes])), float(np.median(L0[strokes]))))
    c = min(each) if each else 0
    check('S6', 'Z-Slider', 'Value label is legible over the room, every letter (text vs what is behind it)', f'worst {c:.1f}:1 over {len(each)} letters', c >= 4.5,
          '>= 4.5:1 (WCAG 1.4.3)', 'accessibility-review skill; judge round 2: 3.3:1 at the "L" and "%"; each letter measured on its own strokes (one threshold across the label had skipped the lighter name)')
    if have('slider-rest-nobubble'):
        # What the label adds round its letters: either nothing, or a piece
        # of glass with a defined edge and an even tone, never a soft patch
        # spilling round it.
        back = mask('slider-rest-labelglass') if have('slider-rest-labelglass') else np.zeros_like(dl, dtype=bool)
        shape = back if back.sum() > 200 else dilate(dl > 0.25, 4)
        dL = lum(rgb('slider-rest-beauty')) - lum(rgb('slider-rest-nobubble'))
        spill = float(np.abs(dL)[dilate(shape, 30) & ~dilate(shape, 3)].mean())
        inner = erode(back, 14) & ~dilate(dl > 0.1, 6)   # the face, inside its rounded rim
        # Blotches, not the glass's smooth shading: what is left after the
        # best plane through the tone across the platter.
        if inner.sum() > 200:
            ys, xs = np.nonzero(inner)
            A = np.stack([np.ones_like(xs), xs, ys], axis=1).astype(np.float64)
            coef, *_ = np.linalg.lstsq(A, dL[inner].astype(np.float64), rcond=None)
            blotch = float((dL[inner] - A @ coef).std())
        else:
            blotch = 0.0
        check('S10', 'Z-Slider', 'Label backing is a defined piece of glass, not a soft shade (no spill round it, even tone on it)',
              f'spill {spill:.4f} (3-30 px outside), blotchiness {blotch:.3f}' + ('' if back.sum() > 200 else ' (no backing)'), spill <= 0.01 and blotch <= 0.02,
              'spill <= 0.01; blotchiness (tone left after its smooth gradient) <= 0.02', 'Judge round 2: "a dark smudge sits behind the label and reads as dirt"; text sits on glass (catalog-spec)')
    # Judge round 3: a bright seam and stair-stepped highlights where the
    # stem enters the knob, and along the stem.
    refl_s = sharp(np.abs(rgb('slider-rest-beauty') - rgb('slider-rest-noreflect')))
    gk = np.abs(rgb('slider-rest-beauty') - rgb('slider-rest-noglyph')).max(axis=2) > 0.04
    j_stem = float((refl_s[erode(stem & ~knob, 1)] > 0.04).mean())
    j_knob = float((refl_s[erode(knob, 1) & ~dilate(gk, 3)] > 0.04).mean())
    check('S12', 'Z-Slider', 'Glass edges are clean: no stair-stepped or cross-hatched reflections on the stem and knob',
          f'stem {j_stem:.1%}, knob {j_knob:.1%}', j_stem <= 0.06 and j_knob <= 0.04, 'stem <= 6%, knob <= 4% of pixels with pixel-scale detail in the reflection',
          'Judge round 3: "a striped, jagged highlight runs along the stem"')
    # The knob's joint must curve where you can see it: in the stem left
    # visible beside the knob, it widens before it goes behind the glass.
    vis = profile(stem & ~knob, p0, p1)
    seen = np.nonzero(vis)[0]
    k_end = float(vis[seen[-3:]].max() / max(core, 1)) if len(seen) else 0
    check('S13', 'Z-Slider', 'Knob joint curves in view: the visible stem flares before it enters the knob', f'{k_end:.2f}x the stem at the knob\'s edge',
          k_end >= 1.3, '>= 1.3x the stem', 'Judge round 3: "where the stem meets the knob there is a hard bright vertical seam and no curve"')
    # Judge round 4: the greyed plate read as stone and the greyed label as
    # grey plastic. Lookdev plate: clear glass, the wall seen through it in
    # its own hue. The label: smoked glass, which darkens the room behind it
    # but keeps some of its hue (round 3's warm, thick bar read as brown
    # plastic; round 4's 0.12x as grey plastic).
    if have('slider-rest-labelglass'):
        Sb = rgb('slider-rest-beauty')
        Sg = rgb('slider-rest-noglow')   # the plate's own glass, before the lamp's light falls on it (S15)
        wall = dilate(plate, 40) & ~dilate(plate, 8) & ~dilate(knob, 40) & ~dilate(mask('slider-rest-labelglass'), 20)
        face = erode(plate, 6) & ~dilate(knob | stem, 14)
        lab_face = erode(mask('slider-rest-labelglass'), 8) & ~dilate(dl > 0.05, 4)
        cw, cp, cl = chroma(Sb[wall]), chroma(Sg[face]), chroma(Sb[lab_face]) if lab_face.any() else 1
        lw_, lp = float(np.median(lum(Sb[wall]))), float(np.median(lum(Sg[face])))
        check('S11', 'Z-Slider', 'Plate is clear glass in the room\'s colour; the label is smoked glass, not grey or brown plastic',
              f'plate {cp / cw:.2f}x the wall\'s colour, {lp / max(lw_, 1e-3):.2f}x its light; label {cl / cw:.2f}x the wall\'s colour',
              0.8 * cw <= cp <= 1.25 * cw and lp >= 0.8 * lw_ and 0.35 * cw <= cl <= 0.9 * cw,
              'plate 0.8-1.25x the wall\'s colour and >= 0.8x its light; label 0.35-0.9x the wall\'s colour (its darkness is set by S6)',
              'Judge round 4: "the plate is opaque matte grey ... reads as ceramic"; "grey plastic capsule"; round 3: "chocolate-brown plastic bar"')
        # The plate's rim catches the light round much of its edge, as the
        # lookdev's does (round 4: "only a faint rim on the right").
        ys, xs = np.nonzero(plate)
        cy, cx = ys.mean(), xs.mean()
        band = plate & ~erode(plate, 4) & ~dilate(mask('slider-rest-labelglass') | knob | stem, 6)
        by, bx = np.nonzero(band)
        sect = ((np.arctan2(by - cy, bx - cx) + math.pi) / (2 * math.pi) * 36).astype(int) % 36
        Lb = lum(Sb)[by, bx]
        peaks = [float(Lb[sect == k].max()) for k in range(36) if (sect == k).any()]
        lit = float(np.mean([p_ >= 1.25 * lw_ for p_ in peaks])) if peaks else 0
        check('S14', 'Z-Slider', 'Plate rim catches the light round its edge', f'{lit:.0%} of the rim lit (peak >= 1.25x the wall)', lit >= 0.3,
              '>= 30% of 36 sectors round the rim', 'Judge round 4: "only a faint rim on the right catches light"; lookdev rim')
        # The lamp lights the plate: warm light round the stem's foot.
        pys, pxs = np.nonzero(plate)
        ax, ay = (pxs.max() - pxs.min()) / 2, (pys.max() - pys.min()) / 2
        yy, xx = np.mgrid[0:H, 0:W]
        foot = plate & (((xx - p0[0]) / ax) ** 2 + ((yy - p0[1]) / ay) ** 2 <= 0.38 ** 2) & ~dilate(stem | knob, 3)
        warm = lambda im: im[..., 0] - im[..., 2]
        w_ = float((warm(Sb) - warm(rgb('slider-rest-noglow')))[foot].mean()) if foot.any() else 0
        check('S15', 'Z-Slider', 'The lamp lights the plate: warm light round the stem\'s foot', f'{w_:+.3f} warmth (red minus blue) from the glow', w_ >= 0.03,
              '>= +0.03 inside the first ring', 'Judge round 4: "no amber light falls on the plate, which is lit flat"')

    if have('shown-slider-rest'):
        region = dilate(glass, 6)
        c = float(((np.abs(rgb('shown-slider-rest') - np.asarray(Image.open('shots/match/live-slider-rest.png').convert('RGB'), dtype=np.float32) / 255).max(axis=2) > 0.06) & region).sum() / region.sum())
        check('S5', 'Z-Slider', 'Change from the version Jihoon last saw is visible', f'{c:.0%} of the slider\'s pixels', c >= 0.25,
              '>= 25% of pixels change by more than 6%', 'Jihoon: "Z-slider are totally same to previous one visually"')

(E / 'report.json').write_text(json.dumps(results, indent=1))
lines = ['| | Check | Measured | Target | Why |', '|---|---|---|---|---|']
for r in results:
    lines.append(f"| {'PASS' if r['ok'] else 'FAIL'} {r['id']} | {r['part']}: {r['what']} | {r['value']} | {r['target']} | {r['source']} |")
(E / 'report.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines))
fails = [r['id'] for r in results if not r['ok']]
print(f"\n{len(results) - len(fails)}/{len(results)} pass" + (f"; failing: {', '.join(fails)}" if fails else ''))
sys.exit(1 if fails else 0)
