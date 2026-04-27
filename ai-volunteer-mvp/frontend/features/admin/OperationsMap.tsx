"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Activity } from "lucide-react";

export function OperationsMap() {
  const supabase = createClient();
  const [needs, setNeeds] = useState<any[]>([]);

  const fetchNeeds = async () => {
    const { data } = await supabase
      .from("needs")
      .select("*")
      .not("location_geo", "is", null)
      .in("status", ["unassigned", "pending_acceptance", "assigned"]);
    
    if (data) {
      setNeeds(data.map(n => {
        // Parse POINT(lng lat)
        const match = n.location_geo.match(/POINT\(([-0-9.]+)\s+([-0-9.]+)\)/i);
        return {
          ...n,
          lat: match ? parseFloat(match[2]) : 0,
          lng: match ? parseFloat(match[1]) : 0,
        };
      }));
    }
  };

  useEffect(() => {
    fetchNeeds();
    const channel = supabase
      .channel("map-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "needs" }, fetchNeeds)
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card className="overflow-hidden border-slate-200 dark:border-slate-800 yc-shadow">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <MapPin className="h-4 w-4 text-rose-500" />
              Live Operations Overview
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Showing active needs and their latest known locations without depending on the browser map SDK.
            </p>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Activity className="h-3 w-3" />
            {needs.length} tracked
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3 md:p-6">
        {needs.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No active needs with coordinates yet.
          </div>
        ) : (
          needs.slice(0, 6).map((need) => (
            <div key={need.need_id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {need.category || "general"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {need.location_text || "Unknown location"}
                  </p>
                </div>
                <Badge variant={need.status === "assigned" ? "default" : "secondary"}>
                  {need.status}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <div>
                  <span className="block font-medium uppercase tracking-wide text-slate-400">Lat</span>
                  <span>{need.lat?.toFixed?.(4) ?? "-"}</span>
                </div>
                <div>
                  <span className="block font-medium uppercase tracking-wide text-slate-400">Lng</span>
                  <span>{need.lng?.toFixed?.(4) ?? "-"}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
