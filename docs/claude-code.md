# Cómo seguir el proyecto con Claude Code

## Abrirlo en VS Code

1. Instalá la extensión **Claude Code** (Extensiones → buscar "Claude Code" de Anthropic).
2. `git clone https://github.com/Facuund0/gym.git` y abrí la carpeta en VS Code.
3. Tocá el ícono de Claude (la chispa arriba a la derecha del editor) e iniciá sesión con **tu cuenta de Claude** (la misma del plan Pro/Max). No hace falta API key.
4. Claude Code lee solo el `CLAUDE.md` del proyecto, así que ya sabe el stack, las reglas y dónde está cada cosa.

## Pedidos que funcionan bien

Cuanto más concreto el pedido, menos uso consume:

- "Leé `docs/roadmap.md` y hacé el ítem 4 (alojar MediaPipe localmente). Corré los tests y el build al final."
- "Agregá reglas curadas para **remo en polea baja** siguiendo la skill nuevo-ejercicio-tecnica."
- "En `ProgramEditor.tsx`, agregá un botón para duplicar un día dentro de la misma semana."
- "Tengo este error en Vercel: (pegar el log). Encontrá la causa."

Para cosas grandes, primero **modo plan** (Shift+Tab hasta "plan"): Claude explora y propone; vos aprobás antes de que toque código.

## Cuidar el uso del plan

Tu plan tiene dos límites, que son los de la captura: uno por **sesión de 5 horas** y otro **semanal**. Claude.ai y Claude Code **comparten** esos límites.

- `/usage` muestra cuánto te queda y qué está consumiendo más.
- `/clear` cuando cambiás de tarea (el historial viejo se reenvía en cada mensaje y gasta).
- `/model`: Sonnet alcanza para la mayoría de las tareas; reservá Opus para decisiones de arquitectura o bugs difíciles.
- `/compact` si una conversación larga se pone pesada.
- Si aparece la opción de seguir con créditos de API, rechazala si no querés pagar aparte. Si tenés la variable `ANTHROPIC_API_KEY` definida en tu sistema, Claude Code la usa en vez de tu plan: borrala.

Documentación oficial: [Claude Code en VS Code](https://code.claude.com/docs/en/vs-code) · [Costos y uso](https://code.claude.com/docs/en/costs) · [Claude Code con Pro/Max](https://support.claude.com/en/articles/11145838).
