# Orbit

An online markdown/Obsidian platform on Cloudflare. Stores notes as markdown in R2 with D1 indexes, renders them on the client through react-markdown (with known component tags pre-processed as markdown), and exposes everything via MCP for agent consumption.

## Language

**Vault**:
The collection of all notes stored in Orbit. Notes live in R2 (raw content) and D1 (index with path, frontmatter, tags, links). The vault tree is derived from path hierarchy.
_Avoid_: store, repo, database

**Note**:
A piece of content in the vault — markdown or code with frontmatter. Notes can be temporary (with a TTL) or permanent. Created via the web UI, API, or MCP. All content lives as first-class nodes.
_Avoid_: paste, post, snippet, entry, record, row

**TTL**:
Optional time-to-live in a note's frontmatter (`ttl: <seconds>`). Notes with a TTL are automatically cleaned up after expiry. Default is no expiry — notes persist until manually deleted. Quick-created notes default to 7 days.
_Avoid_: expires_at, expiry, lifetime

**Node**:
A row in D1 indexing a note — its path, frontmatter, tags, mime type, content preview, and R2 pointer. The vault tree is derived from path hierarchy, not parent references. All content (manual or agent-authored) lives as first-class nodes.
_Avoid_: entry, record, row, artifact record, folder node

**Artifact**:
_Avoid_: output, result, generated file, separate table

**Agent Namespace**:
The `agent/` prefix in note paths. All agent-written content lives under this boundary (e.g., `agent/teach/2024-06-15-patterns.mdx`). Auto-generated frontmatter includes `created_by: "orbit-mcp"` and `created_at`.
_Avoid_: skills/, generated/

## Editing

**CodeMirror 6**:
The editor used for all note editing. Edits markdown directly (like Obsidian) — no rich-text document model. Markdown remains the source of truth at all times.
_Avoid_: Lexical, TipTap, rich text, ProseMirror

**Live Preview**:
CM6 decorations provide styled syntax for headings, bold, italic, links, wikilinks, callouts, and frontmatter. The editor shows a styled preview of the rendered markdown without leaving edit mode — decorations overlay styled DOM on top of the underlying text.

**Toggle Mode**:
Notes use `<Activity>` (React 19.2) to toggle between read and edit views on the same route. No route change — both views are mounted, only one is visible at a time. Preserves scroll position in the read view when toggling back.

**Auto-save**:
Debounced save on content change (2s). In-flight saves are cancelled on new input, 3 retry attempts on failure. Subtle status indicator shows "Saving…" / "Saved" in the header. Navigation away is allowed — saves complete in background or are silently lost. No conflict because user notes and agent notes live under different paths.

