-- Online Examination System — database schema (SQLite)
-- Loaded automatically by server.py on first run. You can also open it
-- directly against exam.db with any SQLite client to inspect the tables.

CREATE TABLE IF NOT EXISTS users(
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  email    TEXT NOT NULL UNIQUE,
  pw_hash  TEXT NOT NULL,                        -- PBKDF2-SHA256 hash, never plain text
  salt     TEXT NOT NULL,
  role     TEXT NOT NULL CHECK(role IN ('admin','student'))
);

CREATE TABLE IF NOT EXISTS quizzes(
  id        INTEGER PRIMARY KEY,
  title     TEXT NOT NULL,
  minutes   INTEGER,                             -- NULL = untimed quiz
  pass_pct  INTEGER NOT NULL DEFAULT 40,          -- percentage required to pass
  published INTEGER NOT NULL DEFAULT 0            -- 0 = draft (hidden), 1 = visible to students
);

CREATE TABLE IF NOT EXISTS questions(
  id       INTEGER PRIMARY KEY,
  quiz_id  INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  text     TEXT NOT NULL,
  opt1     TEXT NOT NULL,
  opt2     TEXT NOT NULL,
  opt3     TEXT NOT NULL,
  opt4     TEXT NOT NULL,
  correct  INTEGER NOT NULL CHECK(correct BETWEEN 0 AND 3)   -- index of the right option
);

CREATE TABLE IF NOT EXISTS attempts(
  id            INTEGER PRIMARY KEY,
  quiz_id       INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  score         INTEGER NOT NULL,
  total         INTEGER NOT NULL,
  answers       TEXT NOT NULL,                   -- JSON array of chosen option indices
  submitted_at  INTEGER NOT NULL                 -- unix timestamp
);

-- Tracks when a student started a timed quiz, so the countdown survives a
-- page refresh. Cleared once the attempt is submitted.
CREATE TABLE IF NOT EXISTS starts(
  user_id     INTEGER,
  quiz_id     INTEGER,
  started_at  INTEGER,
  PRIMARY KEY (user_id, quiz_id)
);

-- Login sessions. token is the bearer token the front end sends back on
-- every API request; deleting a row logs that session out.
CREATE TABLE IF NOT EXISTS sessions(
  token    TEXT PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_questions_quiz   ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz    ON attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user    ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
