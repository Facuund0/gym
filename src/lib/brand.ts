// Nombres de marca. Se pueden cambiar por variables de entorno sin tocar código.
// APP_NAME = nombre de la app (lo que ve el alumno en el celular).
// GYM_NAME = nombre del gimnasio (va en las planillas Excel exportadas).
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "GymClaud";
export const APP_SHORT_NAME = process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? "GymClaud";
export const GYM_NAME = process.env.NEXT_PUBLIC_GYM_NAME ?? "GymRun";
