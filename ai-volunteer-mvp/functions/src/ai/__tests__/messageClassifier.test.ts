import { classifyMessage } from '../messageClassifier';
import { MessageClassification } from '../../shared-types';

describe('Message Classifier', () => {
  it('flags critical medical emergencies with 15m SLA', () => {
    const res = classifyMessage('Emergency! Bleeding severely, need blood now.', 'msg-1');
    expect(res.classification).toBe('critical');
    expect(res.routing.immediate_action).toBe(true);
    expect(res.routing.sla_minutes).toBe(15);
  });

  it('classifies low-urgency updates for batch review', () => {
    const res = classifyMessage('Weekly status update on road repairs.', 'msg-2');
    expect(res.classification).toBe('low');
    expect(res.routing.sla_minutes).toBe(60);
  });
});