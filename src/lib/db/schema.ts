import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
  title: text("title").notNull().default(""),
  frontmatter: text("frontmatter", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  tags: text("tags", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  contentPreview: text("content_preview").notNull().default(""),
  mimeType: text("mime_type").notNull().default(""),
  size: integer("size").notNull().default(0),
  contentHash: text("content_hash").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const pastes = sqliteTable("pastes", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  language: text("language"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
