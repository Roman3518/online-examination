#!/usr/bin/env python3
"""Online Examination System - backend (Python standard library + SQLite).
Run:  python server.py   ->  http://localhost:8000
"""
import csv, hashlib, io, json, os, re, secrets, sqlite3, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR", HERE)   # set DATA_DIR to a mounted persistent disk in production
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "exam.db")
SCHEMA_PATH = os.path.join(HERE, "schema.sql")

def db():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c

def hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 120_000).hex()

def add_user(c, name, email, pw, role):
    salt = secrets.token_hex(16)
    c.execute("INSERT INTO users(name,email,pw_hash,salt,role) VALUES(?,?,?,?,?)",
              (name, email.lower(), hash_pw(pw, salt), salt, role))

def init():
    c = db()
    with open(SCHEMA_PATH, "r") as f: c.executescript(f.read())
    if not c.execute("SELECT 1 FROM users").fetchone():
        add_user(c, "Administrator", "admin@exam.local", "admin123", "admin")
        add_user(c, "Demo Student", "student@exam.local", "student123", "student")
        c.execute("INSERT INTO quizzes(title,minutes,pass_pct,published) VALUES('Programming Basics',10,40,1)")
        qs = [("Which symbol ends a statement in C?", [".", ";", ":", ","], 1),
              ("HTML stands for?", ["Hyper Text Markup Language", "High Text Machine Language",
                                    "Hyperlinks Tool Markup Language", "Home Tool Markup Language"], 0),
              ("Which CSS property changes text color?", ["font-color", "text-style", "color", "background"], 2)]
        for t, o, a in qs:
            c.execute("INSERT INTO questions(quiz_id,text,opt1,opt2,opt3,opt4,correct) VALUES(1,?,?,?,?,?,?)", (t, *o, a))
    c.commit(); c.close()

class Err(Exception):
    def __init__(s, code, msg): s.code, s.msg = code, msg

def q_public(r):   # question without the answer
    return {"id": r["id"], "text": r["text"], "opts": [r["opt1"], r["opt2"], r["opt3"], r["opt4"]]}

# ---------------- route handlers: fn(c, user, body, params, query) -> data ----------------
def register(c, u, b, p, q):
    name, email, pw = (b.get("name") or "").strip(), (b.get("email") or "").strip(), b.get("password") or ""
    if not name or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email) or len(pw) < 6:
        raise Err(400, "Enter a name, a valid email and a password of at least 6 characters.")
    try: add_user(c, name, email, pw, "student")
    except sqlite3.IntegrityError: raise Err(409, "That email is already registered.")
    return {"ok": True}

def login(c, u, b, p, q):
    r = c.execute("SELECT * FROM users WHERE email=? AND role=?", ((b.get("email") or "").lower(), b.get("role"))).fetchone()
    if not r or not secrets.compare_digest(r["pw_hash"], hash_pw(b.get("password") or "", r["salt"])):
        raise Err(401, "Email or password is incorrect.")
    tok = secrets.token_hex(24)
    c.execute("INSERT INTO sessions VALUES(?,?,?)", (tok, r["id"], int(time.time())))
    return {"token": tok, "user": {"id": r["id"], "name": r["name"], "role": r["role"]}}

def logout(c, u, b, p, q):
    c.execute("DELETE FROM sessions WHERE user_id=?", (u["id"],)); return {"ok": True}

def me(c, u, b, p, q): return {"id": u["id"], "name": u["name"], "role": u["role"]}

def quizzes(c, u, b, p, q):
    rows = c.execute("""SELECT z.*, (SELECT COUNT(*) FROM questions WHERE quiz_id=z.id) n,
        (SELECT id FROM attempts WHERE quiz_id=z.id AND user_id=?) attempt_id
        FROM quizzes z WHERE published=1 ORDER BY id DESC""", (u["id"],)).fetchall()
    return [dict(r) for r in rows if r["n"]]

