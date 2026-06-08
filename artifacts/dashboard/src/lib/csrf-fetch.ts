function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}

function isUnsafe(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function isSameOrigin(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
  const parsed = new URL(url, window.location.origin);
  return parsed.origin === window.location.origin;
}

export function installCsrfFetch(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = init.method ?? (input instanceof Request ? input.method : "GET");
    if (isUnsafe(method) && isSameOrigin(input)) {
      const token = readCookie("csrf_token");
      if (token) {
        const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", token);
        init = { ...init, headers };
      }
    }
    return originalFetch(input, init);
  };
}
