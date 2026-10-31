CREATE TABLE IF NOT EXISTS tantu.email_verifications (
  email text PRIMARY KEY CHECK (email=lower(email) AND length(email)<=254),
  code_hash text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  password_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verifications_expiry_idx ON tantu.email_verifications(expires_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tantu_runtime') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON tantu.email_verifications TO tantu_runtime;
  END IF;
END $$;

