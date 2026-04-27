"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnimatedStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  type?: "loading" | "success" | "error" | "empty";
  className?: string;
}

export function AnimatedState({ 
  icon: Icon, 
  title, 
  description, 
  type = "loading",
  className 
}: AnimatedStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-12 text-center", className)}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          type: "spring", 
          damping: 12, 
          stiffness: 200 
        }}
        className={cn(
          "relative mb-6 flex h-20 w-20 items-center justify-center rounded-full",
          type === "loading" && "bg-primary/10 text-primary",
          type === "success" && "bg-green-500/10 text-green-500",
          type === "error" && "bg-destructive/10 text-destructive",
          type === "empty" && "bg-muted text-muted-foreground"
        )}
      >
        {type === "loading" && (
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        )}
        {Icon && <Icon className="h-10 w-10" />}
      </motion.div>
      
      <motion.h3 
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-2 text-xl font-bold tracking-tight"
      >
        {title}
      </motion.h3>
      
      {description && (
        <motion.p 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="max-w-xs text-sm text-muted-foreground leading-relaxed"
        >
          {description}
        </motion.p>
      )}
    </div>
  );
}
