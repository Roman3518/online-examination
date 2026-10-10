# API reference

Base URL: `http://localhost:8000` (or whatever host/port you deploy to).

All request and response bodies are JSON, except `GET /api/admin/results.csv`,
which returns `text/csv`. Send `Content-Type: application/json` on every
request that has a body.

## Authentication

Login returns a bearer token. Send it on every endpoint marked **Auth** below:

```
Authorization: Bearer <token>
```

A missing or invalid token returns `401`. A token for the wrong role (for
example a student token on an admin-only route) returns `403`.

## Errors

Every failure returns a JSON body `{ "error": "<message>" }` with a 4xx or
5xx status. The front end shows `error` to the user as-is, so messages are
written to be read directly (e.g. `"Email or password is incorrect."`).

| Status | Meaning |
|---|---|
| 400 | Validation failed (missing/invalid fields) |
| 401 | Not logged in, or wrong credentials |
| 403 | Logged in, but wrong role for this route |
| 404 | Resource not found, or not visible to this user |
| 409 | Conflict (duplicate email, already attempted/submitted) |
| 500 | Server error |

---

## Public

### `POST /api/register`
Create a student account.
```json
// request
{ "name": "Jane Doe", "email": "jane@example.com", "password": "secret1" }
// response
{ "ok": true }
```
`400` if name/email/password are invalid, `409` if the email is taken.

### `POST /api/login`
```json
// request
{ "email": "jane@example.com", "password": "secret1", "role": "student" }
// response
{ "token": "…", "user": { "id": 2, "name": "Jane Doe", "role": "student" } }
```
`role` must be `"student"` or `"admin"` and must match the account's actual
role. `401` on bad credentials.

---

## Any logged-in user  — **Auth**

### `POST /api/logout`
Invalidates all of the caller's sessions. `{ "ok": true }`

### `GET /api/me`
`{ "id": 2, "name": "Jane Doe", "role": "student" }`

### `GET /api/attempts/:id`
Full review of one attempt (question text, options, the correct answer, and
what the student chose). A student may only read their own attempts; an
admin may read any.
```json
{ "title": "Programming Basics", "student": "Jane Doe",
  "score": 3, "total": 4, "pct": 75, "passed": true,
  "items": [ { "id": 1, "text": "…", "opts": ["…","…","…","…"],
               "correct": 1, "chosen": 1 } ] }
```

---

## Student — **Auth, role: student**

### `GET /api/quizzes`
Published quizzes with at least one question, newest first. `attempt_id` is
`null` until the student has submitted.
```json
[ { "id": 1, "title": "Programming Basics", "minutes": 10, "pass_pct": 40,
    "published": 1, "n": 3, "attempt_id": null } ]
```

### `GET /api/quizzes/:id/start`
Begins (or resumes) an attempt. Records the start time server-side on first
call, so refreshing the page doesn't reset a timed quiz's clock.
```json
{ "id": 1, "title": "Programming Basics", "seconds_left": 600,
  "questions": [ { "id": 1, "text": "…", "opts": ["…","…","…","…"] } ] }
```
`seconds_left` is `null` for an untimed quiz. Correct answers are never sent
to the client here. `409` if already attempted.

### `POST /api/quizzes/:id/submit`
```json
// request
{ "answers": { "1": 1, "2": 0, "3": 2 } }   // question id -> chosen option index
// response
{ "attempt_id": 7 }
```
Grades server-side and stores the result; the client cannot submit a score
directly. `409` if already submitted.

### `GET /api/my/attempts`
This student's own attempt history, newest first.
```json
[ { "id": 7, "title": "Programming Basics", "score": 3, "total": 4,
    "submitted_at": 1790572278 } ]
```

---

## Admin — **Auth, role: admin**

### Quizzes
| | |
|---|---|
| `GET /api/admin/quizzes` | All quizzes, with question and attempt counts |
| `POST /api/admin/quizzes` | Create: `{ "title", "minutes"?, "pass_pct"? }` |
| `PUT /api/admin/quizzes/:id` | Edit any of `{ "title", "minutes", "published" }` |
| `DELETE /api/admin/quizzes/:id` | Delete the quiz, its questions, and all attempts |

Publishing (`"published": true`) is rejected with `400` if the quiz has no
questions yet. `minutes` omitted or blank means untimed.

### Questions
| | |
|---|---|
| `GET /api/admin/quizzes/:id/questions` | List, including the correct answer |
| `POST /api/admin/quizzes/:id/questions` | Add: `{ "text", "opts": [4 strings], "correct": 0-3 }` |
| `PUT /api/admin/questions/:id` | Edit, same body shape |
| `DELETE /api/admin/questions/:id` | Remove |

### Students
| | |
|---|---|
| `GET /api/admin/students` | All student accounts with attempt counts |
| `DELETE /api/admin/students/:id` | Remove the student and their attempts |
| `POST /api/admin/students/:id/password` | Reset: `{ "password" }` (min 6 chars), logs them out |

### Results
| | |
|---|---|
| `GET /api/admin/results?quiz_id=&name=` | Filtered attempt list + summary stats |
| `GET /api/admin/results.csv?quiz_id=&name=` | Same data as a CSV download |
| `DELETE /api/admin/attempts/:id` | Delete one attempt (lets that student retake the quiz) |

`GET /api/admin/results` response:
```json
{ "rows": [ { "id": 7, "student": "Jane Doe", "email": "jane@example.com",
              "quiz": "Programming Basics", "score": 3, "total": 4,
              "pass_pct": 40, "submitted_at": 1790572278,
              "pct": 75, "passed": true } ],
  "stats": { "count": 1, "avg": 75, "high": 75, "low": 75 } }
```
Both filters are optional; `name` matches the student's name or email
(partial, case-insensitive).

---

## Static files
`GET /`, `/index.html`, `/style.css`, `/app.js` are served directly by the
same process — see `server.py`'s `STATIC` map.
