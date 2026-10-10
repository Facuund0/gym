"""Reemplaza el logo y los colores de la planilla Excel (public/templates/planilla.xlsx).

Uso:  python3 scripts/generate-brand.py && python3 scripts/rebrand-template.py
Edita el .xlsx a nivel ZIP (no lo abre con Excel ni con librerías), así no se pierde
ningún formato, fórmula ni validación.
"""
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "public" / "templates" / "planilla.xlsx"
IMAGES = {
    "xl/media/image1.png": ROOT / "scripts" / "brand-out" / "planilla-image1.png",
    "xl/media/image2.png": ROOT / "scripts" / "brand-out" / "planilla-image2.png",
}
# colores viejos (ARGB en styles.xml) → nuevos de GymRun
COLORS = {
    "FF9C1944": "FFC2410C",  # encabezados bordó → naranja oscuro
    "FFD95988": "FFFF6A2B",  # rosa → naranja
    "FFFFE0EA": "FFFFEBDD",  # rosa clarito → naranja clarito
}


def main() -> None:
    tmp = TEMPLATE.with_suffix(".tmp.xlsx")
    with zipfile.ZipFile(TEMPLATE) as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename in IMAGES:
                data = IMAGES[item.filename].read_bytes()
            elif item.filename == "xl/styles.xml":
                text = data.decode("utf-8")
                for old, new in COLORS.items():
                    text = text.replace(old, new).replace(old.lower(), new)
                data = text.encode("utf-8")
            dst.writestr(item, data)
    shutil.move(tmp, TEMPLATE)
    print(f"Plantilla actualizada: {TEMPLATE}")


if __name__ == "__main__":
    main()
