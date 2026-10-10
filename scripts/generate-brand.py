"""Genera los logos de la app (GymClaud) y de la planilla (GymRun).

Uso:  python3 scripts/generate-brand.py
Requiere Pillow (pip install pillow). Si querés otra tipografía, cambiá FONT_*.
Escribe:
  public/brand-icon.png, public/brand-logo.png, public/icon-{180,192,512}.png, src/app/icon.png
  scripts/brand-out/planilla-image1.png (500x500) y planilla-image2.png (2048x1024)
    → se insertan en public/templates/planilla.xlsx con scripts/rebrand-template.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
APP_NAME = "GymClaud"
GYM_NAME = "GymRun"
ORANGE = (255, 106, 43)
ORANGE_DARK = (194, 65, 12)
INK = (18, 16, 20)
WHITE = (255, 255, 255)

FONT_DIRS = ["/usr/share/fonts/truetype/google-fonts", "/usr/share/fonts/truetype/dejavu", "C:/Windows/Fonts", "/Library/Fonts"]


def font(names: list[str], size: int) -> ImageFont.FreeTypeFont:
    for d in FONT_DIRS:
        for n in names:
            p = Path(d) / n
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default(size)


BOLD_ITALIC = ["Poppins-BoldItalic.ttf", "DejaVuSans-BoldOblique.ttf", "arialbi.ttf"]
BOLD = ["Poppins-Bold.ttf", "DejaVuSans-Bold.ttf", "arialbd.ttf"]


def dumbbell(d: ImageDraw.ImageDraw, cx: float, cy: float, w: float, color) -> None:
    """Mancuerna estilizada centrada en (cx, cy) de ancho w."""
    bar_h = w * 0.07
    d.rounded_rectangle([cx - w * 0.36, cy - bar_h / 2, cx + w * 0.36, cy + bar_h / 2], radius=bar_h / 2, fill=color)
    for sign in (-1, 1):
        for i, (off, h, pw) in enumerate([(0.30, 0.42, 0.09), (0.42, 0.28, 0.07)]):
            x = cx + sign * w * off
            d.rounded_rectangle(
                [x - w * pw / 2, cy - w * h / 2, x + w * pw / 2, cy + w * h / 2], radius=w * 0.025, fill=color
            )


def speed_lines(d: ImageDraw.ImageDraw, x: float, cy: float, size: float, color) -> None:
    for i, (dy, ln) in enumerate([(-0.18, 0.55), (0, 0.8), (0.18, 0.45)]):
        y = cy + dy * size
        d.rounded_rectangle([x - ln * size, y - size * 0.035, x, y + size * 0.035], radius=size * 0.035, fill=color)


def text_center(d: ImageDraw.ImageDraw, xy, text: str, f, fill) -> None:
    box = d.textbbox((0, 0), text, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text((xy[0] - w / 2 - box[0], xy[1] - h / 2 - box[1]), text, font=f, fill=fill)


def app_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), ORANGE)
    d = ImageDraw.Draw(img)
    # degradado simple
    for y in range(size):
        t = y / size
        c = tuple(int(ORANGE[i] * (1 - t) + ORANGE_DARK[i] * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=c)
    text_center(d, (size / 2, size * 0.44), "GC", font(BOLD_ITALIC, int(size * 0.42)), WHITE)
    dumbbell(d, size / 2, size * 0.78, size * 0.62, WHITE)
    return img


def app_logo() -> Image.Image:
    w, h = 1200, 600
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w, h], radius=80, fill=INK)
    icon = app_icon(300)
    mask = Image.new("L", (300, 300), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 300, 300], radius=70, fill=255)
    img.paste(icon, (90, 150), mask)
    f = font(BOLD, 118)
    d.text((440, 190), "Gym", font=f, fill=WHITE)
    gw = d.textlength("Gym", font=f)
    d.text((440 + gw, 190), "Claud", font=f, fill=ORANGE)
    d.text((445, 375), "Entrená con técnica", font=font(BOLD, 48), fill=(170, 160, 165))
    return img


def gym_square() -> Image.Image:
    s = 500
    img = Image.new("RGB", (s, s), ORANGE)
    d = ImageDraw.Draw(img)
    speed_lines(d, s * 0.28, s * 0.5, s * 0.22, WHITE)
    text_center(d, (s * 0.62, s * 0.5), "GR", font(BOLD_ITALIC, 200), WHITE)
    return img


def gym_wide() -> Image.Image:
    w, h = 2048, 1024
    img = Image.new("RGB", (w, h), ORANGE)
    d = ImageDraw.Draw(img)
    speed_lines(d, w * 0.22, h * 0.36, h * 0.3, WHITE)
    text_center(d, (w * 0.56, h * 0.36), "GR", font(BOLD_ITALIC, 470), WHITE)
    text_center(d, (w / 2, h * 0.8), GYM_NAME.upper(), font(BOLD_ITALIC, 220), WHITE)
    return img


def main() -> None:
    pub = ROOT / "public"
    icon512 = app_icon(512)
    icon512.save(pub / "brand-icon.png")
    for s in (180, 192, 512):
        app_icon(s).convert("RGB").save(pub / f"icon-{s}.png")
    app_icon(64).save(ROOT / "src" / "app" / "icon.png")
    app_logo().save(pub / "brand-logo.png")
    out = ROOT / "scripts" / "brand-out"
    out.mkdir(exist_ok=True)
    gym_square().save(out / "planilla-image1.png")
    gym_wide().save(out / "planilla-image2.png")
    print("Logos generados")


if __name__ == "__main__":
    main()
