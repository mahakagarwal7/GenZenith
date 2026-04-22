import os
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import psycopg2
import pytest


@pytest.fixture()
def mock_prediction_db(monkeypatch):
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = [
        ('water_supply', 'TestRegion', '2026-04-20T00:00:00+00:00'),
        ('water_supply', 'TestRegion', '2026-04-20T01:00:00+00:00'),
        ('medical', 'TestRegion', '2026-04-20T02:00:00+00:00'),
        ('food', 'TestRegion', '2026-04-20T03:00:00+00:00')
    ]

    mock_conn = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    monkeypatch.setattr('needPredictionService.get_db_connection', lambda: mock_conn)
    return mock_conn


@pytest.fixture()
def seeded_local_postgres():
    """
    Optional integration fixture.
    Requires a running local Supabase/Postgres and SUPABASE_DB_URL.
    """
    db_url = os.getenv('SUPABASE_DB_URL')
    if not db_url:
        pytest.skip('Set SUPABASE_DB_URL to run integration tests against local Supabase/Postgres.')

    conn = psycopg2.connect(db_url)
    conn.autocommit = True

    volunteer_id = str(uuid4())
    now = datetime.now(timezone.utc)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO volunteers (id, status, skills, total_assignments, active_tasks, typical_capacity)
            VALUES (%s, 'available', ARRAY['first_aid'], 0, 0, 1)
            ON CONFLICT (id) DO NOTHING
            """,
            (volunteer_id,)
        )

        cur.execute(
            """
            INSERT INTO needs (
              need_id, source, submitted_at, location_text, category, subcategory,
              urgency, raw_text, confidence, status, assigned_to, ngo_id
            )
            VALUES (%s, 'whatsapp', %s, 'TestRegion', 'water_supply', 'pending', 'urgent',
                    'Need water', 0.9, 'completed', %s, 'ngo_default_01')
            """,
            (str(uuid4()), now, volunteer_id)
        )

    yield

    with conn.cursor() as cur:
        cur.execute("DELETE FROM needs WHERE ngo_id = 'ngo_default_01' AND location_text = 'TestRegion'")
        cur.execute("DELETE FROM volunteers WHERE id = %s", (volunteer_id,))

    conn.close()