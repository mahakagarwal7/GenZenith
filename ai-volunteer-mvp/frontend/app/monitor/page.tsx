"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, ServerCrash } from "lucide-react";
import { fetchWithRetry } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { toast } from "sonner";

export default function MonitorPage() {
  const [isPinging, setIsPinging] = useState(false);
  const [lastPing, setLastPing] = useState<{ status: string; time: string } | null>(null);

  const testWebhook = async () => {
    setIsPinging(true);
    try {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!anonKey) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
      }

      // Sending a diagnostic ping payload
      await fetchWithRetry(ENDPOINTS.whatsappWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ type: "diagnostic_ping", text: "Ping" }),
        retries: 0,
      });
      setLastPing({ status: "Success", time: new Date().toLocaleTimeString() });
      toast.success("Webhook endpoint reached successfully.");
    } catch (error: any) {
      setLastPing({ status: "Failed", time: new Date().toLocaleTimeString() });
      toast.error(error.message || "Webhook endpoint failed.");
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Webhook Diagnostics</h1>
        <p className="text-slate-400 mt-2">
          Send a live diagnostic payload to the webhook and inspect delivery health.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerCrash className="w-5 h-5 text-indigo-400" />
              Endpoint Tester
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400">
              Send a diagnostic payload to the /whatsapp-webhook endpoint to verify network reachability and Twilio-safe responses.
            </p>
            <div className="flex items-center gap-4">
              <Button onClick={testWebhook} disabled={isPinging} className="bg-slate-800 hover:bg-slate-700">
                {isPinging ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
                Ping Webhook
              </Button>
              {lastPing && (
                <span className={`text-sm ${lastPing.status === "Success" ? "text-green-400" : "text-red-400"}`}>
                  {lastPing.status} at {lastPing.time}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle>Twilio Log Stream</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-950 p-4 rounded-lg font-mono text-sm text-slate-500 h-50 flex items-center justify-center border border-slate-800">
              Awaiting inbound payloads...
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
