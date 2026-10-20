# Path-traced lookdev for the Dock and the Z-Slider, in the glass and bubble
# language the Catalog settled on (docs/components.md). Renders design
# options side by side so one can be picked before the live components are
# matched to it.
#
#   python3 lookdev/dock_slider.py --part dock --option inlay --state hover --out shots/x.png
#
# Reuses catalog.py's scene, materials and helpers (everything above its
# "the Catalog" section), so the room, glass and type match exactly.
import argparse, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--part', default='dock', choices=['dock', 'slider'])
ap.add_argument('--option', default='bead')  # dock: bead | inlay | layered | shelf; slider: stem | column | membrane
ap.add_argument('--state', default='rest', choices=['rest', 'hover', 'press'])
ap.add_argument('--value', type=float, default=0.4)  # slider value, 0 pulled out .. 1 pushed in
ap.add_argument('--samples', type=int, default=64)
ap.add_argument('--res', default='1400x900')
ap.add_argument('--out', default=os.path.join(HERE, 'shots', 'dock.png'))
own = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

# Run catalog.py's shared part with matching settings.
sys.argv = ['catalog.py', '--samples', str(own.samples), '--res', own.res, '--bubble', '6,4,0.06', '--clear', '0.25', '--hover', 'bubble']
src = open(os.path.join(HERE, 'catalog.py')).read()
exec(src[:src.index('# ---------------------------------------------------------------- the Catalog')])

import bmesh
from mathutils import Vector

GROOVE = 0.0
APPS = [('house', (0.18, 0.49, 0.96)), ('ruler', (0.88, 0.54, 0.12)), ('scan', (0.14, 0.64, 0.43)),
        ('image', (0.85, 0.27, 0.37)), ('settings', None)]
NEUTRAL = (0.62, 0.62, 0.65)  # Settings' patch in the inlay dock: a grey glass, not a hole
HOVER = 2  # Scan


def lin(c):  # sRGB to linear
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def tinted(name, rgb, rough=0.12, absorb=4, coat=1.0, gloss_attr=False):
    """Coloured glass: the room shows through it in this colour."""
    m, p = principled(name, **{'Base Color': (*rgb, 1), 'Transmission Weight': 1.0, 'Roughness': rough,
                               'IOR': 1.45, 'Coat Weight': coat, 'Coat Roughness': 0.03, 'Coat IOR': 1.5})
    if absorb:
        nodes, links = m.node_tree.nodes, m.node_tree.links
        vol = nodes.new('ShaderNodeVolumeAbsorption'); vol.inputs['Color'].default_value = (*rgb, 1)
        vol.inputs['Density'].default_value = absorb
        links.new(vol.outputs['Volume'], nodes['Material Output'].inputs['Volume'])
    return m


def field_glass(name, base_tint, rough):
    """Window glass whose colour and gloss come from mesh attributes:
    'tint' (colour per point) and 'gloss' (1 on a bubble's crown)."""
    m = glass(name, base_tint, rough, args.absorb, coat=0.6)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    p = nodes['Principled BSDF']
    ca = nodes.new('ShaderNodeAttribute'); ca.attribute_name = 'tint'
    links.new(ca.outputs['Color'], p.inputs['Base Color'])
    # Inside a colour patch the glass is milkier ('patch' 1): fully clear
    # tinted glass lets a warm room mute a blue patch to slate.
    pa = nodes.new('ShaderNodeAttribute'); pa.attribute_name = 'patch'
    mr = nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 1.0; mr.inputs['To Max'].default_value = 0.55
    links.new(pa.outputs['Fac'], mr.inputs['Value']); links.new(mr.outputs['Result'], p.inputs['Transmission Weight'])
    return m


