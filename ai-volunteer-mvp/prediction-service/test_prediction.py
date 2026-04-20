import unittest
from unittest.mock import patch, MagicMock
from needPredictionService import generate_predictions

class TestPredictionEngine(unittest.TestCase):
    @patch('needPredictionService.firestore')
    def test_generates_high_alert(self, mock_fs):
        mock_query = MagicMock()
        mock_query.stream.return_value = [
            MagicMock(to_dict=lambda: {'category': 'water_supply'}),
            MagicMock(to_dict=lambda: {'category': 'water_supply'}),
            MagicMock(to_dict=lambda: {'category': 'medical'}),
            MagicMock(to_dict=lambda: {'category': 'food'})
        ]
        mock_fs.client.return_value.collection.return_value.where.return_value.where.return_value = mock_query

        res = generate_predictions("TestRegion", 7)
        self.assertEqual(res['alert_level'], 'medium')
        self.assertTrue(any(p['category'] == 'water_supply' for p in res['predicted_needs']))
        self.assertGreaterEqual(res['predicted_needs'][0]['confidence'], 0.8)

if __name__ == '__main__':
    unittest.main()