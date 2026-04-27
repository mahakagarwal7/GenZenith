"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Need } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

export function AdminNeedsTable() {
  const supabase = createClient();
  const [realtimeNeeds, setRealtimeNeeds] = useState<Record<string, Need>>({});

  const { data: initialNeeds, isLoading } = useQuery({
    queryKey: ["needs-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("needs")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(20);
      
      if (error) {
        console.warn("Failed to load needs", error);
        return [];
      }
      return data as Need[];
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const channel = supabase
      .channel("needs-list-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "needs" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const need = payload.new as Need;
            setRealtimeNeeds((prev) => ({ ...prev, [need.need_id]: need }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  // Merge initial and realtime needs, keep sorting
  const mergedNeedsMap = new Map(initialNeeds?.map((n) => [n.need_id, n]));
  Object.values(realtimeNeeds).forEach((n) => mergedNeedsMap.set(n.need_id, n));
  
  const displayNeeds = Array.from(mergedNeedsMap.values()).sort(
    (a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()
  );

  if (displayNeeds.length === 0) {
    return <div className="text-center py-8 text-slate-500">No requests found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
          <tr>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayNeeds.map((need) => (
            <tr key={need.need_id} className="border-b border-slate-800 hover:bg-slate-800/20 transition-colors">
              <td className="px-4 py-3">
                <Badge variant={need.status === "assigned" ? "default" : need.status === "failed" ? "destructive" : "secondary"}>
                  {need.status.replace("_", " ")}
                </Badge>
              </td>
              <td className="px-4 py-3 font-medium">{need.category || "Uncategorized"}</td>
              <td className="px-4 py-3 text-slate-400">{need.location_text || "Unknown"}</td>
              <td className="px-4 py-3 text-slate-400">
                {need.submitted_at ? new Date(need.submitted_at).toLocaleTimeString() : "-"}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/status/${need.need_id}`}
                  className="inline-flex items-center text-indigo-400 hover:text-indigo-300"
                >
                  View <ExternalLink className="w-3 h-3 ml-1" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
