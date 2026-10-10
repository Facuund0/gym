# Investigación: app de gimnasio con corrección de técnica por cámara

_GymClaud (app) · GymRun (gimnasio) · octubre 2026_

Este documento resume la investigación que fundamenta las decisiones técnicas del proyecto. Está pensado para que cualquier persona (o Claude Code) entienda **por qué** la app está construida así antes de cambiarla.

---

## 1. Resumen ejecutivo

1. **La corrección en vivo tiene que correr en el teléfono**, con un modelo de pose (MediaPipe Pose Landmarker) y **reglas biomecánicas por ejercicio**. Es gratis, funciona sin internet una vez cargado, responde en milisegundos y no saca video del dispositivo (privacidad).
2. **No existe un modelo que "sepa la técnica de todos los ejercicios posibles"**. Lo que sí existe: detectar el cuerpo con mucha precisión y medir ángulos. La "inteligencia" sobre cada ejercicio hay que darla en forma de reglas (o entrenar modelos con videos etiquetados, que hoy no tenemos).
3. **Los modelos de lenguaje con visión (Gemini) no sirven para el feedback en tiempo real**: la investigación más reciente muestra que dan consejos genéricos y a destiempo. Sí sirven para **generar reglas** de ejercicios nuevos (una vez, en texto) y para una **devolución escrita opcional** al terminar la serie.
4. **Estrategia "cubrir todos los ejercicios"** en tres capas:
   - Biblioteca curada (14 sets de reglas que cubren 31 ejercicios del seed, ampliable).
   - Gemini genera reglas para ejercicios desconocidos → se validan, se guardan y el entrenador las revisa.
   - Modo automático: si no hay reglas ni IA, la app aprende el movimiento en 2 repeticiones y al menos cuenta y detecta recorridos incompletos.
5. **Planes gratuitos**: Supabase Free y Vercel Hobby alcanzan de sobra para el volumen de un gimnasio. Técnicamente todo funciona en gratis; la única salvedad es que las condiciones de Vercel Hobby dicen "uso personal no comercial" (ver sección 6). El plan gratuito de Gemini usa los datos para mejorar los productos de Google: no mandar fotos de alumnos sin consentimiento.
6. **Notificaciones push**: Firebase Cloud Messaging funciona en Android y en iPhone, pero en iPhone **solo si el alumno instala la app en la pantalla de inicio** (PWA). La app lo explica en Perfil.

---

## 2. Detección de pose en el navegador

### Opciones evaluadas

| Opción | Puntos | Corre en | Pros | Contras |
|---|---|---|---|---|
| **MediaPipe Pose Landmarker** (Google) | 33 (incluye talón y punta del pie) + coordenadas 3D en metros | Navegador (WASM + GPU), Android, iOS | Estándar de la industria, gratis, modelos lite/full/heavy, paquete npm oficial `@mediapipe/tasks-vision` | Sin puntos en la columna; 2D sensible al ángulo de cámara |
| MoveNet (TensorFlow.js) | 17 | Navegador | Muy rápido | Sin pies ni talones → no sirve para sentadilla/peso muerto |
| YOLO-pose / RTMPose | 17 (COCO) | Servidor o ONNX en navegador | Muy preciso, multi-persona | Más pesado, sin pies, licencias a revisar |

**Decisión: MediaPipe Pose Landmarker, modelo lite**, en modo `VIDEO`, 1 persona. Los 33 puntos incluyen talones y puntas de pie (necesarios para detectar talones levantados) y el paquete web es oficial. El modelo `full` se puede activar para computadoras.

Detalles técnicos relevantes de la documentación oficial:
- Las coordenadas normalizadas (`landmarks`) están en 0..1 respecto del ancho y alto de la imagen, con visibilidad por punto; `worldLandmarks` da metros con origen en la cadera.
- `detectForVideo()` es sincrónico y bloquea el hilo principal; Google sugiere moverlo a un Web Worker si hay problemas de rendimiento (está en el roadmap).
- **Importante**: al medir ángulos con coordenadas normalizadas hay que corregir por la relación de aspecto del video (x × ancho/alto), si no los ángulos salen deformados. El motor lo hace en `resolvePoint()`.

### Limitaciones que hay que comunicar

