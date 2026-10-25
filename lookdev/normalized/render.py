"""Render the pinned Catalog mesh bundle with Blender, without font/SVG fallback.

Example (the caller records Blender's real process exit code)::

  blender --background --factory-startup --python-exit-code 1 --python render.py \
    -- --bundle INPUT --out NEW_OUTPUT --state rest --view front --calibration

All vertices and normals arrive baked into the product's metre, Y-up frame.
The adapter changes axes, preserves supplied triangulation, and checks evaluated
bounds before rendering. It deliberately supports only rest/front. It does not
claim that the physical reference material equals the WebXR analytic shader.
No preferences, startup file, source assets, or input bundle are written.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
import time
import traceback


SOURCE_SHA = "b0efff2de1860e5d2f39dc65b17db250f3c6b627"
CONTRACT_SHA = "2372f3a6d156416f37f5971130eb2e12d319aec0db7a9bb8698efe06398d6cad"
INPUT_DIGEST = "7128e3948de73654a078f93cf5de3d4759d29caa049c860e1c11931a87c40cce"
BOUNDS_TOLERANCE_M = 2e-7  # BufferGeometry float32 and Blender mesh float32.
PALETTE = {"window": [0.18]*3, "bead": [0.35]*3, "text": [1.0]*3,
           "icon": [1.0]*3, "separator": [0.4]*3, "background": [0.05]*3}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    # Even evidence files are never silently replaced.
    with Path(path).open("x", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


def finite_vector(value, length=3):
    return (isinstance(value, (list, tuple)) and len(value) == length
            and all(isinstance(v, (int, float)) and not isinstance(v, bool)
                    and math.isfinite(v) for v in value))


def bounds(points):
    require(bool(points), "Cannot calculate bounds for an empty mesh")
    return {"min": [min(p[i] for p in points) for i in range(3)],
            "max": [max(p[i] for p in points) for i in range(3)]}


def bounds_error(actual, expected):
    require(all(finite_vector(expected.get(k)) for k in ("min", "max")),
            "Bounds must contain finite min/max vectors")
    return max(abs(actual[k][i] - expected[k][i])
               for k in ("min", "max") for i in range(3))


def ui_to_blender(point):
    return (point[0], -point[2], point[1])


def blender_to_ui(point):
    return (point[0], point[2], -point[1])


def asset_path(bundle, relative):
    require(isinstance(relative, str) and relative, "Asset path is missing")
    candidate = (bundle / relative).resolve()
    require(candidate.is_relative_to(bundle) and candidate != bundle,
            "Asset path escapes the input bundle")
    require(candidate.is_file(), f"Missing bundle asset: {relative}")
    return candidate


def check_asset(bundle, record):
    path = asset_path(bundle, record["path"])
    actual = sha256(path)
    require(actual == record["sha256"], f"Asset hash mismatch: {record['path']}")
    return {"path": record["path"], "sha256": actual, "bytes": path.stat().st_size}


def validate_bundle(bundle, normalized, contract):
    require(normalized.get("schemaVersion") == 1, "Unsupported normalized schema")
    require(normalized.get("sourceSha") == SOURCE_SHA == contract["sourceSha"],
            "The pinned product source SHA changed")
    require(normalized.get("contractSha256") == CONTRACT_SHA,
            "The normalized input does not name the frozen contract")
    require(contract["inputDigest"] == INPUT_DIGEST, "Source/asset digest changed")
    if "inputDigest" in normalized:
        require(normalized["inputDigest"] == INPUT_DIGEST, "Normalized source/asset digest changed")
    require(normalized.get("state") == "rest" and normalized.get("view") == "front",
            "Only actual rest/front inputs are supported")
    meshes = normalized.get("meshes", [])
    require(bool(meshes), "No normalized meshes supplied")
    ids = [mesh.get("id") for mesh in meshes]
    require(all(isinstance(i, str) and i for i in ids) and len(set(ids)) == len(ids),
            "Mesh IDs must be present and unique")
    for mesh in meshes:
        vertices, triangles = mesh["verticesUiM"], mesh["triangles"]
        require(vertices and all(finite_vector(v) for v in vertices),
                f"Invalid vertices: {mesh['id']}")
        require(triangles and all(isinstance(t, (list, tuple)) and len(t) == 3
                and all(type(i) is int and 0 <= i < len(vertices) for i in t)
                and len(set(t)) == 3 for t in triangles),
                f"Invalid triangle indices: {mesh['id']}")
        require(bounds_error(bounds(vertices), mesh["expectedBoundsUiM"])
                <= BOUNDS_TOLERANCE_M, f"Input mesh bounds mismatch: {mesh['id']}")
        if "normalsUi" in mesh:
            require(len(mesh["normalsUi"]) == len(vertices)
                    and all(finite_vector(n) and sum(x*x for x in n) > 0
                            for n in mesh["normalsUi"]),
                    f"Invalid supplied normals: {mesh['id']}")
        require(mesh["material"] in {"glass", "window", "bead", "text", "icon", "separator"},
                f"Unsupported material: {mesh['id']}")
        opacity = mesh.get("opacity", 1.0)
        require(isinstance(opacity, (int, float)) and math.isfinite(opacity)
                and 0 <= opacity <= 1, f"Invalid opacity: {mesh['id']}")
    font_records = normalized.get("fonts", [])
    require(font_records, "Missing canonical font provenance")
    fonts = {font["id"]: font for font in font_records}
    require(len(fonts) == len(font_records), "Font IDs are not unique")
    assets = [check_asset(bundle, asset) for asset in normalized.get("assets", [])]
    for font in font_records:
        require(font.get("canonicalTablesPreserved") is True,
                "Font table preservation has not passed")
        require(type(font.get("unitsPerEm")) is int and font["unitsPerEm"] > 0,
                "Missing font units per em")
        assets.append(check_asset(bundle, font))
    by_id = {mesh["id"]: mesh for mesh in meshes}
    text_records = normalized.get("texts", [])
    expected_texts = [contract["catalog"]["label"], contract["catalog"]["subtitle"]]
    for row in contract["resolvedLevels"][0]["rows"]:
        expected_texts.extend([row["label"], row["detail"]])
    require(Counter(t["text"] for t in text_records) == Counter(expected_texts),
            "Text content does not equal the actual root Catalog")
    for text in text_records:
        style = contract["typeRamp"][text["style"]]
        font = fonts[text["fontId"]]
        require(text["fontSha256"] == font["sha256"], "Text uses a different font")
        require(abs(text["sizeM"] - style["sizeM"]) < 1e-12
                and abs(text["trackingEm"] - style["tracking"]) < 1e-12,
                f"Text style differs from contract: {text['id']}")
        require(isinstance(text["advanceM"], (int, float))
                and math.isfinite(text["advanceM"]) and text["advanceM"] > 0,
                f"Missing normalized text advance: {text['id']}")
        refs = text["meshIds"]
        require(refs and all(mid in by_id and by_id[mid]["material"] == "text" for mid in refs),
                f"Missing text silhouette meshes: {text['id']}")
        text_points = [v for mid in refs for v in by_id[mid]["verticesUiM"]]
        require(bounds_error(bounds(text_points), text["boundsUiM"]) <= BOUNDS_TOLERANCE_M,
                f"Text silhouette bounds mismatch: {text['id']}")
        expected_z = (contract["geometry"]["headerZM"] if text["style"] in {"title", "subheadline"}
                      else contract["geometry"]["windowFrontZ"]
                      + contract["geometry"]["rowFaceOffsetM"]
                      + contract["geometry"]["rowTextOffsetFromFaceM"])
        require(all(abs(v[2]-expected_z) <= BOUNDS_TOLERANCE_M for v in text_points),
                f"Text surface Z differs from the contract: {text['id']}")
    icons = normalized.get("icons", [])
    expected_icons = [row["icon"] for row in contract["resolvedLevels"][0]["rows"]]
    expected_icons += ["chevron-right"] * 4
    require(Counter(icon["name"] for icon in icons) == Counter(expected_icons),
            "Icon content does not equal the actual root Catalog")
    for icon in icons:
        refs = icon["meshIds"]
        require(refs and all(mid in by_id and by_id[mid]["material"] == "icon" for mid in refs),
                f"Missing 2D icon silhouette: {icon['id']}")
        pts = [v for mid in refs for v in by_id[mid]["verticesUiM"]]
        actual = bounds(pts)
        require(actual["max"][2] - actual["min"][2] <= 1e-10,
                f"Icon is not a flat silhouette: {icon['id']}")
        require(bounds_error(actual, icon["boundsUiM"]) <= BOUNDS_TOLERANCE_M,
                f"Icon silhouette bounds mismatch: {icon['id']}")
        expected_size = contract["geometry"]["chevronM" if icon["name"] == "chevron-right" else "glyphM"]
        require(abs(icon["sizeM"] - expected_size) < 1e-12,
                f"Icon size differs from contract: {icon['id']}")
        expected_z = contract["geometry"]["windowFrontZ"] + contract["geometry"]["rowFaceOffsetM"]
        expected_z += (contract["geometry"]["rowTextOffsetFromFaceM"] if icon["name"] == "chevron-right"
                       else contract["geometry"]["beadHeightM"] + 0.0004)
        require(abs(actual["min"][2]-expected_z) <= BOUNDS_TOLERANCE_M,
                f"Icon surface Z differs from the contract: {icon['id']}")
        require(any(a["sha256"] == icon["sourceSha256"] for a in assets),
                f"Icon source hash was not verified: {icon['id']}")
    window = [m for m in meshes if m["material"] in {"window", "glass"}]
    beads = [m for m in meshes if m["material"] == "bead"]
    separators = [m for m in meshes if m["material"] == "separator"]
    require(len(window) == 1 and len(beads) == 4 and len(separators) == 3,
            "Rest must have one window, four beads, three separators and no row lens")
    win_bounds = bounds(window[0]["verticesUiM"])
    root = contract["resolvedLevels"][0]
    require(abs(win_bounds["max"][0] - win_bounds["min"][0] - root["widthM"]) <= BOUNDS_TOLERANCE_M
            and abs(win_bounds["max"][1] - win_bounds["min"][1] - root["heightM"]) <= BOUNDS_TOLERANCE_M,
            "Root window dimensions differ from the contract")
    # THREE.ExtrudeGeometry deliberately uses a 10 micrometre central depth
    # when the bevel is half the thickness. Preserve that measured geometry;
    # do not silently collapse it to the nominal thickness.
    require(abs(win_bounds["min"][2]) <= BOUNDS_TOLERANCE_M
            and abs(win_bounds["max"][2] - contract["geometry"]["windowThicknessM"])
            <= 1.01e-5, "Window depth is outside the pinned geometry tolerance")
    require(abs(win_bounds["min"][0]+win_bounds["max"][0]) <= BOUNDS_TOLERANCE_M
            and abs(win_bounds["min"][1]+win_bounds["max"][1]) <= BOUNDS_TOLERANCE_M,
            "The root window is not centered in the frozen UI frame")
    for bead, row in zip(sorted(beads, key=lambda m: -bounds(m["verticesUiM"])["max"][1]), root["rows"]):
        box = bounds(bead["verticesUiM"])
        center = [(box["min"][i]+box["max"][i])/2 for i in range(3)]
        extents = [box["max"][i]-box["min"][i] for i in range(3)]
        require(abs(center[0] - (-0.0534)) <= BOUNDS_TOLERANCE_M
                and abs(center[1]-row["centerYM"]) <= BOUNDS_TOLERANCE_M
                and all(abs(extents[i]-contract["geometry"]["beadDiameterM"]) <= BOUNDS_TOLERANCE_M for i in (0, 1))
                and abs(extents[2]-contract["geometry"]["beadHeightM"]) <= BOUNDS_TOLERANCE_M
                and abs(box["min"][2]-(contract["geometry"]["windowFrontZ"]
                            +contract["geometry"]["rowFaceOffsetM"])) <= BOUNDS_TOLERANCE_M,
                f"Bead geometry or position differs from the frozen row: {bead['id']}")
    return assets


def emission(bpy, name, colour, strength, opacity=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    shader = nodes.new("ShaderNodeEmission")
    shader.inputs["Color"].default_value = (*colour, 1)
    shader.inputs["Strength"].default_value = strength
    output = nodes.new("ShaderNodeOutputMaterial")
    if opacity < 1:
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        mix = nodes.new("ShaderNodeMixShader")
        mix.inputs[0].default_value = opacity
        links.new(transparent.outputs[0], mix.inputs[1])
        links.new(shader.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], output.inputs["Surface"])
    else:
        links.new(shader.outputs[0], output.inputs["Surface"])
    return mat


def physical_glass(bpy, name, tint, roughness, absorption, ior, coat):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    for key, value in {"Base Color": (*tint, 1), "Transmission Weight": 1.0,
                       "Roughness": roughness, "IOR": ior, "Coat Weight": coat,
                       "Coat Roughness": 0.04, "Coat IOR": 1.5}.items():
        shader.inputs[key].default_value = value
    volume = nodes.new("ShaderNodeVolumeAbsorption")
    volume.inputs["Color"].default_value = (*tint, 1)
    volume.inputs["Density"].default_value = absorption
    links.new(volume.outputs[0], nodes["Material Output"].inputs["Volume"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 900
    noise.inputs["Detail"].default_value = 4
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.04
    bump.inputs["Distance"].default_value = 0.0002
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return mat


def configure_gpu(bpy, scene):
    preferences = bpy.context.preferences.addons["cycles"].preferences
    preferences.compute_device_type = "OPTIX"
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type == "OPTIX"
    inventory = [{"name": d.name, "type": d.type, "enabled": bool(d.use)}
                 for d in preferences.devices]
    require(any(d["enabled"] and d["type"] == "OPTIX" for d in inventory),
            "No existing OptiX device; CPU fallback is forbidden")
    require(not any(d["enabled"] and d["type"] != "OPTIX" for d in inventory),
            "A non-OptiX device was enabled")
    scene.cycles.device = "GPU"
    return inventory


def configure_scene(bpy, bundle, contract, normalized, calibration):
    from mathutils import Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "CYCLES"
    ref, cap = contract["lightingAndColour"]["blenderReference"], contract["capture"]
    scene.cycles.samples = ref["samples"]
    scene.cycles.seed = ref["seed"]
    scene.cycles.use_animated_seed = False
    scene.cycles.use_adaptive_sampling = ref["adaptiveSampling"]
    scene.cycles.use_denoising = False if calibration else ref["denoising"]
    scene.cycles.max_bounces = ref["maxBounces"]
    scene.cycles.transmission_bounces = ref["transmissionBounces"]
    scene.cycles.glossy_bounces = ref["glossyBounces"]
    scene.cycles.caustics_refractive = ref["refractiveCaustics"]
    scene.cycles.caustics_reflective = ref["reflectiveCaustics"]
    scene.render.resolution_x = cap["widthPx"]
    scene.render.resolution_y = cap["heightPx"]
    scene.render.resolution_percentage = cap["resolutionPercentage"]
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    scene.render.film_transparent = cap["transparentFilm"]
    scene.render.image_settings.file_format = cap["outputFormat"]
    scene.render.image_settings.color_mode = cap["channels"]
    scene.render.image_settings.color_depth = str(cap["bitDepth"])
    scene.render.use_file_extension = True
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    scene.render.use_border = False
    scene.view_settings.view_transform = "Standard" if calibration else ref["viewTransform"]
    scene.view_settings.look = "None" if calibration else ref["look"]
    scene.view_settings.exposure = 0 if calibration else ref["exposure"]
    scene.view_settings.gamma = 1 if calibration else ref["gamma"]
    scene.view_settings.use_curve_mapping = False
    palette = dict(PALETTE)
    palette.update(normalized.get("calibration", {}).get("palette", {}))
    palette = {name: [colour]*3 if isinstance(colour, (int, float)) else colour
               for name, colour in palette.items()}
    require(all(finite_vector(c) and all(0 <= v <= 1 for v in c) for c in palette.values()),
            "Invalid calibration palette")
    world = bpy.data.worlds.new("pinned-room")
    world.use_nodes = True
    scene.world = world
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = 1
    output = nodes.new("ShaderNodeOutputWorld")
    links.new(background.outputs[0], output.inputs["Surface"])
    if calibration:
        background.inputs["Color"].default_value = (*palette["background"], 1)
    else:
        env_path = asset_path(bundle, "env/lebombo_1k.hdr")
        require(any(a["path"] == "env/lebombo_1k.hdr" for a in normalized.get("assets", [])),
                "HDR must be present in the verified asset manifest")
        env = nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(env_path), check_existing=False)
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value = (0, 0, contract["lightingAndColour"]["legacyBlenderYawRad"])
        coord = nodes.new("ShaderNodeTexCoord")
        links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], env.inputs["Vector"])
        links.new(env.outputs["Color"], background.inputs["Color"])
        key = bpy.data.lights.new("pinned-key", "AREA")
        key.energy, key.size = ref["keyEnergyW"], ref["keySizeM"]
        key.color = ref["legacyKeyColour"]
        light = bpy.data.objects.new("pinned-key", key)
        scene.collection.objects.link(light)
        light.location = ref["legacyKeyWorldPositionM"]
        light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()
    camera_data = bpy.data.cameras.new("fixed-front")
    camera = bpy.data.objects.new("fixed-front", camera_data)
    scene.collection.objects.link(camera)
    camera.location = ui_to_blender(cap["views"]["front"]["cameraInUiM"])
    target = Vector(ui_to_blender(cap["targetInUiM"]))
    camera.rotation_euler = (target-camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "PERSP"
    camera_data.sensor_fit = "VERTICAL"
    camera_data.sensor_height = 32
    camera_data.lens = camera_data.sensor_height / (2*math.tan(math.radians(cap["fovYDegrees"])/2))
    camera_data.clip_start, camera_data.clip_end = cap["nearM"], cap["farM"]
    camera_data.dof.use_dof = False
    camera_data.shift_x = camera_data.shift_y = 0
    scene.camera = camera
    material_cache = {}
    objects = {}
    for mesh in normalized["meshes"]:
        role = "window" if mesh["material"] == "glass" else mesh["material"]
        opacity = 1 if calibration else mesh.get("opacity", 1)
        key = (role, opacity)
        if key not in material_cache:
            if calibration:
                material = emission(bpy, f"calibration-{role}-{opacity}", palette[role], 1, opacity)
            elif role == "window":
                material = physical_glass(bpy, "reference-window", ref["windowTint"],
                    ref["windowRoughness"], ref["windowAbsorptionPerM"], ref["ior"], 0.6)
            elif role == "bead":
                # Explicit historical physical reference, not a new product value.
                material = physical_glass(bpy, "reference-bead", [0.95, 0.95, 0.96], 0.12, 4, ref["ior"], 1)
            else:
                material = emission(bpy, f"reference-{role}-{opacity}", [1, 1, 1], ref["textEmission"], opacity)
            material_cache[key] = material
        data = bpy.data.meshes.new(mesh["id"])
        data.from_pydata([ui_to_blender(v) for v in mesh["verticesUiM"]], [], mesh["triangles"])
        data.update()
        if "normalsUi" in mesh:
            for poly in data.polygons:
                poly.use_smooth = True
            data.normals_split_custom_set_from_vertices([ui_to_blender(n) for n in mesh["normalsUi"]])
        obj = bpy.data.objects.new(mesh["id"], data)
        scene.collection.objects.link(obj)
        data.materials.append(material_cache[key])
        objects[mesh["id"]] = obj
    scene.frame_set(1)
    bpy.context.view_layer.update()
    return scene, objects, palette


def evaluated_preflight(bpy, scene, objects, normalized, contract):
    from bpy_extras.object_utils import world_to_camera_view
    depsgraph = bpy.context.evaluated_depsgraph_get()
    records = []
    for source in normalized["meshes"]:
        obj = objects[source["id"]].evaluated_get(depsgraph)
        mesh = obj.to_mesh()
        try:
            world_vertices = [obj.matrix_world @ v.co for v in mesh.vertices]
            actual = bounds([blender_to_ui(v) for v in world_vertices])
            error = bounds_error(actual, source["expectedBoundsUiM"])
            require(error <= BOUNDS_TOLERANCE_M, f"Evaluated bounds drift: {source['id']}")
            projected = [world_to_camera_view(scene, scene.camera, v) for v in world_vertices]
            projected_bounds = bounds(projected)
            inside = all(-1e-7 <= p.x <= 1+1e-7 and -1e-7 <= p.y <= 1+1e-7
                         and scene.camera.data.clip_start < p.z < scene.camera.data.clip_end for p in projected)
            require(inside, f"Object is clipped by the frozen camera: {source['id']}")
            require(len(mesh.polygons) == len(source["triangles"]),
                    f"Triangle count changed: {source['id']}")
            records.append({"id": source["id"], "role": source.get("role", source["material"]),
                "vertices": len(mesh.vertices), "triangles": len(mesh.polygons),
                "expectedBoundsUiM": source["expectedBoundsUiM"], "evaluatedBoundsUiM": actual,
                "maximumBoundsErrorM": error, "projectedBounds01": projected_bounds,
                "insideFrustum": inside, "suppliedNormals": "normalsUi" in source})
        finally:
            obj.to_mesh_clear()
    frame = scene.camera.data.view_frame(scene=scene)
    ys = [p.y/-p.z for p in frame]
    measured_fov = math.degrees(math.atan(max(ys))-math.atan(min(ys)))
    require(abs(measured_fov-contract["capture"]["fovYDegrees"]) < 1e-4,
            "Evaluated camera vertical FOV differs from the contract")
    return {"allPassed": True, "boundsToleranceM": BOUNDS_TOLERANCE_M,
            "meshes": records, "camera": {"measuredFovYDegrees": measured_fov,
                "positionUiM": list(blender_to_ui(scene.camera.location)),
                "widthPx": scene.render.resolution_x, "heightPx": scene.render.resolution_y,
                "nearM": scene.camera.data.clip_start, "farM": scene.camera.data.clip_end,
                "depthOfField": scene.camera.data.dof.use_dof},
            "textMode": "canonical glyph triangles; no Blender text/font layout",
            "iconMode": "supplied flat SVG stroke silhouette triangles; no bevel/import addon",
            "fontMetricsIndependentlyReshaped": False,
            "nominalWindowThicknessM": contract["geometry"]["windowThicknessM"],
            "windowDepthPolicy": "Preserve pinned evaluated mesh; THREE bevel's minimum core adds up to 10 micrometres to nominal thickness",
            "browserComparisonCompleted": False,
            "environmentLandmarksCompared": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--state", required=True, choices=["rest"])
    parser.add_argument("--view", required=True, choices=["front"])
    parser.add_argument("--calibration", action="store_true")
    parser.add_argument("--preflight-only", action="store_true")
    args = parser.parse_args(argv)
    bundle = args.bundle.resolve(strict=True)
    output = args.out.resolve()
    require(not output.is_relative_to(bundle), "Output must be outside the input bundle")
    require(not output.exists(), "Output directory already exists; use a fresh run directory")
    contract_path, normalized_path = bundle / "contract.json", bundle / "normalized.json"
    require(sha256(contract_path) == CONTRACT_SHA, "Frozen contract file hash changed")
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    normalized = json.loads(normalized_path.read_text(encoding="utf-8"))
    assets = validate_bundle(bundle, normalized, contract)
    output.mkdir(parents=True, exist_ok=False)
    started = utc_now()
    evidence = {"schemaVersion": 1, "startedAt": started, "state": args.state, "view": args.view,
        "sourceSha": SOURCE_SHA, "contractSha256": CONTRACT_SHA, "inputDigest": INPUT_DIGEST,
        "normalizedSha256": sha256(normalized_path), "adapterSha256": sha256(__file__),
        "assets": assets, "mode": "calibration" if args.calibration else "physical-reference",
        "preflightOnly": args.preflight_only, "status": "STARTED"}
    write_json(output / "run-input.json", evidence)
    # A byte-equivalent copy is useful for independent comparison after retrieval.
    with (output / "normalized-input.json").open("xb") as handle:
        handle.write(normalized_path.read_bytes())
    try:
        import bpy
        require(tuple(bpy.app.version[:2]) == (5, 2), "This adapter requires the verified Blender 5.2 runtime")
        scene, objects, palette = configure_scene(bpy, bundle, contract, normalized, args.calibration)
        preflight = evaluated_preflight(bpy, scene, objects, normalized, contract)
        preflight["calibrationPaletteLinear"] = palette
        preflight["calibrationOpacity"] = "all meshes 1.0" if args.calibration else "not a calibration frame"
        preflight["blenderVersion"] = bpy.app.version_string
        preflight["colourTransform"] = {"viewTransform": scene.view_settings.view_transform,
            "look": scene.view_settings.look, "exposure": scene.view_settings.exposure,
            "gamma": scene.view_settings.gamma}
        write_json(output / "preflight.json", preflight)
        if args.preflight_only:
            evidence.update(status="PREFLIGHT_PASSED", completedAt=utc_now(), rendered=False)
        else:
            devices = configure_gpu(bpy, scene)
            write_json(output / "devices.json", {"backend": "OPTIX", "sceneDevice": scene.cycles.device,
                                                   "cpuRenderingEnabled": False, "devices": devices})
            image_path = output / ("rest-front-calibration.png" if args.calibration else "rest-front-reference.png")
            scene.render.filepath = str(image_path)
            before = time.monotonic()
            bpy.ops.render.render(write_still=True)
            require(image_path.is_file() and image_path.stat().st_size > 0, "Render returned without an output image")
            image = bpy.data.images.load(str(image_path), check_existing=False)
            require(tuple(image.size) == (contract["capture"]["widthPx"], contract["capture"]["heightPx"]),
                    "Rendered image dimensions differ from the contract")
            evidence.update(status="RENDERED", completedAt=utc_now(), rendered=True,
                renderSeconds=time.monotonic()-before, backend="OPTIX", cpuRenderingEnabled=False,
                image={"path": image_path.name, "sha256": sha256(image_path),
                       "bytes": image_path.stat().st_size, "widthPx": image.size[0], "heightPx": image.size[1]},
                browserCalibrationAccepted=False, appearanceEquivalentToWebXR=False,
                headsetAcceptance=False, limitations=["Only rest/front is implemented",
                    "Browser calibration, image content inspection and HDR landmarks are external gates",
                    "Physical materials are a labelled reference; not the product shader"])
        write_json(output / "result.json", evidence)
        print("XR_NORMALIZED_RESULT " + json.dumps({"status": evidence["status"],
              "sourceSha": SOURCE_SHA, "contractSha256": CONTRACT_SHA,
              "image": evidence.get("image")}, sort_keys=True), flush=True)
    except Exception as error:
        evidence.update(status="FAILED", completedAt=utc_now(), errorType=type(error).__name__, error=str(error))
        write_json(output / "failure.json", evidence)
        traceback.print_exc()
        raise


if __name__ == "__main__":
    arguments = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else sys.argv[1:]
    main(arguments)
