Local runtime data lives here.

This directory is intentionally ignored except for this README. The local
SQLite database (`app.db`), Hydro-Quebec raw snapshots (`raw/`), disclosure
downloads, and generated SQLite sidecar files are created by development,
collection, or rebuild commands and should not be committed.

For a fresh local database, run the collection commands from the top-level
README or restore a known snapshot from an external artifact store. Production
durable data lives in Cloudflare D1/R2, while the Flask/container path may still
use a baked SQLite snapshot as an implementation detail.
