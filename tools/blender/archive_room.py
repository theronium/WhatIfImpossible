# 資料室の背景を生成する（editor/public/img/archive_*.jpg）
#   blender -b --factory-startup -P tools/blender/archive_room.py -- editor/public/img/archive_wide.jpg 1920 1080 26
#   blender -b --factory-startup -P tools/blender/archive_room.py -- editor/public/img/archive_tall.jpg 600 1500 15
import bpy, random, sys, math

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
# 引数: 出力パス 幅 高さ レンズ(mm)
OUT = ARGS[0] if ARGS else "//archive_room.png"
RES = (int(ARGS[1]), int(ARGS[2])) if len(ARGS) >= 3 else (1920, 1080)
LENS = float(ARGS[3]) if len(ARGS) >= 4 else 26
random.seed(7)

# ── 初期化 ──────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def mat(name, color, rough=0.8, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


def box(name, loc, size, material):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    o.data.materials.append(material)
    return o


M_FLOOR = mat("floor", (0.035, 0.035, 0.045), 0.3)
M_WALL = mat("wall", (0.05, 0.05, 0.065), 0.9)
M_SHELF = mat("shelf", (0.07, 0.065, 0.06), 0.6)
M_BOXES = [mat(f"box{i}", c, 0.85) for i, c in enumerate([
    (0.32, 0.22, 0.13), (0.27, 0.19, 0.12), (0.36, 0.27, 0.17),
    (0.22, 0.17, 0.12), (0.18, 0.18, 0.2), (0.25, 0.22, 0.2),
])]
M_LABEL = mat("label", (0.75, 0.72, 0.65), 0.9)
M_LAMP = mat("lamp", (1, 0.8, 0.55), 0.5, emit=(1, 0.75, 0.45), strength=25)

# ── 部屋 ────────────────────────────────────────────────
L, W, H = 24.0, 7.0, 5.0
box("floor", (0, L / 2, -0.05), (W + 6, L + 4, 0.1), M_FLOOR)
box("ceil", (0, L / 2, H), (W + 6, L + 4, 0.1), M_WALL)
box("wallL", (-W / 2 - 2.6, L / 2, H / 2), (0.2, L + 4, H), M_WALL)
box("wallR", (W / 2 + 2.6, L / 2, H / 2), (0.2, L + 4, H), M_WALL)

# 奥の壁：高窓（格子付き）を残して組む
yb, wx0, wx1, wz0, wz1 = L + 0.5, -1.3, 1.3, 2.3, 4.5
box("back_low", (0, yb, wz0 / 2), (W + 6, 0.2, wz0), M_WALL)
box("back_high", (0, yb, (wz1 + H) / 2), (W + 6, 0.2, H - wz1), M_WALL)
box("back_l", ((-(W + 6) / 2 + wx0) / 2, yb, (wz0 + wz1) / 2), (wx0 + (W + 6) / 2, 0.2, wz1 - wz0), M_WALL)
box("back_r", (((W + 6) / 2 + wx1) / 2, yb, (wz0 + wz1) / 2), ((W + 6) / 2 - wx1, 0.2, wz1 - wz0), M_WALL)
for gx in (-0.43, 0.43):
    box("mullion", (gx, yb, (wz0 + wz1) / 2), (0.05, 0.12, wz1 - wz0), M_SHELF)
for gz in (3.0, 3.75):
    box("transom", (0, yb, gz), (wx1 - wx0, 0.12, 0.05), M_SHELF)
WIN_Y = []

# ── 書架と資料箱 ─────────────────────────────────────────
def shelf_row(x, facing):
    depth, levels = 0.9, 5
    for y0 in range(0, int(L) - 2, 3):
        y = y0 + 1.5
        for side in (-1.45, 1.45):
            box("upright", (x, y + side, 2.0), (depth, 0.06, 4.0), M_SHELF)
        for k in range(levels):
            z = 0.15 + k * 0.85
            box("board", (x, y, z), (depth, 3.0, 0.05), M_SHELF)
            cy = y - 1.38
            while cy < y + 1.3:
                w = random.uniform(0.28, 0.5)
                h = random.uniform(0.42, 0.7)
                if random.random() < 0.08:  # 抜けた棚
                    cy += w + 0.05
                    continue
                d = depth * random.uniform(0.75, 0.95)
                o = box("doc", (x + facing * (depth - d) / 2, cy + w / 2, z + 0.025 + h / 2),
                        (d, w, h), random.choice(M_BOXES))
                o.rotation_euler.x = random.uniform(-0.03, 0.03)
                if random.random() < 0.7:  # ラベル
                    box("label", (x + facing * (depth / 2 + 0.006), cy + w / 2, z + h * 0.6),
                        (0.01, w * 0.6, h * 0.18), M_LABEL)
                cy += w + 0.04

shelf_row(-W / 2, +1)
shelf_row(-W / 2 - 1.6, -1)
shelf_row(W / 2, -1)

# ── 奥の机と灯り ─────────────────────────────────────────
box("desk", (0, L - 1.2, 0.75), (2.4, 1.0, 0.06), M_SHELF)
for dx in (-1.1, 1.1):
    box("leg", (dx, L - 1.2, 0.37), (0.06, 0.9, 0.74), M_SHELF)
for i in range(4):
    box("papers", (random.uniform(-0.8, 0.6), L - 1.2 + random.uniform(-0.2, 0.2), 0.8 + i * 0.01),
        (0.42, 0.3, 0.01), M_LABEL).rotation_euler.z = random.uniform(-0.4, 0.4)
