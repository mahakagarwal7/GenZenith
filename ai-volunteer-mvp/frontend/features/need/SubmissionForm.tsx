"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import {
  Send,
  MapPin,
  MessageSquare,
  Phone,
  Loader2,
  CheckCircle
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { toast } from "sonner";
import { fetchWithRetry } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { useRouter } from "next/navigation";
import Link from "next/link";

const submissionSchema = z.object({
  text: z.string().min(10, "Please provide more details about the need."),
  location: z.string().min(2, "Location text is required for geocoding."),
  contact_number: z.string().min(10, "A valid contact number is required."),
});

type SubmissionValues = z.infer<typeof submissionSchema>;

export function SubmissionForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMethod, setLocationMethod] = useState<'manual' | 'gps'>('manual');

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<SubmissionValues>({
    resolver: zodResolver(submissionSchema),
    defaultValues: {
      text: "",
      location: "",
      contact_number: "",
    },
  });

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          // Attempt reverse geocoding
          const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
          if (apiKey) {
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
            );
            const data = await response.json();
            if (data.results && data.results[0]) {
              setValue("location", data.results[0].formatted_address);
              setLocationMethod('gps');
              toast.success("Location detected!");
            } else {
              setValue("location", `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
              setLocationMethod('gps');
              toast.info("Location detected (coords only).");
            }
          } else {
            setValue("location", `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            setLocationMethod('gps');
            toast.info("Location detected (coords only).");
          }
        } catch (err) {
          setValue("location", `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        toast.error("Failed to detect location: " + error.message);
      }
    );
  };

  const onSubmit = async (data: SubmissionValues) => {
    setIsSubmitting(true);
    try {
      // In a production app, this would hit the backend which generates the Need ID.
      // We simulate the backend processing.
      // Map the form data to the naming convention expected by the WhatsApp webhook (Twilio format)
      const payload = {
        Body: `${data.text} (Location: ${data.location})`,
        From: data.contact_number,
      };

      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!anonKey) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
      }

      const result = await fetchWithRetry<{ need_id: string }>(ENDPOINTS.whatsappWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify(payload),
      });

      setIsSuccess(true);
      toast.success("Need submitted successfully!");

      // Auto-redirect to status page after a brief delay
      setTimeout(() => {
        const id = (result as any).need_id ?? (result as any).needId ?? '';
        if (id) router.push(`/status/${id}`);
      }, 3000);
    } catch (error: any) {
      console.error("Submission failed:", error);
      toast.error(error.message || "Failed to submit request.");
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl mx-auto text-center"
      >
        <Card className="yc-shadow border-slate-200 dark:border-slate-800 p-12 space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Request Submitted!</h2>
            <p className="text-muted-foreground">
              Your need has been successfully ingested and the AI is matching volunteers.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/">View Live Dashboard</Link>
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full sm:w-auto">
              Submit Another
            </Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="w-full max-w-2xl mx-auto yc-shadow border-slate-200 dark:border-slate-800">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">Submit a Need</CardTitle>
          <CardDescription>
            Enter the details as you would on WhatsApp. Our AI handles the rest.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-sm font-medium">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>Description</span>
              </div>
              <Textarea
                placeholder="e.g. Emergency blood needed for surgery at Metro Hospital..."
                className="min-h-30 resize-none border-slate-200 dark:border-slate-800 focus:ring-primary"
                {...register("text")}
              />
              {errors.text && (
                <p className="text-xs text-destructive">{errors.text.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>Location</span>
                </div>
                <div className="relative">
                  <Input
                    placeholder="e.g. Park Street, Kolkata"
                    className="border-slate-200 dark:border-slate-800 pr-10"
                    {...register("location", {
                      onChange: () => setLocationMethod('manual')
                    })}
                  />
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={isLocating}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                    title="Use my current location"
                  >
                    {isLocating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {locationMethod === 'gps' && (
                  <motion.div
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center space-x-1.5 text-[10px] font-bold text-green-500 uppercase tracking-widest mt-1"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <span>Live GPS Active</span>
                    <button
                      onClick={() => setLocationMethod('manual')}
                      className="ml-2 underline opacity-50 hover:opacity-100"
                    >
                      Clear
                    </button>
                  </motion.div>
                )}
                {errors.location && (
                  <p className="text-xs text-destructive">{errors.location.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm font-medium">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>Contact Number</span>
                </div>
                <Input
                  placeholder="+91 98765 43210"
                  className="border-slate-200 dark:border-slate-800"
                  {...register("contact_number")}
                />
                {errors.contact_number && (
                  <p className="text-xs text-destructive">{errors.contact_number.message}</p>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold transition-all"
              disabled={isSubmitting || isSuccess}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating ID...
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Redirecting to Timeline...
                </>
              ) : (
                <>
                  Submit Request
                  <Send className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </motion.div>
  );
}
