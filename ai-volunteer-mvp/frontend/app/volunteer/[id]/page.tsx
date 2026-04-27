import { VolunteerCard } from "@/components/features/volunteer-card";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VolunteerPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="flex-1 flex flex-col items-center py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Assigned Volunteer</h1>
          <p className="text-slate-400 text-sm">
            This volunteer has accepted your request and will contact you shortly.
          </p>
        </div>
        
        <VolunteerCard volunteerId={id} />
      </div>
    </div>
  );
}
