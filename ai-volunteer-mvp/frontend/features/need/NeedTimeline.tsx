"use client";

import { StatusTimeline } from "@/components/features/status-timeline";

export function NeedTimeline({ needId }: { needId: string }) {
  return <StatusTimeline needId={needId} />;
}
