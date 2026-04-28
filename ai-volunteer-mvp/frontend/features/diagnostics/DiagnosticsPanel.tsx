"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchWithRetry } from "@/lib/api/client";
import { ENDPOINTS, env } from "@/lib/api/endpoints";
import { toast } from "sonner";
import { 
  Database, 
  FileSearch,
  CheckCircle,
  ShieldAlert,
  Clock,
  Loader2,
  MapPin
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription,
  CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { cn } from "@/lib/utils";

export function DiagnosticsPanel({ needId }: { needId?: string }) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [isSimulating, setIsSimulating] = useState(false);

  const handleReset = async () => {
    if (!needId) return;
    
    try {
      // 1. Reset the need in the DB
      const { error: needError } = await supabase
        .from('needs')
        .update({ 
          status: 'unassigned', 
          assigned_to: null,
          updated_at: new Date().toISOString()
        })
        .eq('need_id', needId);

      if (needError) throw needError;

      // 2. Clear old match logs
      const { error: logError } = await supabase
        .from('match_logs')
        .delete()
        .eq('need_id', needId);

      if (logError) throw logError;

      toast.success("Match state reset successfully!");
      queryClient.invalidateQueries({ queryKey: ['need', needId] });
      queryClient.invalidateQueries({ queryKey: ['needs-list'] });
    } catch (error: any) {
      console.error("Reset failed:", error);
      toast.error("Failed to reset match state.");
    }
  };

  const { data: diagnostics, isLoading } = useQuery({
    queryKey: ["diagnostics-panel", needId ?? "global"],
    queryFn: async () => {
      const [latestNeedResult, latestLogResult] = await Promise.all([
        needId
          ? supabase
            .from("needs")
            .select("need_id, status, location_text, submitted_at, raw_text, assigned_to, metadata")
            .eq("need_id", needId)
            .maybeSingle()
          : supabase
            .from("needs")
            .select("need_id, status, location_text, submitted_at, raw_text, assigned_to, metadata")
              .order("submitted_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
        supabase
          .from("match_logs")
          .select("need_id, volunteer_id, match_score, timestamp, metadata")
          .eq(needId ? "need_id" : "need_id", needId || "")
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        latestNeed: latestNeedResult.data ?? null,
        latestLog: latestLogResult.data ?? null,
      };
    },
    staleTime: 1000 * 30,
  });

  const handleRematch = async () => {
    if (!needId) return;
    setIsSimulating(true);
    
    try {
      const headersObj: Record<string,string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      };

      const result = await fetchWithRetry<{ matched: boolean; volunteerId?: string; message?: string }>(
        ENDPOINTS.volunteerResponse,
        {
          method: 'POST',
          headers: headersObj as HeadersInit,
          body: JSON.stringify({
            action: 'REMATCH',
            needId: needId,
          }),
        }
      );
      if (result.matched) {
        toast.success(`Successfully matched volunteer: ${result.volunteerId}`);
      } else {
        toast.info(result.message || "No local volunteers found.");
      }
      
      queryClient.invalidateQueries({ queryKey: ['need', needId] });
      queryClient.invalidateQueries({ queryKey: ['needs-list'] });
    } catch (error: any) {
      console.error("Rematch failed:", error);
      toast.error("Failed to trigger AI matching.");
    } finally {
      setIsSimulating(false);
    }
  };

  const simulateResponse = async () => {
    const latestLog = diagnostics?.latestLog;
    if (!latestLog?.volunteer_id) {
      toast.error("No volunteer matched yet to simulate response for.");
      return;
    }

    setIsSimulating(true);
    try {
      const functionUrl = ENDPOINTS.volunteerResponse;
      const headersObj: Record<string,string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'apikey': env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      };

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: headersObj as HeadersInit,
        body: JSON.stringify({
          needId: needId,
          volunteerId: latestLog.volunteer_id,
          response: "YES"
        })
      });

      if (response.ok) {
        toast.success("Simulation successful! Volunteer accepted.");
        // Invalidate queries to refresh the UI
        queryClient.invalidateQueries({ queryKey: ["diagnostics-panel", needId ?? "global"] });
        queryClient.invalidateQueries({ queryKey: ["need-status-page", needId] });
      } else {
        const errData = await response.json().catch(() => ({}));
        toast.error(`Simulation failed: ${errData.error || "Check edge function logs"}`);
      }
    } catch (err) {
      toast.error("Network error during simulation.");
    } finally {
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    const needsChannel = supabase
      .channel(`diagnostics-needs-${needId ?? "global"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "needs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["diagnostics-panel", needId ?? "global"] });
      })
      .subscribe();

    const logsChannel = supabase
      .channel("diagnostics-logs")
      .on("postgres_changes", { event: "*", schema: "public", table: "match_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["diagnostics-panel", needId ?? "global"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(needsChannel);
      supabase.removeChannel(logsChannel);
    };
  }, [needId, queryClient, supabase]);

  const latestNeed = diagnostics?.latestNeed;
  const latestLog = diagnostics?.latestLog;

  return (
    <Card className="border-slate-200 dark:border-slate-800 yc-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold">Diagnostics & Control</CardTitle>
            <CardDescription>
              Live readout from Supabase needs and match logs.
            </CardDescription>
          </div>
          {needId && (
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                size="sm" 
                onClick={handleReset} 
                className="font-bold h-8 text-[10px] uppercase tracking-wider"
              >
                Reset Match
              </Button>
              {latestNeed?.status === 'unassigned' && (
                <Button 
                  size="sm" 
                  onClick={handleRematch} 
                  disabled={isSimulating}
                  className="bg-indigo-500 hover:bg-indigo-600 font-bold h-8 text-[10px] uppercase tracking-wider"
                >
                  {isSimulating ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Matching...
                    </>
                  ) : (
                    "Trigger AI Match"
                  )}
                </Button>
              )}
              {latestNeed?.status !== 'assigned' && latestNeed?.status !== 'unassigned' && (
                <Button 
                  size="sm" 
                  onClick={simulateResponse} 
                  disabled={isSimulating}
                  className="bg-indigo-500 hover:bg-indigo-600 font-bold h-8 text-[10px] uppercase tracking-wider"
                >
                  {isSimulating ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Simulating...
                    </>
                  ) : (
                    "Simulate YES"
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 dark:bg-slate-900 transition-all hover:border-primary/50 col-span-1 md:col-span-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded bg-indigo-500/10 text-indigo-500">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold">Geocoding Resolution</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-tight">
                    {latestNeed?.metadata?.geocoding_details ? (
                      <span className="text-indigo-500 font-bold">
                        {latestNeed.metadata.geocoding_details.city} ({latestNeed.metadata.geocoding_details.lat.toFixed(4)}, {latestNeed.metadata.geocoding_details.lng.toFixed(4)})
                      </span>
                    ) : (
                      "No GPS data available yet"
                    )}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className={cn(
                "text-[9px] uppercase font-bold",
                latestNeed?.metadata?.geocoding_result === 'success' ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-slate-500/10 text-slate-500 border-slate-500/20"
              )}>
                {latestNeed?.metadata?.geocoding_result || 'N/A'}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 dark:bg-slate-900 transition-all hover:border-primary/50">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded bg-primary/10 text-primary">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold">Latest Need</p>
                  <p className="text-[10px] text-muted-foreground">
                    {latestNeed ? `${latestNeed.location_text || "Unknown location"} · ${latestNeed.status}` : "No need rows yet"}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" disabled={!latestNeed}>
                Live
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 dark:bg-slate-900 transition-all hover:border-primary/50">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded bg-indigo-500/10 text-indigo-500">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold">Latest Match Log</p>
                  <p className="text-[10px] text-muted-foreground">
                    {latestLog ? `Need ${latestLog.need_id} · score ${latestLog.match_score ?? 0}` : "No match logs recorded yet"}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" disabled={!latestLog}>
                <FileSearch className="h-3 w-3" />
              </Button>
            </div>

            <div className="mt-4 p-3 rounded-lg border bg-slate-950 text-slate-400 font-mono text-[9px] overflow-x-auto max-h-40 col-span-1 md:col-span-2">
              <p className="text-slate-500 mb-2 uppercase tracking-widest font-bold">System Metadata JSON</p>
              <pre>{JSON.stringify(latestNeed?.metadata || {}, null, 2)}</pre>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="bg-slate-50/50 dark:bg-slate-900/50 border-t p-4 flex justify-between">
        <div className="flex items-center text-[10px] text-muted-foreground">
          <CheckCircle className="h-2.5 w-2.5 mr-1 text-green-500" />
          Backend readout from Supabase
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <Clock className="h-2.5 w-2.5" />
          {latestNeed?.submitted_at ? new Date(latestNeed.submitted_at).toLocaleTimeString() : "waiting for sync"}
        </div>
      </CardFooter>
    </Card>
  );
}
