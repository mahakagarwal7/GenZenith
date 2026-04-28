"use client";

import { useState } from "react";
import {
  Upload,
  Database,
  ShieldCheck,
  AlertCircle,
  FileJson,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

export default function IngestPage() {
  const [isUploading, setIsUploading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const supabase = createClient();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let parsed;
        if (file.name.endsWith(".json")) {
          parsed = JSON.parse(text);
        } else {
          // Very basic CSV parser
          const lines = text.split("\n");
          const headers = lines[0].split(",");
          parsed = lines.slice(1).map(line => {
            const values = line.split(",");
            return headers.reduce((obj, header, i) => {
              obj[header.trim()] = values[i]?.trim();
              return obj;
            }, {} as any);
          });
        }

        if (Array.isArray(parsed)) {
          setData(parsed);
          toast.success(`Loaded ${parsed.length} records`);
        } else {
          toast.error("Invalid format: Expected an array of objects");
        }
      } catch (err) {
        toast.error("Failed to parse file");
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const submitToSupabase = async () => {
    if (data.length === 0) return;
    setIsUploading(true);

    try {
      const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const results = await Promise.all(
        data.map(item =>
          fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey
            },
            body: JSON.stringify({
              Body: item.description || item.text || item.Body || "Bulk ingested need",
              From: item.contact || item.From || "ngo_bulk_ingest",
              Source: "ngo_ingestion"
            })
          })
        )
      );

      const failures = results.filter(r => !r.ok);
      if (failures.length > 0) {
        toast.warning(`Ingested with ${failures.length} issues. Check diagnostics.`);
      } else {
        toast.success(`Successfully ingested ${data.length} records!`);
      }
      setData([]);
    } catch (err: any) {
      toast.error(`Ingestion failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-10">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight">NGO Ingestion Layer</h1>
          <p className="text-muted-foreground">
            Bulk upload community needs and volunteer data directly into the matching engine.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
          <ShieldCheck className="h-3 w-3 mr-1" />
          TRUSTED PARTNER ACCESS
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Upload Card */}
        <Card className="lg:col-span-4 border-dashed border-2 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 yc-shadow transition-all hover:border-primary/50">
          <CardContent className="p-10 flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Upload className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold">Import Data</h3>
              <p className="text-sm text-muted-foreground">
                Drag and drop your CSV or JSON files here.
              </p>
            </div>
            <div className="w-full pt-4">
              <label className="cursor-pointer">
                <Input
                  type="file"
                  className="hidden"
                  accept=".csv,.json"
                  onChange={handleFileUpload}
                />
                <Button variant="secondary" className="w-full h-12" asChild>
                  <span>Select File</span>
                </Button>
              </label>
            </div>
            <div className="flex items-center space-x-4 pt-4 text-slate-400">
              <FileJson className="h-5 w-5" />
              <FileSpreadsheet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Data Preview */}
        <div className="lg:col-span-8">
          <Card className="h-full yc-shadow border-slate-200 dark:border-slate-800 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold">Staging Area</CardTitle>
                <CardDescription>
                  {data.length} records detected. Review before finalizing.
                </CardDescription>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setData([])}
                disabled={data.length === 0}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                <AnimatePresence>
                  {data.length === 0 ? (
                    <div className="p-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
                      <Database className="h-10 w-10 opacity-20" />
                      <p className="text-sm">No data staged for ingestion.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.slice(0, 10).map((row, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-bold">{row.category || "General"}</p>
                            <p className="text-xs text-muted-foreground">{row.location || "Unknown location"}</p>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {JSON.stringify(row).slice(0, 40)}...
                          </div>
                        </motion.div>
                      ))}
                      {data.length > 10 && (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          And {data.length - 10} more records...
                        </div>
                      )}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-4 bg-slate-50/50 dark:bg-slate-900/50">
              <Button
                className="w-full h-11 font-bold"
                disabled={data.length === 0 || isUploading}
                onClick={submitToSupabase}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ingesting into Supabase...
                  </>
                ) : (
                  <>
                    Finalize & Ingest Data
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Info Section */}
      <div className="p-6 rounded-2xl bg-indigo-500 text-white flex items-center justify-between shadow-xl shadow-indigo-500/20">
        <div className="flex items-center space-x-6">
          <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-lg">System-Wide Impact</h4>
            <p className="text-sm text-white/80 max-w-xl leading-relaxed">
              Ingesting data here triggers the intelligent matching service instantly.
              Ensure geocoding fields (City, Landmark) are accurate for precise volunteer routing.
            </p>
          </div>
        </div>
        <Button variant="secondary" className="font-bold text-indigo-500">
          Review Guidelines
        </Button>
      </div>
    </div>
  );
}