def surface(ob, bubbles, step=0.0008):
    """Splits the slab's front face finely, then shapes it: each bubble is
    (cx, cy, radius, height, rgb or None, dent) -- a round pillow eased in by
    a meniscus, tinted inside when rgb is given. Writes 'gloss' and 'tint'."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear(); old = ob.data; ob.data = me; bpy.data.meshes.remove(old)
    t = max(v.co.z for v in me.vertices)
    bm = bmesh.new(); bm.from_mesh(me)
    front = lambda: [f for f in bm.faces if f.normal.z > 0.999 and min(v.co.z for v in f.verts) > t - 1e-6]
    xs = [v.co.x for f in front() for v in f.verts]; ys = [v.co.y for f in front() for v in f.verts]
    def cut(co, no):
        fs = front(); es = list({e for f in fs for e in f.edges}); vs = list({v for f in fs for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=fs + es + vs, plane_co=co, plane_no=no)
    # Grid offset by half a step, so no cut lands on the slab's centre line
    # (it left a seam there).
    x = min(xs) + step / 2
    while x <= max(xs): cut((x, 0, 0), (1, 0, 0)); x += step
    y = min(ys) + step / 2
    while y <= max(ys): cut((0, y, 0), (0, 1, 0)); y += step
    bmesh.ops.triangulate(bm, faces=front())
    base = tuple(map(float, args.tint.split(',')))
    gl, tn, pt = {}, {}, {}
    for v in {v for f in front() for v in f.verts}:
        z, g, col, pm = 0.0, 0.0, base, 0.0
        for cx, cy, r, hgt, rgb, dent in bubbles:
            d = math.hypot(v.co.x - cx, v.co.y - cy) - r
            u = min(max(-d / r, 0.0), 1.0)
            k = smootherstep((0.15 * BUBBLE_RAMP - d) / BUBBLE_RAMP)
            dz = hgt * k * math.sqrt(max(0.0, 1.0 - (1.0 - u) ** 2))
            if dent:
                dx, dy, dr, dd = dent
                dz -= dd * math.exp(-((v.co.x - dx) ** 2 + (v.co.y - dy) ** 2) / (dr * dr)) * k
            z += dz
            if hgt > 0: g = max(g, k)
            if rgb:
                m = smootherstep((0.0006 - d) / 0.0012)
                col = tuple(c0 * (1 - m) + c1 * m for c0, c1 in zip(col, rgb))
                # A tinted patch is polished glass, not paint on the frost,
                # and a fine groove at its edge catches a crisp line of light.
                g = max(g, 0.4 * m); pm = max(pm, m if max(rgb) - min(rgb) > 0.05 else 0.0)  # grey stays clear
                z -= GROOVE * math.exp(-(d / 0.0008) ** 2)
        v.co.z += z; gl[v.index] = g; tn[v.index] = col; pt[v.index] = pm
    bm.to_mesh(me); bm.free()
    a = me.attributes.new('gloss', 'FLOAT', 'POINT'); c = me.attributes.new('tint', 'FLOAT_COLOR', 'POINT')
    for i in range(len(me.vertices)):
        a.data[i].value = gl.get(i, 0.0); c.data[i].color = (*tn.get(i, base), 1)
    b = me.attributes.new('patch', 'FLOAT', 'POINT')
    for i in range(len(me.vertices)): b.data[i].value = pt.get(i, 0.0)
    for pl in me.polygons: pl.use_smooth = True


def holder(name, parent=ui):
    return link(bpy.data.objects.new(name, None), parent)



# ---------------------------------------------------------------- Dock, shelf
def milky(name, rgb):
    """Icon tile glass: partly milky, so its colour holds over any room."""
    m, p = principled(name, **{'Base Color': (*rgb, 1), 'Transmission Weight': 0.6, 'Roughness': 0.16,
                               'IOR': 1.45, 'Coat Weight': 1.0, 'Coat Roughness': 0.03, 'Coat IOR': 1.5})
    return m


def shelf_dock():
    """Jihoon's direction (2026-10-20): a Snow Leopard style dock. A thin,
    flat glass shelf curved around the user at reach, so every icon is the
    same distance from the eye, with the icons floating upright above it
    and reflected in it."""
    R = 0.5                       # the arc's radius: the user's reach at the desk
    dist = R
    dm = lambda v: v / 1000 * dist
    side, gap, pad = dm(60), dm(18), dm(16)
    L = 5 * side + 4 * gap + 2 * pad; D = side * 1.7; T = 0.003
    lift = dm(10)                 # how high the icons float over the glass
    hovered = own.state in ('hover', 'press')
    C = Vector((0, -R, 0))        # the user, at the arc's centre
    on_arc = lambda s, t, z=0.0: C + Vector(((R + t) * math.sin(s / R), (R + t) * math.cos(s / R), z))
    # The shelf: a rounded rect laid along the arc, then given a polished rim.
    bm = bmesh.new()
    pts = rounded_rect(L, D, D / 2 * 0.98, 16)
    # Subdivide the long sides so the arc stays smooth.
    dense = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int(abs(x1 - x0) / 0.002))
        dense += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n)]
    face = bm.faces.new([bm.verts.new(on_arc(x, y)) for x, y in dense])
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z += T
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('shelf'); bm.to_mesh(me); bm.free()
    sh = bpy.data.objects.new('shelf', me); scene.collection.objects.link(sh)
    bev = sh.modifiers.new('rim', 'BEVEL'); bev.width = T * 0.49; bev.segments = 8; bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(60)
    me.materials.append(glass('shelfglass', (0.74, 0.76, 0.8), 0.02, 6, coat=1.0))  # smoky, mirror-smooth: it carries the reflections
    for pl in me.polygons: pl.use_smooth = True
    # The icons: upright tiles of milky tinted glass, each turned to face
    # the user. The hovered one rises and grows, macOS magnification style.
    xs = [-L / 2 + pad + side / 2 + i * (side + gap) for i in range(5)]
    for i, (ic, rgb) in enumerate(APPS):
        up = hovered and i == HOVER
        k = 1.18 if up else 1.0
        d = side * k
        th = -xs[i] / R
        h = link(bpy.data.objects.new(f'tile{i}', None), None)
        h.location = on_arc(xs[i], 0, T + lift + (dm(8) if up else 0) + d / 2)
        h.rotation_euler = (math.pi / 2, 0, th)
        col = tuple(min(1.0, v * 1.3) for v in lin(rgb or NEUTRAL))
        tile = slab(f't{i}', d, d, d * 0.24, dm(5) * k, milky(f'm{i}', col), h)
        tile.location = (0, 0, -dm(2.5) * k)
        icon(ic, d * 0.5, 0, 0, dm(2.5) * k + 0.0004, h)
    # Snow Leopard's running light: a small glowing dot on the glass in
    # front of an open app (Home here).
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=dm(2.5))
    rd = bpy.context.object; rd.scale = (1, 1, 0.35); rd.location = on_arc(xs[0], -D * 0.38, T + 0.0004)
    rd.data.materials.append(emissive('runlight', (0.75, 0.88, 1.0), strength=4))
    # Camera: the user's eye, 0.28 m above the shelf and looking down at it.
    eye = C + Vector((0, 0.02, 0.28))
    return eye, Vector((0, 0, T + lift + side * 0.3)), 24


# ---------------------------------------------------------------- Dock
def dock():
    dist = 0.55
    dm = lambda v: v / 1000 * dist
    side, gap, pad = dm(60), dm(16), dm(14)
    W = 5 * side + 4 * gap + 2 * pad; H = side + 2 * pad
    root = holder('dock')
    root.rotation_euler = (math.radians(-35), 0, 0)  # faces the eye above it
    hovered = own.state in ('hover', 'press')
    o = own.option
    xs = [-W / 2 + pad + side / 2 + i * (side + gap) for i in range(5)]
    tint = lambda rgb: tuple(min(1.0, c * 1.25) for c in lin(rgb)) if rgb else None
    bright = lambda rgb, k: tuple(min(1.0, v * k) for v in tint(rgb))
    if o == 'inlay':
        # The icons are tinted patches of the shelf's own glass; the hovered
        # one swells into a bubble, like the toolbar's Place button.
        sh = slab('shelf', W, H, H / 2 * 0.98, T_WINDOW, field_glass('shelf', (0.72, 0.695, 0.66), 0.4), root)
        hgt = 0.006 * dist / 0.6
        global GROOVE; GROOVE = 0.0003 * dist / 0.6
        bub = []
        for i, (ic, rgb) in enumerate(APPS):
            up = hovered and i == HOVER
            dent = (xs[i] + side * 0.08, 0, side * 0.2, hgt * 0.55) if up and own.state == 'press' else None
            # Hovered: the patch grows about 12% as it swells and its colour
            # brightens, so the lift reads as light, not as a darker lump.
            rgb = rgb or NEUTRAL
            c = bright(rgb, 1.7 if up else 1.45)
            bub.append((xs[i], 0, side / 2 * (1.03 if up else 0.92), hgt * (0.85 if dent else 1) if up else 0.0, c, dent))
        surface(sh, bub, step=0.0005)
        for i, (ic, rgb) in enumerate(APPS):
            up = hovered and i == HOVER
            icon(ic, side * 0.42, xs[i], 0, T_WINDOW + (hgt * 0.95 if up else 0) + 0.0004, root)
    else:
        slab('shelf', W, H, H / 2 * 0.98, T_WINDOW, M_WINDOW, root)  # a hair under half: a full capsule left a seam
        for i, (ic, rgb) in enumerate(APPS):
            up = hovered and i == HOVER
            s = 1.25 if up else 1.0
            d = side * s
            if o == 'bead':
                bh = d * 0.2
                bead(f'b{i}', d, bh, tinted(f't{i}', tint(rgb)) if rgb else M_BEAD, root).location = (xs[i], 0, T_WINDOW)
                icon(ic, d * 0.42, xs[i], 0, T_WINDOW + bh + 0.0003, root)
            else:  # layered: a colour plate under a clear glass dome
                plate = slab(f'p{i}', d * 0.9, d * 0.9, d * 0.45, 0.0015, tinted(f't{i}', tint(rgb), rough=0.35, absorb=0) if rgb else M_WINDOW, root)
                plate.location = (xs[i], 0, T_WINDOW)
                icon(ic, d * 0.42, xs[i], 0, T_WINDOW + 0.0016, root)
                bh = d * 0.1  # a low lens cap: fuller domes read as marbles
                bead(f'b{i}', d, bh, M_BEAD, root).location = (xs[i], 0, T_WINDOW + 0.0017)
    # Camera: 0.55 m away, 35° above the dock's centre, so the bubble's
    # height reads (25° looked nearly straight-on).
    e = math.radians(35)
    return Vector((0, -math.cos(e) * dist, math.sin(e) * dist)), 19


# ---------------------------------------------------------------- Z-Slider
def slider():
    dist = 0.6
    side = dmm(60); travel = 0.07
    out = travel * (1 - own.value)  # how far the knob stands out of the plate
    plateD = side * 1.55
    root = holder('slider')
    o = own.option
    amber = (1.0, 0.62, 0.25)
    if o == 'membrane':
        # The knob is the plate's own glass, pulled out into a tall bubble:
        # pushing sinks it back toward flat. The top carries the icon.
        pl = slab('plate', plateD, plateD, plateD / 2, T_WINDOW, field_glass('plate', (0.72, 0.695, 0.66), 0.4), root)
        surface(pl, [(0, 0, side / 2, max(out, 0.002), None, None)], step=0.0012)
        icon('sun', side * 0.42, 0, 0, T_WINDOW + max(out, 0.002) + 0.0005, root)
    elif o == 'column':
        # A column of amber-tinted glass standing out of the plate, with a
        # ring every detent: the depth reads as a ruler.
        slab('plate', plateD, plateD, plateD / 2, T_WINDOW, M_WINDOW, root)
        bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=side / 2, depth=out, location=(0, 0, 0))
        col = bpy.context.object; col.parent = root; col.location = (0, 0, T_WINDOW + out / 2)
        bev = col.modifiers.new('b', 'BEVEL'); bev.width = side * 0.12; bev.segments = 8
        col.data.materials.append(tinted('amber', lin(amber), rough=0.08, absorb=10))
        for p in col.data.polygons: p.use_smooth = True
        for i in range(1, 10):
            z = travel * i / 10
            if z >= out - 0.002: break
            bpy.ops.mesh.primitive_torus_add(major_radius=side / 2 + 0.0003, minor_radius=0.0004, location=(0, 0, 0))
            ring = bpy.context.object; ring.parent = root; ring.location = (0, 0, T_WINDOW + z)
            ring.data.materials.append(text_mat(0.5))
        icon('sun', side * 0.42, 0, 0, T_WINDOW + out + 0.0004, root)
    else:  # stem: an amber glass bead knob on a glass stem over detent rings
        # Refined after the critique: amber glass instead of clear (it read as
        # a pin), a flared foot so the stem grows out of the plate rather than
        # being stuck into it, and five etched detents instead of ten white
        # rings (a dartboard). Detents up to the value glow lamp amber.
        slab('plate', plateD, plateD, plateD / 2 * 0.98, T_WINDOW, M_WINDOW, root)  # a hair under round: full round left a seam
        glassA = tinted('amberglass', lin(amber), rough=0.05, absorb=3)
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=side * 0.1, depth=out, location=(0, 0, 0))
        st = bpy.context.object; st.parent = root; st.location = (0, 0, T_WINDOW + out / 2)
        st.data.materials.append(glassA)
        for p in st.data.polygons: p.use_smooth = True
        foot = bead('foot', side * 0.5, side * 0.07, glassA, root); foot.location = (0, 0, T_WINDOW)
        lit = emissive('detent-lit', lin(amber), strength=2.2)
        etched = emissive('detent', (1, 1, 1), strength=0.35)  # faint, like an etch in the frost
        n = 5
        for i in range(n):
            on = i < round(own.value * n)
            bpy.ops.mesh.primitive_torus_add(major_radius=side * (0.34 + 0.07 * i), minor_radius=0.0003 if on else 0.0002, location=(0, 0, 0))
            ring = bpy.context.object; ring.parent = root; ring.location = (0, 0, T_WINDOW + 0.0002)
            ring.data.materials.append(lit if on else etched)
        knob = bead('knob', side, side * 0.22, glassA, root); knob.location = (0, 0, T_WINDOW + out)
        icon('sun', side * 0.42, 0, 0, T_WINDOW + out + side * 0.22 + 0.0003, root)
        # A rim light from behind, so the amber glass edges catch light.
        rim = bpy.data.lights.new('rim', 'AREA'); rim.size = 0.3; rim.energy = 6; rim.color = (1.0, 0.85, 0.65)
        rob = bpy.data.objects.new('rim', rim); scene.collection.objects.link(rob)
        rob.location = (-0.35, 0.4, 0.35); rob.rotation_euler = (Vector((0, 0, 0)) - rob.location).to_track_quat('-Z', 'Y').to_euler()
    # Value label beside the knob, as the live component has it.
    text(f'Lamp  {round(own.value * 100)}%', 'headline', plateD / 2 + dmm(10), 0, T_WINDOW + 0.0004, root)
    a = 0.75
    return Vector((math.sin(a) * dist, -math.cos(a) * dist, 0.05)), 11


aim = Vector((0, 0, 0))
if own.part == 'dock' and own.option == 'shelf': eye, aim, fov = shelf_dock()
else: eye, fov = dock() if own.part == 'dock' else slider()

key = bpy.data.lights.new('key', 'AREA'); key.size = 0.6; key.energy = 18; key.color = (1.0, 0.92, 0.82)
kob = bpy.data.objects.new('key', key); scene.collection.objects.link(kob)
kob.location = (-0.7, -0.5, 0.9); kob.rotation_euler = Vector((0.7, 0.5, -0.9)).to_track_quat('Z', 'Y').to_euler()
cam = bpy.data.cameras.new('cam'); cam.sensor_fit = 'VERTICAL'; cam.angle_y = math.radians(fov)
cam.dof.use_dof = True; cam.dof.aperture_fstop = 5.6
cob = bpy.data.objects.new('cam', cam); scene.collection.objects.link(cob); scene.camera = cob
cob.location = eye
cob.rotation_euler = (aim - eye).to_track_quat('-Z', 'Y').to_euler()
cam.dof.focus_distance = (aim - eye).length
os.makedirs(os.path.dirname(own.out), exist_ok=True)
scene.render.filepath = own.out
bpy.ops.render.render(write_still=True)
print('wrote', own.out)
