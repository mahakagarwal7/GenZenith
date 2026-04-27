"use client";

import { StatusTimeline } from "@/components/features/status-timeline";
import { ActivityPanel } from "@/features/diagnostics/ActivityPanel";
import { DiagnosticsPanel } from "@/features/diagnostics/DiagnosticsPanel";
import { AssignmentCard } from "@/features/volunteer/AssignmentCard";
import { 
  ArrowLeft, 
  Share2, 
  ExternalLink,
  ShieldAlert,
  Loader2
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { Need, Volunteer } from "@/types";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function StatusPage() {
  const params = useParams<{ need_id: string }>();
  const need_id = params?.need_id;
  const supabase = createClient();
  const [realtimeNeed, setRealtimeNeed] = useState<Need | null>(null);

  const { data: initialNeed, isLoading: isNeedLoading } = useQuery({
    queryKey: ["need-status-page", need_id],
    queryFn: async () => {
      if (!need_id || need_id === "undefined") return null;
      const { data, error } = await supabase
        .from("needs")
        .select("*")
        .eq("need_id", need_id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as Need | null;
    },
    enabled: Boolean(need_id) && need_id !== "undefined",
  });

  useEffect(() => {
    if (!need_id || need_id === "undefined") return;

    const channel = supabase
      .channel(`status-page-need-${need_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "needs",
          filter: `need_id=eq.${need_id}`,
        },
        (payload) => {
          if (payload.new) {
            setRealtimeNeed(payload.new as Need);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [need_id, supabase]);

  const need = realtimeNeed || initialNeed;

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("URL copied to clipboard!");
  };

  if (!need_id || need_id === "undefined") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Invalid Need ID</h2>
        <p className="text-muted-foreground text-center max-w-md">
          The link you followed seems to be broken. Please return to the dashboard to select a valid request.
        </p>
        <Button asChild>
          <Link href="/">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const assignedVolunteerId = need?.assigned_to ?? null;

  const { data: volunteer } = useQuery({
    queryKey: ["assigned-volunteer", assignedVolunteerId],
    queryFn: async () => {
      if (!assignedVolunteerId) {
        return null;
      }

      const { data, error } = await supabase
        .from("volunteers")
        .select("*")
        .eq("id", assignedVolunteerId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as Volunteer | null;
    },
    enabled: Boolean(assignedVolunteerId),
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <Link 
            href="/" 
            className="text-sm text-muted-foreground hover:text-foreground flex items-center mb-2 transition-colors"
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back to Dashboard
          </Link>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold tracking-tight">Need Status</h1>
            <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-muted-foreground">
              {need_id}
            </span>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            This request is tracked directly from Supabase and updates live as the backend changes.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-2" />
            Share URL
          </Button>
          <Button size="sm" variant="secondary" disabled>
            <ExternalLink className="h-4 w-4 mr-2" />
            Backend Link Unavailable
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Pipeline */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 yc-shadow">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Intelligence Pipeline
              </h3>
              <div className="flex items-center text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-bold">
                ACTIVE
              </div>
            </div>
            <StatusTimeline needId={need_id} need={need} />
          </div>
        </div>

        {/* Center/Right Column: Assignment & Logs */}
        <div className="lg:col-span-8 space-y-8">
          {/* Assignment Section (Show when matched/assigned) */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold">Matched Assignment</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {volunteer ? (
                <AssignmentCard volunteer={volunteer} />
              ) : (
                <Card className="border-slate-200 dark:border-slate-800 yc-shadow">
                  <CardContent className="p-6 space-y-2">
                    <p className="font-bold">No volunteer assigned yet</p>
                    <p className="text-sm text-muted-foreground">
                      Supabase has not populated an assigned volunteer for this need.
                    </p>
                    <div className="text-xs font-mono text-muted-foreground">
                      {isNeedLoading ? <Loader2 className="h-3 w-3 animate-spin inline-block" /> : "Waiting for backend assignment"}
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="space-y-4">
                <div className="p-5 rounded-xl border border-primary/10 bg-primary/5 text-sm space-y-3">
                  <p className="font-bold text-primary">Matching Insight</p>
                  <p className="text-muted-foreground leading-relaxed">
                    {volunteer ? (
                      <>
                        Volunteer <span className="font-bold text-foreground">{volunteer.full_name}</span> is assigned directly from the backend record.
                      </>
                    ) : (
                      <>
                        No assignment has landed in Supabase yet for this request.
                      </>
                    )}
                  </p>
                  <div className="flex items-center text-xs font-mono text-primary pt-2">
                    NEED_STATUS: {need?.status?.toUpperCase() || "PENDING"}
                  </div>
                </div>
                <DiagnosticsPanel needId={need_id} />
              </div>
            </div>
          </div>

          {/* Activity Logs Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Inbound Webhook Activity</h2>
              <Link href="/diagnostics" className="text-xs text-primary hover:underline">
                View full diagnostics
              </Link>
            </div>
            <ActivityPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
