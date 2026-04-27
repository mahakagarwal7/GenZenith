"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Need } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ExternalLink, 
  ChevronRight, 
  Clock, 
  MapPin, 
  User 
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminNeedsTable({ searchQuery }: { searchQuery?: string }) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [realtimeNeeds, setRealtimeNeeds] = useState<Record<string, Need>>({});

  const { data: initialNeeds, isLoading } = useQuery({
    queryKey: ["needs-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("needs")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(50);
      
      if (error) {
        console.warn("Failed to load needs", error);
        return [];
      }
      return data as Need[];
    },
    staleTime: 1000 * 30,
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

  const [visibleCount, setVisibleCount] = useState(10);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-slate-100 dark:bg-slate-900" />
        ))}
      </div>
    );
  }

  const mergedNeedsMap = new Map(initialNeeds?.map((n) => [n.need_id, n]));
  Object.values(realtimeNeeds).forEach((n) => mergedNeedsMap.set(n.need_id, n));
  
  let displayNeeds = Array.from(mergedNeedsMap.values()).sort(
    (a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()
  );

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    displayNeeds = displayNeeds.filter(n => 
      n.need_id.toLowerCase().includes(q) || 
      (n.category?.toLowerCase() || "").includes(q) ||
      (n.location_text?.toLowerCase() || "").includes(q)
    );
  }

  const paginatedNeeds = displayNeeds.slice(0, visibleCount);
  const hasMore = displayNeeds.length > visibleCount;

  return (
    <div className="w-full flex flex-col">
      <div className="grid grid-cols-1 divide-y divide-slate-100 dark:divide-slate-800">
        {paginatedNeeds.map((need) => (
          <Link 
            key={need.need_id} 
            href={`/status/${need.need_id}`}
            className="group block p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center border transition-colors",
                  need.status === "assigned" ? "bg-green-500/10 border-green-500/20 text-green-500" :
                  need.status === "pending_acceptance" ? "bg-blue-500/10 border-blue-500/20 text-blue-500" :
                  "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
                )}>
                  {need.status === "assigned" ? <User className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold tracking-tight">
                      {need.category || "General Assistance"}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 uppercase font-bold tracking-wider opacity-70">
                      {need.status.replace("_", " ")}
                    </Badge>
                    {need.metadata?.is_image && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-amber-500/10 text-amber-500 border-amber-500/20">
                        OCR
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                    <div className="flex items-center truncate max-w-[120px] sm:max-w-[200px]">
                      <MapPin className="h-3 w-3 mr-1 shrink-0" />
                      <span className="truncate">{need.location_text || "Unknown Location"}</span>
                    </div>
                    <div className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {new Date(need.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center text-slate-300 dark:text-slate-700 group-hover:text-primary group-hover:translate-x-1 transition-all">
                <ChevronRight className="h-5 w-5" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <div className="p-4 flex justify-center border-t border-slate-100 dark:border-slate-800">
          <button 
            onClick={() => setVisibleCount(prev => prev + 10)}
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors py-2 px-4 rounded-full border border-slate-200 dark:border-slate-800 hover:border-primary/20 bg-slate-50/50 dark:bg-slate-900/50"
          >
            Load More Requests
          </button>
        </div>
      )}

      {displayNeeds.length === 0 && !isLoading && (
        <div className="p-12 text-center text-muted-foreground">
          No matching requests found.
        </div>
      )}
    </div>
  );
}
