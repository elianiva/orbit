-- FTS5 virtual table for full-text search on vault nodes
CREATE VIRTUAL TABLE `nodes_fts` USING fts5(
  `title`,
  `tags`,
  `content_preview`,
  `path`
);

-- Triggers to keep FTS5 in sync with nodes table
CREATE TRIGGER `nodes_ai` AFTER INSERT ON `nodes` BEGIN
  INSERT INTO `nodes_fts`(`rowid`, `title`, `tags`, `content_preview`, `path`)
  VALUES (new.`rowid`, new.`title`, new.`tags`, new.`content_preview`, new.`path`);
END;

CREATE TRIGGER `nodes_ad` AFTER DELETE ON `nodes` BEGIN
  DELETE FROM `nodes_fts` WHERE `rowid` = old.`rowid`;
END;


CREATE TRIGGER `nodes_au` AFTER UPDATE ON `nodes` BEGIN
  DELETE FROM `nodes_fts` WHERE `rowid` = old.`rowid`;
  INSERT INTO `nodes_fts`(`rowid`, `title`, `tags`, `content_preview`, `path`)
  VALUES (new.`rowid`, new.`title`, new.`tags`, new.`content_preview`, new.`path`);
END;
