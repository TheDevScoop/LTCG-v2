export function buildAuthRedirectTarget(location: {
  pathname: string;
  search?: string;
  hash?: string;
}) {
  return `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
}
