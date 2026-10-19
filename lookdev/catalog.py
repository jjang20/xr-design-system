# Path-traced reference for the Catalog window (lookdev).
#
# Builds the Catalog at its real size (same numbers as src/core/defaults.js
# and tokens.json), lights it with the same room, and renders it with Cycles.
# The live three.js component is tuned until it matches these frames.
#
#   python3 lookdev/catalog.py --state hover --view angle --samples 128 --out shots/x.png
#
# Needs: pip install bpy (Blender 5.x as a Python module), fonts converted to
# TTF in lookdev/fonts (see lookdev/README.md).
import argparse, json, math, os, sys
import bpy, bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

ap = argparse.ArgumentParser()
ap.add_argument('--state', default='hover', choices=['rest', 'hover', 'levels'])
ap.add_argument('--view', default='front', choices=['front', 'angle'])
ap.add_argument('--samples', type=int, default=96)
ap.add_argument('--res', default='1600x1000')
ap.add_argument('--yaw', type=float, default=-1.6)  # world rotation (rad)
ap.add_argument('--tint', default='0.55,0.54,0.53')  # window glass colour
ap.add_argument('--absorb', type=float, default=40)  # absorption density (1/m)
ap.add_argument('--rough', type=float, default=0.4)  # frost
ap.add_argument('--fov', type=float, default=17)  # deg, vertical
ap.add_argument('--text', type=float, default=2.2)  # text emission, so white reads white after AgX
ap.add_argument('--out', default=os.path.join(HERE, 'shots', 'catalog.png'))
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

# ---------------------------------------------------------------- sizes
DIST = 0.6  # m, DEFAULTS.distance
dmm = lambda v: v / 1000 * DIST
D = dict(panelWidth=240, rowHeight=48, panelPadding=18, panelPadTop=19, panelPadBottom=8,
         rowInset=7, badge=26, badgeGlyph=14, badgeGap=9, chevron=11, subtitleGap=3, headerGap=12,
         rWindow=34, rRow=15)
TYPE = dict(title=(21, 700), headline=(12.4, 600), subheadline=(11, 500), footnote=(9.5, 500))
T_WINDOW, T_LENS = 0.008, 0.004  # material.t.regular / thin
LIFT = 0.005  # DEFAULTS.look.lensLift

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 16
scene.cycles.transmission_bounces = 16
scene.cycles.glossy_bounces = 8
scene.cycles.caustics_refractive = False
scene.cycles.caustics_reflective = False
w, h = map(int, args.res.split('x'))
scene.render.resolution_x, scene.render.resolution_y = w, h
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'

# The room: the same HDR the live demo uses.
world = bpy.data.worlds.new('room'); scene.world = world
world.use_nodes = True
nt = world.node_tree; nt.nodes.clear()
env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(os.path.join(ROOT, 'demo/public/env/lebombo_1k.hdr'))
mapping = nt.nodes.new('ShaderNodeMapping'); coord = nt.nodes.new('ShaderNodeTexCoord')
mapping.inputs['Rotation'].default_value = (0, 0, args.yaw)
bg = nt.nodes.new('ShaderNodeBackground'); out = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(coord.outputs['Generated'], mapping.inputs['Vector'])
nt.links.new(mapping.outputs['Vector'], env.inputs['Vector'])
nt.links.new(env.outputs['Color'], bg.inputs['Color'])
nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

# The UI is built in a y-up frame (x right, y up, z toward the viewer), like
# three.js, then turned into Blender's z-up world.
ui = bpy.data.objects.new('ui', None); scene.collection.objects.link(ui)
ui.rotation_euler = (math.pi / 2, 0, 0)


def link(ob, parent=ui):
    scene.collection.objects.link(ob); ob.parent = parent; return ob


