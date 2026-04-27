"use client";

import { useMemo, useState, useEffect } from "react";
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from "@react-google-maps/api";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";

const containerStyle = {
  width: "100%",
  height: "500px",
};

const center = {
  lat: 22.5726, // Kolkata
  lng: 88.3639,
};

export function OperationsMap() {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  const supabase = createClient();
  const [needs, setNeeds] = useState<any[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<any>(null);

  const fetchNeeds = async () => {
    const { data } = await supabase
      .from("needs")
      .select("*")
      .not("location_geo", "is", null)
      .in("status", ["unassigned", "pending_acceptance", "assigned"]);
    
    if (data) {
      setNeeds(data.map(n => {
        // Parse POINT(lng lat)
        const match = n.location_geo.match(/POINT\(([-0-9.]+)\s+([-0-9.]+)\)/i);
        return {
          ...n,
          lat: match ? parseFloat(match[2]) : 0,
          lng: match ? parseFloat(match[1]) : 0,
        };
      }));
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

  const markers = useMemo(() => needs, [needs]);

  if (!isLoaded) return <div className="h-[500px] flex items-center justify-center bg-slate-900 rounded-xl">Loading Map...</div>;

  return (
    <Card className="overflow-hidden border-slate-200 dark:border-slate-800 yc-shadow">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={12}
        options={{
          styles: darkMapStyle,
          disableDefaultUI: true,
          zoomControl: true,
        }}
      >
        {markers.map((need) => (
          <MarkerF
            key={need.need_id}
            position={{ lat: need.lat, lng: need.lng }}
            onClick={() => setSelectedNeed(need)}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: need.status === 'assigned' ? '#22c55e' : '#ef4444',
              fillOpacity: 1,
              strokeWeight: 0,
              scale: 8,
            }}
          />
        ))}

        {selectedNeed && (
          <InfoWindowF
            position={{ lat: selectedNeed.lat, lng: selectedNeed.lng }}
            onCloseClick={() => setSelectedNeed(null)}
          >
            <div className="p-2 text-slate-900 min-w-[200px]">
              <h3 className="font-bold text-sm uppercase">{selectedNeed.category}</h3>
              <p className="text-xs mt-1">{selectedNeed.location_text}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  selectedNeed.urgency === 'critical' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {selectedNeed.urgency.toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-500">{selectedNeed.status}</span>
              </div>
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>
    </Card>
  );
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  // ... more styles for a premium dark look
];
