// Nombre e identidad del gimnasio. Se pueden cambiar por variables de entorno
// sin tocar código (útil si la app se usa en otro gimnasio).
export const GYM_NAME = process.env.NEXT_PUBLIC_GYM_NAME ?? "Gualda Training";
export const GYM_SHORT_NAME = process.env.NEXT_PUBLIC_GYM_SHORT_NAME ?? "Gualda";
