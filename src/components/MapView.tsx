"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { FeatureCollection, Polygon } from "geojson";
import { loadZones, detectZone } from "@/lib/zoneDetect";
import type { Observation, ObservationPriority } from "@/types";
import { PRIORITY_COLORS, getZoneColor } from "@/types";

interface MapViewProps {
  observations: Observation[];
  onMapClick: (lng: number, lat: number, zoneName: string | null) => void;
  onPinClick: (observation: Observation) => void;
  basemap?: "satellite" | "streets";
}

async function loadZoneLabels(): Promise<FeatureCollection> {
  const res = await fetch("/data/project_zone_labels.geojson");
  return res.json();
}

export default function MapView({ observations, onMapClick, onPinClick, basemap = "satellite" }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Keyed by observation id (not a plain array) so pins can be diffed and
  // updated in place instead of being torn down and rebuilt from scratch on
  // every fetch. With a project's worth of observations accumulated over
  // months of use, rebuilding every single marker on every refresh (which
  // happens after each new observation, status change, etc.) is exactly
  // what made the map feel heavier the longer the app had been used.
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const markerSignatureRef = useRef<Map<string, string>>(new Map());
  // Markers are kept and reused across renders (see the diffing effect
  // below), so their click handlers can't capture an `obs` object directly
  // — that would freeze on whatever data existed the moment the pin was
  // first created. This map always holds the latest observation per id, so
  // a click always looks up current data instead of a stale snapshot.
  const obsByIdRef = useRef<Map<string, Observation>>(new Map());
  const zonesRef = useRef<FeatureCollection<Polygon> | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  const currentBasemapRef = useRef<"satellite" | "streets">("satellite");
  const [mapReady, setMapReady] = useState(false);
  const basemapRef = useRef(basemap);
  basemapRef.current = basemap;

  // Keep the latest callback refs so the map's event handlers (bound once)
  // always call the current version without needing to re-init the map.
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;

  // Initialize map once
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Guard against React Strict Mode's mount→unmount→mount double-invoke
    // in dev: if this container already has a leaflet instance attached
    // from a cleanup that hasn't fully settled, don't init a second one.
    if ((mapContainer.current as unknown as { _leaflet_id?: number })._leaflet_id) {
      return;
    }

    let cancelled = false;

    const map = L.map(mapContainer.current, {
      center: [24.88, 46.745], // approximate project center (Riyadh area)
      zoom: 15,
      zoomControl: true,
    });

    // Esri World Imagery — free satellite basemap, no API key required.
    const satelliteLayer = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        maxZoom: 20,
      }
    );

    // Street map alternative, switchable from Settings.
    const streetsLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    });

    currentBasemapRef.current = basemapRef.current;
    baseLayerRef.current = basemapRef.current === "streets" ? streetsLayer : satelliteLayer;
    baseLayerRef.current.addTo(map);

    // Optional reference labels (roads/place names) overlaid on the imagery.
    // Only shown over satellite imagery — the streets basemap already has
    // its own labels baked in.
    const referenceLabels = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, opacity: 0.9 }
    );
    labelsLayerRef.current = referenceLabels;
    if (basemapRef.current !== "streets") referenceLabels.addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lng, lat } = e.latlng;
      const zones = zonesRef.current;
      const zoneName = zones ? detectZone(lng, lat, zones) : null;
      onMapClickRef.current(lng, lat, zoneName);
    });

    mapRef.current = map;

    // Leaflet caches the container's pixel size at init time and doesn't
    // notice on its own when that size changes (window resize, orientation
    // change, the side panel opening/closing, StatsBar/FilterBar wrapping
    // onto more lines on a narrow phone). Without telling it to recheck,
    // the map renders at the wrong size and tiles appear to "flash and
    // disappear" until you interact with it again.
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainer.current);

    loadZones().then((zones) => {
      // The effect may have been cleaned up (map removed) by the time this
      // async fetch resolves — never touch a removed map instance.
      if (cancelled) return;
      zonesRef.current = zones;

      L.geoJSON(zones, {
        // interactive:false is the key fix — without it, the zone polygons
        // (which cover entire buildings) swallow clicks meant for the map,
        // which is exactly why tapping on a building stopped opening the
        // new-observation form.
        interactive: false,
        // Each zone/phase gets its own color (derived from the phase
        // number in its name — "3I", "Phase 4 Boundary", "2A-B", etc.)
        // instead of one flat yellow for everything.
        style: (feature) => {
          const color = getZoneColor(feature?.properties?.name);
          return {
            color,
            weight: 2.5,
            fillColor: color,
            fillOpacity: 0.08,
            opacity: 0.9,
          };
        },
      }).addTo(map);

      setMapReady(true);
    });

    // Zone name labels — always visible, placed at the exact point drawn
    // in the original CAD/KML file (not a computed centroid), so each
    // phase/zone code sits exactly where the surveyor put it.
    loadZoneLabels().then((labels) => {
      if (cancelled) return;
      L.geoJSON(labels, {
        pointToLayer: (feature, latlng) => {
          const name: string = feature.properties?.name ?? "";
          // Short codes ("3I", "4M") are zone/plot labels; anything longer
          // ("PHASE 5", "GATE 4", "WADI") is a landmark/section label and
          // reads better a size up.
          const isLandmark = name.replace(/\s/g, "").length > 3;
          const icon = L.divIcon({
            className: "zone-label",
            html: `<div style="
              font-size:${isLandmark ? 14 : 12.5}px;
              font-weight:${isLandmark ? 800 : 700};
              color:#fff;
              white-space:nowrap;pointer-events:none;
              transform:translate(-50%,-50%);
              letter-spacing:0.4px;
              text-shadow:
                -1px -1px 1.5px rgba(0,0,0,0.9),
                1px -1px 1.5px rgba(0,0,0,0.9),
                -1px 1px 1.5px rgba(0,0,0,0.9),
                1px 1px 1.5px rgba(0,0,0,0.9),
                0 0 6px rgba(0,0,0,0.55);
            ">${name}</div>`,
            iconSize: [0, 0],
          });
          return L.marker(latlng, { icon, interactive: false });
        },
      }).addTo(map);
    });

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      markerSignatureRef.current.clear();
      obsByIdRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the base tile layer (and its label overlay) when the user changes
  // the map style in Settings, without re-initializing the whole map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!baseLayerRef.current) return;

    const wantsStreets = basemap === "streets";
    const currentIsStreets = currentBasemapRef.current === "streets";

    if (wantsStreets === currentIsStreets) return;
    currentBasemapRef.current = basemap;

    map.removeLayer(baseLayerRef.current);
    if (labelsLayerRef.current) map.removeLayer(labelsLayerRef.current);

    const newLayer = wantsStreets
      ? L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        })
      : L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution:
              "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
            maxZoom: 20,
          }
        );
    newLayer.addTo(map);
    newLayer.bringToBack();
    baseLayerRef.current = newLayer;

    if (!wantsStreets && labelsLayerRef.current) {
      labelsLayerRef.current.addTo(map);
    }
  }, [basemap, mapReady]);

  function buildMarkerIcon(obs: Observation): L.DivIcon {
    const color =
      obs.status === "closed"
        ? "#6b7280"
        : obs.status === "pending_review"
        ? "#0891b2" // cyan — visually distinct "awaiting review" state
        : PRIORITY_COLORS[obs.priority as ObservationPriority];
    const opacity = obs.status === "closed" ? 0.6 : 1;
    const isConsultantReport = obs.profiles?.role === "consultant";

    // Consultant-raised observations get a distinct look: a blue ring
    // plus a small "C" badge, so they stand out from Safety Officer
    // reports at a glance (consultant items must close same-day).
    // The ticket number is always shown so a specific observation can be
    // found and referenced at a glance instead of having to open each pin.
    const isInProgress = obs.status === "in_progress";

    return L.divIcon({
      className: "observation-marker",
      html: `<div style="position:relative;width:26px;height:26px;overflow:visible;">
        ${
          isInProgress
            ? `<div class="pulse-ring" style="border:2px solid ${color};"></div>
               <div class="pulse-ring" style="border:2px solid ${color};animation-delay:0.85s;"></div>`
            : ""
        }
        <div style="
          width:26px;height:26px;border-radius:50%;
          border:${isConsultantReport ? "3px solid #2563eb" : "2px solid white"};
          box-shadow:0 1px 4px rgba(0,0,0,0.4);
          background-color:${color};opacity:${opacity};cursor:pointer;
          display:flex;align-items:center;justify-content:center;
          font-size:10px;font-weight:800;color:white;
          text-shadow:0 1px 1px rgba(0,0,0,0.5);
        ">#${obs.ticket_no}</div>
        ${
          isConsultantReport
            ? `<div style="
                position:absolute;top:-6px;right:-6px;
                width:15px;height:15px;border-radius:50%;
                background:#2563eb;border:1.5px solid white;
                display:flex;align-items:center;justify-content:center;
                font-size:9px;font-weight:800;color:white;
                box-shadow:0 1px 2px rgba(0,0,0,0.4);
              ">C</div>`
            : ""
        }
      </div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  // Everything that affects how a pin looks or where it sits — if none of
  // this changed for a given observation, its marker doesn't need to be
  // touched at all.
  function markerSignature(obs: Observation): string {
    return [
      obs.status,
      obs.priority,
      obs.ticket_no,
      obs.latitude,
      obs.longitude,
      obs.profiles?.role === "consultant" ? "c" : "",
    ].join("|");
  }

  // Render / update observation pins whenever the list changes. Diffs
  // against what's already on the map instead of clearing and rebuilding
  // everything, so a single new/updated observation doesn't cost an
  // O(n) marker rebuild once the project has hundreds of pins.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const markers = markersRef.current;
    const signatures = markerSignatureRef.current;

    const incomingIds = new Set(observations.map((o) => o.id));
    obsByIdRef.current = new Map(observations.map((o) => [o.id, o]));

    // Remove pins for observations no longer in the list (filtered out or
    // deleted).
    for (const [id, marker] of markers) {
      if (!incomingIds.has(id)) {
        marker.remove();
        markers.delete(id);
        signatures.delete(id);
      }
    }

    // Add new pins / update ones whose look actually changed.
    for (const obs of observations) {
      const signature = markerSignature(obs);
      const existing = markers.get(obs.id);

      if (existing) {
        if (signatures.get(obs.id) !== signature) {
          existing.setIcon(buildMarkerIcon(obs));
          existing.setLatLng([obs.latitude, obs.longitude]);
          signatures.set(obs.id, signature);
        }
        continue;
      }

      const marker = L.marker([obs.latitude, obs.longitude], { icon: buildMarkerIcon(obs) })
        .addTo(map)
        .on("click", () => {
          const latest = obsByIdRef.current.get(obs.id);
          if (latest) onPinClickRef.current(latest);
        });
      markers.set(obs.id, marker);
      signatures.set(obs.id, signature);
    }
  }, [observations, mapReady]);

  return <div ref={mapContainer} className="w-full h-full relative z-0" />;
}
