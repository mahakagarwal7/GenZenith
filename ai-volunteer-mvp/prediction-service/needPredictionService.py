import os, json
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)
db = firestore.client()

def generate_predictions(region: str, days_lookback: int = 30) -> dict:
    cutoff = datetime.now() - timedelta(days=days_lookback)
    query = db.collection('needs_raw').where('location.text', '>=', region).where('submittedAt', '>=', cutoff)
    
    counts = {}
    for doc in query.stream():
        cat = doc.to_dict().get('category', 'unknown')
        counts[cat] = counts.get(cat, 0) + 1

    predicted = [
        {"category": c, "confidence": min(0.95, 0.5 + n*0.1), 
         "reason": "Recurring pattern detected" if n > 2 else "Emerging trend",
         "recommended_action": f"Pre-position {c.replace('_', ' ')} resources"}
        for c, n in counts.items() if n >= 2
    ]

    alert = "high" if len(predicted) > 3 else "medium" if len(predicted) > 1 else "low"
    return {"region": region, "prediction_horizon": "48_hours", "predicted_needs": predicted, "alert_level": alert}

def prediction_handler(request):
    region = request.args.get('region', 'Default_Region')
    result = generate_predictions(region)
    db.collection('predictions').add(result)
    return json.dumps(result), 200, {'Content-Type': 'application/json'}