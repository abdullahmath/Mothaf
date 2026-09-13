CREATE TABLE "heritage_site_media" (
	"heritage_site_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" "media_role" DEFAULT 'gallery' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "heritage_site_media_heritage_site_id_media_id_role_pk" PRIMARY KEY("heritage_site_id","media_id","role")
);
--> statement-breakpoint
CREATE TABLE "heritage_site_translations" (
	"heritage_site_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"title" text NOT NULL,
	"short_description" text,
	"description" text,
	CONSTRAINT "heritage_site_translations_heritage_site_id_locale_pk" PRIMARY KEY("heritage_site_id","locale")
);
--> statement-breakpoint
CREATE TABLE "heritage_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" uuid NOT NULL,
	"slug" varchar(120) NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"cover_media_id" uuid,
	"latitude" double precision,
	"longitude" double precision,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "heritage_sites_latitude_range" CHECK ("heritage_sites"."latitude" IS NULL OR ("heritage_sites"."latitude" BETWEEN -90 AND 90)),
	CONSTRAINT "heritage_sites_longitude_range" CHECK ("heritage_sites"."longitude" IS NULL OR ("heritage_sites"."longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
ALTER TABLE "heritage_site_media" ADD CONSTRAINT "heritage_site_media_heritage_site_id_heritage_sites_id_fk" FOREIGN KEY ("heritage_site_id") REFERENCES "public"."heritage_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heritage_site_media" ADD CONSTRAINT "heritage_site_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heritage_site_translations" ADD CONSTRAINT "heritage_site_translations_heritage_site_id_heritage_sites_id_fk" FOREIGN KEY ("heritage_site_id") REFERENCES "public"."heritage_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heritage_site_translations" ADD CONSTRAINT "heritage_site_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "heritage_sites" ADD CONSTRAINT "heritage_sites_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heritage_sites" ADD CONSTRAINT "heritage_sites_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "heritage_site_media_heritage_site_id_idx" ON "heritage_site_media" USING btree ("heritage_site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "heritage_sites_destination_slug_key" ON "heritage_sites" USING btree ("destination_id","slug");--> statement-breakpoint
CREATE INDEX "heritage_sites_destination_id_idx" ON "heritage_sites" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "heritage_sites_status_idx" ON "heritage_sites" USING btree ("status");