CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`frontmatter` text DEFAULT '{}' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`content_preview` text DEFAULT '' NOT NULL,
	`mime_type` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`content_hash` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nodes_path_unique` ON `nodes` (`path`);--> statement-breakpoint
CREATE TABLE `pastes` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`language` text,
	`created_at` integer NOT NULL
);