def start(c, u, b, p, q):
    z = c.execute("SELECT * FROM quizzes WHERE id=? AND published=1", (p[0],)).fetchone()
    if not z: raise Err(404, "Quiz not available.")
    if c.execute("SELECT 1 FROM attempts WHERE quiz_id=? AND user_id=?", (z["id"], u["id"])).fetchone():
        raise Err(409, "You have already attempted this quiz.")
    now = int(time.time())
    c.execute("INSERT OR IGNORE INTO starts VALUES(?,?,?)", (u["id"], z["id"], now))
    st = c.execute("SELECT started_at FROM starts WHERE user_id=? AND quiz_id=?", (u["id"], z["id"])).fetchone()[0]
    left = max(0, z["minutes"] * 60 - (now - st)) if z["minutes"] else None
    qs = [q_public(r) for r in c.execute("SELECT * FROM questions WHERE quiz_id=? ORDER BY id", (z["id"],))]
    return {"id": z["id"], "title": z["title"], "seconds_left": left, "questions": qs}

def submit(c, u, b, p, q):
    z = c.execute("SELECT * FROM quizzes WHERE id=? AND published=1", (p[0],)).fetchone()
    if not z: raise Err(404, "Quiz not available.")
    if c.execute("SELECT 1 FROM attempts WHERE quiz_id=? AND user_id=?", (z["id"], u["id"])).fetchone():
        raise Err(409, "Already submitted.")
    qs = c.execute("SELECT * FROM questions WHERE quiz_id=? ORDER BY id", (z["id"],)).fetchall()
    given = b.get("answers") or {}
    ans = [given.get(str(r["id"]), -1) for r in qs]
    score = sum(1 for r, a in zip(qs, ans) if a == r["correct"])
    cur = c.execute("INSERT INTO attempts(quiz_id,user_id,score,total,answers,submitted_at) VALUES(?,?,?,?,?,?)",
                    (z["id"], u["id"], score, len(qs), json.dumps(ans), int(time.time())))
    c.execute("DELETE FROM starts WHERE user_id=? AND quiz_id=?", (u["id"], z["id"]))
    return {"attempt_id": cur.lastrowid}

def attempt(c, u, b, p, q):
    a = c.execute("""SELECT a.*, z.title, z.pass_pct, s.name student FROM attempts a
        JOIN quizzes z ON z.id=a.quiz_id JOIN users s ON s.id=a.user_id WHERE a.id=?""", (p[0],)).fetchone()
    if not a or (u["role"] != "admin" and a["user_id"] != u["id"]): raise Err(404, "Attempt not found.")
    ans = json.loads(a["answers"])
    qs = c.execute("SELECT * FROM questions WHERE quiz_id=? ORDER BY id", (a["quiz_id"],)).fetchall()
    items = [{**q_public(r), "correct": r["correct"], "chosen": ans[i] if i < len(ans) else -1} for i, r in enumerate(qs)]
    pct = round(100 * a["score"] / a["total"]) if a["total"] else 0
    return {"title": a["title"], "student": a["student"], "score": a["score"], "total": a["total"],
            "pct": pct, "passed": pct >= a["pass_pct"], "items": items}

def my_attempts(c, u, b, p, q):
    return [dict(r) for r in c.execute("""SELECT a.id, z.title, a.score, a.total, a.submitted_at FROM attempts a
        JOIN quizzes z ON z.id=a.quiz_id WHERE a.user_id=? ORDER BY a.id DESC""", (u["id"],))]

# ---- admin ----
def a_quizzes(c, u, b, p, q):
    return [dict(r) for r in c.execute("""SELECT z.*, (SELECT COUNT(*) FROM questions WHERE quiz_id=z.id) n,
        (SELECT COUNT(*) FROM attempts WHERE quiz_id=z.id) attempts FROM quizzes z ORDER BY id DESC""")]

def mins(v):
    try: v = int(v)
    except (TypeError, ValueError): return None
    return v if v > 0 else None

def a_new_quiz(c, u, b, p, q):
    t = (b.get("title") or "").strip()
    if not t: raise Err(400, "Quiz title is required.")
    pp = min(100, max(0, int(b.get("pass_pct") or 40)))
    c.execute("INSERT INTO quizzes(title,minutes,pass_pct) VALUES(?,?,?)", (t, mins(b.get("minutes")), pp))
    return {"ok": True}

def a_edit_quiz(c, u, b, p, q):
    z = c.execute("SELECT * FROM quizzes WHERE id=?", (p[0],)).fetchone()
    if not z: raise Err(404, "Quiz not found.")
    title = (b.get("title", z["title"]) or "").strip() or z["title"]
    minutes = mins(b["minutes"]) if "minutes" in b else z["minutes"]
    pub = int(bool(b["published"])) if "published" in b else z["published"]
    if pub and not c.execute("SELECT 1 FROM questions WHERE quiz_id=?", (z["id"],)).fetchone():
        raise Err(400, "Add at least one question before publishing.")
    c.execute("UPDATE quizzes SET title=?,minutes=?,published=? WHERE id=?", (title, minutes, pub, z["id"]))
    return {"ok": True}