# ---------------------------------------------------------------- materials
def principled(name, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    for k, v in kw.items(): p.inputs[k].default_value = v
    return m, p


def glass(name, tint, rough, absorb, coat=0.0):
    # Frosted glass: rough transmission (the frost), clear coat on top (the
    # polish that gives sharp reflections), and absorption inside, so the
    # thick rim reads darker and tinted, like real glass.
    m, p = principled(name, **{'Base Color': (*tint, 1), 'Transmission Weight': 1.0, 'Roughness': rough,
                               'IOR': 1.45, 'Coat Weight': coat, 'Coat Roughness': 0.04, 'Coat IOR': 1.5})
    nodes, links = m.node_tree.nodes, m.node_tree.links
    if absorb > 0:
        vol = nodes.new('ShaderNodeVolumeAbsorption')
        vol.inputs['Color'].default_value = (*tint, 1)
        vol.inputs['Density'].default_value = absorb
        links.new(vol.outputs['Volume'], nodes['Material Output'].inputs['Volume'])
    # Fine frost grain, as a bump on the surface.
    noise = nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 900; noise.inputs['Detail'].default_value = 4
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.04; bump.inputs['Distance'].default_value = 0.0002
    links.new(noise.outputs['Fac'], bump.inputs['Height']); links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m


def emissive(name, rgb=(1, 1, 1), strength=1.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links; nodes.clear()
    em = nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*rgb, 1); em.inputs['Strength'].default_value = strength
    out = nodes.new('ShaderNodeOutputMaterial')
    if alpha < 1:
        tr = nodes.new('ShaderNodeBsdfTransparent'); mix = nodes.new('ShaderNodeMixShader')
        mix.inputs['Fac'].default_value = alpha
        links.new(tr.outputs[0], mix.inputs[1]); links.new(em.outputs[0], mix.inputs[2]); links.new(mix.outputs[0], out.inputs['Surface'])
    else:
        links.new(em.outputs[0], out.inputs['Surface'])
    return m


M_WINDOW = glass('window', tuple(map(float, args.tint.split(','))), args.rough, args.absorb, coat=0.6)
M_LENS = glass('lens', (0.95, 0.95, 0.95), 0.2, 6, coat=0.9)
M_BEAD = glass('bead', (0.95, 0.95, 0.96), 0.12, 4, coat=1.0)


def text_mat(alpha):
    key = f'text{alpha}'
    return bpy.data.materials.get(key) or (lambda m: (setattr(m, 'name', key), m)[1])(emissive(key, strength=args.text, alpha=alpha))


# ---------------------------------------------------------------- geometry
def rounded_rect(w, h, r, n=12):
    r = min(r, w / 2, h / 2); pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n); pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def slab(name, w, h, r, t, mat, parent=ui):
    # A rounded-rect slab with a fully rounded rim (half-round edge).
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0)) for x, y in rounded_rect(w, h, r, 16)]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z += t
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me), parent)
    bev = ob.modifiers.new('rim', 'BEVEL'); bev.width = t * 0.49; bev.segments = 10; bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(60); bev.harden_normals = False
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return ob


def bead(name, d, height, mat, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=d / 2)
    ob = bpy.context.object; scene.collection.objects.unlink(ob) if ob.name in scene.collection.objects else None
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-6], context='VERTS')
    bm.to_mesh(me); bm.free()
    ob.scale = (1, 1, height / (d / 2)); ob.name = name
    if ob.name not in scene.collection.objects: scene.collection.objects.link(ob)
    ob.parent = parent; me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return ob


FONTS = {wt: bpy.data.fonts.load(os.path.join(HERE, 'fonts', f'inter-{wt}.ttf')) for wt in (500, 600, 700)}


def text(s, style, x, y, z, parent, alpha=1.0, anchor='LEFT', valign='CENTER'):
    size, wt = TYPE[style]
    cu = bpy.data.curves.new(s, 'FONT'); cu.body = s; cu.font = FONTS[wt]; cu.size = dmm(size) * 1.0
    cu.align_x = anchor; cu.align_y = valign
    if style == 'title': cu.space_character = 0.99
    ob = link(bpy.data.objects.new(s, cu), parent); ob.location = (x, y, z)
    cu.materials.append(text_mat(alpha))
    return ob


def icon(name, size, x, y, z, parent, alpha=1.0):
    # Lucide icons are 24-unit stroke paths, stroke width 2.
    path = os.path.join(ROOT, 'node_modules/lucide-static/icons', f'{name}.svg')
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    holder = link(bpy.data.objects.new(f'icon-{name}', None), parent)
    holder.location = (x, y, z)
    # SVG units import at 1 unit = 1 px / 90 * 0.0254 m; normalise to `size`.
    k = size / (24 / 90 * 0.0254) / 1.0
    for o in new:
        if o.type != 'CURVE': continue
        o.parent = holder
        o.data.bevel_depth = (1 / 90 * 0.0254)  # half of stroke 2 px
        o.data.fill_mode = 'FULL'; o.data.bevel_resolution = 2
        o.data.materials.clear(); o.data.materials.append(text_mat(alpha))
    holder.scale = (k, k, k)
    # Centre: SVG origin is top-left, y down.
    for o in new:
        if o.type == 'CURVE': o.location = (-(12 / 90 * 0.0254), -(12 / 90 * 0.0254), 0)
    for c in list(bpy.data.collections):
        if c.name.startswith(name) and not c.objects: bpy.data.collections.remove(c)
    return holder


# ---------------------------------------------------------------- the Catalog
CATALOG = json.load(open(os.path.join(HERE, 'catalog.json')))


