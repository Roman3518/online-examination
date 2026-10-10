# Online Examination System

Python (standard library only) + SQLite. No installs needed.

## Run
    python server.py
Open http://localhost:8000 (set PORT=9000 to change the port).

Demo logins:  admin@exam.local / admin123   |   student@exam.local / student123

## Files
- server.py    backend and REST API (creates exam.db from schema.sql on first run)
- schema.sql   database schema (six tables, see below)
- index.html   page markup
- style.css    all styling
- app.js       all front-end logic (views, API calls, quiz/timer behavior)
- API.md       full API reference (every endpoint, request/response shapes)

## Database tables
users, quizzes, questions (options and correct answer), attempts (score and answers), starts (timer), sessions — defined in schema.sql.

## Deploying to Render (free tier)

1. Push this folder to a new GitHub repository (`.gitignore` already excludes `exam.db` and `__pycache__/`).
2. Go to [render.com](https://render.com), sign in with GitHub, and click **New > Blueprint**.
3. Pick your repository. Render reads `render.yaml` automatically and sets up:
   - a free web service running `python server.py`
   - a 1 GB persistent disk mounted at `/opt/render/project/data`, so `exam.db` survives restarts and redeploys
4. Click **Apply**. The first deploy takes a minute or two; Render gives you a public URL like `https://online-exam-system.onrender.com`.
5. Open that URL and log in with the demo accounts, or register a student.

No build step or dependencies are needed — the backend only uses Python's standard library.

**Free-tier note:** Render's free web services spin down after periods of inactivity and take a few seconds to wake back up on the next request — expect a short delay on the first load after it's been idle.

### Other hosts
`Procfile` (`web: python server.py`) works the same way on platforms like Railway that use that convention instead of `render.yaml`. Set a `DATA_DIR` environment variable there too, pointing at whatever persistent volume the host provides, so the database isn't wiped on redeploy.