def a_del_quiz(c, u, b, p, q):
    c.execute("DELETE FROM quizzes WHERE id=?", (p[0],)); return {"ok": True}

def a_questions(c, u, b, p, q):
    return [{**q_public(r), "correct": r["correct"]} for r in c.execute("SELECT * FROM questions WHERE quiz_id=? ORDER BY id", (p[0],))]

def a_new_q(c, u, b, p, q):
    o, t = b.get("opts") or [], (b.get("text") or "").strip()
    if not t or len(o) != 4 or not all((x or "").strip() for x in o) or b.get("correct") not in (0, 1, 2, 3):
        raise Err(400, "Enter the question, all four options and mark the correct one.")
    c.execute("INSERT INTO questions(quiz_id,text,opt1,opt2,opt3,opt4,correct) VALUES(?,?,?,?,?,?,?)",
              (p[0], t, *[x.strip() for x in o], b["correct"]))
    return {"ok": True}

def a_edit_q(c, u, b, p, q):
    o, t = b.get("opts") or [], (b.get("text") or "").strip()
    if not t or len(o) != 4 or not all((x or "").strip() for x in o) or b.get("correct") not in (0, 1, 2, 3):
        raise Err(400, "Enter the question, all four options and mark the correct one.")
    c.execute("UPDATE questions SET text=?,opt1=?,opt2=?,opt3=?,opt4=?,correct=? WHERE id=?",
              (t, *[x.strip() for x in o], b["correct"], p[0]))
    return {"ok": True}

def a_del_q(c, u, b, p, q):
    c.execute("DELETE FROM questions WHERE id=?", (p[0],)); return {"ok": True}

def a_students(c, u, b, p, q):
    return [dict(r) for r in c.execute("""SELECT id,name,email,(SELECT COUNT(*) FROM attempts WHERE user_id=users.id) attempts
        FROM users WHERE role='student' ORDER BY name""")]

def a_del_student(c, u, b, p, q):
    c.execute("DELETE FROM users WHERE id=? AND role='student'", (p[0],)); return {"ok": True}

def a_reset_pw(c, u, b, p, q):
    pw = b.get("password") or ""
    if len(pw) < 6: raise Err(400, "Password must be at least 6 characters.")
    salt = secrets.token_hex(16)
    c.execute("UPDATE users SET pw_hash=?,salt=? WHERE id=? AND role='student'", (hash_pw(pw, salt), salt, p[0]))
    c.execute("DELETE FROM sessions WHERE user_id=?", (p[0],))
    return {"ok": True}

def result_rows(c, quiz_id, name):
    sql = """SELECT a.id, s.name student, s.email, z.title quiz, a.score, a.total, z.pass_pct, a.submitted_at
        FROM attempts a JOIN users s ON s.id=a.user_id JOIN quizzes z ON z.id=a.quiz_id WHERE 1=1"""
    args = []
    if quiz_id: sql += " AND a.quiz_id=?"; args.append(quiz_id)
    if name: sql += " AND (s.name LIKE ? OR s.email LIKE ?)"; args += [f"%{name}%"] * 2
    rows = [dict(r) for r in c.execute(sql + " ORDER BY a.id DESC", args)]
    for r in rows:
        r["pct"] = round(100 * r["score"] / r["total"]) if r["total"] else 0
        r["passed"] = r["pct"] >= r["pass_pct"]
    return rows

def a_results(c, u, b, p, q):
    rows = result_rows(c, q.get("quiz_id", [""])[0], q.get("name", [""])[0])
    pcts = [r["pct"] for r in rows]
    return {"rows": rows, "stats": {"count": len(rows), "avg": round(sum(pcts) / len(pcts)) if pcts else 0,
            "high": max(pcts, default=0), "low": min(pcts, default=0)}}

def a_del_attempt(c, u, b, p, q):
    c.execute("DELETE FROM attempts WHERE id=?", (p[0],)); return {"ok": True}

