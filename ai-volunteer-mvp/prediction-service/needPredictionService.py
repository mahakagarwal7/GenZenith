import json
import os
from datetime import datetime, timedelta, timezone

import psycopg2

_db_conn = None


def get_db_connection():
    global _db_conn

    if _db_conn is not None and getattr(_db_conn, 'closed', 1) == 0:
        return _db_conn

    db_url = os.getenv('SUPABASE_DB_URL', '')
    if not db_url:
        raise RuntimeError('SUPABASE_DB_URL is required')

    _db_conn = psycopg2.connect(db_url)
    _db_conn.autocommit = True
    return _db_conn


def fetch_recent_needs(region: str, cutoff: datetime) -> list[dict]:
    conn = get_db_connection()

    # Firestore -> SQL translation examples:
    # db.collection('needs').where('status', '==', 'completed').get()
    #   => SELECT * FROM needs WHERE status = 'completed';
    # db.collection('needs').where('submittedAt', '>=', cutoff).get()
    #   => SELECT * FROM needs WHERE submitted_at >= %s;
    # Geo note:
    #   For proximity, prefer PostGIS SQL such as:
    #   ST_DWithin(location_geo, ST_SetSRID(ST_MakePoint(%s,%s), 4326)::geography, %s)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT category, location_text, submitted_at
            FROM needs
            WHERE status = %s
              AND location_text ILIKE %s
              AND submitted_at >= %s
            """,
            ('completed', f'%{region}%', cutoff)
        )
        rows = cur.fetchall()

    return [
        {
            'category': row[0],
            'location_text': row[1],
            'submitted_at': row[2]
        }
        for row in rows
    ]


def store_prediction(result: dict) -> None:
    conn = get_db_connection()

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO predictions (region, prediction_horizon, predicted_needs, alert_level)
            VALUES (%s, %s, %s::jsonb, %s)
            """,
            (
                result['region'],
                result['prediction_horizon'],
                json.dumps(result['predicted_needs']),
                result['alert_level']
            )
        )

def generate_predictions(region: str, days_lookback: int = 30) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_lookback)
    rows = fetch_recent_needs(region, cutoff)

    counts = {}
    for row in rows:
        cat = row.get('category', 'unknown')
        counts[cat] = counts.get(cat, 0) + 1

    predicted = [
        {"category": c, "confidence": min(0.95, 0.6 + n*0.1), 
         "reason": "Recurring pattern detected" if n > 2 else "Emerging trend",
         "recommended_action": f"Pre-position {c.replace('_', ' ')} resources"}
        for c, n in counts.items() if n >= 2
    ]

    alert = "high" if len(predicted) > 3 else "medium" if len(predicted) > 0 else "low"
    return {"region": region, "prediction_horizon": "48_hours", "predicted_needs": predicted, "alert_level": alert}

def prediction_handler(request):
    region = request.args.get('region', 'Default_Region')
    result = generate_predictions(region)
    store_prediction(result)
    return json.dumps(result), 200, {'Content-Type': 'application/json'}