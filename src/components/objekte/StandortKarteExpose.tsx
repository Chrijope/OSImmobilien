import { useState, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface StandortData {
  objekt_koordinaten?: { lat: number; lng: number };
  arbeitgeber: { name: string; branche: string; mitarbeiter: number; entfernung_km: number; lat?: number; lng?: number }[];
  mikrolage: {
    kindergaerten: { name: string; entfernung_m: number; lat?: number; lng?: number }[];
    schulen: { name: string; typ: string; entfernung_m: number; lat?: number; lng?: number }[];
    einkaufen: { name: string; typ: string; entfernung_m: number; lat?: number; lng?: number }[];
    apotheken: { name: string; entfernung_m: number; lat?: number; lng?: number }[];
    aerzte: { name: string; entfernung_m: number; lat?: number; lng?: number }[];
    oepnv: { name: string; typ: string; entfernung_m: number; lat?: number; lng?: number }[];
    freizeit: { name: string; typ: string; entfernung_m: number; lat?: number; lng?: number }[];
  };
  makrolage: any;
}

const CATEGORY_COLORS: Record<string, { color: string; label: string }> = {
  objekt: { color: "#dc2626", label: "Objekt" },
  arbeitgeber: { color: "#2563eb", label: "Arbeitgeber" },
  kindergaerten: { color: "#f59e0b", label: "Kindergärten" },
  schulen: { color: "#8b5cf6", label: "Schulen" },
  einkaufen: { color: "#10b981", label: "Einkaufen" },
  apotheken: { color: "#ef4444", label: "Apotheken" },
  aerzte: { color: "#ec4899", label: "Ärzte" },
  oepnv: { color: "#06b6d4", label: "ÖPNV" },
  freizeit: { color: "#84cc16", label: "Freizeit" },
};

function createCategoryIcon(color: string, isObjekt = false) {
  const size = isObjekt ? 36 : 24;
  const border = isObjekt ? 4 : 3;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:${border}px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      ${isObjekt ? 'z-index:1000;' : ''}
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

export default function StandortKarteExpose({ standort, objTitel }: { standort: StandortData; objTitel: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(Object.keys(CATEGORY_COLORS)));

  const allPins = useMemo(() => {
    const pins: { lat: number; lng: number; name: string; detail: string; category: string }[] = [];

    if (standort.objekt_koordinaten?.lat && standort.objekt_koordinaten?.lng) {
      pins.push({ lat: standort.objekt_koordinaten.lat, lng: standort.objekt_koordinaten.lng, name: objTitel, detail: "Immobilienstandort", category: "objekt" });
    }

    standort.arbeitgeber?.forEach(a => {
      if (a.lat && a.lng) pins.push({ lat: a.lat, lng: a.lng, name: a.name, detail: `${a.branche} · ${new Intl.NumberFormat("de-DE").format(a.mitarbeiter)} MA · ${a.entfernung_km} km`, category: "arbeitgeber" });
    });

    const mikro = standort.mikrolage;
    if (mikro) {
      mikro.kindergaerten?.forEach(k => { if (k.lat && k.lng) pins.push({ lat: k.lat, lng: k.lng, name: k.name, detail: `${k.entfernung_m} m`, category: "kindergaerten" }); });
      mikro.schulen?.forEach(s => { if (s.lat && s.lng) pins.push({ lat: s.lat, lng: s.lng, name: s.name, detail: `${s.typ} · ${s.entfernung_m} m`, category: "schulen" }); });
      mikro.einkaufen?.forEach(e => { if (e.lat && e.lng) pins.push({ lat: e.lat, lng: e.lng, name: e.name, detail: `${e.typ} · ${e.entfernung_m} m`, category: "einkaufen" }); });
      mikro.apotheken?.forEach(a => { if (a.lat && a.lng) pins.push({ lat: a.lat, lng: a.lng, name: a.name, detail: `${a.entfernung_m} m`, category: "apotheken" }); });
      mikro.aerzte?.forEach(a => { if (a.lat && a.lng) pins.push({ lat: a.lat, lng: a.lng, name: a.name, detail: `${a.entfernung_m} m`, category: "aerzte" }); });
      mikro.oepnv?.forEach(o => { if (o.lat && o.lng) pins.push({ lat: o.lat, lng: o.lng, name: o.name, detail: `${o.typ} · ${o.entfernung_m} m`, category: "oepnv" }); });
      mikro.freizeit?.forEach(f => { if (f.lat && f.lng) pins.push({ lat: f.lat, lng: f.lng, name: f.name, detail: `${f.typ} · ${f.entfernung_m} m`, category: "freizeit" }); });
    }

    return pins;
  }, [standort, objTitel]);

  useEffect(() => {
    if (!mapRef.current || allPins.length === 0) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const center = standort.objekt_koordinaten
      ? [standort.objekt_koordinaten.lat, standort.objekt_koordinaten.lng] as [number, number]
      : [allPins[0].lat, allPins[0].lng] as [number, number];

    const map = L.map(mapRef.current, { center, zoom: 13, scrollWheelZoom: true });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const bounds: L.LatLng[] = [];

    allPins.forEach(pin => {
      if (!activeCategories.has(pin.category)) return;
      const catConfig = CATEGORY_COLORS[pin.category];
      const icon = createCategoryIcon(catConfig?.color || "#666", pin.category === "objekt");
      const latLng = L.latLng(pin.lat, pin.lng);
      bounds.push(latLng);

      const marker = L.marker(latLng, { icon, zIndexOffset: pin.category === "objekt" ? 1000 : 0 }).addTo(map);
      marker.bindPopup(`
        <div style="min-width:140px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <div style="width:10px;height:10px;border-radius:50%;background:${catConfig?.color || '#666'};flex-shrink:0"></div>
            <span style="font-size:10px;color:#888;text-transform:uppercase">${catConfig?.label || pin.category}</span>
          </div>
          <p style="font-weight:700;font-size:13px;margin:0 0 2px">${pin.name}</p>
          <p style="font-size:11px;color:#666;margin:0">${pin.detail}</p>
        </div>
      `);
    });

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [allPins, activeCategories, standort.objekt_koordinaten]);

  const toggleCategory = (cat: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (allPins.length === 0) return null;

  const usedCategories = [...new Set(allPins.map(p => p.category))];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3 print:mb-2">
        {usedCategories.map(cat => {
          const cfg = CATEGORY_COLORS[cat];
          if (!cfg) return null;
          const isActive = activeCategories.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all print:opacity-100 ${
                isActive
                  ? "bg-white border-[hsl(40,8%,82%)] shadow-sm"
                  : "bg-[hsl(40,10%,91%)] border-transparent opacity-50"
              }`}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: cfg.color }}
              />
              <span className="font-medium">{cfg.label}</span>
              <span className="text-[hsl(0,0%,43%)]">
                ({allPins.filter(p => p.category === cat).length})
              </span>
            </button>
          );
        })}
      </div>
      <div ref={mapRef} className="h-[400px] rounded-xl border border-[hsl(40,8%,82%)] print:h-[300px]" />
    </div>
  );
}