**Read View**:
Client-side rendering via `react-markdown` with custom components for wikilinks, callouts, embedded HTML (` ```html {"live":true} `), task lists, math. Same prose styling (`@tailwindcss/typography`) as the current server-rendered view.

**Embedded HTML**:
A fenced code block with info string `html {"live":true}` — renders the block as live HTML instead of a code block. Future metadata (width, sandbox) can be added to the JSON info string.
_Avoid_: JSX tags in notes, MDX compilation, `<EmbeddedHtml>` component tags

**Published**:
Notes with `published: true` in frontmatter are still rendered server-side via the unified/remark pipeline and cached at the Cloudflare edge. The client-side renderer is not used for public pages.

**Callouts**:
Standard `> [!type]` markdown syntax. Rendered as styled blockquotes in both read and edit views.
_Avoid_: `<Callout>` JSX tags

## Agent Interface

**MCP Tools**:
The set of tools Orbit exposes via MCP for agent consumption: `vault.search`, `vault.read`, `vault.tree`, `vault.attachment`, `vault.write`. Agents write content as regular vault nodes — no separate artifact API.
_Avoid_: skills, commands, API

**Vault Search**:
Full-text search via D1 FTS5 virtual table (`nodes_fts`) indexing node titles, tags, content previews, and paths. Supports ranked results with snippets. Scalable to thousands of nodes; more complex indexing deferred.
_Avoid_: grep, SQL LIKE, external search

## Rendering

**Client-side rendering**:
Notes are rendered on the client using `react-markdown` with a set of known component tags (`<EmbeddedHtml>`, `<Callout>`, `<CodeBlock>`). These are pre-processed into markdown-compatible structures before rendering — not compiled as MDX. Wikilinks, frontmatter, GFM, and custom callouts are handled via react-markdown plugins and custom components.
_Avoid_: MDX, Sätteri, server-side rendering, Shiki

**AI-authored content**:
AI agents write content in plain markdown augmented with a small set of known component tags. These follow a predictable format and are handled as custom syntax, not JSX. The full MDX compiler (`@mdx-js/mdx`) is not used on the client.

**Published notes**:
Notes with `published: true` in frontmatter are rendered server-side (via the same unified/remark pipeline) and cached at the Cloudflare edge. The client-side renderer is not used for public pages.
_Avoid_: compiling arbitrary MDX, JSX in notes, runtime MDX evaluation

## Access

**Cloudflare Access**:
The auth gate for all private Orbit routes. No login UI — Cloudflare Zero Trust handles identity before requests reach the Worker.
_Avoid_: auth, login, session

**Published**:
A note with `published: true` in frontmatter. Publicly accessible via a shareable URL without Cloudflare Access. All other content is private.
_Avoid_: public, shared, featured

## UI

**Trees**:
`@pierre/trees` — open source file tree rendering library for the vault sidebar. React-based, path-first model with prepared input support.
_Avoid_: custom file tree, recursive components

**Opt-in Components**:
React components are added individually per user direction, not scaffolded wholesale. Default to server-rendered HTML; React hydration is explicit.
_Avoid_: client components, use client, React everything

## Design

**Theme**:
Always light mode. No dark toggle, no system preference detection. Remove dark mode CSS vars. Shiki uses one-light theme.
_Avoid_: dark mode, theme toggle, system preference

**Layout**:
shadcn Sidebar component. Sidebar contains file tree + search trigger. SidebarInset wraps main content area. Collapses on mobile.
_Avoid_: custom layout, flexbox hacks

**Icons**:
Lucide for all icons — file types (FileText, Folder, FileImage), UI controls, search.
_Avoid_: emoji icons, custom SVG

**Fonts**:
Space Grotesk (already in template). Keep as-is.
_Avoid_: font changes, additional fonts

**Errors**:
Minimal styled 404/500 pages. No elaborate error UI.
_Avoid_: verbose error pages, error boundaries

## Architecture

**Server Infrastructure**:
`src/server/` holds all backend infrastructure: Effect services (Database, R2, Search), app-layer composition, managed runtime, and structured JSON logger. Services use `Context.Service` + `Layer` patterns. Domain-agnostic — no business logic here.
_Avoid_: putting infrastructure in src/lib/, mixing domain logic into server/

**Features**:
Each domain (vault, render, mcp) lives in `src/features/<name>/` with a `lib/` subdirectory for service logic (types, errors, service implementation). Components live at the feature root or in `components/`. One flat features directory — no nesting beyond the feature name.
_Avoid_: src/domains/, src/services/, feature directories without lib/

**Shared Utilities**:
`src/lib/` holds only client-side shared utilities (cn, error helpers). No services, no infrastructure.
_Avoid_: putting services in src/lib/

## Vault Conventions

Agents creating notes MUST follow these conventions:

**Path Structure**:
Notes live under `notes/` with a PARA-inspired hierarchy. Subfolders use slugified names (`Software Engineering` → `software-engineering`).

| Path                                | Purpose                                      |
| ----------------------------------- | -------------------------------------------- |
| `notes/projects/`                   | Active projects with deadlines               |
| `notes/areas/`                      | Ongoing responsibilities (learning, fitness) |
| `notes/resources/`                  | Reference material, literature, bookmarks    |
| `notes/fleeting/`                   | Quick captures, raw ideas                    |
| `notes/daily/YYYY/MM/YYYY-MM-DD.md` | Daily journal entries                        |
| `notes/mocs/`                       | Maps of Contents linking related notes       |

**Frontmatter Schema**:
Every note MUST include:

- `tags: string[]` — role tag + domain tags
- `created_at: string` — `YYYY-MM-DD` or `YYYY-MM-DD HH:MM`

Optional: `source` (URL), `difficulty` (easy/medium/hard), `published` (boolean).

**Tag Taxonomy**:

- Role: `project`, `area`, `resource`, `fleeting`, `daily`, `moc`
- Domain: `software-engineering`, `motorsports`, `workout`, `language-learning`, `literature`, `leetcode`, `islam`
- Content: `bookmark`, `book`, `post`, `tips`

**Content Rules**:

- `[[Note Title]]` — wikilinks for internal references
- `> [!type]` — callouts (tip, warning, quote)
- `![[image.png]]` — image embeds
- `- [ ]` / `- [x]` — checklists
