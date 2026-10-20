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
ap.add_argument('--option', default='bead')  # dock: bead | inlay | layered; slider: stem | column | membrane
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

APPS = [('house', (0.18, 0.49, 0.96)), ('ruler', (0.88, 0.54, 0.12)), ('scan', (0.14, 0.64, 0.43)),
        ('image', (0.85, 0.27, 0.37)), ('settings', None)]
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
    gl, tn = {}, {}
    for v in {v for f in front() for v in f.verts}:
        z, g, col = 0.0, 0.0, base
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
        v.co.z += z; gl[v.index] = g; tn[v.index] = col
    bm.to_mesh(me); bm.free()
    a = me.attributes.new('gloss', 'FLOAT', 'POINT'); c = me.attributes.new('tint', 'FLOAT_COLOR', 'POINT')
    for i in range(len(me.vertices)):
        a.data[i].value = gl.get(i, 0.0); c.data[i].color = (*tn.get(i, base), 1)
    for pl in me.polygons: pl.use_smooth = True


def holder(name, parent=ui):
    return link(bpy.data.objects.new(name, None), parent)


# ---------------------------------------------------------------- Dock
def dock():
    dist = 0.55
    dm = lambda v: v / 1000 * dist
    side, gap, pad = dm(60), dm(16), dm(14)
    W = 5 * side + 4 * gap + 2 * pad; H = side + 2 * pad
    root = holder('dock')
    root.rotation_euler = (math.radians(-25), 0, 0)  # faces the eye above it
    hovered = own.state in ('hover', 'press')
    o = own.option
    xs = [-W / 2 + pad + side / 2 + i * (side + gap) for i in range(5)]
    tint = lambda rgb: tuple(min(1.0, c * 1.25) for c in lin(rgb)) if rgb else None
    if o == 'inlay':
        # The icons are tinted patches of the shelf's own glass; the hovered
        # one swells into a bubble, like the toolbar's Place button.
        sh = slab('shelf', W, H, H / 2 * 0.98, T_WINDOW, field_glass('shelf', (0.72, 0.695, 0.66), 0.4), root)
        hgt = 0.006 * dist / 0.6
        bub = []
        for i, (ic, rgb) in enumerate(APPS):
            up = hovered and i == HOVER
            dent = (xs[i] + side * 0.08, 0, side * 0.2, hgt * 0.55) if up and own.state == 'press' else None
            bub.append((xs[i], 0, side / 2 * 0.92, hgt * (0.85 if dent else 1) if up else 0.0, tint(rgb), dent))
        surface(sh, bub)
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
    # Camera: 0.55 m away, 25° above the dock's centre.
    e = math.radians(25)
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
    else:  # stem: a clear bead knob on a thin glass stem over detent rings
        slab('plate', plateD, plateD, plateD / 2, T_WINDOW, M_WINDOW, root)
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=side * 0.12, depth=out, location=(0, 0, 0))
        st = bpy.context.object; st.parent = root; st.location = (0, 0, T_WINDOW + out / 2)
        st.data.materials.append(M_BEAD)
        for i in range(10):
            bpy.ops.mesh.primitive_torus_add(major_radius=side * (0.2 + 0.055 * i), minor_radius=0.00025, location=(0, 0, 0))
            ring = bpy.context.object; ring.parent = root; ring.location = (0, 0, T_WINDOW + 0.0003)
            ring.data.materials.append(text_mat(0.5 if i < round((1 - own.value) * 10) else 0.15))
        knob = bead('knob', side, side * 0.3, M_BEAD, root); knob.location = (0, 0, T_WINDOW + out)
        icon('sun', side * 0.42, 0, 0, T_WINDOW + out + side * 0.3 + 0.0003, root)
    # Value label beside the knob, as the live component has it.
    text(f'Lamp  {round(own.value * 100)}%', 'headline', plateD / 2 + dmm(10), 0, T_WINDOW + 0.0004, root)
    a = 0.75
    return Vector((math.sin(a) * dist, -math.cos(a) * dist, 0.05)), 11


eye, fov = dock() if own.part == 'dock' else slider()

key = bpy.data.lights.new('key', 'AREA'); key.size = 0.6; key.energy = 18; key.color = (1.0, 0.92, 0.82)
kob = bpy.data.objects.new('key', key); scene.collection.objects.link(kob)
kob.location = (-0.7, -0.5, 0.9); kob.rotation_euler = Vector((0.7, 0.5, -0.9)).to_track_quat('Z', 'Y').to_euler()
cam = bpy.data.cameras.new('cam'); cam.sensor_fit = 'VERTICAL'; cam.angle_y = math.radians(fov)
cam.dof.use_dof = True; cam.dof.aperture_fstop = 5.6
cob = bpy.data.objects.new('cam', cam); scene.collection.objects.link(cob); scene.camera = cob
cob.location = eye
cob.rotation_euler = (Vector((0, 0, 0)) - eye).to_track_quat('-Z', 'Y').to_euler()
cam.dof.focus_distance = eye.length
os.makedirs(os.path.dirname(own.out), exist_ok=True)
scene.render.filepath = own.out
bpy.ops.render.render(write_still=True)
print('wrote', own.out)