- **No se puede medir de verdad la espalda redondeada**: no hay puntos sobre la columna. Usamos aproximaciones (cuello, línea hombro-cadera) y lo decimos.
- **La toma importa**: cada ejercicio indica si filmar de costado o de frente. Un error de rodillas hacia adentro solo se ve de frente; la profundidad de una sentadilla se ve de costado.
- **Ropa holgada, poca luz, espejos y otras personas** degradan la detección. La app pide acomodar la cámara si no ve las articulaciones necesarias.

---

## 3. ¿Cómo "sabe" la app si la técnica está bien?

### Tres enfoques posibles

1. **Reglas biomecánicas** (lo que implementamos): ángulos, inclinaciones y distancias con umbrales, más una máquina de estados para contar repeticiones y detectar la fase (arriba, bajando, abajo, subiendo). Es transparente (el entrenador puede leer y ajustar cada número), barato y funciona con pocos ejercicios bien hechos.
2. **Modelos entrenados con videos etiquetados** (clasificadores sobre los landmarks o redes de grafos espacio-temporales). Más robustos, pero necesitan cientos de videos por ejercicio con errores marcados.
3. **Modelos de visión-lenguaje** (Gemini, GPT, etc.) mirando el video.

### Qué dice la investigación reciente

- **QEVD (Qualcomm, 2024)**: dataset de más de 470 horas, ~148 ejercicios y un benchmark de coaching en vivo. Su conclusión central: los modelos de visión-lenguaje actuales dan **feedback repetitivo, genérico y a destiempo** cuando se los usa como entrenador en vivo; incluso su mejor modelo especializado queda lejos de ser confiable. El acuerdo de los participantes permite uso comercial, pero el paper tiene licencia CC BY-NC-ND.
- **FLEX (2025)**: 20 ejercicios con carga, 5 cámaras, pose 3D y electromiografía, con errores y correcciones anotados. Mostró que agregar una segunda vista de cámara mejora notablemente la evaluación, y que un modelo de visión-lenguaje ajustado mejora el texto pero no la precisión del puntaje. Licencia solo académica no comercial.
- **Fitness-AQA (ECCV 2022)**: sentadilla, remo con barra y press militar "en la vida real" con 7 tipos de errores. Útil para validar nuestras reglas de esos tres ejercicios.
- **M3GYM (CVPR 2025)**: 82 sesiones, 8 cámaras, 502 acciones (gimnasio, pilates, yoga) con evaluación experta "bien/mal" y texto de mejora.
- **Ejercicios isométricos (arXiv 2025)**: 3.600 clips de 6 posturas con variantes correctas e incorrectas, con métrica de localización del error.

**Conclusión práctica**: para un gimnasio, hoy lo que funciona es pose en el dispositivo + reglas, y usar la IA generativa fuera del bucle de tiempo real. Los datasets académicos sirven como referencia y para validar, pero casi todos tienen licencias no comerciales.

### Principios de diseño de las reglas (en `src/lib/pose/library`)

- **Tolerancia antes que precisión**: un falso positivo ("¡pecho arriba!" cuando estaba bien) destruye la confianza del alumno. Los umbrales son conservadores y cada error tiene que sostenerse un tiempo mínimo (`hold_ms`) antes de avisar.
- **Nada de mitos**: no se marca "la rodilla pasa la punta del pie" como error.
- **Una consigna por vez**, con prioridad por gravedad y con pausas entre avisos (`CueGate`).
- **Profundidad y extensión** se evalúan por repetición (`target_end`, `target_start`), no por cuadro.
- **Suavizado One Euro** de los puntos para sacar el temblor sin agregar retraso.

---

## 4. Gemini (API gratuita) — dónde sí y dónde no

### Estado del plan gratuito (octubre 2026)

