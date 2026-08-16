


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."invite_codes" (
    "code" "text" NOT NULL,
    "user_id" "text",
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_uuid" "uuid" DEFAULT "gen_random_uuid"(),
    "code_hash" "text",
    "status" "text" DEFAULT 'active'::"text"
);


ALTER TABLE "public"."invite_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mind_nodes" (
    "id" "text" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "note_id" "text",
    "item_id" "text" DEFAULT ''::"text" NOT NULL,
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "connections" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "user_id" "text" NOT NULL,
    "detail" "text"
);


ALTER TABLE "public"."mind_nodes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "from_voice" boolean DEFAULT false NOT NULL,
    "audio_duration" "text",
    "original" "text" DEFAULT ''::"text" NOT NULL,
    "key_points" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "deep_thinking" "jsonb" DEFAULT '{"expand": [], "question": [], "breakdown": []}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "text" NOT NULL
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token_hash" "text" NOT NULL,
    "user_uuid" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "user_id" "text" NOT NULL,
    "mindmap_manual_root_node_id" "text",
    "mindmap_excluded_node_ids" "text"[] DEFAULT '{}'::"text"[],
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mindmap_focus_result" "jsonb"
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


ALTER TABLE ONLY "public"."invite_codes"
    ADD CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."invite_codes"
    ADD CONSTRAINT "invite_codes_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."invite_codes"
    ADD CONSTRAINT "invite_codes_user_uuid_unique" UNIQUE ("user_uuid");



ALTER TABLE ONLY "public"."mind_nodes"
    ADD CONSTRAINT "mind_nodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "idx_mind_nodes_user_id" ON "public"."mind_nodes" USING "btree" ("user_id");



CREATE INDEX "idx_notes_user_id" ON "public"."notes" USING "btree" ("user_id");



CREATE INDEX "idx_sessions_token_hash" ON "public"."sessions" USING "btree" ("token_hash");



CREATE INDEX "idx_sessions_user_uuid" ON "public"."sessions" USING "btree" ("user_uuid");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "public"."invite_codes"("user_uuid");



CREATE POLICY "block_anon" ON "public"."invite_codes" TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "block_anon" ON "public"."mind_nodes" TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "block_anon" ON "public"."notes" TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "block_authenticated" ON "public"."invite_codes" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "block_authenticated" ON "public"."mind_nodes" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "block_authenticated" ON "public"."notes" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."invite_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mind_nodes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





































































































































































GRANT ALL ON TABLE "public"."invite_codes" TO "service_role";



GRANT ALL ON TABLE "public"."mind_nodes" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sessions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_preferences" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_preferences" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_preferences" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";



































revoke references on table "public"."invite_codes" from "anon";

revoke trigger on table "public"."invite_codes" from "anon";

revoke truncate on table "public"."invite_codes" from "anon";

revoke references on table "public"."invite_codes" from "authenticated";

revoke trigger on table "public"."invite_codes" from "authenticated";

revoke truncate on table "public"."invite_codes" from "authenticated";

revoke references on table "public"."mind_nodes" from "anon";

revoke trigger on table "public"."mind_nodes" from "anon";

revoke truncate on table "public"."mind_nodes" from "anon";

revoke references on table "public"."mind_nodes" from "authenticated";

revoke trigger on table "public"."mind_nodes" from "authenticated";

revoke truncate on table "public"."mind_nodes" from "authenticated";

revoke references on table "public"."notes" from "anon";

revoke trigger on table "public"."notes" from "anon";

revoke truncate on table "public"."notes" from "anon";

revoke references on table "public"."notes" from "authenticated";

revoke trigger on table "public"."notes" from "authenticated";

revoke truncate on table "public"."notes" from "authenticated";

alter table "public"."sessions" drop constraint "sessions_user_uuid_fkey";

alter table "public"."sessions" add constraint "sessions_user_uuid_fkey" FOREIGN KEY (user_uuid) REFERENCES public.invite_codes(user_uuid) not valid;

alter table "public"."sessions" validate constraint "sessions_user_uuid_fkey";

