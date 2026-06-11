#!/usr/bin/env bash
set -e
# Wait for Postgres, then seed (idempotent), then serve.
python -c "import time, socket, os
host='postgres'; port=5432
for _ in range(60):
    try:
        socket.create_connection((host, port), 1).close(); break
    except OSError:
        time.sleep(1)
"
python -m app.seed.run || echo "seed step skipped/failed (continuing)"
python -m app.seed.enrich_learner || echo "enrichment step skipped/failed (continuing)"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
