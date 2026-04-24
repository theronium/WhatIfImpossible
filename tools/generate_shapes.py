#!/usr/bin/env python3
"""
tools/generate_shapes.py

工学的幾何構造図を docs/assets/shapes/ に一括生成する。
依存: numpy matplotlib (scipy は任意)
インストール: pip install numpy matplotlib
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import Arc, Polygon as MplPolygon, Circle
from matplotlib.collections import PatchCollection
from pathlib import Path

OUTPUT = Path(__file__).parent.parent / "docs" / "assets" / "shapes"
OUTPUT.mkdir(parents=True, exist_ok=True)

DPI = 150
FIG_SQ = (4.5, 4.5)
FIG_WIDE = (6.0, 3.5)

# 日本語フォント（なければ英語表示にフォールバック）
for font in ["Yu Gothic", "MS Gothic", "Hiragino Sans", "DejaVu Sans"]:
    plt.rcParams["font.family"] = font
    break


def save(fig, name):
    path = OUTPUT / f"{name}.png"
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white", edgecolor="none")
    plt.close(fig)
    print(f"  OK {name}.png")


def fig3d(title=""):
    fig = plt.figure(figsize=FIG_SQ)
    ax = fig.add_subplot(111, projection="3d")
    ax.set_title(title, fontsize=9, pad=4)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_zticks([])
    ax.set_xlabel(""); ax.set_ylabel(""); ax.set_zlabel("")
    return fig, ax


def fig2d(title="", figsize=FIG_SQ):
    fig, ax = plt.subplots(figsize=figsize)
    ax.set_title(title, fontsize=9, pad=4)
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


# ─────────────────────────────────────────────
# 回転体・軸対称曲面
# ─────────────────────────────────────────────

def gen_toroidal():
    fig, ax = fig3d("Toroidal (トロイダル)")
    u = np.linspace(0, 2 * np.pi, 80)
    v = np.linspace(0, 2 * np.pi, 80)
    U, V = np.meshgrid(u, v)
    R, r = 2.0, 0.7
    X = (R + r * np.cos(V)) * np.cos(U)
    Y = (R + r * np.cos(V)) * np.sin(U)
    Z = r * np.sin(V)
    ax.plot_surface(X, Y, Z, cmap="plasma", alpha=0.9, linewidth=0, antialiased=True)
    ax.view_init(elev=30, azim=45)
    save(fig, "toroidal")


def gen_ellipsoid():
    fig, ax = fig3d("Ellipsoid (楕円体)")
    u = np.linspace(0, np.pi, 60)
    v = np.linspace(0, 2 * np.pi, 80)
    U, V = np.meshgrid(u, v)
    X = 1.8 * np.sin(U) * np.cos(V)
    Y = 1.3 * np.sin(U) * np.sin(V)
    Z = 1.0 * np.cos(U)
    ax.plot_surface(X, Y, Z, cmap="viridis", alpha=0.9, linewidth=0)
    ax.view_init(elev=25, azim=30)
    save(fig, "ellipsoid")


def gen_paraboloid():
    fig, ax = fig3d("Paraboloid (放物面)")
    r = np.linspace(0, 2, 50)
    theta = np.linspace(0, 2 * np.pi, 80)
    R, T = np.meshgrid(r, theta)
    X = R * np.cos(T); Y = R * np.sin(T); Z = R ** 2
    ax.plot_surface(X, Y, Z, cmap="coolwarm", alpha=0.9, linewidth=0)
    ax.view_init(elev=30, azim=45)
    save(fig, "paraboloid")


def gen_hyperboloid():
    fig, ax = fig3d("Hyperboloid (双曲面 / 冷却塔)")
    u = np.linspace(-1.5, 1.5, 60)
    v = np.linspace(0, 2 * np.pi, 80)
    U, V = np.meshgrid(u, v)
    X = np.cosh(U) * np.cos(V)
    Y = np.cosh(U) * np.sin(V)
    Z = np.sinh(U)
    ax.plot_surface(X, Y, Z, cmap="magma", alpha=0.9, linewidth=0)
    ax.view_init(elev=20, azim=45)
    save(fig, "hyperboloid")


def gen_catenoid():
    fig, ax = fig3d("Catenoid (カテノイド / 最小曲面)")
    u = np.linspace(-1.5, 1.5, 60)
    v = np.linspace(0, 2 * np.pi, 80)
    U, V = np.meshgrid(u, v)
    X = np.cosh(U) * np.cos(V)
    Y = np.cosh(U) * np.sin(V)
    Z = U
    ax.plot_surface(X, Y, Z, cmap="copper", alpha=0.9, linewidth=0)
    ax.view_init(elev=15, azim=45)
    save(fig, "catenoid")


# ─────────────────────────────────────────────
# コーン系
# ─────────────────────────────────────────────

def gen_cone():
    fig, ax = fig3d("Cone (単円錐)")
    r = np.linspace(0, 2, 40)
    theta = np.linspace(0, 2 * np.pi, 80)
    R, T = np.meshgrid(r, theta)
    ax.plot_surface(R * np.cos(T), R * np.sin(T), -R, cmap="YlOrRd", alpha=0.9, linewidth=0)
    ax.view_init(elev=25, azim=45)
    save(fig, "cone")


def gen_double_cone():
    fig, ax = fig3d("Double Cone / Biconical (双円錐)")
    r = np.linspace(0, 2, 40)
    theta = np.linspace(0, 2 * np.pi, 80)
    R, T = np.meshgrid(r, theta)
    X = R * np.cos(T); Y = R * np.sin(T)
    ax.plot_surface(X, Y,  R, cmap="Blues", alpha=0.85, linewidth=0)
    ax.plot_surface(X, Y, -R, cmap="Blues", alpha=0.85, linewidth=0)
    ax.view_init(elev=20, azim=45)
    save(fig, "double_cone")


def gen_laval_nozzle():
    fig, ax = plt.subplots(figsize=FIG_WIDE)
    ax.set_title("De Laval Nozzle (ラバルノズル) — 断面", fontsize=9)
    t = np.linspace(-2.5, 2.5, 300)
    y = 0.4 + 0.5 * t ** 2          # converging-diverging profile
    ax.fill_between(t,  y, 3.0, color="lightsteelblue", alpha=0.5)
    ax.fill_between(t, -y, -3.0, color="lightsteelblue", alpha=0.5)
    ax.plot(t,  y, "b-", linewidth=2)
    ax.plot(t, -y, "b-", linewidth=2)
    ax.axvline(0, color="gray", linestyle="--", linewidth=0.8, alpha=0.7)
    ax.text(0.08, 2.5, "throat", fontsize=7, color="gray")
    ax.text(-2.4, 2.6, "← subsonic", fontsize=7, color="navy")
    ax.text(1.2, 2.6, "supersonic →", fontsize=7, color="darkred")
    ax.set_xlim(-2.7, 2.7); ax.set_ylim(-3.2, 3.2)
    ax.set_xticks([]); ax.set_yticks([])
    ax.set_aspect("equal")
    save(fig, "laval_nozzle")


# ─────────────────────────────────────────────
# フレネル・レンズ系
# ─────────────────────────────────────────────

def gen_fresnel():
    fig, ax = plt.subplots(figsize=FIG_WIDE)
    ax.set_title("Fresnel Lens (フレネルレンズ) — 断面概念図", fontsize=9)
    n_zones = 8
    x_max = 3.0
    zone_w = x_max / n_zones
    for i in range(n_zones):
        x0 = i * zone_w; x1 = x0 + zone_w
        slope = 0.18 * (i + 0.5)
        xs = np.linspace(x0, x1, 30)
        ys = slope * (xs - x0)
        for sign in [1, -1]:
            ax.fill_between(sign * xs, ys, 0, color="lightcyan",
                            edgecolor="steelblue", linewidth=0.8, alpha=0.85)
    for rx in np.linspace(-x_max * 0.85, x_max * 0.85, 9):
        ax.annotate("", xy=(rx, 0), xytext=(rx, 1.6),
                    arrowprops=dict(arrowstyle="->", color="orange", lw=1.0))
    ax.plot(0, -1.4, "r*", markersize=11, zorder=5)
    for rx in [-x_max * 0.6, x_max * 0.6]:
        ax.annotate("", xy=(0, -1.4), xytext=(rx, 0.05),
                    arrowprops=dict(arrowstyle="->", color="red", lw=0.8, alpha=0.5))
    ax.set_xlim(-x_max * 1.1, x_max * 1.1); ax.set_ylim(-2.0, 2.0)
    ax.set_xticks([]); ax.set_yticks([])
    ax.set_aspect("equal")
    save(fig, "fresnel")


def gen_luneburg():
    fig, ax = plt.subplots(figsize=FIG_SQ)
    ax.set_title("Luneburg Lens (ルーネベルクレンズ) — 屈折率分布", fontsize=9)
    R = 2.0; N = 300
    x = np.linspace(-R * 1.4, R * 1.4, N)
    y = np.linspace(-R * 1.2, R * 1.2, N)
    X, Y = np.meshgrid(x, y)
    r = np.sqrt(X ** 2 + Y ** 2)
    n = np.where(r <= R, np.sqrt(np.clip(2 - (r / R) ** 2, 0, 2)), 1.0)
    ax.contourf(X, Y, n, levels=60, cmap="plasma")
    ax.add_patch(Circle((0, 0), R, fill=False, color="white", linewidth=2))
    for ry in np.linspace(-R * 0.7, R * 0.7, 5):
        ax.annotate("", xy=(-R * 0.9, ry), xytext=(-R * 1.35, ry),
                    arrowprops=dict(arrowstyle="->", color="cyan", lw=1.1))
    ax.plot(R, 0, "w*", markersize=11, zorder=5)
    ax.text(R + 0.1, 0.1, "焦点", fontsize=7, color="white")
    ax.set_xticks([]); ax.set_yticks([])
    save(fig, "luneburg")


def gen_zone_plate():
    fig, ax = plt.subplots(figsize=FIG_SQ)
    ax.set_title("Fresnel Zone Plate (ゾーンプレート)", fontsize=9)
    n_zones = 10
    for i in range(n_zones, 0, -1):
        r = np.sqrt(i)
        color = "black" if i % 2 == 0 else "white"
        ax.add_patch(Circle((0, 0), r, color=color))
    ax.set_xlim(-3.5, 3.5); ax.set_ylim(-3.5, 3.5)
    ax.set_xticks([]); ax.set_yticks([])
    save(fig, "zone_plate")


# ─────────────────────────────────────────────
# らせん系
# ─────────────────────────────────────────────

def gen_helix():
    fig, ax = fig3d("Helix (単ヘリックス)")
    t = np.linspace(0, 6 * np.pi, 500)
    ax.plot(np.cos(t), np.sin(t), t / (2 * np.pi), "b-", linewidth=2)
    ax.view_init(elev=20, azim=45)
    save(fig, "helix")


def gen_double_helix():
    fig, ax = fig3d("Double Helix (二重ヘリックス)")
    t = np.linspace(0, 6 * np.pi, 500)
    Z = t / (2 * np.pi)
    ax.plot(np.cos(t),           np.sin(t),           Z, "royalblue", linewidth=2.5)
    ax.plot(np.cos(t + np.pi),   np.sin(t + np.pi),   Z, "tomato",    linewidth=2.5)
    for i in range(0, len(t), 28):
        ax.plot([np.cos(t[i]), np.cos(t[i] + np.pi)],
                [np.sin(t[i]), np.sin(t[i] + np.pi)],
                [Z[i], Z[i]], "gray", linewidth=0.7, alpha=0.5)
    ax.view_init(elev=20, azim=45)
    save(fig, "double_helix")


def gen_log_spiral():
    fig, ax = fig2d("Logarithmic Spiral (対数螺旋)")
    theta = np.linspace(0, 5 * np.pi, 1000)
    r = 0.08 * np.exp(0.2 * theta)
    ax.plot(r * np.cos(theta), r * np.sin(theta), "b-", linewidth=2)
    ax.axis("on"); ax.set_xticks([]); ax.set_yticks([])
    save(fig, "log_spiral")


def gen_archimedes_spiral():
    fig, ax = fig2d("Archimedes Spiral (アルキメデス螺旋)")
    theta = np.linspace(0, 6 * np.pi, 1000)
    r = 0.1 * theta
    ax.plot(r * np.cos(theta), r * np.sin(theta), "g-", linewidth=2)
    ax.axis("on"); ax.set_xticks([]); ax.set_yticks([])
    save(fig, "archimedes_spiral")


def gen_clothoid():
    fig, ax = fig2d("Clothoid / Cornu Spiral (クロソイド)")
    # Fresnel integrals via numerical integration (scipy 不要)
    t = np.linspace(-6, 6, 4000)
    dt = t[1] - t[0]
    phase = np.pi / 2 * t ** 2
    C = np.cumsum(np.cos(phase)) * dt
    S = np.cumsum(np.sin(phase)) * dt
    ax.plot(C, S, color="purple", linewidth=2)
    ax.axis("on"); ax.set_xticks([]); ax.set_yticks([])
    save(fig, "clothoid")


# ─────────────────────────────────────────────
# 最小曲面
# ─────────────────────────────────────────────

def gen_gyroid():
    fig, ax = plt.subplots(figsize=FIG_SQ)
    ax.set_title("Gyroid (ジャイロイド) — z=0 断面", fontsize=9)
    N = 400
    x = np.linspace(0, 4 * np.pi, N)
    y = np.linspace(0, 4 * np.pi, N)
    X, Y = np.meshgrid(x, y)
    F = np.cos(X) * np.sin(Y) + np.cos(Y) * np.sin(0) + np.cos(0) * np.sin(X)
    ax.contourf(X, Y, F, levels=60, cmap="RdBu_r")
    ax.contour(X, Y, F, levels=[0], colors="white", linewidths=1.5)
    ax.set_xticks([]); ax.set_yticks([])
    save(fig, "gyroid")


def gen_schwartz_p():
    fig, ax = plt.subplots(figsize=FIG_SQ)
    ax.set_title("Schwartz P Surface — z=0 断面", fontsize=9)
    N = 400
    x = np.linspace(0, 4 * np.pi, N)
    y = np.linspace(0, 4 * np.pi, N)
    X, Y = np.meshgrid(x, y)
    F = np.cos(X) + np.cos(Y) + np.cos(0)
    ax.contourf(X, Y, F, levels=60, cmap="PuOr")
    ax.contour(X, Y, F, levels=[0], colors="white", linewidths=1.5)
    ax.set_xticks([]); ax.set_yticks([])
    save(fig, "schwartz_p")


# ─────────────────────────────────────────────
# フラクタル
# ─────────────────────────────────────────────

def gen_fractal_tree():
    fig, ax = fig2d("Fractal Branching (フラクタル分岐)")

    def branch(x, y, angle, length, depth):
        if depth == 0 or length < 0.005:
            return
        x2 = x + length * np.sin(angle)
        y2 = y + length * np.cos(angle)
        ax.plot([x, x2], [y, y2], "-",
                color=plt.cm.YlGn(depth / 9),
                linewidth=max(0.3, depth * 0.45))
        branch(x2, y2, angle - 0.42, length * 0.68, depth - 1)
        branch(x2, y2, angle + 0.42, length * 0.68, depth - 1)

    branch(0, -1.5, 0, 1.1, 9)
    ax.set_xlim(-2.2, 2.2); ax.set_ylim(-1.8, 2.0)
    save(fig, "fractal_branching")


def gen_koch():
    fig, ax = fig2d("Koch Snowflake (コッホ曲線)")

    def subdivide(p1, p2, depth):
        if depth == 0:
            return [p1, p2]
        p1, p2 = np.array(p1), np.array(p2)
        a = p1 + (p2 - p1) / 3
        b = p1 + 2 * (p2 - p1) / 3
        c = a + np.array([
            (b - a)[0] * np.cos(np.pi / 3) - (b - a)[1] * np.sin(np.pi / 3),
            (b - a)[0] * np.sin(np.pi / 3) + (b - a)[1] * np.cos(np.pi / 3),
        ])
        pts = []
        for seg in [(p1, a), (a, c), (c, b), (b, p2)]:
            pts.extend(subdivide(*seg, depth - 1)[:-1])
        return pts + [p2]

    depth = 4
    verts = [np.array([-1.0, -0.5]), np.array([1.0, -0.5]),
             np.array([0.0, -0.5 + np.sqrt(3)])]
    pts = []
    for i in range(3):
        pts.extend(subdivide(verts[i], verts[(i + 1) % 3], depth)[:-1])
    pts.append(pts[0])
    xs, ys = zip(*pts)
    ax.fill(xs, ys, color="royalblue", alpha=0.55)
    ax.plot(xs, ys, "b-", linewidth=0.7)
    save(fig, "koch_snowflake")


# ─────────────────────────────────────────────
# 断面最適化・特殊曲線
# ─────────────────────────────────────────────

def gen_catenary():
    fig, ax = plt.subplots(figsize=FIG_WIDE)
    ax.set_title("Catenary Arch (カテナリーアーチ)", fontsize=9)
    x = np.linspace(-2, 2, 300)
    y_cat = np.cosh(x)
    y_arch = y_cat.max() - y_cat      # invert → arch
    ax.plot(x, y_arch, "navy", linewidth=2.5)
    ax.fill_between(x, y_arch, 0, alpha=0.15, color="blue")
    ax.set_xlim(-2.3, 2.3); ax.set_ylim(-0.2, 1.6)
    ax.set_aspect("equal")
    ax.set_xticks([]); ax.set_yticks([])
    save(fig, "catenary")


def gen_cycloid():
    fig, ax = plt.subplots(figsize=FIG_WIDE)
    ax.set_title("Cycloid (サイクロイド)", fontsize=9)
    t = np.linspace(0, 4 * np.pi, 600)
    x = t - np.sin(t); y = 1 - np.cos(t)
    ax.plot(x, y, "r-", linewidth=2)
    # rolling circle at t=π
    t0 = np.pi
    cx, cy = t0, 1.0
    circle = plt.Circle((cx, cy), 1.0, fill=False, color="gray",
                         linestyle="--", linewidth=1)
    ax.add_patch(circle)
    ax.axhline(0, color="gray", linewidth=0.8)
    ax.set_xlim(-0.5, 4 * np.pi + 0.5); ax.set_ylim(-0.4, 2.5)
    ax.set_xticks([]); ax.set_yticks([])
    save(fig, "cycloid")


def gen_reuleaux():
    fig, ax = fig2d("Reuleaux Triangle (ルーローの三角形)")
    verts = np.array([
        [0.0,          1.0],
        [-np.sqrt(3) / 2, -0.5],
        [ np.sqrt(3) / 2, -0.5],
    ])
    pts = []
    for i in range(3):
        center = verts[i]
        p1 = verts[(i + 1) % 3]
        p2 = verts[(i + 2) % 3]
        a1 = np.arctan2(p1[1] - center[1], p1[0] - center[0])
        a2 = np.arctan2(p2[1] - center[1], p2[0] - center[0])
        if a2 - a1 > np.pi:  a2 -= 2 * np.pi
        if a1 - a2 > np.pi:  a1 -= 2 * np.pi
        t_arc = np.linspace(a1, a2, 80)
        pts.extend(zip(center[0] + np.cos(t_arc), center[1] + np.sin(t_arc)))
    xs, ys = zip(*pts)
    ax.fill(xs, ys, alpha=0.3, color="royalblue")
    ax.plot(xs, ys, "navy", linewidth=2)
    ax.set_xlim(-1.6, 1.6); ax.set_ylim(-1.5, 1.6)
    save(fig, "reuleaux")


# ─────────────────────────────────────────────
# 多面体・格子
# ─────────────────────────────────────────────

def gen_honeycomb():
    fig, ax = fig2d("Honeycomb (ハニカム)")
    r = 0.5; h = r * np.sqrt(3)
    for row in range(-3, 4):
        for col in range(-5, 6):
            cx = col * h + (row % 2) * h / 2
            cy = row * 1.5 * r
            if abs(cx) < 2.6 and abs(cy) < 2.3:
                angles = np.linspace(0, 2 * np.pi, 7)
                hx = cx + r * 0.95 * np.cos(angles)
                hy = cy + r * 0.95 * np.sin(angles)
                ax.fill(hx, hy, color="gold", alpha=0.65,
                        edgecolor="darkorange", linewidth=0.9)
    ax.set_xlim(-2.8, 2.8); ax.set_ylim(-2.5, 2.5)
    save(fig, "honeycomb")


def gen_geodesic():
    fig, ax = fig2d("Geodesic Dome (ジオデシックドーム) — 平面投影")
    R_out, R_in = 2.0, 1.15
    n_out, n_in = 10, 5
    out_pts = [(R_out * np.cos(i * 2 * np.pi / n_out + np.pi / n_out),
                R_out * np.sin(i * 2 * np.pi / n_out + np.pi / n_out))
               for i in range(n_out)]
    in_pts  = [(R_in  * np.cos(i * 2 * np.pi / n_in),
                R_in  * np.sin(i * 2 * np.pi / n_in))
               for i in range(n_in)]
    colors = plt.cm.Blues(np.linspace(0.35, 0.8, 15))
    ci = 0
    for i in range(n_in):
        j = i * 2
        for tri in [
            [in_pts[i], out_pts[j], out_pts[(j + 1) % n_out]],
            [in_pts[i], out_pts[(j + 1) % n_out], in_pts[(i + 1) % n_in]],
            [in_pts[(i + 1) % n_in], out_pts[(j + 1) % n_out], out_pts[(j + 2) % n_out]],
        ]:
            ax.add_patch(MplPolygon(tri, closed=True,
                                    facecolor=colors[ci % len(colors)],
                                    edgecolor="navy", linewidth=0.8, alpha=0.75))
            ci += 1
    ax.add_patch(MplPolygon(in_pts, closed=True, facecolor="steelblue",
                            edgecolor="navy", linewidth=0.8, alpha=0.85))
    ax.add_patch(Circle((0, 0), R_out, fill=False, color="navy", linewidth=1.5))
    ax.set_xlim(-2.4, 2.4); ax.set_ylim(-2.4, 2.4)
    save(fig, "geodesic")


def gen_tensegrity():
    fig, ax = fig2d("Tensegrity (テンセグリティ)")
    rods = [
        (np.array([-0.9, 0.1]), np.array([0.2, 1.3])),
        (np.array([ 0.9, 0.1]), np.array([-0.2, 1.3])),
        (np.array([-0.2, -1.3]), np.array([0.9, 0.1])),
    ]
    nodes = [[-0.9, 0.1], [0.9, 0.1], [-0.2, 1.3], [0.2, 1.3], [-0.2, -1.3]]
    cables = [(0, 2), (0, 4), (1, 3), (1, 4), (2, 3), (3, 4), (0, 3), (1, 2)]
    for p1, p2 in rods:
        ax.plot([p1[0], p2[0]], [p1[1], p2[1]], "royalblue",
                linewidth=5, solid_capstyle="round", zorder=3)
    for i, j in cables:
        ax.plot([nodes[i][0], nodes[j][0]], [nodes[i][1], nodes[j][1]],
                "tomato", linestyle="--", linewidth=1.2, alpha=0.8, zorder=2)
    for n in nodes:
        ax.plot(*n, "ko", markersize=6, zorder=4)
    ax.text(-1.45, -1.55, "-- 圧縮材 (rod)",  fontsize=7, color="royalblue")
    ax.text(-1.45, -1.82, ".. 張力材 (cable)", fontsize=7, color="tomato")
    ax.set_xlim(-1.6, 1.6); ax.set_ylim(-2.0, 1.7)
    save(fig, "tensegrity")


# ─────────────────────────────────────────────
# 翼型・モノコック断面
# ─────────────────────────────────────────────

def gen_airfoil():
    fig, ax = plt.subplots(figsize=FIG_WIDE)
    ax.set_title("Airfoil NACA 2412 (翼型断面)", fontsize=9)
    x = np.linspace(0, 1, 300)

    def naca_thickness(t, c=0.12):
        return 5 * c * (0.2969 * np.sqrt(t) - 0.1260 * t
                        - 0.3516 * t**2 + 0.2843 * t**3 - 0.1015 * t**4)

    m, p = 0.02, 0.4
    yc = np.where(x < p,
                  m / p**2 * (2 * p * x - x**2),
                  m / (1 - p)**2 * (1 - 2 * p + 2 * p * x - x**2))
    yt = naca_thickness(x)
    ax.fill_between(x, yc + yt, yc - yt, color="steelblue", alpha=0.7)
    ax.plot(x, yc + yt, "b-", linewidth=1.5)
    ax.plot(x, yc - yt, "b-", linewidth=1.5)
    ax.plot(x, yc, "r--", linewidth=1.0, label="camber line")
    for ry in [-0.28, 0.28]:
        ax.annotate("", xy=(0.05, ry), xytext=(-0.18, ry),
                    arrowprops=dict(arrowstyle="->", color="gray", lw=1))
    ax.set_aspect("equal")
    ax.set_xlim(-0.25, 1.3); ax.set_ylim(-0.4, 0.45)
    ax.set_xticks([]); ax.set_yticks([])
    save(fig, "airfoil")


# ─────────────────────────────────────────────
# メイン
# ─────────────────────────────────────────────

GENERATORS = [
    ("回転体・軸対称曲面", [gen_toroidal, gen_ellipsoid, gen_paraboloid,
                           gen_hyperboloid, gen_catenoid]),
    ("コーン系",           [gen_cone, gen_double_cone, gen_laval_nozzle]),
    ("フレネル・レンズ系", [gen_fresnel, gen_zone_plate, gen_luneburg]),
    ("らせん系",           [gen_helix, gen_double_helix, gen_log_spiral,
                           gen_archimedes_spiral, gen_clothoid]),
    ("最小曲面",           [gen_gyroid, gen_schwartz_p]),
    ("フラクタル",         [gen_fractal_tree, gen_koch]),
    ("断面最適化・曲線",   [gen_catenary, gen_cycloid, gen_reuleaux]),
    ("格子・多面体",       [gen_honeycomb, gen_geodesic, gen_tensegrity]),
    ("翼型",               [gen_airfoil]),
]

if __name__ == "__main__":
    print(f"出力先: {OUTPUT}\n")
    total = ok = 0
    for category, fns in GENERATORS:
        print(f"【{category}】")
        for fn in fns:
            total += 1
            try:
                fn()
                ok += 1
            except Exception as e:
                print(f"  NG {fn.__name__}: {e}")
    print(f"\n完了: {ok}/{total} 件")
