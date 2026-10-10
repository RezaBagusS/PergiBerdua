export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY,
 email text NOT NULL UNIQUE,
 username text NOT NULL UNIQUE,
 email_reminders boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS otp_requests (
 id uuid PRIMARY KEY, email text NOT NULL, username text,
 intent text NOT NULL CHECK(intent IN ('login','register')),
 code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL, used boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_email_idx ON otp_requests(email, created_at);
CREATE TABLE IF NOT EXISTS rate_events (
 bucket text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_idx ON rate_events(bucket,created_at);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rooms (
 id uuid PRIMARY KEY, title text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 anniversary date, pair_key text,
 created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS room_pair_unique ON rooms(pair_key) WHERE pair_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS memberships (
 room_id uuid REFERENCES rooms(id), user_id uuid REFERENCES users(id),
 state text NOT NULL CHECK(state IN ('active','archived','left')),
 PRIMARY KEY(room_id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_room ON memberships(user_id) WHERE state='active';
CREATE TABLE IF NOT EXISTS invitations (
 token_hash text PRIMARY KEY, room_id uuid NOT NULL REFERENCES rooms(id),
 created_by uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL, used boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS places (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES rooms(id),
 name text NOT NULL, area text NOT NULL DEFAULT '',
 category text NOT NULL DEFAULT 'Alam', budget integer NOT NULL DEFAULT 0,
 note text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'wish'
 CHECK(status IN ('wish','planned','visited')),
 scheduled_at timestamptz, visited_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mail_jobs (
 id uuid PRIMARY KEY, room_id uuid REFERENCES rooms(id),
 place_id uuid REFERENCES places(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('reminder','room_closed')),
 scheduled_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','sending','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, locked_at timestamptz,
 sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mail_due ON mail_jobs(status,scheduled_at);
`;
