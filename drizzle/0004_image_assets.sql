CREATE TABLE "image_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"originalName" text NOT NULL,
	"mime" varchar(120) NOT NULL,
	"size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"hash" varchar(128),
	"uploadedBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "image_assets_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "image_asset_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"imageId" integer NOT NULL,
	"sourceType" varchar(40) NOT NULL,
	"sourceId" text NOT NULL,
	"sourceLabel" text,
	"field" varchar(80) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "image_asset_references_unique_ref" UNIQUE("imageId","sourceType","sourceId","field")
);
--> statement-breakpoint
CREATE INDEX "image_assets_path_idx" ON "image_assets" USING btree ("path");--> statement-breakpoint
CREATE INDEX "image_assets_hash_idx" ON "image_assets" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "image_assets_uploadedBy_idx" ON "image_assets" USING btree ("uploadedBy");--> statement-breakpoint
CREATE INDEX "image_asset_references_imageId_idx" ON "image_asset_references" USING btree ("imageId");--> statement-breakpoint
CREATE INDEX "image_asset_references_source_idx" ON "image_asset_references" USING btree ("sourceType","sourceId");--> statement-breakpoint
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_uploadedBy_users_id_fk" FOREIGN KEY ("uploadedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_asset_references" ADD CONSTRAINT "image_asset_references_imageId_image_assets_id_fk" FOREIGN KEY ("imageId") REFERENCES "public"."image_assets"("id") ON DELETE cascade ON UPDATE no action;
