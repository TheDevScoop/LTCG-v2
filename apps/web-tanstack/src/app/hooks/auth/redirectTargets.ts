export function buildAuthRedirectTarget(location: {
  pathname: string;
  search?: string;
  hash?: string;
}) {
  return `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
}

export function shouldClearStoredRedirect({
  storedRedirect,
  currentTarget,
  needsOnboarding,
}: {
  storedRedirect: string | null;
  currentTarget: string;
  needsOnboarding: boolean;
}) {
  return Boolean(storedRedirect && storedRedirect === currentTarget && !needsOnboarding);
}