- Modelos con nivel gratuito según la página oficial de precios: **Gemini 3.8 Flash** (`gemini-3.8-flash`, el recomendado para proyectos nuevos), 3.6 Flash, **3.5 Flash-Lite** (`gemini-3.5-flash-lite`), 3.1 Flash-Lite, 3 Flash Preview y modelos Live. Los modelos Pro y los de generación de imágenes son solo pagos.
- Los límites por minuto/día **ya no se publican en una tabla fija**: se ven por proyecto en Google AI Studio y se aplican por proyecto (no por clave). Las cuotas diarias se reinician a medianoche hora del Pacífico. Hubo recortes fuertes del plan gratuito en diciembre de 2025.
- **El contenido enviado en el plan gratuito se usa para mejorar los productos de Google** (en el plan pago no). Además, apps que atiendan usuarios del Espacio Económico Europeo, Suiza o Reino Unido solo pueden usar el plan pago.

### Cómo lo usa la app

| Uso | Cuándo | Qué se envía | Límite por defecto |
|---|---|---|---|
| Generar reglas de un ejercicio nuevo | La primera vez que alguien abre la cámara con un ejercicio sin reglas, o cuando el coach lo pide | Solo texto: nombre y descripción | 30/día coach, 5/día alumno |
| Devolución escrita de una serie | Al terminar, si el alumno lo aceptó explícitamente | 3-4 fotos chicas (384 px) + resumen numérico | 10/día |

