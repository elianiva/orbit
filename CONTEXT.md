# Orbit

A vault viewer and agent-facing document platform that renders an Obsidian vault stored on Cloudflare R2+D1 as a beautiful web UI, exposes vault contents via MCP, and serves as a pastebin and artifact store.

## Language

**Vault**:
The user's Obsidian vault — a local folder of markdown files and attachments (images, PDFs). The source of truth lives locally; Orbit indexes a copy in the cloud.
_Avoid_: store, repo, database

**Sync**:
The process of pushing vault contents from the local filesystem into Orbit's cloud storage. D1 receives the vault tree (nodes with frontmatter, tags, links); R2 receives raw .md files and attachments. Source of truth remains local.
_Avoid_: upload, deploy, push

**Artifact**:
_Avoid_: output, result, generated file, separate table

**Agent Namespace**:
The `agent/` prefix in vault paths. All agent-written content lives under this boundary (e.g., `agent/teach/2024-06-15-patterns.mdx`). Auto-generated frontmatter includes `created_by: "orbit-mcp"` and `created_at`.
_Avoid_: skills/, generated/

**Paste**:
A quick publish — raw content (markdown or code) with optional language annotation. Ephemeral by nature, unlike vault entries which are permanent and indexed.
_Avoid_: post, snippet, note

**Node**:
A row in D1 indexing a vault file — its path, title, frontmatter, tags, mime type, content preview, and R2 pointer. The vault tree is derived from path hierarchy, not parent references. All content (manual or agent-authored) lives as first-class nodes.
_Avoid_: entry, record, row, artifact record, folder node

## Agent Interface

**MCP Tools**:
The set of tools Orbit exposes via MCP for agent consumption: `vault.search`, `vault.read`, `vault.tree`, `vault.attachment`, `vault.write`, `paste.create`, `paste.read`. Agents write content as regular vault nodes — no separate artifact API.
_Avoid_: skills, commands, API

**Vault Search**:
Full-text search via D1 FTS5 virtual table (`nodes_fts`) indexing node titles, tags, content previews, and paths. Supports ranked results with snippets. Scalable to thousands of nodes; more complex indexing deferred.
_Avoid_: grep, SQL LIKE, external search

## Rendering

**Sätteri**:
The Rust-powered Markdown/MDX engine used for server-side rendering. Parses markdown via native Rust, exposes JS plugin API for AST manipulation. Supports wikilinks, frontmatter, GFM, and math natively. `evaluate()` compiles MDX to React components.
_Avoid_: marked, remark, rehype, mdx-js

**Render Pipeline**:
R2 raw .md → Sätteri `markdownToHtml` (with wikilinks, frontmatter, math) → Shiki code highlighting → pre-rendered React tree served via SSR. For MDX: `evaluate()` with custom components.
_Avoid_: compile, transform, build

## Access

**Cloudflare Access**:
The auth gate for all private Orbit routes. No login UI — Cloudflare Zero Trust handles identity before requests reach the Worker.
_Avoid_: auth, login, session

**Published**:
A vault entry with `published: true` in frontmatter. Publicly accessible via a shareable URL without Cloudflare Access. All other content is private.
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

**Features**:
Each domain (vault, paste, render, mcp) lives in `src/features/<name>/` with its own service, errors, and types. Shared infrastructure (DB, R2, runtime) lives in `src/lib/`. One flat features directory — no nesting beyond the feature name.
_Avoid_: src/server/, src/domains/, src/services/
