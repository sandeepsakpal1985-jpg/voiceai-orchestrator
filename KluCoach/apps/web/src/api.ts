const API = "/api";

let csrf = "";

export type Me = {
  user: {
    id: string;
    email: string | null;
    firstName: string;
    lastName: string;
    role: string;
    institutionId: string | null;
  };
  institution: { id: string; name: string; type: string } | null;
  csrfToken: string | null;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (csrf && init.method && init.method !== "GET") {
    headers.set("x-csrf-token", csrf);
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401) {
    const publicAuth =
      path.startsWith("/auth/login") ||
      path.startsWith("/auth/invitations/accept") ||
      path.startsWith("/auth/password-reset/");
    if (!publicAuth) window.location.href = "/login";
    throw new Error(data?.error?.message ?? "Unauthorized");
  }
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  }
  if (data?.csrfToken) csrf = data.csrfToken;
  return data as T;
}

export function setCsrf(token: string) {
  csrf = token;
}

export const auth = {
  login: (email: string, password: string) =>
    api<{ user: Me["user"]; csrfToken: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => api("/auth/logout", { method: "POST" }),
  me: () => api<Me>("/me"),
  requestPasswordReset: (email: string) =>
    api<{ message: string }>("/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  completePasswordReset: (token: string, password: string) =>
    api<{ ok: boolean }>("/auth/password-reset/complete", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  acceptInvite: (token: string, password: string, firstName: string, lastName: string) =>
    api("/auth/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token, password, firstName, lastName }),
    }),
};
