export function originMatchesRequest(origin: string | null, hostHeader: string | null, requestUrl: string): boolean {
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (hostHeader && originHost === hostHeader) return true;
  try {
    return originHost === new URL(requestUrl).host;
  } catch {
    return false;
  }
}