# 卓上ランプ（笠付き）
bpy.ops.mesh.primitive_cone_add(radius1=0.22, radius2=0.08, depth=0.2, location=(0.8, L - 1.1, 1.22))
bpy.context.object.data.materials.append(M_SHELF)
box("lamp_pole", (0.8, L - 1.1, 1.0), (0.025, 0.025, 0.45), M_SHELF)
bpy.ops.object.light_add(type="POINT", location=(0.8, L - 1.1, 1.12))
bpy.context.object.data.energy = 220
bpy.context.object.data.color = (1, 0.7, 0.42)
bpy.context.object.data.shadow_soft_size = 0.05
bpy.ops.object.light_add(type="POINT", location=(0.8, L - 1.6, 1.5))  # 机まわりの照り返し
bpy.context.object.data.energy = 40
bpy.context.object.data.color = (1, 0.7, 0.42)

# 天井の吊り灯（弱め、笠付き）
for y in (5, 13):
    bpy.ops.mesh.primitive_cone_add(radius1=0.35, radius2=0.1, depth=0.25, location=(0, y, H - 0.9))
    bpy.context.object.data.materials.append(M_SHELF)
    box("cord", (0, y, H - 0.4), (0.015, 0.015, 0.8), M_SHELF)
    bpy.ops.object.light_add(type="SPOT", location=(0, y, H - 1.0))
    s = bpy.context.object
    s.data.energy = 250
    s.data.spot_size = math.radians(80)
    s.data.spot_blend = 0.6
    s.data.color = (1.0, 0.85, 0.65)

# 高窓から差し込む光（青白い月光）
bpy.ops.object.light_add(type="SPOT", location=(0, L + 5, 5.6))
win = bpy.context.object
win.data.energy = 60000
win.data.spot_size = math.radians(30)
win.data.spot_blend = 0.15
win.data.shadow_soft_size = 0.05
win.data.color = (0.62, 0.7, 1.0)
win.rotation_euler = (math.radians(-72), 0, 0)

# ── 通路の小物 ───────────────────────────────────────────
# 資料を積んだ台車
tx, ty = 1.4, 8.5
box("cart_top", (tx, ty, 0.55), (0.8, 1.3, 0.04), M_SHELF)
box("cart_low", (tx, ty, 0.15), (0.8, 1.3, 0.04), M_SHELF)
for dx in (-0.37, 0.37):
    for dy in (-0.62, 0.62):
        box("cart_leg", (tx + dx, ty + dy, 0.35), (0.03, 0.03, 0.6), M_SHELF)
box("cart_handle", (tx, ty - 0.62, 0.95), (0.7, 0.03, 0.03), M_SHELF)
z = 0.57
for i in range(4):
    h = random.uniform(0.18, 0.3)
    o = box("cart_box", (tx + random.uniform(-0.05, 0.05), ty + random.uniform(-0.1, 0.1), z + h / 2),
            (0.55, 0.75, h), random.choice(M_BOXES))
    o.rotation_euler.z = random.uniform(-0.15, 0.15)
    z += h

# 書架に立てかけた梯子
lg = bpy.data.collections.new("ladder")
scene.collection.children.link(lg)
lx, ly = -W / 2 + 0.9, 14.0
parts = []
for dy in (-0.25, 0.25):
    parts.append(box("rail", (0, dy, 1.9), (0.05, 0.05, 3.8), M_SHELF))
for k in range(10):
    parts.append(box("rung", (0, 0, 0.3 + k * 0.36), (0.04, 0.5, 0.03), M_SHELF))
bpy.ops.object.empty_add(location=(lx, ly, 0))
pivot = bpy.context.object
for p in parts:
    p.parent = pivot
pivot.rotation_euler.y = math.radians(-12)

# ── 空気中の塵（ボリューム） ─────────────────────────────
world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes["Background"].inputs["Color"].default_value = (0.005, 0.005, 0.01, 1)
vol = nt.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Density"].default_value = 0.035
vol.inputs["Anisotropy"].default_value = 0.4
nt.links.new(vol.outputs[0], nt.nodes["World Output"].inputs["Volume"])

# ── カメラ ──────────────────────────────────────────────
bpy.ops.object.camera_add(location=(-0.6, -1.5, 1.7), rotation=(math.radians(84), 0, math.radians(-8)))
cam = bpy.context.object
cam.data.lens = LENS
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = 9
cam.data.dof.aperture_fstop = 2.8
scene.camera = cam

# ── レンダー設定 ─────────────────────────────────────────
r = scene.render
r.resolution_x, r.resolution_y = RES
r.filepath = OUT
r.image_settings.file_format = "JPEG" if OUT.lower().endswith(".jpg") else "PNG"
if OUT.lower().endswith(".jpg"):
    r.image_settings.quality = 82
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
r.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
ee = scene.eevee
for attr, val in [("taa_render_samples", 64), ("use_shadows", True), ("volumetric_tile_size", "4"),
                  ("volumetric_samples", 96), ("use_raytracing", True), ("volumetric_end", 40.0)]:
    if hasattr(ee, attr):
        try:
            setattr(ee, attr, val)
        except Exception as e:
            print("skip", attr, e)
scene.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.3

print("ENGINE", r.engine)
bpy.ops.render.render(write_still=True)
print("WROTE", OUT)

