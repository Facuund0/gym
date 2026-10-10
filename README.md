# Gualda Training · app del gimnasio

PWA para que el entrenador cargue rutinas y novedades, y los alumnos registren sus entrenamientos y **corrijan la técnica con la cámara del celular en tiempo real**.

- 📋 Rutinas por semana y día (mismo modelo que la planilla del gimnasio) y descarga en la **planilla Excel original**.
- 📷 Corrección de técnica en vivo con MediaPipe (corre en el teléfono, no se graba video), voz en castellano y puntaje por repetición.
- 🤖 Gemini genera reglas para ejercicios nuevos y, si el alumno quiere, da una devolución escrita.
- 🔔 Novedades con notificaciones push (Firebase).
- 📈 Progreso: tonelaje, peso, series por músculo, historial de técnica y feedback semanal.

**Stack:** Next.js 16 · Supabase · MediaPipe Pose · Gemini API · Firebase Cloud Messaging · Tailwind · Vercel.

## Empezar

```bash
npm install
cp .env.example .env.local   # completar (ver docs/setup.md)
npm run dev
```

## Documentación

- [Puesta en marcha paso a paso](docs/setup.md)
- [Investigación y decisiones técnicas](docs/investigacion.md)
- [Motor de técnica](docs/motor-de-tecnica.md)
- [Roadmap](docs/roadmap.md)
- [Cómo seguir con Claude Code](docs/claude-code.md)

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `npm run dev:https` | Desarrollo (HTTPS para probar la cámara desde el celular) |
| `npm test` | Tests del motor de pose y de la exportación Excel |
| `npm run lint` · `npm run typecheck` | Calidad de código |
| `npm run build` | Build de producción |
