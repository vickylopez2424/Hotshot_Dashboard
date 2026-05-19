import React, { useState, useCallback } from 'react';
import { Menu, Select } from '@mantine/core';
import './App.css';
import MapView from './components/Map/MapView';
import CameraPanel from './components/Cameras/CameraPanel';
import ElmfirePanel from './components/Elmfire/ElmfirePanel';
import WimsPanel from './components/WeatherStations/WimsPanel';
import WildcadPanel from './components/Wildcad/WildcadPanel';
import FirmsPanel from './components/Firms/FirmsPanel';
import NWSPanel from './components/NWSFire/NWSPanel';
import AirNowPanel from './components/AirNow/AirNowPanel';
import WatchdutyPanel from './components/Watchduty/WatchdutyPanel';
import LandfirePanel from './components/Landfire/LandfirePanel';
import PlantIdPanel from './components/PlantId/PlantIdPanel';
import VegetationPanel from './components/Vegetation/VegetationPanel';
import Sidebar from './components/Sidebar/Sidebar';
import { PlatformProvider } from './context/PlatformContext';
import { PANEL_CATEGORIES, getEnabledPlatformsByCategory } from './config/platforms';

// Top-bar menu icon per category
const CATEGORY_ICON = {
  Fire: '🔥',
  Weather: '🌤️',
  Vegetation: '🌿',
  'Air Quality': '💨',
  Alerts: '🔔',
};

// Minimum-acreage filter for incident markers on the map
const ACRE_FILTER_OPTIONS = [
  { value: '0',    label: 'All incidents' },
  { value: '1',    label: '≥ 1 acre' },
  { value: '10',   label: '≥ 10 acres' },
  { value: '100',  label: '≥ 100 acres' },
  { value: '1000', label: '≥ 1,000 acres' },
];

function App() {
  const [activePanel, setActivePanel] = useState('cameras');

  // Enabled platforms grouped by category for the top-bar menus
  const panelGroups = getEnabledPlatformsByCategory();

  // Hide incident markers smaller than this acreage (declutters the map)
  const [incidentMinAcres, setIncidentMinAcres] = useState(10);

  // Shared ELMFIRE time state — panel controls it, map layer reads it
  const [elmfireTime, setElmfireTime] = useState(null);

  // LANDFIRE layer state — panel controls which layer + opacity the map shows
  const [landfireLayer,   setLandfireLayer]   = useState('US_220FBFM40');
  const [landfireOpacity, setLandfireOpacity] = useState(0.7);

  // Vegetation layer state
  const [vegetationLayer,   setVegetationLayer]   = useState('MOD13A2_006_NDVI');
  const [vegetationOpacity, setVegetationOpacity] = useState(0.65);

  // Selected WildCAD incident — panel selection flies map to incident
  const [selectedIncident, setSelectedIncident] = useState(null);
  const handleElmfireTimeChange = useCallback((t) => setElmfireTime(t), []);

  return (
    <PlatformProvider>
      <div className="app-container">
        {/* Top navigation bar */}
        <header className="topbar">
          <div className="topbar-brand">
            <span className="fire-icon">🔥</span>
            <h1>Hotshot Dashboard</h1>
          </div>
          <nav className="topbar-nav">
            {PANEL_CATEGORIES.map(cat => {
              const platforms = panelGroups[cat] || [];
              if (platforms.length === 0) return null;

              const activeInCat = platforms.find(p => p.id === activePanel);
              const icon = CATEGORY_ICON[cat] || '';

              return (
                <Menu
                  key={cat}
                  position="bottom-start"
                  width={220}
                  shadow="md"
                  withinPortal
                >
                  <Menu.Target>
                    <button className={`nav-btn ${activeInCat ? 'active' : ''}`}>
                      {icon} {activeInCat ? activeInCat.label : cat}
                      <span className="nav-caret">▾</span>
                    </button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>{icon} {cat}</Menu.Label>
                    {platforms.map(p => (
                      <Menu.Item
                        key={p.id}
                        leftSection={p.icon}
                        rightSection={activePanel === p.id ? '●' : null}
                        onClick={() => setActivePanel(p.id)}
                      >
                        {p.label}
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              );
            })}
          </nav>
          <div className="topbar-status">
            <span className="status-dot live"></span> Live
          </div>
        </header>

        {/* Main dashboard layout */}
        <main className="dashboard-layout">
          {/* Left sidebar: layer controls */}
          <Sidebar />

          {/* Center: interactive map */}
          <section className="map-section">
            <div className="map-filter-overlay">
              <Select
                size="xs"
                label="Min fire size"
                data={ACRE_FILTER_OPTIONS}
                value={String(incidentMinAcres)}
                onChange={(v) => setIncidentMinAcres(Number(v ?? 0))}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
              />
            </div>
            <MapView
              elmfireTime={elmfireTime}
              landfireLayer={landfireLayer}
              landfireOpacity={landfireOpacity}
              vegetationLayer={vegetationLayer}
              vegetationOpacity={vegetationOpacity}
              incidentMinAcres={incidentMinAcres}
            />
          </section>

          {/* Right panel: platform-specific data */}
          <aside className="data-panel">
            {activePanel === 'cameras'    && <CameraPanel />}
            {activePanel === 'elmfire'    && (
              <ElmfirePanel onTimeChange={handleElmfireTimeChange} />
            )}
            {activePanel === 'wims'       && <WimsPanel />}
            {activePanel === 'wildcad'    && (
              <WildcadPanel onIncidentSelect={setSelectedIncident} />
            )}
            {activePanel === 'firms'      && <FirmsPanel />}
            {activePanel === 'nws'        && <NWSPanel />}
            {activePanel === 'airnow'     && <AirNowPanel />}
            {activePanel === 'watchduty'  && <WatchdutyPanel />}
            {activePanel === 'landfire'   && (
              <LandfirePanel
                onLayerChange={setLandfireLayer}
                onOpacityChange={setLandfireOpacity}
              />
            )}
            {activePanel === 'plant_id'   && <PlantIdPanel />}
            {activePanel === 'vegetation' && (
              <VegetationPanel
                onLayerChange={setVegetationLayer}
                onOpacityChange={setVegetationOpacity}
              />
            )}
            {/* Additional panels added here as platforms expand */}
          </aside>
        </main>
      </div>
    </PlatformProvider>
  );
}

export default App;
