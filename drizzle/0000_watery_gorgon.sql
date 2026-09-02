CREATE TYPE "public"."analytics_event" AS ENUM('tour_open', 'scene_view', 'hotspot_click', 'poi_view', 'media_play', 'locale_change', 'tour_complete');--> statement-breakpoint
CREATE TYPE "public"."device_class" AS ENUM('mobile', 'tablet', 'desktop', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."hotspot_action" AS ENUM('navigate', 'poi', 'info', 'image', 'gallery', 'video', 'audio', 'event', 'link');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'panorama', 'video', 'audio');--> statement-breakpoint
CREATE TYPE "public"."media_role" AS ENUM('gallery', 'narration', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."scene_kind" AS ENUM('panorama', 'image', 'map', 'story');--> statement-breakpoint
CREATE TYPE "public"."text_direction" AS ENUM('ltr', 'rtl');--> statement-breakpoint
CREATE TYPE "public"."tour_kind" AS ENUM('panorama', 'image', 'map', 'story');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'administrator', 'content_editor', 'event_manager', 'analyst');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "locales" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"native_name" text NOT NULL,
	"direction" text_direction DEFAULT 'ltr' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"ip_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"tokens" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent_label" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" DEFAULT 'content_editor' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"preferred_locale" varchar(10),
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"sessions_valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "media_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" double precision,
	"checksum" text NOT NULL,
	"preview_data_uri" text,
	"original_filename" text,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_translations" (
	"media_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"alt_text" text,
	"caption" text,
	"transcript" text,
	CONSTRAINT "media_translations_media_id_locale_pk" PRIMARY KEY("media_id","locale")
);
--> statement-breakpoint
CREATE TABLE "destination_translations" (
	"destination_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"summary" text,
	"description" text,
	"historical_context" text,
	CONSTRAINT "destination_translations_destination_id_locale_pk" PRIMARY KEY("destination_id","locale")
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"default_locale" varchar(10) NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"cover_media_id" uuid,
	"latitude" double precision,
	"longitude" double precision,
	"country_code" varchar(2),
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "destinations_latitude_range" CHECK ("destinations"."latitude" IS NULL OR ("destinations"."latitude" BETWEEN -90 AND 90)),
	CONSTRAINT "destinations_longitude_range" CHECK ("destinations"."longitude" IS NULL OR ("destinations"."longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "hotspot_translations" (
	"hotspot_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"label" text NOT NULL,
	"description" text,
	CONSTRAINT "hotspot_translations_hotspot_id_locale_pk" PRIMARY KEY("hotspot_id","locale")
);
--> statement-breakpoint
CREATE TABLE "hotspots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"action_type" "hotspot_action" NOT NULL,
	"action_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"yaw_deg" double precision,
	"pitch_deg" double precision,
	"x" double precision,
	"y" double precision,
	"icon" varchar(48) DEFAULT 'dot' NOT NULL,
	"style" varchar(24) DEFAULT 'pulse' NOT NULL,
	"status" "publication_status" DEFAULT 'published' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotspots_pitch_range" CHECK ("hotspots"."pitch_deg" IS NULL OR ("hotspots"."pitch_deg" BETWEEN -90 AND 90)),
	CONSTRAINT "hotspots_yaw_range" CHECK ("hotspots"."yaw_deg" IS NULL OR ("hotspots"."yaw_deg" BETWEEN -360 AND 360)),
	CONSTRAINT "hotspots_x_range" CHECK ("hotspots"."x" IS NULL OR ("hotspots"."x" BETWEEN 0 AND 1)),
	CONSTRAINT "hotspots_y_range" CHECK ("hotspots"."y" IS NULL OR ("hotspots"."y" BETWEEN 0 AND 1))
);
--> statement-breakpoint
CREATE TABLE "scene_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_scene_id" uuid NOT NULL,
	"to_scene_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "scene_links_no_self_loop" CHECK ("scene_links"."from_scene_id" <> "scene_links"."to_scene_id")
);
--> statement-breakpoint
CREATE TABLE "scene_media" (
	"scene_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" "media_role" DEFAULT 'gallery' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "scene_media_scene_id_media_id_role_pk" PRIMARY KEY("scene_id","media_id","role")
);
--> statement-breakpoint
CREATE TABLE "scene_translations" (
	"scene_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"description" text,
	CONSTRAINT "scene_translations_scene_id_locale_pk" PRIMARY KEY("scene_id","locale")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tour_id" uuid NOT NULL,
	"slug" varchar(120) NOT NULL,
	"kind" "scene_kind" DEFAULT 'panorama' NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"is_start" boolean DEFAULT false NOT NULL,
	"background_media_id" uuid,
	"thumbnail_media_id" uuid,
	"audio_media_id" uuid,
	"view" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"north_offset_deg" double precision DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tour_translations" (
	"tour_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"description" text,
	"welcome_message" text,
	CONSTRAINT "tour_translations_tour_id_locale_pk" PRIMARY KEY("tour_id","locale")
);
--> statement-breakpoint
CREATE TABLE "tours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" uuid NOT NULL,
	"slug" varchar(120) NOT NULL,
	"kind" "tour_kind" DEFAULT 'panorama' NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"cover_media_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estimated_minutes" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "poi_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" uuid NOT NULL,
	"slug" varchar(120) NOT NULL,
	"color" varchar(9) DEFAULT '#B4884B' NOT NULL,
	"icon" varchar(48) DEFAULT 'marker' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "poi_categories_color_hex" CHECK ("poi_categories"."color" ~ '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$')
);
--> statement-breakpoint
CREATE TABLE "poi_category_translations" (
	"category_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "poi_category_translations_category_id_locale_pk" PRIMARY KEY("category_id","locale")
);
--> statement-breakpoint
CREATE TABLE "poi_media" (
	"poi_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" "media_role" DEFAULT 'gallery' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "poi_media_poi_id_media_id_role_pk" PRIMARY KEY("poi_id","media_id","role")
);
--> statement-breakpoint
CREATE TABLE "poi_translations" (
	"poi_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"title" text NOT NULL,
	"short_description" text,
	"description" text,
	"historical_info" text,
	CONSTRAINT "poi_translations_poi_id_locale_pk" PRIMARY KEY("poi_id","locale")
);
--> statement-breakpoint
CREATE TABLE "points_of_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" uuid NOT NULL,
	"category_id" uuid,
	"slug" varchar(120) NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"cover_media_id" uuid,
	"latitude" double precision,
	"longitude" double precision,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_pois" (
	"scene_id" uuid NOT NULL,
	"poi_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "scene_pois_scene_id_poi_id_pk" PRIMARY KEY("scene_id","poi_id")
);
--> statement-breakpoint
CREATE TABLE "event_media" (
	"event_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" "media_role" DEFAULT 'gallery' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_media_event_id_media_id_role_pk" PRIMARY KEY("event_id","media_id","role")
);
--> statement-breakpoint
CREATE TABLE "event_schedule_item_translations" (
	"item_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"performer" text,
	"location" text,
	CONSTRAINT "event_schedule_item_translations_item_id_locale_pk" PRIMARY KEY("item_id","locale")
);
--> statement-breakpoint
CREATE TABLE "event_schedule_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"scene_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_schedule_items_ends_after_starts" CHECK ("event_schedule_items"."ends_at" IS NULL OR "event_schedule_items"."ends_at" >= "event_schedule_items"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "event_translations" (
	"event_id" uuid NOT NULL,
	"locale" varchar(10) NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"description" text,
	"organizer" text,
	"venue" text,
	"admission_info" text,
	CONSTRAINT "event_translations_event_id_locale_pk" PRIMARY KEY("event_id","locale")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" uuid NOT NULL,
	"tour_id" uuid,
	"slug" varchar(120) NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"cover_media_id" uuid,
	"latitude" double precision,
	"longitude" double precision,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "events_ends_after_starts" CHECK ("events"."ends_at" >= "events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" "analytics_event" NOT NULL,
	"destination_id" uuid,
	"tour_id" uuid,
	"scene_id" uuid,
	"poi_id" uuid,
	"hotspot_id" uuid,
	"locale" varchar(10),
	"device_class" "device_class" DEFAULT 'unknown' NOT NULL,
	"visitor_hash" varchar(64),
	"session_id" varchar(64),
	"duration_ms" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_translations" ADD CONSTRAINT "media_translations_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_translations" ADD CONSTRAINT "media_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "destination_translations" ADD CONSTRAINT "destination_translations_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_translations" ADD CONSTRAINT "destination_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_default_locale_locales_code_fk" FOREIGN KEY ("default_locale") REFERENCES "public"."locales"("code") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotspot_translations" ADD CONSTRAINT "hotspot_translations_hotspot_id_hotspots_id_fk" FOREIGN KEY ("hotspot_id") REFERENCES "public"."hotspots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotspot_translations" ADD CONSTRAINT "hotspot_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "hotspots" ADD CONSTRAINT "hotspots_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_links" ADD CONSTRAINT "scene_links_from_scene_id_scenes_id_fk" FOREIGN KEY ("from_scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_links" ADD CONSTRAINT "scene_links_to_scene_id_scenes_id_fk" FOREIGN KEY ("to_scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_media" ADD CONSTRAINT "scene_media_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_media" ADD CONSTRAINT "scene_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_translations" ADD CONSTRAINT "scene_translations_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_translations" ADD CONSTRAINT "scene_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_background_media_id_media_assets_id_fk" FOREIGN KEY ("background_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_thumbnail_media_id_media_assets_id_fk" FOREIGN KEY ("thumbnail_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_audio_media_id_media_assets_id_fk" FOREIGN KEY ("audio_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_translations" ADD CONSTRAINT "tour_translations_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_translations" ADD CONSTRAINT "tour_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poi_categories" ADD CONSTRAINT "poi_categories_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poi_category_translations" ADD CONSTRAINT "poi_category_translations_category_id_poi_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."poi_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poi_category_translations" ADD CONSTRAINT "poi_category_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "poi_media" ADD CONSTRAINT "poi_media_poi_id_points_of_interest_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."points_of_interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poi_media" ADD CONSTRAINT "poi_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poi_translations" ADD CONSTRAINT "poi_translations_poi_id_points_of_interest_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."points_of_interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poi_translations" ADD CONSTRAINT "poi_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "points_of_interest" ADD CONSTRAINT "points_of_interest_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_of_interest" ADD CONSTRAINT "points_of_interest_category_id_poi_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."poi_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_of_interest" ADD CONSTRAINT "points_of_interest_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_pois" ADD CONSTRAINT "scene_pois_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_pois" ADD CONSTRAINT "scene_pois_poi_id_points_of_interest_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."points_of_interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_schedule_item_translations" ADD CONSTRAINT "event_schedule_item_translations_item_id_event_schedule_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."event_schedule_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_schedule_item_translations" ADD CONSTRAINT "event_schedule_item_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_schedule_items" ADD CONSTRAINT "event_schedule_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_schedule_items" ADD CONSTRAINT "event_schedule_items_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_poi_id_points_of_interest_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."points_of_interest"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_hotspot_id_hotspots_id_fk" FOREIGN KEY ("hotspot_id") REFERENCES "public"."hotspots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_absolute_expires_at_idx" ON "sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_assets_checksum_idx" ON "media_assets" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "media_assets_kind_idx" ON "media_assets" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "destinations_slug_key" ON "destinations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "destinations_status_idx" ON "destinations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hotspots_scene_id_idx" ON "hotspots" USING btree ("scene_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scene_links_from_to_key" ON "scene_links" USING btree ("from_scene_id","to_scene_id");--> statement-breakpoint
CREATE INDEX "scene_links_from_idx" ON "scene_links" USING btree ("from_scene_id");--> statement-breakpoint
CREATE INDEX "scene_links_to_idx" ON "scene_links" USING btree ("to_scene_id");--> statement-breakpoint
CREATE INDEX "scene_media_scene_id_idx" ON "scene_media" USING btree ("scene_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_tour_slug_key" ON "scenes" USING btree ("tour_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_one_start_per_tour" ON "scenes" USING btree ("tour_id") WHERE "scenes"."is_start";--> statement-breakpoint
CREATE INDEX "scenes_tour_id_idx" ON "scenes" USING btree ("tour_id");--> statement-breakpoint
CREATE INDEX "scenes_status_idx" ON "scenes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "tours_destination_slug_key" ON "tours" USING btree ("destination_id","slug");--> statement-breakpoint
CREATE INDEX "tours_status_idx" ON "tours" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tours_destination_id_idx" ON "tours" USING btree ("destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX "poi_categories_destination_slug_key" ON "poi_categories" USING btree ("destination_id","slug");--> statement-breakpoint
CREATE INDEX "poi_media_poi_id_idx" ON "poi_media" USING btree ("poi_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pois_destination_slug_key" ON "points_of_interest" USING btree ("destination_id","slug");--> statement-breakpoint
CREATE INDEX "pois_destination_id_idx" ON "points_of_interest" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "pois_category_id_idx" ON "points_of_interest" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "pois_status_idx" ON "points_of_interest" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scene_pois_scene_id_idx" ON "scene_pois" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "scene_pois_poi_id_idx" ON "scene_pois" USING btree ("poi_id");--> statement-breakpoint
CREATE INDEX "event_media_event_id_idx" ON "event_media" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_schedule_items_event_id_idx" ON "event_schedule_items" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_destination_slug_key" ON "events" USING btree ("destination_id","slug");--> statement-breakpoint
CREATE INDEX "events_destination_id_idx" ON "events" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_at_idx" ON "analytics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_tour_occurred_idx" ON "analytics_events" USING btree ("tour_id","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_type_idx" ON "analytics_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "analytics_events_session_idx" ON "analytics_events" USING btree ("session_id");