- Las reglas generadas se **validan con un esquema** (zod); si fallan, se le pide a Gemini que corrija una vez. Se guardan en `exercises.pose_rules` con `rules_source = 'gemini'` y `rules_reviewed = false` hasta que el entrenador las revisa.
- Si el modelo principal da error de cuota (429) o no está disponible, se reintenta con el modelo de respaldo (Flash-Lite). Si todo falla, la app usa el **modo automático**.
- Los nombres de modelo se configuran por variable de entorno (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`) porque Google los retira seguido (por ejemplo, 2.0 Flash se apagó en junio de 2026).

---

## 5. Notificaciones push con Firebase

- **Android (Chrome)**: funciona en navegador y app instalada.
- **iPhone/iPad (Safari)**: Firebase Cloud Messaging soporta Safari desde 2023, pero Apple exige que la web app esté **agregada a la pantalla de inicio**; en una pestaña común no hay push. El permiso además tiene que pedirse **desde un toque del usuario** (botón), nunca al cargar la página. Las suscripciones del navegador y de la app instalada son independientes.
- Implementación: service worker propio (`public/sw.js`) que muestra las notificaciones y abre la pantalla correcta al tocarlas; los tokens se guardan en `push_tokens` y el servidor envía con `firebase-admin` (limpia tokens vencidos automáticamente).
- Disparadores implementados: nueva novedad publicada (a todos) y programa activado (al alumno). Se pueden agregar recordatorios con tareas programadas (ver roadmap).

---

## 6. Infraestructura y costos

| Servicio | Plan gratuito | Ojo con |
|---|---|---|
| **Supabase** | 500 MB de base, 1 GB de archivos, 50.000 usuarios activos/mes, 5 GB de transferencia, 2 proyectos | **Pausa el proyecto tras 1 semana sin actividad** (para producción conviene Pro, USD 25/mes). |
| **Vercel** | Hobby: 1M invocaciones, 100 GB de transferencia, funciones de hasta 300 s | Las condiciones dicen uso personal no comercial. Funciona igual; ver nota abajo. |
| **Firebase Cloud Messaging** | Gratis | — |
| **Gemini API** | Gratis con límites por proyecto | Uso de datos para mejorar productos (ver sección 4). |
| **MediaPipe** | Gratis, corre en el dispositivo | El modelo (~5 MB) y el WASM se bajan de CDN de Google/jsDelivr; se pueden alojar en `/public` para no depender de terceros. |

**Sobre Vercel gratis (Hobby)**: la app anda perfecto en Hobby y el consumo de un gimnasio queda muy lejos de los límites (la cámara y la planilla corren en el teléfono, no en Vercel). Lo único es que sus condiciones de uso reservan Hobby para proyectos personales no comerciales. Para arrancar, probar con alumnos o como proyecto de estudio no hay problema. Si más adelante la app pasa a ser parte del negocio (por ejemplo, cobrar por usarla), lo prolijo es pasar a Pro o mudarla a un hosting gratuito que sí permita uso comercial; el código no cambia.

El volumen de datos de un gimnasio (rutinas, series, resúmenes de técnica sin video) es chico: miles de alumnos entran cómodos en el plan gratuito de Supabase.

---

## 7. Privacidad y aspectos legales (Argentina)

- **Ley 25.326 de Protección de Datos Personales**: la imagen de una persona es un dato personal. La app **no graba ni sube video**; el análisis ocurre en el teléfono. Solo se suben resúmenes (repeticiones, puntaje, tipos de error).
- Las fotos para la devolución de IA son **opcionales y con consentimiento explícito** en cada sesión, con aviso de que el plan gratuito de Google puede usarlas.
- Datos de salud: la app no pide diagnósticos. El feedback semanal (sueño, estrés, saciedad) es sensible: solo lo ven el alumno y los entrenadores (RLS).
- Se recomienda agregar términos y política de privacidad antes de abrir la app a todos los alumnos (roadmap).
- El detector es una **ayuda**, no reemplaza al entrenador; la app lo aclara en el resumen.

---

## 8. La planilla del gimnasio

Se relevó la planilla original del gimnasio (14 hojas). La app replica su modelo de datos (12 semanas × 6 días × 8 ejercicios × 5 series, las 20 categorías del contador de series, el resumen diario y el feedback semanal) y **exporta sobre el archivo original** para conservar formato, logo, menús y fórmulas.

En el relevamiento aparecieron **dos errores en la planilla original**, que la exportación corrige:
1. "Contador de series" D8 (Tracción horizontal, semana 1) tenía un **9 escrito a mano** en lugar de la fórmula.
2. La fila de **Espalda** de las semanas 2 a 12 sumaba siempre la **semana 1**.

Además, "Semanas transcurridas" daba `#VALUE!` si la fecha de inicio era futura; se envolvió con `IFERROR`.

---

## 9. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Falsos positivos que molestan | Umbrales tolerantes, `hold_ms`, una consigna por vez, calibración con videos reales |
| Reglas de IA incorrectas | Validación por esquema, marca "sin revisar", el coach las prueba y aprueba |
| Celulares viejos lentos | Modelo lite, procesamiento solo de cuadros nuevos; roadmap: Web Worker y bajar resolución |
| Cuota de Gemini agotada | Caché de reglas en la base, límites diarios, modelo de respaldo, modo automático |
| iPhone sin notificaciones | Instrucciones de instalación en Perfil; las novedades igual se ven en la app |
| Vercel Hobby pide uso no comercial | Arrancar en Hobby; si la app se vuelve parte del negocio, pasar a Pro o mudar el hosting (sin cambiar código) |
| Cambio de nombres de modelos | Variables de entorno, documentación de cómo actualizar |

---

## Fuentes

- [MediaPipe Pose Landmarker para Web (Google)](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Paquete @mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision)
- [Live Fitness Coaching as a Testbed for Situated Interaction (QEVD, arXiv 2407.08101)](https://arxiv.org/abs/2407.08101)
- [Qualcomm Exercise Video Dataset](https://www.qualcomm.com/developer/software/qevd-dataset)
- [FLEX: A Large-Scale Multi-Modal Multi-Action Dataset for Fitness AQA (arXiv 2506.03198)](https://arxiv.org/abs/2506.03198)
- [Fitness-AQA (Papers with Code)](https://paperswithcode.com/dataset/fitness-aqa)
- [M3GYM, CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/papers/Xu_M3GYM_A_Large-Scale_Multimodal_Multi-view_Multi-person_Pose_Dataset_for_Fitness_CVPR_2025_paper.pdf)
- [Real-time feedback for isometric exercises (arXiv 2506.11774)](https://arxiv.org/abs/2506.11774)
- [Gemini API: precios](https://ai.google.dev/gemini-api/docs/pricing) · [modelos](https://ai.google.dev/gemini-api/docs/models) · [límites](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Cambios de precios de Gemini API 2026 (resumen de terceros)](https://agentdeals.dev/gemini-api-pricing-changes)
- [FCM para Safari (blog de Firebase)](https://firebase.blog/posts/2023/08/fcm-for-safari)
- [Requisitos de iOS para web push (Pushpad)](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications)
- [Supabase: precios](https://supabase.com/pricing) · [Auth con Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Vercel: plan Hobby](https://vercel.com/docs/plans/hobby)
- Casiez, Roussel y Vogel (2012), _1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems_ (CHI).
