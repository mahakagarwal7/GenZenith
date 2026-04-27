import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function VolunteersPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Volunteers Directory</h1>
        <p className="text-slate-400 mt-2">
          Manage and monitor active volunteers in the network.
        </p>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            Registered Volunteers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-slate-500">
            Volunteer directory implementation will connect to the `volunteers` table here.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
