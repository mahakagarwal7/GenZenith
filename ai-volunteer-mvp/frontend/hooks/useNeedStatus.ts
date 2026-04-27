"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { ApiNeed, ApiNeedSchema } from "@/validators";

/**
 * Staff-level hook for real-time status tracking.
 * Combines initial React Query fetch with Supabase Realtime subscriptions.
 */
export function useNeedStatus(needId: string) {
  const supabase = createClient();
  const [realtimeData, setRealtimeData] = useState<Partial<ApiNeed> | null>(null);

  // Initial fetch using React Query
  const query = useQuery({
    queryKey: ["need-status", needId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("needs")
        .select("*")
        .eq("need_id", needId)
        .single();

      if (error) throw error;
      
      // Runtime validation of backend data
      return ApiNeedSchema.parse(data);
    },
    staleTime: 1000 * 60, // 1 minute
  });

  // Real-time synchronization
  useEffect(() => {
    if (!needId) return;

    const channel = supabase
      .channel(`need-updates-${needId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "needs",
          filter: `need_id=eq.${needId}`,
        },
        (payload) => {
          console.log("🟢 Real-time Update Received:", payload.new);
          // Validate incoming realtime payload
          const validated = ApiNeedSchema.partial().safeParse(payload.new);
          if (validated.success) {
            setRealtimeData(validated.data);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [needId, supabase]);

  return {
    ...query,
    data: realtimeData ? { ...query.data, ...realtimeData } as ApiNeed : query.data,
  };
}
