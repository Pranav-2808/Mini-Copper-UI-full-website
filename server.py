from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote
import json
import mimetypes
import os
import re
import sqlite3
import threading
import time
import uuid


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "submissions.json"
DB_FILE = DATA_DIR / "mini.sqlite3"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PORT = int(os.environ.get("PORT", "5174"))
STORE_LOCK = threading.Lock()
BUCKETS = ["test_drives", "builds", "newsletters", "dealer_searches"]


def read_json_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length > 16_384:
        raise ValueError("Request is too large.")

    raw = handler.rfile.read(length).decode("utf-8")
    try:
        data = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON payload.") from exc

    if not isinstance(data, dict):
        raise ValueError("Payload must be an object.")

    return {str(key): str(value).strip() for key, value in data.items()}


def require_fields(data, fields):
    missing = [field for field in fields if not data.get(field)]
    if missing:
        raise ValueError(f"Missing required field: {missing[0]}.")


def validate_email(email):
    if not EMAIL_RE.match(email or ""):
        raise ValueError("Please enter a valid email address.")


def db_connection():
    DATA_DIR.mkdir(exist_ok=True)
    connection = sqlite3.connect(DB_FILE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS submissions (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                created_at TEXT NOT NULL,
                payload TEXT NOT NULL
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_submissions_kind ON submissions(kind)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at)")


def migrate_json_store():
    if not DATA_FILE.exists():
        return

    with DATA_FILE.open("r", encoding="utf-8") as file:
        try:
            store = json.load(file)
        except json.JSONDecodeError:
            return

    with STORE_LOCK, db_connection() as connection:
        existing = connection.execute("SELECT COUNT(*) FROM submissions").fetchone()[0]
        if existing:
            return

        for bucket in BUCKETS:
            for item in store.get(bucket, []):
                entry_id = item.get("id") or uuid.uuid4().hex
                created_at = item.get("created_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                payload = {key: value for key, value in item.items() if key not in {"id", "created_at"}}
                connection.execute(
                    "INSERT OR IGNORE INTO submissions (id, kind, created_at, payload) VALUES (?, ?, ?, ?)",
                    (entry_id, bucket, created_at, json.dumps(payload)),
                )


def counts():
    with db_connection() as connection:
        rows = connection.execute("SELECT kind, COUNT(*) AS total FROM submissions GROUP BY kind").fetchall()
    output = {bucket: 0 for bucket in BUCKETS}
    output.update({row["kind"]: row["total"] for row in rows})
    return output


def list_submissions():
    with db_connection() as connection:
        rows = connection.execute(
            "SELECT id, kind, created_at, payload FROM submissions ORDER BY created_at DESC"
        ).fetchall()

    return [
        {
            "id": row["id"],
            "kind": row["kind"],
            "created_at": row["created_at"],
            "payload": json.loads(row["payload"]),
        }
        for row in rows
    ]


def save_entry(bucket, data):
    with STORE_LOCK:
        entry = {
            "id": uuid.uuid4().hex,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            **data,
        }
        payload = {key: value for key, value in entry.items() if key not in {"id", "created_at"}}
        with db_connection() as connection:
            connection.execute(
                "INSERT INTO submissions (id, kind, created_at, payload) VALUES (?, ?, ?, ?)",
                (entry["id"], bucket, entry["created_at"], json.dumps(payload)),
            )

    return entry


def dealer_results(city):
    normalized = city.strip().title()
    return [
        {
            "name": f"MINI {normalized} Studio",
            "address": f"12 Performance Avenue, {normalized}",
            "phone": "+91 90000 12001",
        },
        {
            "name": f"MINI {normalized} Service Hub",
            "address": f"48 Cooper Road, {normalized}",
            "phone": "+91 90000 12002",
        },
    ]


class MiniHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".jpg": "image/jpeg",
    }

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "public, max-age=3600")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/admin":
            self.path = "/admin.html"

        if self.path == "/api/health":
            self.send_json(
                200,
                {
                    "ok": True,
                    "counts": counts(),
                },
            )
            return

        if self.path == "/api/admin/submissions":
            self.send_json(200, {"ok": True, "counts": counts(), "submissions": list_submissions()})
            return

        super().do_GET()

    def do_POST(self):
        try:
            data = read_json_body(self)

            if self.path == "/api/test-drive":
                require_fields(data, ["name", "email", "phone", "city", "date", "model"])
                validate_email(data["email"])
                entry = save_entry("test_drives", data)
                self.send_json(200, {"ok": True, "id": entry["id"]})
                return

            if self.path == "/api/build":
                require_fields(data, ["variant", "color", "mode"])
                entry = save_entry("builds", data)
                self.send_json(200, {"ok": True, "id": entry["id"]})
                return

            if self.path == "/api/newsletter":
                require_fields(data, ["email"])
                validate_email(data["email"])
                entry = save_entry("newsletters", data)
                self.send_json(200, {"ok": True, "id": entry["id"]})
                return

            if self.path == "/api/dealer":
                require_fields(data, ["city"])
                entry = save_entry("dealer_searches", data)
                self.send_json(200, {"ok": True, "id": entry["id"], "dealers": dealer_results(data["city"])})
                return

            self.send_json(404, {"ok": False, "error": "API endpoint not found."})
        except ValueError as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})
        except Exception:
            self.send_json(500, {"ok": False, "error": "Internal server error."})

    def translate_path(self, path):
        requested = unquote(path.split("?", 1)[0].split("#", 1)[0])
        if requested == "/":
            requested = "/index.html"

        resolved = (ROOT / requested.lstrip("/")).resolve()
        if not str(resolved).startswith(str(ROOT)):
            return str(ROOT / "index.html")

        return str(resolved)

    def guess_type(self, path):
        return mimetypes.guess_type(path)[0] or "application/octet-stream"


if __name__ == "__main__":
    init_db()
    migrate_json_store()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), MiniHandler)
    print(f"MINI experience running at http://127.0.0.1:{PORT}/")
    server.serve_forever()
