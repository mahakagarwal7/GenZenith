"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Volunteer } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Phone, MapPin, User, Star } from "lucide-react";
import { motion } from "framer-motion";

export function VolunteerCard({ volunteerId }: { volunteerId: string }) {
  const supabase = createClient();

  const { data: volunteer, isLoading, isError } = useQuery({
    queryKey: ["volunteer", volunteerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("volunteers")
        .select("*")
        .eq("id", volunteerId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data as Volunteer | null;
    },
  });

  if (isLoading) {
    return (
      <Card className="w-full bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !volunteer) {
    return (
      <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg">
        Volunteer record not found in Supabase.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="w-full bg-slate-900/50 border-slate-800 overflow-hidden relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <CardHeader className="flex flex-row items-center gap-4 pb-2">
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
            <User className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{volunteer.full_name}</h2>
            <div className="flex items-center text-sm text-slate-400 mt-1 gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {volunteer.city}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 pt-2">
            {volunteer.skills?.map((skill) => (
              <Badge key={skill} variant="secondary" className="bg-slate-800 hover:bg-slate-700">
                <Star className="w-3 h-3 mr-1 text-yellow-500" />
                {skill}
              </Badge>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-800">
            <a
              href={`https://wa.me/${volunteer.contact_number.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              <Phone className="w-4 h-4" />
              Contact on WhatsApp
            </a>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
