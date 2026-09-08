/**
 * Route classification shared by the middleware and the layout chrome, so that
 * "is this the signed-in product?" has exactly one answer.
 */
export const APP_ROUTES = {
  start: "/start",
  today: "/today",
  goals: "/goals",
  settings: "/settings",
} as const;

const APP_PREFIXES = Object.values(APP_ROUTES);

export function isAppPath(pathname: string): boolean {
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function goalPath(goalId: string): string {
  return `${APP_ROUTES.goals}/${goalId}`;
}

export function goalReviewPath(goalId: string): string {
  return `${APP_ROUTES.goals}/${goalId}/review`;
}