def level(item, z, scale, dim, hovered=None, header_only=False):
    root = link(bpy.data.objects.new(f"level-{item['label']}", None))
    root.location = (0, 0, 0); root.scale = (scale,) * 3
    W = dmm(D['panelWidth']); rowH = dmm(D['rowHeight'])
    titleH = dmm(TYPE['title'][0] * 1.2)
    sub = item.get('subtitle')
    subH = dmm(D['subtitleGap'] + TYPE['subheadline'][0] * 1.3) if sub else 0
    headerH = titleH + subH + dmm(D['headerGap'])
    rows = item.get('items', [])
    H = dmm(D['panelPadTop'] + D['panelPadBottom']) + headerH + len(rows) * rowH
    win = slab('window', W, H, dmm(D['rWindow']), T_WINDOW, M_WINDOW, root)
    front = T_WINDOW + 0.0003
    left = -W / 2 + dmm(D['panelPadding'])
    y = H / 2 - dmm(D['panelPadTop'])
    a = 1 - dim
    text(item['label'], 'title', left, y, front, root, alpha=a, valign='TOP')
    if sub and not header_only:
        text(sub, 'subheadline', left, y - titleH - dmm(D['subtitleGap']), front, root, alpha=0.72 * a, valign='TOP')
    if not header_only:
        listTop = H / 2 - dmm(D['panelPadTop']) - headerH
        rw = dmm(D['panelWidth'] - 2 * D['rowInset'])
        for i, r in enumerate(rows):
            cy = listTop - rowH / 2 - i * rowH
            lift = r['label'] == hovered
            row = link(bpy.data.objects.new(f"row-{r['label']}", None), root)
            row.location = (0, cy, T_WINDOW + (LIFT if lift else 0.0002))
            fz = T_LENS + 0.0003 if lift else 0.0003
            if lift:
                slab('lens', rw, rowH, dmm(D['rRow']), T_LENS, M_LENS, row)
            pad = dmm(D['panelPadding'] - D['rowInset'])
            x = -rw / 2 + pad
            if r.get('icon'):
                b = dmm(D['badge']); bh = b * 0.22
                bd = bead('bead', b, bh, M_BEAD, row); bd.location = (x + b / 2, 0, fz - 0.0003)
                icon(r['icon'], dmm(D['badgeGlyph']), x + b / 2, 0, fz + bh, row)
                x += b + dmm(D['badgeGap'])
            n = len(r.get('items', []))
            detail = r.get('sublabel') or (f"{n} {'item' if n == 1 else 'items'}" if n else None)
            gap = dmm((TYPE['headline'][0] + TYPE['footnote'][0]) * 0.6 / 2)
            text(r['label'], 'headline', x, gap if detail else 0, fz, row)
            if detail: text(detail, 'footnote', x, -gap, fz, row, alpha=0.72)
            if n:
                s = dmm(D['chevron'])
                icon('chevron-right', s, rw / 2 - pad - s / 2, 0, fz, row, alpha=0.5)
            if i > 0 and r['label'] != hovered and rows[i - 1]['label'] != hovered:
                # Hairline between rows.
                bpy.ops.mesh.primitive_plane_add(size=1)
                ln = bpy.context.object; ln.parent = root
                x1 = W / 2 - dmm(D['panelPadding'])
                ln.scale = (x1 - x, dmm(0.75), 1); ln.location = ((x + x1) / 2, cy + rowH / 2, front - 0.0001)
                ln.data.materials.append(text_mat(0.08))
    return root, (W, H)


def find(items, label):
    return next(i for i in items if i['label'] == label)


if args.state in ('rest', 'hover'):
    level(CATALOG, 0, 1, 0, hovered='Sofas' if args.state == 'hover' else None)
else:
    # Three levels, as packaging.parent.recede.* poses them (compress mode).
    sofas = find(CATALOG['items'], 'Sofas'); modular = find(sofas['items'], 'Modular')
    tok = json.load(open(os.path.join(ROOT, 'tokens.json')))['packaging']['parent']['recede']
    val = lambda o: o['$value']['value'] / (1000 if o['$value'].get('unit') == 'mm' else (100 if o['$value'].get('unit') == 'cm' else 1)) if isinstance(o['$value'], dict) else o['$value']
    rz, ry, rs = val(tok['z']), val(tok['y']), val(tok['scale'])
    for depth, item in ((2, CATALOG), (1, sofas), (0, modular)):
        r, _ = level(item, 0, 1, 0.35 * depth, header_only=depth > 0)
        r.location = (0, ry * depth, -rz * depth); s = 1 - rs * depth; r.scale = (s, s, s)

# ---------------------------------------------------------------- light and camera
# A soft warm key from the room's window side, above left: it gives the rim
# its highlight. The HDR does the rest.
key = bpy.data.lights.new('key', 'AREA'); key.size = 0.6; key.energy = 18; key.color = (1.0, 0.92, 0.82)
kob = bpy.data.objects.new('key', key); scene.collection.objects.link(kob)
kob.location = (-0.7, -0.5, 0.9); kob.rotation_euler = Vector((0.7, 0.5, -0.9)).to_track_quat('Z', 'Y').to_euler()

cam = bpy.data.cameras.new('cam'); cam.sensor_fit = 'VERTICAL'; cam.angle_y = math.radians(args.fov)
cam.dof.use_dof = True; cam.dof.aperture_fstop = 5.6
cob = bpy.data.objects.new('cam', cam); scene.collection.objects.link(cob); scene.camera = cob
if args.view == 'front':
    cob.location = (0, -DIST, 0)
else:
    a = 0.6; cob.location = (math.sin(a) * DIST, -math.cos(a) * DIST, 0.06)
cob.rotation_euler = (Vector((0, 0, 0)) - cob.location).to_track_quat('-Z', 'Y').to_euler()
cam.dof.focus_distance = (cob.location).length

os.makedirs(os.path.dirname(args.out), exist_ok=True)
scene.render.filepath = args.out
bpy.ops.render.render(write_still=True)
print('wrote', args.out)
