const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Prefer REACT_APP_API_BASE, then REACT_APP_BACKEND_URL.
 * If neither is set, default to same-origin (useful when proxying).
 */
function getApiBaseUrl() {
  const base =
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_BACKEND_URL ||
    "";
  return String(base).replace(/\/+$/, "");
}

function buildUrl(path) {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(buildUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

    if (!res.ok) {
      const message =
        (body && typeof body === "object" && (body.message || body.error)) ||
        (typeof body === "string" && body) ||
        `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    return body;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Note shape expected by UI:
 * { id: string|number, title: string, content: string, updatedAt?: string }
 *
 * Backend endpoint conventions used:
 * GET    /notes
 * POST   /notes               body: { title, content }
 * PUT    /notes/:id           body: { title, content }
 * DELETE /notes/:id
 */

// PUBLIC_INTERFACE
export async function listNotes() {
  /** Fetch all notes. */
  return fetchJson("/notes", { method: "GET" });
}

// PUBLIC_INTERFACE
export async function createNote(note) {
  /** Create a note with {title, content}. */
  return fetchJson("/notes", { method: "POST", body: JSON.stringify(note) });
}

// PUBLIC_INTERFACE
export async function updateNote(id, note) {
  /** Update note by id with {title, content}. */
  return fetchJson(`/notes/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(note),
  });
}

// PUBLIC_INTERFACE
export async function deleteNote(id) {
  /** Delete note by id. */
  return fetchJson(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
}
