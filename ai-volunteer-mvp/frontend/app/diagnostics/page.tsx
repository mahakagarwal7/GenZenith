"use client";

import { ActivityPanel } from "@/features/diagnostics/ActivityPanel";
import { DiagnosticsPanel } from "@/features/diagnostics/DiagnosticsPanel";
import { 
  Terminal, 
  Settings, 
  ShieldCheck, 
  Database,
  ArrowUpRight,
  RefreshCw,
  Cpu
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export default function DiagnosticsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [startTime] = useState(Date.now());

  // Health Checks
  const { data: health, isLoading: isHealthLoading } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const t1 = Date.now();
      const { data: edgeOk, error: edgeError } = await supabase.functions.invoke("whatsapp-webhook", {
        method: "POST",
        body: {}, // Dummy body to check reachability
      });
      const edgeLatency = Date.now() - t1;

      const t2 = Date.now();
      const { data: dbOk, error: dbError } = await supabase.from("needs").select("count").limit(1).maybeSingle();
      const dbLatency = Date.now() - t2;

      return {
        edge: {
          status: !edgeError ? "Healthy" : "Error",
          latency: `${edgeLatency}ms`,
          connected: !edgeError
        },
        db: {
          status: !dbError ? "Connected" : "Disconnected",
          latency: `${dbLatency}ms`,
          connected: !dbError
        }
      };
    },
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-10 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight">Diagnostics</h1>
          <p className="text-muted-foreground">
            Monitor system health and inspect low-level pipeline execution.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ["system-health"] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm">
            <Settings className="mr-2 h-4 w-4" />
            Config
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Log Stream */}
        <div className="lg:col-span-8 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Terminal className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">Real-time Event Stream</h2>
              </div>
              <div className="flex items-center space-x-2 text-[10px] text-muted-foreground">
                <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                <span>WS_CONNECTED</span>
              </div>
            </div>
            <ActivityPanel />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <HealthCard 
              title="Edge Functions"
              status={health?.edge.status || "Checking..."}
              latency={health?.edge.latency || "---"}
              icon={ShieldCheck}
              connected={health?.edge.connected}
            />
            <HealthCard 
              title="Postgres Auth"
              status={health?.db.status || "Checking..."}
              latency={health?.db.latency || "---"}
              icon={Database}
              connected={health?.db.connected}
            />
          </div>
        </div>

        {/* Right: Tools & Summary */}
        <div className="lg:col-span-4 space-y-8">
          <DiagnosticsPanel />

          <Card className="yc-shadow border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                System Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <MetaRow label="Version" value="v1.5.0-live" />
              <MetaRow label="Env" value={process.env.NODE_ENV || "development"} />
              <MetaRow label="Region" value="Local Dev (Windows)" />
              <MetaRow label="Runtime" value="Deno / Next.js 15" />
              <MetaRow label="Uptime" value={`${Math.floor((Date.now() - startTime) / 1000)}s`} />
              
              <div className="pt-4 border-t">
                <Button variant="ghost" size="sm" className="w-full text-xs text-primary font-bold">
                  View Full Stack Trace <ArrowUpRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HealthCard({ title, status, latency, icon: Icon, connected }: any) {
  return (
    <div className="p-4 rounded-xl border bg-white dark:bg-slate-950 yc-shadow flex items-center justify-between transition-all hover:border-primary/50">
      <div className="flex items-center space-x-3">
        <div className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center border transition-colors",
          connected ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground">{title}</p>
          <p className="text-sm font-bold">{status}</p>
        </div>
      </div>
      <div className="text-xs font-mono text-slate-400">
        {latency}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: any) {
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-bold text-primary">{value}</span>
    </div>
  );
}

import { cn } from "@/lib/utils";

