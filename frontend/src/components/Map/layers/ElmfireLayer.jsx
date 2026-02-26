/**
 * ElmfireLayer
 * Renders ELMFIRE fire spread prediction as animated time-step polygons.
 *
 * Each concentric ring shows the cumulative burned area at one time step.
 * Color progresses from deep red (early) to orange/yellow (late).
 * The time slider in ElmfirePanel controls which steps are visible.
 */
import React, { useEffect, useState } from 'react';
import { GeoJSON, Marker, Popup } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';

// Color scale: early arrival = dark red, late = yellow
const TIME_COLORS = [
  '#7f0000', '#b30000', '#d73027', '#f46d43',
  '#fdae61', '#fee08b', '#ffffbf',
];

function getColorForStep(index, totalSteps) {
  const t = totalSteps <= 1 ? 0 : index / (totalSteps - 1);
  const i = Math.min(Math.floor(t * (TIME_COLORS.length - 1)), TIME_COLORS.length - 2);
  return TIME_COLORS[i];
}

function ElmfireLayer({ currentTimeMinutes, runId, onDataLoaded }) {
  const [geojson, setGeojson]   = useState(null);
  const [maxTime, setMaxTime]   = useState(360);

  useEffect(() => {
    const url = runId
      ? `/api/elmfire/prediction/${runId}`
      : '/api/elmfire/prediction';
    axios.get(url)
      .then(res => {
        setGeojson(res.data);
        if (res.data.max_time_minutes) {
          setMaxTime(res.data.max_time_minutes);
          onDataLoaded?.({
            maxTimeMinutes: res.data.max_time_minutes,
            featureCount:   res.data.features?.length ?? 0,
          });
        }
      })
      .catch(() => setGeojson(null));
  }, [runId]);

  if (!geojson || !geojson.features) return null;

  // Only show features up to currentTimeMinutes
  const visibleFeatures = geojson.features.filter(
    f => f.properties.time_minutes <= (currentTimeMinutes ?? maxTime)
  );

  const totalSteps = geojson.features.length;

  return (
    <>
      {visibleFeatures.map((feature, index) => {
        const color = getColorForStep(index, totalSteps);
        return (
          <GeoJSON
            key={`${feature.properties.time_minutes}-${currentTimeMinutes}`}
            data={feature}
            style={{
              color:       color,
              weight:      1.5,
              fillColor:   color,
              fillOpacity: index === visibleFeatures.length - 1 ? 0.4 : 0.15,
              opacity:     0.9,
            }}
            onEachFeature={(feat, layer) => {
              layer.bindTooltip(
                `<strong>ELMFIRE Prediction</strong><br />
                 Fire arrival: <strong>${feat.properties.time_label}</strong>`,
                { sticky: true }
              );
            }}
          />
        );
      })}
    </>
  );
}

export default ElmfireLayer;
