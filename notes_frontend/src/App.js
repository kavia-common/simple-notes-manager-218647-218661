import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import { createNote, deleteNote, listNotes, updateNote } from "./api/notesApi";
import { useDebouncedEffect } from "./hooks/useDebouncedEffect";

function toSafeString(value) {
  return value == null ? "" : String(value);
}

function formatUpdatedAt(note) {
  const raw = note?.updatedAt || note?.updated_at || note?.modifiedAt || note?.modified_at;
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return toSafeString(raw);
  return d.toLocaleString();
}

function normalizeNote(note) {
  // Be tolerant of backend naming.
  const id = note?.id ?? note?._id ?? note?.noteId ?? note?.note_id;
  return {
    id,
    title: toSafeString(note?.title || "").trim(),
    content: toSafeString(note?.content || ""),
    updatedAt: note?.updatedAt ?? note?.updated_at ?? note?.modifiedAt ?? note?.modified_at ?? null,
    raw: note,
  };
}

function buildPayload(draft) {
  return {
    title: toSafeString(draft.title).trim(),
    content: toSafeString(draft.content),
  };
}

// PUBLIC_INTERFACE
function App() {
  /** Main entrypoint for the Notes UI. */
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const [query, setQuery] = useState("");

  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutating, setMutating] = useState(false);

  const [error, setError] = useState("");

  const activeNote = useMemo(() => notes.find((n) => n.id === activeId) || null, [notes, activeId]);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;

    return notes.filter((n) => {
      return (
        (n.title || "").toLowerCase().includes(q) ||
        (n.content || "").toLowerCase().includes(q)
      );
    });
  }, [notes, query]);

  async function refreshNotes({ preserveSelection } = { preserveSelection: true }) {
    setError("");
    setLoadingList(true);
    try {
      const data = await listNotes();
      const list = Array.isArray(data) ? data : data?.notes || [];
      const normalized = list.map(normalizeNote).filter((n) => n.id != null);

      // Sort newest updated first when possible.
      normalized.sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      });

      setNotes(normalized);

      if (!preserveSelection) {
        setActiveId(normalized[0]?.id ?? null);
        return;
      }

      // If current selection disappeared, move to first.
      if (activeId != null && !normalized.some((n) => n.id === activeId)) {
        setActiveId(normalized[0]?.id ?? null);
      } else if (activeId == null) {
        setActiveId(normalized[0]?.id ?? null);
      }
    } catch (e) {
      setError(e?.message || "Failed to load notes.");
    } finally {
      setLoadingList(false);
    }
  }

  // Initial load
  useEffect(() => {
    refreshNotes({ preserveSelection: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep draft in sync when selection changes.
  useEffect(() => {
    if (!activeNote) {
      setDraftTitle("");
      setDraftContent("");
      return;
    }
    setDraftTitle(activeNote.title || "");
    setDraftContent(activeNote.content || "");
  }, [activeNote?.id]); // intentionally tied to note identity

  async function handleCreate() {
    setError("");
    setMutating(true);
    try {
      const created = await createNote({ title: "Untitled", content: "" });
      const createdNorm = normalizeNote(created);

      // If backend returns only id, refresh from server; otherwise optimistic insert.
      if (createdNorm.id == null) {
        await refreshNotes({ preserveSelection: false });
      } else {
        setNotes((prev) => [createdNorm, ...prev.filter((n) => n.id !== createdNorm.id)]);
        setActiveId(createdNorm.id);
      }
    } catch (e) {
      setError(e?.message || "Failed to create note.");
    } finally {
      setMutating(false);
    }
  }

  async function handleDeleteActive() {
    if (!activeNote) return;

    setError("");
    setMutating(true);
    try {
      await deleteNote(activeNote.id);

      setNotes((prev) => prev.filter((n) => n.id !== activeNote.id));

      // Pick next note
      const remaining = notes.filter((n) => n.id !== activeNote.id);
      setActiveId(remaining[0]?.id ?? null);
    } catch (e) {
      setError(e?.message || "Failed to delete note.");
    } finally {
      setMutating(false);
    }
  }

  // Autosave title/content with debounce when editing active note.
  useDebouncedEffect(
    async () => {
      if (!activeNote) return;

      const payload = buildPayload({ title: draftTitle, content: draftContent });

      // Avoid unnecessary saves if nothing changed.
      const currentPayload = buildPayload({ title: activeNote.title, content: activeNote.content });
      if (payload.title === currentPayload.title && payload.content === currentPayload.content) return;

      setError("");
      setSaving(true);
      try {
        const updated = await updateNote(activeNote.id, payload);
        const updatedNorm = normalizeNote(updated);

        setNotes((prev) => {
          // If backend doesn't return the whole object, still reflect local changes.
          const merged = {
            ...activeNote,
            ...payload,
            ...(updatedNorm.id != null ? updatedNorm : {}),
            updatedAt: updatedNorm.updatedAt || new Date().toISOString(),
          };

          const next = prev.map((n) => (n.id === activeNote.id ? merged : n));
          // keep most-recent at top by stable re-sort
          next.sort((a, b) => {
            const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return tb - ta;
          });
          return next;
        });
      } catch (e) {
        setError(e?.message || "Failed to save changes.");
      } finally {
        setSaving(false);
      }
    },
    [activeNote?.id, draftTitle, draftContent],
    650
  );

  const canEdit = !!activeNote && !loadingList;
  const apiBaseLabel = process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "(same-origin)";

  return (
    <div className="App">
      <div className="shell">
        <header className="header">
          <div className="header-inner">
            <div className="brand" aria-label="Application header">
              <h1 className="brand-title">Retro Notes</h1>
              <span className="brand-badge">vhs://mem</span>
            </div>

            <div className="header-right">
              <span className="pill" title="API base URL">
                API: {apiBaseLabel}
              </span>
              <button className="btn btn-primary" onClick={handleCreate} disabled={mutating}>
                + New note
              </button>
            </div>
          </div>
        </header>

        <main className="main" aria-label="Notes workspace">
          {/* Sidebar */}
          <section className="card sidebar" aria-label="Notes list">
            <div className="sidebar-top">
              <div className="sidebar-actions">
                <div>
                  <div className="pill" title="Notes count">
                    {loadingList ? "Loading…" : `${notes.length} note${notes.length === 1 ? "" : "s"}`}
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => refreshNotes({ preserveSelection: true })}
                  disabled={loadingList || mutating}
                  aria-label="Refresh notes"
                >
                  Refresh
                </button>
              </div>

              <div className="search">
                <label className="sr-only" htmlFor="search">
                  Search notes
                </label>
                <input
                  id="search"
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title or content…"
                />
              </div>

              {error ? <div className="alert" role="alert">{error}</div> : null}
            </div>

            <div className="list" role="listbox" aria-label="Notes">
              {loadingList ? (
                <div className="note-item skeleton">Loading notes from the server…</div>
              ) : filteredNotes.length === 0 ? (
                <div className="note-item skeleton">
                  {query.trim() ? "No matches." : "No notes yet. Create one!"}
                </div>
              ) : (
                filteredNotes.map((n) => (
                  <button
                    key={String(n.id)}
                    className={`note-item ${n.id === activeId ? "note-item-active" : ""}`}
                    onClick={() => setActiveId(n.id)}
                    role="option"
                    aria-selected={n.id === activeId}
                  >
                    <p className="note-title">{n.title || "Untitled"}</p>
                    <p className="note-preview">{(n.content || "").trim() || "Empty note…"}</p>
                    <p className="note-meta">updated: {formatUpdatedAt(n)}</p>
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Editor */}
          <section className="card editor" aria-label="Note editor">
            <div className="editor-top">
              <p className="editor-title">
                {activeNote ? `editing://note/${activeNote.id}` : "no://selection"}
              </p>
              <div className="editor-actions">
                <span className="pill" aria-live="polite">
                  {saving ? "Saving…" : activeNote ? "Saved" : "—"}
                </span>
                <button
                  className="btn btn-danger"
                  onClick={handleDeleteActive}
                  disabled={!activeNote || mutating}
                  aria-label="Delete note"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="editor-body">
              <label className="sr-only" htmlFor="title">
                Note title
              </label>
              <input
                id="title"
                className="input"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Title…"
                disabled={!canEdit}
              />

              <label className="sr-only" htmlFor="content">
                Note content
              </label>
              <textarea
                id="content"
                className="input textarea"
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder={activeNote ? "Write something…" : "Select a note or create a new one…"}
                disabled={!canEdit}
              />
            </div>

            <div className="statusbar" aria-label="Status bar">
              <span>
                {activeNote ? (
                  <>
                    <span className="pill">chars: {draftContent.length}</span>
                  </>
                ) : (
                  <span className="pill">tip: create a note to start</span>
                )}
              </span>
              <span className="pill">
                {mutating ? "Working…" : "Ready"}
              </span>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
