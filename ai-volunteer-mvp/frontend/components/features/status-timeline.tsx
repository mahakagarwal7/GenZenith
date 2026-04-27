"use client";

import { useEffect, useState } from "react";
import { Need, NeedStatus } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, Loader2, AlertCircle, UserCheck, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const STATUS_STEPS = [
  { id: "needs_validation", label: "Request Received", icon: Clock },
  { id: "unassigned", label: "Matching Volunteers", icon: Loader2 },
  { id: "pending_acceptance", label: "Awaiting Volunteer Response", icon: Clock },
  { id: "assigned", label: "Volunteer Assigned", icon: UserCheck },
];

export function StatusTimeline({ needId, need: propNeed }: { needId: string, need?: Need | null }) {
  const supabase = createClient();
  const [realtimeNeed, setRealtimeNeed] = useState<Partial<Need> | null>(null);

  // Initial fetch (only if propNeed is not provided)
  const { data: initialNeed, isLoading, isError } = useQuery({
    queryKey: ["need", needId],
    queryFn: async () => {
      if (!needId || needId === "undefined") return null;
      const { data, error } = await supabase
        .from("needs")
        .select("*")
        .eq("need_id", needId)
        .maybeSingle();
      
      if (error) {
        throw error;
      }
      return data as Need;
    },
    enabled: (!propNeed) && Boolean(needId) && needId !== "undefined",
    staleTime: Infinity, // Realtime will handle updates
  });

  // Supabase Realtime Subscription
  useEffect(() => {
    const channel = supabase
      .channel(`need-${needId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "needs",
          filter: `need_id=eq.${needId}`,
        },
        (payload) => {
          if (payload.new) {
            setRealtimeNeed(payload.new as Partial<Need>);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [needId, supabase]);

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-1/3 bg-slate-800" />
          <Skeleton className="h-20 w-full bg-slate-800" />
          <Skeleton className="h-20 w-full bg-slate-800" />
        </CardContent>
      </Card>
    );
  }

  const baseNeed = propNeed || initialNeed;
  const activeNeed = (realtimeNeed ? { ...baseNeed, ...realtimeNeed } : baseNeed) as Need | null;

  if (!activeNeed) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Request not available yet</h3>
            <p className="text-slate-400">
              The need row has not been created in Supabase or is still syncing in realtime.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentStatus = activeNeed.status;

  const getStepStatus = (stepId: string) => {
    const currentIndex = STATUS_STEPS.findIndex((s) => s.id === currentStatus);
    const stepIndex = STATUS_STEPS.findIndex((s) => s.id === stepId);

    if (stepIndex < currentIndex) return "complete";
    if (stepIndex === currentIndex) return "current";
    return "upcoming";
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card className="bg-slate-900/50 border-slate-800 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
        <CardContent className="p-6 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium">Request Details</h3>
            <p className="text-slate-400 mt-1">{activeNeed.location_text}</p>
          </div>
          <Badge variant={currentStatus === "assigned" ? "default" : "secondary"}>
            {currentStatus.replace("_", " ").toUpperCase()}
          </Badge>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-8">
          <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
            {STATUS_STEPS.map((step, index) => {
              const status = getStepStatus(step.id);
              const isCurrent = status === "current";
              const isComplete = status === "complete";
              const isError = false;

              const Icon = isError ? AlertCircle : isComplete ? CheckCircle2 : step.icon;

              return (
                <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  {/* Icon */}
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm ${
                      isComplete ? "bg-indigo-500 text-white" : isCurrent ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" : isError ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isCurrent && !isComplete ? "animate-pulse" : ""}`} />
                  </motion.div>
                  
                  {/* Content */}
                  <motion.div 
                    initial={{ x: index % 2 === 0 ? -20 : 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 + 0.1 }}
                    className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-800/50 bg-slate-800/20 backdrop-blur-sm"
                  >
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className={`font-medium ${isCurrent ? "text-indigo-300" : isComplete ? "text-slate-200" : isError ? "text-red-400" : "text-slate-500"}`}>
                          {step.label}
                        </h4>
                        {isComplete && index === 0 && Boolean(activeNeed.metadata?.is_image) && (
                          <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20">
                            OCR PROCESSED
                          </Badge>
                        )}
                      </div>

                      {(isCurrent || isComplete) && index === 0 && (
                        <div className="space-y-2">
                          {isCurrent && <p className="text-sm text-slate-400">Validating request content and coordinates...</p>}
                          {Boolean(activeNeed.metadata?.ocr_text) && (
                            <div className="mt-2 p-2 rounded bg-black/40 text-[10px] font-mono text-slate-400 border border-slate-700/50">
                              <p className="text-slate-500 mb-1 uppercase text-[8px] font-bold">Raw Extraction Metadata:</p>
                              <div className="text-slate-300 break-words line-clamp-3">
                                {String(activeNeed.metadata?.ocr_text)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {isCurrent && currentStatus === "unassigned" && (
                        <div className="space-y-2">
                          <p className="text-sm text-slate-400">Our AI is finding the best volunteers...</p>
                            <div className="flex items-center space-x-2 text-[10px] text-indigo-400/70">
                            <MapPin className="h-3 w-3" />
                            <span>Geocoding: {String(activeNeed.metadata?.geocoding_result ?? "Success")}</span>
                          </div>
                        </div>
                      )}

                      {isCurrent && currentStatus === "pending_acceptance" && (
                        <p className="text-sm text-slate-400">Message sent! Waiting for their YES response.</p>
                      )}
                      {isError && (
                        <p className="text-sm text-red-400/80">There was an issue processing this step. Please contact support if this persists.</p>
                      )}
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
