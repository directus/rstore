CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`completed` integer NOT NULL,
	`createed_at` integer NOT NULL,
	`updated_at` integer
);
