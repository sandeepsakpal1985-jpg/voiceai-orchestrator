export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false
  return !!localStorage.getItem("token")
}

export function logout() {
  localStorage.removeItem("token")
  window.location.href = "/auth/login"
}
