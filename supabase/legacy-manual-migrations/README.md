# Legacy Manual Migrations

These SQL files were applied manually to the existing Supabase project before
the repository adopted Supabase CLI migration history.

They are retained only as historical records. Do not move them back into
`supabase/migrations` and do not run them through `supabase db push`.

The first CLI-generated remote schema baseline will be the only migration that
records the pre-existing production schema in CLI history. New schema changes
must use timestamped migration files in `supabase/migrations`.

Archived files:

- `migration-session-auth.sql`
- `migration-user-preferences.sql`
- `migration-user-preferences-v2.sql`
- `migration-mindnode-detail.sql`
