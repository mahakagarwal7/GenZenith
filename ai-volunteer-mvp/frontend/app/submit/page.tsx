import { SubmissionForm } from "@/features/need/SubmissionForm";
import { 
  ArrowLeft, 
  ShieldCheck, 
  Zap, 
  Lock 
} from "lucide-react";
import Link from "next/link";

export default function SubmitPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 py-8">
      <div className="space-y-4 text-center">
        <Link 
          href="/" 
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3 mr-1" />
          Back to Dashboard
        </Link>
        <h1 className="text-5xl font-extrabold tracking-tight">Post a Need</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Every submission is processed by our AI engine to identify 
          urgency, category, and precise coordinates for volunteers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-7">
          <SubmissionForm />
        </div>

        <div className="lg:col-span-5 space-y-8 py-4">
          <FeatureItem 
            icon={Zap}
            title="Real-time Classification"
            description="Our model identifies the need type (Medical, Food, Water) in <400ms."
          />
          <FeatureItem 
            icon={ShieldCheck}
            title="Verified Routing"
            description="Requests are only routed to volunteers with the specific matching skills."
          />
          <FeatureItem 
            icon={Lock}
            title="Privacy First"
            description="Your contact details are encrypted and only shared with the assigned volunteer."
          />

          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">
              Pro Tip
            </h4>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Be as specific as possible with the location. Mentioning landmarks or street 
              names helps our geocoder pinpoint the exact location for faster response.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ icon: Icon, title, description }: any) {
  return (
    <div className="flex space-x-4">
      <div className="h-10 w-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h4 className="font-bold text-base">{title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
