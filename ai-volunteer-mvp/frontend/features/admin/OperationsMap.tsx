"use client";

import { useEffect, useMemo, useState } from "react";
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Activity } from "lucide-react";

type NeedLocation = {
  need_id: string;
  category: string | null;
  status: string;
  location_text: string | null;
  location_geo: string | null;
  lat: number;
  lng: number;
};

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

export function OperationsMap() {
  const supabase = createClient();
  const [needs, setNeeds] = useState<NeedLocation[]>([]);
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const fetchNeeds = async () => {
    try {
      const { data, error } = await supabase
        .from("needs")
        .select("need_id, category, status, location_text, location_geo")
        .not("location_geo", "is", null)
        // include `needs_validation` so partially-processed needs show on the map
        .in("status", ["needs_validation", "unassigned", "pending_acceptance", "assigned"]);

      if (error) {
        console.error("OperationsMap: failed to fetch needs:", error);
        setNeeds([]);
        return;
      }

      if (data) {
        setNeeds(
          data
            .map((need) => {
              const match = need.location_geo?.match(/POINT\(([-0-9.]+)\s+([-0-9.]+)\)/i);
              const lat = match ? parseFloat(match[2]) : Number.NaN;
              const lng = match ? parseFloat(match[1]) : Number.NaN;

              return {
                ...need,
                lat,
                lng,
              };
            })
            .filter((need) => Number.isFinite(need.lat) && Number.isFinite(need.lng))
        );
      }
    } catch (err) {
      console.error("OperationsMap unexpected error fetching needs:", err);
      setNeeds([]);
    }
  };

  useEffect(() => {
    fetchNeeds();
    const channel = supabase
      .channel("map-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "needs" }, fetchNeeds)
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const center = useMemo(() => {
    return needs[0] ? { lat: needs[0].lat, lng: needs[0].lng } : DEFAULT_CENTER;
  }, [needs]);

  if (!mapsApiKey) {
    return (
      <Card className="overflow-hidden border-slate-200 dark:border-slate-800 yc-shadow">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <MapPin className="h-4 w-4 text-rose-500" />
                Live Operations Map
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to render the interactive map.
              </p>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Activity className="h-3 w-3" />
              {needs.length} tracked
            </Badge>
          </div>
        </div>

        <div className="p-4 md:p-6">
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
            Google Maps is not configured in this deployment yet. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, then redeploy to enable the live map view.
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {needs.length === 0 ? (
              <div className="col-span-full rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No active needs with coordinates yet.
              </div>
            ) : (
              needs.slice(0, 6).map((need) => (
                <NeedCard key={need.need_id} need={need} />
              ))
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-slate-200 dark:border-slate-800 yc-shadow">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <MapPin className="h-4 w-4 text-rose-500" />
              Live Operations Map
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Showing active needs and their latest known locations on the live map.
            </p>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Activity className="h-3 w-3" />
            {needs.length} tracked
          </Badge>
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="h-[360px] w-full">
            <OperationsMapCanvas needs={needs} center={center} mapsApiKey={mapsApiKey} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {needs.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No active needs with coordinates yet.
          </div>
        ) : (
          needs.slice(0, 6).map((need) => (
            <NeedCard key={need.need_id} need={need} />
          ))
        )}
        </div>
      </div>
    </Card>
  );
}

function OperationsMapCanvas({
  needs,
  center,
  mapsApiKey,
}: {
  needs: NeedLocation[];
  center: { lat: number; lng: number };
  mapsApiKey: string;
}) {
  const [activeNeedId, setActiveNeedId] = useState<string | null>(needs[0]?.need_id ?? null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "operations-map",
    googleMapsApiKey: mapsApiKey,
  });

  useEffect(() => {
    if (!activeNeedId && needs.length > 0) {
      setActiveNeedId(needs[0].need_id);
    }
  }, [activeNeedId, needs]);

  const activeNeed = needs.find((need) => need.need_id === activeNeedId) ?? null;

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-slate-500 dark:text-slate-400">
        Google Maps failed to load. Check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and the browser console.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-slate-500 dark:text-slate-400">
        Loading live map...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={center}
      zoom={activeNeed ? 11 : 4}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      }}
    >
      {needs.map((need) => (
        <MarkerF
          key={need.need_id}
          position={{ lat: need.lat, lng: need.lng }}
          onClick={() => setActiveNeedId(need.need_id)}
        />
      ))}

      {activeNeed ? (
        <InfoWindowF
          position={{ lat: activeNeed.lat, lng: activeNeed.lng }}
          onCloseClick={() => setActiveNeedId(null)}
        >
          <div className="max-w-xs space-y-1 text-sm">
            <div className="font-semibold text-slate-900">{activeNeed.category || "General"}</div>
            <div className="text-xs text-slate-500">{activeNeed.location_text || "Unknown location"}</div>
            <div className="text-[11px] text-slate-500">Status: {activeNeed.status}</div>
          </div>
        </InfoWindowF>
      ) : null}
    </GoogleMap>
  );
}

function NeedCard({ need }: { need: NeedLocation }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {need.category || "general"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {need.location_text || "Unknown location"}
          </p>
        </div>
        <Badge variant={need.status === "assigned" ? "default" : "secondary"}>
          {need.status}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <div>
          <span className="block font-medium uppercase tracking-wide text-slate-400">Lat</span>
          <span>{need.lat.toFixed(4)}</span>
        </div>
        <div>
          <span className="block font-medium uppercase tracking-wide text-slate-400">Lng</span>
          <span>{need.lng.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}
