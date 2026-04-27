"use client";

import { motion } from "framer-motion";
import { 
  User, 
  MapPin, 
  Phone, 
  Star, 
  ExternalLink,
  ShieldCheck
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardFooter 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Volunteer } from "@/types";

export function AssignmentCard({ volunteer }: { volunteer: Volunteer }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 100 }}
    >
      <Card className="w-full yc-shadow overflow-hidden border-slate-200 dark:border-slate-800">
        <div className="h-2 bg-primary" />
        <CardHeader className="pb-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border text-primary">
                <User className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">{volunteer.full_name}</CardTitle>
                <div className="flex items-center text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3 mr-1" />
                  {volunteer.city}
                </div>
              </div>
            </div>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Skills & Expertise
            </span>
            <div className="flex flex-wrap gap-2">
              {volunteer.skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="px-2 py-0">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border text-sm font-medium">
            <Phone className="h-4 w-4 text-primary" />
            <span>{volunteer.contact_number}</span>
          </div>
        </CardContent>
        <CardFooter className="bg-slate-50/50 dark:bg-slate-900/50 border-t p-4">
          <Button variant="outline" className="w-full bg-background" asChild>
            <a 
              href={`https://wa.me/${volunteer.contact_number.replace(/\D/g, "")}`} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Open WhatsApp Thread
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
