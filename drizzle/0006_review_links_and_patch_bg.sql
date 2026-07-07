ALTER TABLE "review_grid_patches" ADD COLUMN IF NOT EXISTS "bg" text;

CREATE TABLE IF NOT EXISTS "review_client_links" (
  "review_key" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "review_name" text NOT NULL DEFAULT '',
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "review_client_links_client_idx" ON "review_client_links" ("client_id");
