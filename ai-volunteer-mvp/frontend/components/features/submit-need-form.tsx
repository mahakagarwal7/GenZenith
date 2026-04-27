"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SubmitNeedRequest, SubmitNeedRequestSchema } from "@/types";
import { useMutation } from "@tanstack/react-query";
import { fetchWithRetry } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/state/store";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";

export function SubmitNeedForm() {
  const router = useRouter();
  const addRecentNeedId = useAppStore((state) => state.addRecentNeedId);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted">("idle");

  const form = useForm<SubmitNeedRequest>({
    resolver: zodResolver(SubmitNeedRequestSchema),
    defaultValues: {
      Body: "",
      From: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: SubmitNeedRequest) => {
      const result = await fetchWithRetry<{ needId?: string; need_id?: string }>(ENDPOINTS.whatsappWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        retries: 2,
      });

      const needId = result.needId ?? result.need_id;
      if (!needId) {
        throw new Error("Backend did not return a need ID");
      }

      return needId;
    },
    onMutate: () => {
      setSubmitState("submitting");
    },
    onSuccess: (needId) => {
      setSubmitState("submitted");
      addRecentNeedId(needId);
      toast.success("Need submitted successfully!");
      
      // Delay navigation slightly for animation
      setTimeout(() => {
        router.push(`/status/${needId}`);
      }, 1000);
    },
    onError: (error) => {
      setSubmitState("idle");
      toast.error(error.message || "Failed to submit need. Please try again.");
    },
  });

  const onSubmit = (data: SubmitNeedRequest) => {
    mutation.mutate(data);
  };

  return (
    <Card className="w-full bg-slate-900/50 border-slate-800 backdrop-blur-xl overflow-hidden relative">
      <CardContent className="p-6">
        <AnimatePresence mode="wait">
          {submitState === "idle" && (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="Body">What do you need?</Label>
                <Input
                  id="Body"
                  placeholder="e.g., Emergency blood needed..."
                  className="bg-slate-950/50 border-slate-800"
                  {...form.register("Body")}
                />
                {form.formState.errors.Body && (
                  <p className="text-xs text-red-400">{form.formState.errors.Body.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="From">WhatsApp Number</Label>
                <Input
                  id="From"
                  placeholder="+91..."
                  className="bg-slate-950/50 border-slate-800"
                  {...form.register("From")}
                />
                {form.formState.errors.From && (
                  <p className="text-xs text-red-400">{form.formState.errors.From.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-4"
                disabled={mutation.isPending}
              >
                Submit Request <Send className="w-4 h-4 ml-2" />
              </Button>
            </motion.form>
          )}

          {submitState === "submitting" && (
            <motion.div
              key="submitting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center justify-center py-12 space-y-4"
            >
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
              <p className="text-lg font-medium text-slate-300">Processing Request...</p>
            </motion.div>
          )}

          {submitState === "submitted" && (
            <motion.div
              key="submitted"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12 space-y-4"
            >
              <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-medium text-slate-300">Matching Volunteers...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
