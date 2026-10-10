"""Genera supabase/seed.sql con la biblioteca inicial de ejercicios.

Uso:  python3 scripts/generate-seed.py
Editá la lista EX y volvé a correrlo. El slug se calcula igual que src/lib/slug.ts.
"""
import re
import unicodedata
from pathlib import Path


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:80]


# (nombre, categoría de la planilla, rule_key curada o None, equipamiento, consignas)
EX = [
    ("Sentadilla con barra", "Cambio de nivel rodilla", "squat", "Barra", ["Pies al ancho de hombros", "Rodillas en línea con los pies", "Pecho arriba, bajá controlado"]),
    ("Sentadilla goblet", "Cambio de nivel rodilla", "squat", "Mancuerna o kettlebell", ["Peso pegado al pecho", "Codos entre las rodillas abajo"]),
    ("Sentadilla frontal", "Cambio de nivel rodilla", "squat", "Barra", ["Codos altos", "Torso bien vertical"]),
    ("Sentadilla búlgara", "Cambio de nivel rodilla", "lunge", "Mancuernas y banco", ["Pie de atrás apoyado en el banco", "Bajá vertical, rodilla de atrás hacia el piso"]),
    ("Estocada hacia atrás", "Cambio de nivel rodilla", "lunge", "Mancuernas", ["Paso largo hacia atrás", "Torso erguido"]),
    ("Estocada caminando", "Cambio de nivel rodilla", "lunge", "Mancuernas", []),
    ("Subida al cajón", "Cambio de nivel rodilla", "lunge", "Cajón", ["Empujá con la pierna de arriba"]),
    ("Prensa de piernas", "Cuádriceps", None, "Máquina", ["Zona lumbar apoyada", "No bloquees las rodillas arriba"]),
    ("Sillón de cuádriceps", "Cuádriceps", None, "Máquina", []),
    ("Peso muerto convencional", "Cambio de nivel cadera", "deadlift", "Barra", ["Barra sobre la mitad del pie", "Espalda firme, empujá el piso"]),
    ("Peso muerto rumano", "Cambio de nivel cadera", "hinge", "Barra o mancuernas", ["Cadera atrás", "Rodillas apenas flexionadas", "Barra pegada a las piernas"]),
    ("Peso muerto sumo", "Cambio de nivel cadera", "deadlift", "Barra", []),
    ("Peso muerto a una pierna", "Cambio de nivel cadera", "hinge", "Mancuerna", []),
    ("Buenos días", "Cambio de nivel cadera", "hinge", "Barra", []),
    ("Hip thrust", "Glúteo", "hip_thrust", "Barra y banco", ["Mentón al pecho", "Apretá glúteos arriba"]),
    ("Puente de glúteos", "Glúteo", "hip_thrust", "Peso corporal o barra", []),
    ("Patada de glúteo en polea", "Glúteo", None, "Polea", []),
    ("Abducción en máquina", "Abductores", None, "Máquina", []),
    ("Aducción en máquina", "Aductores", None, "Máquina", []),
    ("Curl femoral acostado", "Isquiosurales", None, "Máquina", []),
    ("Curl femoral sentado", "Isquiosurales", None, "Máquina", []),
    ("Curl nórdico", "Isquiosurales", None, "Peso corporal", []),
    ("Elevación de talones de pie", "Gemelos", None, "Máquina o mancuerna", []),
    ("Elevación de talones sentado", "Gemelos", None, "Máquina", []),
    ("Press de banca con barra", "Empuje horizontal", None, "Barra y banco", ["Escápulas juntas", "Pies firmes en el piso"]),
    ("Press de banca con mancuernas", "Empuje horizontal", None, "Mancuernas", []),
    ("Press inclinado con mancuernas", "Empuje horizontal", None, "Mancuernas", []),
    ("Flexiones de brazos", "Empuje horizontal", "pushup", "Peso corporal", ["Cuerpo en línea recta", "Codos a 45 grados"]),
    ("Fondos en paralelas", "Empuje horizontal", "dips", "Paralelas", []),
    ("Aperturas con mancuernas", "Pectoral", None, "Mancuernas", []),
    ("Cruce de poleas", "Pectoral", None, "Polea", []),
    ("Press militar con barra", "Empuje vertical", "overhead_press", "Barra", ["Glúteos y abdomen apretados", "Barra sube en línea recta"]),
    ("Press de hombros con mancuernas", "Empuje vertical", "overhead_press", "Mancuernas", []),
    ("Press Arnold", "Empuje vertical", "overhead_press", "Mancuernas", []),
    ("Elevaciones laterales", "Deltoides lateral", "lateral_raise", "Mancuernas", ["Codos apenas flexionados", "Subí hasta la altura de los hombros"]),
    ("Elevaciones laterales en polea", "Deltoides lateral", "lateral_raise", "Polea", []),
    ("Elevaciones frontales", "Deltoides anterior", None, "Mancuernas", []),
    ("Pájaros con mancuernas", "Deltoides posterior", None, "Mancuernas", []),
    ("Face pull", "Deltoides posterior", None, "Polea", []),
    ("Remo con barra", "Tracción horizontal", "row", "Barra", ["Torso inclinado y firme", "Llevá los codos hacia atrás"]),
    ("Remo con mancuerna", "Tracción horizontal", "row", "Mancuerna y banco", []),
    ("Remo en polea baja", "Tracción horizontal", None, "Polea", []),
    ("Remo en máquina", "Tracción horizontal", None, "Máquina", []),
    ("Dominadas", "Tracción vertical", "pullup", "Barra fija", ["Arrancá con brazos extendidos", "Mentón por arriba de la barra"]),
    ("Dominadas supinas", "Tracción vertical", "pullup", "Barra fija", []),
    ("Dominadas asistidas", "Tracción vertical", "pullup", "Banda o máquina", []),
    ("Jalón al pecho", "Tracción vertical", None, "Polea", ["Pecho arriba", "Llevá la barra a la parte alta del pecho"]),
    ("Pullover en polea", "Espalda", None, "Polea", []),
    ("Curl de bíceps con barra", "Bíceps", "biceps_curl", "Barra", ["Codos pegados al cuerpo", "Sin balanceo"]),
    ("Curl de bíceps con mancuernas", "Bíceps", "biceps_curl", "Mancuernas", []),
    ("Curl martillo", "Bíceps", "biceps_curl", "Mancuernas", []),
    ("Curl en banco Scott", "Bíceps", None, "Banco Scott", []),
    ("Extensión de tríceps en polea", "Tríceps", None, "Polea", ["Codos quietos al costado del cuerpo"]),
    ("Press francés", "Tríceps", None, "Barra Z", []),
    ("Extensión de tríceps sobre la cabeza", "Tríceps", None, "Mancuerna o polea", []),
    ("Fondos en banco", "Tríceps", "dips", "Banco", []),
    ("Plancha", "Abdominales", "plank", "Peso corporal", ["Codos debajo de los hombros", "Cuerpo en línea recta, apretá abdomen"]),
    ("Plancha lateral", "Abdominales", None, "Peso corporal", []),
    ("Crunch abdominal", "Abdominales", None, "Peso corporal", []),
    ("Elevación de piernas colgado", "Abdominales", None, "Barra fija", []),
    ("Rueda abdominal", "Abdominales", None, "Rueda", []),
    ("Pallof press", "Abdominales", None, "Polea o banda", []),
    ("Dead bug", "Abdominales", None, "Peso corporal", []),
    ("Swing con kettlebell", "Cambio de nivel cadera", None, "Kettlebell", ["Es una bisagra: la fuerza sale de la cadera"]),
    ("Thruster", "Cambio de nivel rodilla", None, "Barra o mancuernas", []),
    ("Burpees", "Cambio de nivel rodilla", None, "Peso corporal", []),
]


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def arr(xs: list[str]) -> str:
    return ("array[" + ",".join(q(x) for x in xs) + "]::text[]") if xs else "'{}'::text[]"


