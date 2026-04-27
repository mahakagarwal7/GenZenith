"use client";

export const dynamic = 'force-dynamic';

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { AdminNeedsTable } from "@/features/admin/AdminNeedsTable";
import {
  ArrowUpRight,
  Users,
  MessageSquare,
  Activity,
  AlertTriangle,
  CheckCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { OperationsMap } from "@/features/admin/OperationsMap";
import Link from "next/link";

type DashboardSnapshot = {
  activeRequests: number;
  awaitingResponses: number;
  assignedRequests: number;
  failedRequests: number;
  matchingRate: string;
  systemLoad: string;
  recentNeeds: Array<{
    need_id: string;
    status: string;
    category: string | null;
    location_text: string | null;
    submitted_at: string;
  }>;
  updatedAt: string;
};

import { useState } from "react";

export default function Dashboard() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setSearchQuery(params.get("search") || "");
    } catch (e) {
      setSearchQuery("");
    }
  }, []);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-snapshot"] });
    queryClient.invalidateQueries({ queryKey: ["needs-list"] });
  };

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["dashboard-snapshot"],
    queryFn: async (): Promise<DashboardSnapshot> => {
      const [activeRequestsResult, awaitingResponsesResult, assignedResult, failedResult, recentNeedsResult] = await Promise.all([
        supabase.from("needs").select("need_id", { count: "exact", head: true }).in("status", ["needs_validation", "unassigned", "pending_acceptance", "assigned"]),
        supabase.from("needs").select("need_id", { count: "exact", head: true }).eq("status", "pending_acceptance"),
        supabase.from("needs").select("need_id", { count: "exact", head: true }).eq("status", "assigned"),
        supabase.from("needs").select("need_id", { count: "exact", head: true }).eq("status", "needs_validation"),
        supabase
          .from("needs")
          .select("need_id, status, category, location_text, submitted_at")
          .order("submitted_at", { ascending: false })
          .limit(4),
      ]);

      const activeRequests = activeRequestsResult.count ?? 0;
      const awaitingResponses = awaitingResponsesResult.count ?? 0;
      const assignedRequests = assignedResult.count ?? 0;
      const failedRequests = failedResult.count ?? 0;
      const totalProcessed = assignedRequests + failedRequests;
      const matchingRate = totalProcessed > 0 ? `${Math.round((assignedRequests / totalProcessed) * 100)}%` : "0%";
      const systemLoad = activeRequests > 12 ? "Elevated" : "Healthy";

      return {
        activeRequests,
        awaitingResponses,
        assignedRequests,
        failedRequests,
        matchingRate,
        systemLoad,
        recentNeeds: (recentNeedsResult.data ?? []) as DashboardSnapshot["recentNeeds"],
        updatedAt: new Date().toISOString(),
      };
    },
    staleTime: 1000 * 30, // 30 seconds
  });

  useEffect(() => {
    // 1. PostgreSQL Realtime Subscription
    const needsChannel = supabase
      .channel("dashboard-master-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "needs" }, (payload) => {
        console.log("Realtime change detected:", payload.eventType);
        handleRefresh();
      })
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    // 2. Safety Heartbeat (every 15 seconds)
    const heartbeat = setInterval(() => {
      handleRefresh();
    }, 15000);

    return () => {
      supabase.removeChannel(needsChannel);
      clearInterval(heartbeat);
    };
  }, [queryClient, supabase]);

  const alerts = snapshot?.recentNeeds ?? [];

  return (
    <div className="space-y-10 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight">Operations</h1>
          <p className="text-muted-foreground">
            Monitoring urgent community needs and volunteer logistics in real-time.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href="/submit">
              <Plus className="mr-2 h-4 w-4" />
              New Manual Entry
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard
              title="Active Requests"
              value={String(snapshot?.activeRequests ?? 0)}
              description="Open needs in Supabase"
              icon={Activity}
              trend={
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-green-600 font-bold uppercase tracking-tighter text-[9px]">Live</span>
                  <span>Synced {snapshot?.updatedAt ? new Date(snapshot.updatedAt).toLocaleTimeString() : "..."}</span>
                </div>
              }
            />
            <StatCard
              title="Awaiting Response"
              value={String(snapshot?.awaitingResponses ?? 0)}
              description="Pending volunteer YES/NO"
              icon={MessageSquare}
              trend={`${snapshot?.recentNeeds.length ?? 0} live recent requests`}
            />
            <StatCard
              title="Matching Rate"
              value={snapshot?.matchingRate ?? "0%"}
              description="Assigned vs failed needs"
              icon={CheckCircle}
              trend={`${snapshot?.assignedRequests ?? 0} assigned / ${snapshot?.failedRequests ?? 0} failed`}
            />
            <StatCard
              title="System Load"
              value={snapshot?.systemLoad ?? "Unknown"}
              description="Derived from open and failed requests"
              icon={Users}
              trend={`${snapshot?.recentNeeds.length ?? 0} requests shown below`}
            />
          </>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-7">
        <div className="lg:col-span-5 space-y-8">
          <OperationsMap />
          
          <Card className="yc-shadow border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <CardTitle className="text-lg font-bold">Inbound Intelligence Stream</CardTitle>
                  {searchQuery && (
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                      FILTERED BY: {searchQuery.toUpperCase()}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  A real-time list of all incoming WhatsApp requests and their current status.
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-xs" asChild>
                <Link href="/diagnostics">
                  View Diagnostics <ArrowUpRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0 border-t">
              <AdminNeedsTable searchQuery={searchQuery} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <Card className="yc-shadow border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Live Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <>
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </>
              ) : alerts.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border text-xs text-muted-foreground">
                  No open requests are waiting right now.
                </div>
              ) : (
                alerts.map((need) => (
                  <AlertItem
                    key={need.need_id}
                    type={need.status === "failed" || need.status === "no_volunteers" ? "warning" : "info"}
                    title={need.category || "General Assistance"}
                    description={`${need.location_text || "Unknown location"} · ${need.status.replace(/_/g, " ")}`}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <div className="p-6 rounded-xl bg-primary text-primary-foreground space-y-4">
            <h3 className="font-bold">WhatsApp Visibility</h3>
            <p className="text-xs opacity-80 leading-relaxed">
              The dashboard is reading directly from Supabase. Last sync: {snapshot?.updatedAt ? new Date(snapshot.updatedAt).toLocaleTimeString() : "waiting for live data"}.
            </p>
            <Button variant="secondary" size="sm" className="w-full text-xs font-bold" asChild>
              <Link href="/diagnostics">Open Diagnostics</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, description, icon: Icon, trend }: any) {
  return (
    <Card className="yc-shadow border-slate-200 dark:border-slate-800 transition-all hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        <p className="text-[10px] text-muted-foreground mt-1">{description}</p>
        <div className="mt-4 pt-4 border-t flex items-center text-[10px] font-bold text-green-500">
          <ArrowUpRight className="h-3 w-3 mr-1" />
          {trend}
        </div>
      </CardContent>
    </Card>
  );
}

function StatSkeleton() {
  return <Skeleton className="h-[132px] w-full rounded-xl" />;
}

function AlertItem({ type, title, description }: any) {
  return (
    <div className="flex items-start space-x-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border text-xs">
      {type === "warning" ? (
        <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5" />
      ) : (
        <CheckCircle className="h-3 w-3 text-blue-500 mt-0.5" />
      )}
      <div className="space-y-1">
        <p className="font-bold">{title}</p>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
