export type RouteMode = 'pd' | 'mt';

/** Yandex Maps route from the current location (empty first rtext point) to the target. */
export const yandexRouteUrl = (lat: number, lon: number, mode: RouteMode): string =>
  `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=${mode}`;
