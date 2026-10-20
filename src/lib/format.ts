// Spanish numbers with a thousands dot always ("3.175", not "3175"), so figures read alike side by side.
const nf = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });
export const num = (n: number) => nf.format(n);
