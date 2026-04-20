// Shared domain models - Single source of truth
// (mirrored from ../shared/types.ts to satisfy TypeScript rootDir validation)

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface MessageClassification {
  message_id: string;
  classification: 'critical' | 'urgent' | 'normal' | 'low';
  category: string;
  confidence: number;
  routing: {
    immediate_action: boolean;
    notification_targets: string[];
    sla_minutes: number;
  };
  duplicate_check: {
    is_duplicate: boolean;
    similar_requests: string[];
  };
}

export interface Need {
  needId: string;
  source: 'whatsapp' | 'sms';
  submittedAt: string; // ISO timestamp
  location: {
    geo: GeoPoint | null;
    text: string;
  };
  category: string;
  subcategory: string;
  urgency: 'critical' | 'urgent' | 'normal' | 'low';
  rawText: string;
  confidence: number;
  status: 'needs_validation' | 'unassigned' | 'pending_acceptance' | 'assigned' | 'completed';
  assignedTo: string | null;
  ngoId: string;
  classification?: MessageClassification;
  contactNumber?: string;
}

export interface Volunteer {
  id: string;
  location: GeoPoint;
  skills: string[];
  status: 'available' | 'on-mission' | 'offline';
  historicalResponseRate: number; // 0.0 to 1.0
  typicalCapacity: number; // max concurrent tasks
  totalAssignments: number;
  activeTasks: number;
  lastActiveHour: number; // 0-23
}

export interface PredictionOutput {
  region: string;
  prediction_horizon: string;
  predicted_needs: Array<{
    category: string;
    confidence: number;
    reason: string;
    recommended_action: string;
  }>;
  alert_level: 'low' | 'medium' | 'high';
}

export interface VolunteerInsight {
  volunteer_id: string;
  predicted_availability: {
    now: boolean;
    reason: string;
    next_available_window: string;
  };
  skill_recommendations: Array<{
    skill: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }>;
  engagement_health: 'good' | 'at_risk' | 'declining';
  recent_activity: {
    tasks_completed: number;
    tasks_declined: number;
    avg_response_time: string;
  };
}
