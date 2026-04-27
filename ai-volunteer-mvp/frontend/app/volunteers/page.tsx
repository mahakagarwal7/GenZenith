"use client";

import { useMemo, useState } from "react";
import { 
  Users, 
  Search, 
  Filter, 
  ArrowUpRight,
  MapPin,
  ShieldCheck
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Volunteer } from "@/types";
import { toast } from "sonner";

export default function VolunteersPage() {
  const supabase = createClient();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: volunteers, isLoading, isError } = useQuery({
    queryKey: ["volunteers-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("volunteers")
        .select("*")
        .order("full_name", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as Volunteer[];
    },
  });

  const filteredVolunteers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return volunteers ?? [];
    }

    return (volunteers ?? []).filter((volunteer) => {
      const name = (volunteer.full_name || "").toLowerCase();
      const city = (volunteer.city || "").toLowerCase();
      const skillText = (volunteer.skills || []).join(" ").toLowerCase();
      return (
        name.includes(query) ||
        city.includes(query) ||
        skillText.includes(query)
      );
    });
  }, [searchTerm, volunteers]);

  const [isAdding, setIsAdding] = useState(false);
  const [newVolunteer, setNewVolunteer] = useState({ full_name: "", city: "", contact_number: "", skills: "" });

  const handleAddVolunteer = async () => {
    if (!newVolunteer.full_name || !newVolunteer.contact_number) {
      toast.error("Name and contact number are required.");
      return;
    }

    try {
      const { error } = await supabase.from("volunteers").insert([{
        full_name: newVolunteer.full_name,
        city: newVolunteer.city,
        contact_number: newVolunteer.contact_number,
        skills: newVolunteer.skills.split(",").map(s => s.trim()).filter(Boolean),
        status: "available",
        historical_response_rate: 1.0,
        typical_capacity: 5,
        total_assignments: 0,
        active_tasks: 0
      }]);

      if (error) throw error;
      toast.success("Volunteer added successfully!");
      setIsAdding(false);
      setNewVolunteer({ full_name: "", city: "", contact_number: "", skills: "" });
    } catch (err: any) {
      toast.error(`Failed to add volunteer: ${err.message}`);
    }
  };

  return (
    <div className="space-y-10 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight">Volunteers</h1>
          <p className="text-muted-foreground">
            Manage and search your verified volunteer network.
          </p>
        </div>
        <Button size="sm" onClick={() => setIsAdding(!isAdding)}>
          <Users className="mr-2 h-4 w-4" />
          {isAdding ? "Cancel" : "Add Volunteer"}
        </Button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <Card className="bg-slate-50 dark:bg-slate-900/50 border-dashed border-2">
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input 
                  placeholder="Full Name" 
                  value={newVolunteer.full_name}
                  onChange={e => setNewVolunteer({...newVolunteer, full_name: e.target.value})}
                />
                <Input 
                  placeholder="City" 
                  value={newVolunteer.city}
                  onChange={e => setNewVolunteer({...newVolunteer, city: e.target.value})}
                />
                <Input 
                  placeholder="Phone (+91...)" 
                  value={newVolunteer.contact_number}
                  onChange={e => setNewVolunteer({...newVolunteer, contact_number: e.target.value})}
                />
                <Input 
                  placeholder="Skills (comma separated)" 
                  value={newVolunteer.skills}
                  onChange={e => setNewVolunteer({...newVolunteer, skills: e.target.value})}
                />
                <Button className="md:col-span-4" onClick={handleAddVolunteer}>
                  Confirm Add Volunteer
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, skill, or city..." 
            className="pl-10 yc-shadow"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => { setSearchTerm(""); toast.info("Filters cleared"); }}>
          <Filter className="mr-2 h-4 w-4" />
          Clear Filters
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading volunteer records from Supabase...</div>
      ) : isError ? (
        <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400">
          Unable to load volunteers from Supabase.
        </div>
      ) : filteredVolunteers.length === 0 ? (
        <div className="p-4 rounded-lg border bg-muted/40 text-sm text-muted-foreground">
          No volunteers match the current filter.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredVolunteers.map((volunteer) => (
            <VolunteerCard key={volunteer.id} volunteer={volunteer} />
          ))}
        </div>
      )}
    </div>
  );
}

function VolunteerCard({ volunteer }: { volunteer: Volunteer }) {
  return (
    <Card className="yc-shadow border-slate-200 dark:border-slate-800 hover:border-primary/20 transition-all">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-bold">{volunteer.full_name}</CardTitle>
            <div className="flex items-center text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3 mr-1" />
              {volunteer.city}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="bg-green-500/5 text-green-500 border-green-500/20 text-[10px] uppercase font-bold">
          verified
        </Badge>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex flex-wrap gap-1 mb-4">
          {volunteer.skills.map((skill: string) => (
            <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
              {skill}
            </Badge>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="w-full text-xs text-primary font-bold">
          View Profile <ArrowUpRight className="ml-1 h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