def a_csv(c, u, b, p, q):
    out = io.StringIO(); w = csv.writer(out)
    w.writerow(["Student", "Email", "Quiz", "Score", "Total", "Percent", "Result", "Submitted"])
    for r in result_rows(c, q.get("quiz_id", [""])[0], q.get("name", [""])[0]):
        w.writerow([r["student"], r["email"], r["quiz"], r["score"], r["total"], r["pct"],
                    "Pass" if r["passed"] else "Fail", time.strftime("%Y-%m-%d %H:%M", time.localtime(r["submitted_at"]))])
    return ("csv", out.getvalue())

# (method, regex, role required, handler)   role: None=public, "any", "student", "admin"
ROUTES = [
    ("POST", r"/api/register", None, register), ("POST", r"/api/login", None, login),
    ("POST", r"/api/logout", "any", logout), ("GET", r"/api/me", "any", me),
    ("GET", r"/api/quizzes", "student", quizzes),
    ("GET", r"/api/quizzes/(\d+)/start", "student", start), ("POST", r"/api/quizzes/(\d+)/submit", "student", submit),
    ("GET", r"/api/attempts/(\d+)", "any", attempt), ("GET", r"/api/my/attempts", "student", my_attempts),
    ("GET", r"/api/admin/quizzes", "admin", a_quizzes), ("POST", r"/api/admin/quizzes", "admin", a_new_quiz),
    ("PUT", r"/api/admin/quizzes/(\d+)", "admin", a_edit_quiz), ("DELETE", r"/api/admin/quizzes/(\d+)", "admin", a_del_quiz),
    ("GET", r"/api/admin/quizzes/(\d+)/questions", "admin", a_questions),
    ("POST", r"/api/admin/quizzes/(\d+)/questions", "admin", a_new_q),
    ("PUT", r"/api/admin/questions/(\d+)", "admin", a_edit_q), ("DELETE", r"/api/admin/questions/(\d+)", "admin", a_del_q),
    ("GET", r"/api/admin/students", "admin", a_students), ("DELETE", r"/api/admin/students/(\d+)", "admin", a_del_student),
    ("POST", r"/api/admin/students/(\d+)/password", "admin", a_reset_pw),
    ("GET", r"/api/admin/results", "admin", a_results), ("GET", r"/api/admin/results.csv", "admin", a_csv),
    ("DELETE", r"/api/admin/attempts/(\d+)", "admin", a_del_attempt),
]

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send(self, code, body, ctype="application/json", extra=None):
        data = body if isinstance(body, bytes) else body.encode()
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(data)

    STATIC = {"/": ("index.html", "text/html; charset=utf-8"),
              "/index.html": ("index.html", "text/html; charset=utf-8"),
              "/style.css": ("style.css", "text/css; charset=utf-8"),
              "/app.js": ("app.js", "application/javascript; charset=utf-8")}

    def handle_any(self, method):
        url = urlparse(self.path)
        if method == "GET" and url.path in self.STATIC:
            fname, ctype = self.STATIC[url.path]
            with open(os.path.join(HERE, fname), "rb") as f: return self.send(200, f.read(), ctype)
        c = db()
        try:
            for m, pat, role, fn in ROUTES:
                mt = re.fullmatch(pat, url.path)
                if m != method or not mt: continue
                user = None
                if role:
                    tok = self.headers.get("Authorization", "").replace("Bearer ", "")
                    user = c.execute("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?", (tok,)).fetchone()
                    if not user: raise Err(401, "Please log in.")
                    if role != "any" and user["role"] != role: raise Err(403, "You do not have access to this page.")
                n = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(n) or b"{}") if n else {}
                except ValueError: raise Err(400, "Invalid request.")
                res = fn(c, user, body, mt.groups(), parse_qs(url.query)); c.commit()
                if isinstance(res, tuple):
                    return self.send(200, res[1], "text/csv", {"Content-Disposition": "attachment; filename=results.csv"})
                return self.send(200, json.dumps(res))
            raise Err(404, "Not found.")
        except Err as e: self.send(e.code, json.dumps({"error": e.msg}))
        except Exception as e: self.send(500, json.dumps({"error": "Server error."})); print("ERR", e)
        finally: c.close()

    do_GET = lambda s: s.handle_any("GET")
    do_POST = lambda s: s.handle_any("POST")
    do_PUT = lambda s: s.handle_any("PUT")
    do_DELETE = lambda s: s.handle_any("DELETE")

if __name__ == "__main__":
    init()
    port = int(os.environ.get("PORT", 8000))
    print(f"Exam system running at http://localhost:{port}")
    print("Admin: admin@exam.local / admin123   Student: student@exam.local / student123")
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
