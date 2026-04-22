import os

if 'SUPABASE_DB_URL' not in os.environ:
    os.environ['SUPABASE_DB_URL'] = 'postgresql://localhost/test'

from needPredictionService import generate_predictions

def test_generates_high_alert(mock_prediction_db):
    res = generate_predictions('TestRegion', 7)

    assert res['alert_level'] == 'medium'
    assert any(p['category'] == 'water_supply' for p in res['predicted_needs'])
    assert res['predicted_needs'][0]['confidence'] >= 0.8