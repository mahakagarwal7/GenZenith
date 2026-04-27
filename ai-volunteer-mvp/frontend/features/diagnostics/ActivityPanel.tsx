"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Terminal, 
  ChevronRight, 
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { MatchLog } from "@/types";

type LogEntry = {
  id: string;
  timestamp: string;
  type: "webhook" | "delivery" | "processing";
  status: "success" | "error" | "warning";
  title: string;
  payload: any;
};

export function ActivityPanel() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const supabase = createClient();

  const { data: initialLogs } = useQuery({
    queryKey: ["match-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("match_logs")
        .select("need_id, volunteer_id, match_score, timestamp, metadata")
        .order("timestamp", { ascending: false })
        .limit(20);

      if (error) {
        throw error;
      }

      return (data ?? []) as MatchLog[];
    },
    staleTime: 1000 * 15,
  });

  useEffect(() => {
    setLiveLogs(
      (initialLogs ?? []).map((log, index) => ({
        id: `${log.need_id}-${log.volunteer_id}-${index}`,
        timestamp: new Date(log.timestamp).toLocaleTimeString(),
        type: log.metadata?.type === "delivery" ? "delivery" : log.metadata?.type === "webhook" ? "webhook" : "processing",
        status: log.metadata?.status === "error" ? "error" : "success",
        title: log.metadata?.title || `Match log for ${log.need_id}`,
        payload: log.metadata ?? { need_id: log.need_id, volunteer_id: log.volunteer_id, match_score: log.match_score },
      }))
    );
  }, [initialLogs]);

  useEffect(() => {
    const channel = supabase
      .channel("match-log-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_logs" },
        (payload) => {
          const row = payload.new as MatchLog;
          setLiveLogs((current) => [
            {
              id: `${row.need_id}-${row.volunteer_id}-${row.timestamp}`,
              timestamp: new Date(row.timestamp).toLocaleTimeString(),
              type: row.metadata?.type === "delivery" ? "delivery" : row.metadata?.type === "webhook" ? "webhook" : "processing",
              status: row.metadata?.status === "error" ? "error" : "success",
              title: row.metadata?.title || `Match log for ${row.need_id}`,
              payload: row.metadata ?? { need_id: row.need_id, volunteer_id: row.volunteer_id, match_score: row.match_score },
            },
            ...current,
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <Card className="h-full border-slate-200 dark:border-slate-800 yc-shadow bg-slate-950 text-slate-200 font-mono">
      <CardHeader className="border-b border-slate-800 pb-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Terminal className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-bold tracking-tight">System Logs</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 animate-pulse">
            LIVE
          </Badge>
        </div>
        <CardDescription className="text-xs text-slate-500">
          Real-time activity from Twilio and Supabase Edge Functions.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-96 overflow-y-auto">
          {liveLogs.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">
              No match logs have been recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {liveLogs.map((log) => (
                <div key={log.id} className="p-3 hover:bg-slate-900 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      {log.status === "success" ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-bold">{log.title}</p>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                          <Clock className="h-2.5 w-2.5" />
                          <span>{log.timestamp}</span>
                          <span className="uppercase">{log.type}</span>
                        </div>
                      </div>
                    </div>
                    {expandedId === log.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </div>

                  <AnimatePresence>
                    {expandedId === log.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <pre className="mt-3 p-2 bg-black rounded border border-slate-800 text-[10px] text-slate-400 overflow-x-auto">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