def main() -> None:
    rows = [
        f"  ({q(n)}, {q(slug(n))}, {q(c)}, {q(rk) if rk else 'null'}, {q('curated') if rk else 'null'}, true, {q(eq)}, {arr(cues)})"
        for n, c, rk, eq, cues in EX
    ]
    sql = "\n".join(
        [
            "-- Biblioteca inicial de ejercicios de GymRun (generado por scripts/generate-seed.py).",
            "-- Correr DESPUÉS de la migración (SQL Editor → pegar → Run). Es idempotente.",
            "-- rule_key apunta a las reglas curadas de src/lib/pose/library; NULL = sin detección todavía",
            "-- (la app las genera con Gemini la primera vez que alguien usa la cámara con ese ejercicio).",
            "",
            "insert into public.exercises (name, slug, category, rule_key, rules_source, rules_reviewed, equipment, cues) values",
            ",\n".join(rows),
            "on conflict (slug) do nothing;",
            "",
            "-- Para promover tu usuario a entrenador (reemplazá el mail):",
            "-- update public.profiles set role = 'coach' where id = (select id from auth.users where email = 'tu-mail@ejemplo.com');",
            "",
        ]
    )
    out = Path(__file__).resolve().parent.parent / "supabase" / "seed.sql"
    out.write_text(sql, encoding="utf-8")
    print(f"{len(EX)} ejercicios → {out}")


if __name__ == "__main__":
    main()
