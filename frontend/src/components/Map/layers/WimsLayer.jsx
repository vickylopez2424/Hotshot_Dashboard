/**
 * WimsLayer
 * Renders WIMS/RAWS fire weather station markers on the map.
 * Each marker shows current weather conditions on click.
 */
import React, { useEffect, useState } from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import axios from 'axios';

const STATION_COLOR = '#00bcd4';

function WimsLayer() {
  const [stations, setStations] = useState([]);

  useEffect(() => {
    axios.get('/api/wims/stations')
      .then(res => setStations(res.data.stations || []))
      .catch(() => setStations([]));
  }, []);

  return (
    <>
      {stations.map((station) => (
        <CircleMarker
          key={station.station_id}
          center={[station.latitude, station.longitude]}
          radius={5}
          pathOptions={{ color: STATION_COLOR, fillColor: STATION_COLOR, fillOpacity: 0.8 }}
        >
          <Popup>
            <strong>{station.name}</strong><br />
            Station ID: {station.station_id}<br />
            Temp: {station.temp_f}°F<br />
            RH: {station.rh}%<br />
            Wind: {station.wind_speed} mph {station.wind_dir}<br />
            Fuel Moisture: {station.fuel_moisture}%
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

export default WimsLayer;
