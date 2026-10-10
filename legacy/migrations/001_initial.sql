CREATE TABLE users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','standard','premium')),
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiration ON sessions(expires_at);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE practices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  topic text NOT NULL,
  part smallint NOT NULL CHECK (part BETWEEN 1 AND 3),
  answers jsonb NOT NULL,
  feedback jsonb,
  status text NOT NULL CHECK (status IN ('pending','complete','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key)
);
CREATE INDEX practices_history ON practices(user_id,created_at DESC);
CREATE TABLE subscribers (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_expiration ON rate_limits(expires_at);
CREATE TABLE stripe_events (
  id text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
