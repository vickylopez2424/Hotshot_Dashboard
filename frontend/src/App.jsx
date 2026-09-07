import React, { useState, useCallback } from 'react';
import { Menu, Select } from '@mantine/core';
import {
  Activity,
  Bell,
  Camera,
  ChevronDown,
  Flame,
  Gauge,
  Leaf,
  MapPin,
  Radio,
  Satellite,
  ShieldAlert,
  TrendingUp,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
import PowerBIInsightPanel from './components/PowerBI/PowerBIInsightPanel';
import Sidebar from './components/Sidebar/Sidebar';
import { PlatformProvider } from './context/PlatformContext';
import { PANEL_CATEGORIES, getEnabledPlatformsByCategory, getPlatform } from './config/platforms';

const CATEGORY_META = {
  Fire: { Icon: Flame, tone: 'fire' },
  Weather: { Icon: Wind, tone: 'weather' },
  Vegetation: { Icon: Leaf, tone: 'vegetation' },
  'Air Quality': { Icon: Activity, tone: 'air' },
  Alerts: { Icon: Bell, tone: 'alerts' },
};

// Minimum-acreage filter for incident markers on the map
const ACRE_FILTER_OPTIONS = [
  { value: '0',    label: 'All incidents' },
  { value: '1',    label: '≥ 1 acre' },
  { value: '10',   label: '≥ 10 acres' },
  { value: '100',  label: '≥ 100 acres' },
  { value: '1000', label: '≥ 1,000 acres' },
];

const VISUAL_TREND_DATA = [
  { time: '0600', risk: 28, intel: 35 },
  { time: '0900', risk: 42, intel: 48 },
  { time: '1200', risk: 58, intel: 56 },
  { time: '1500', risk: 72, intel: 68 },
  { time: '1800', risk: 64, intel: 74 },
  { time: '2100', risk: 46, intel: 62 },
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
  const activePlatform = getPlatform(activePanel);

  return (
    <PlatformProvider>
      <div className="app-container">
        {/* Top navigation bar */}
        <header className="topbar">
          <div className="topbar-brand">
            <span className="brand-mark" aria-hidden="true">H</span>
            <div>
              <h1>Hotshot Dashboard</h1>
              <span>Wildfire intelligence command view</span>
            </div>
          </div>
          <nav className="topbar-nav">
            {PANEL_CATEGORIES.map(cat => {
              const platforms = panelGroups[cat] || [];
              if (platforms.length === 0) return null;

              const activeInCat = platforms.find(p => p.id === activePanel);
              const meta = CATEGORY_META[cat] || { Icon: Radio, tone: 'default' };
              const NavIcon = meta.Icon;

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
                      <span className={`nav-icon ${meta.tone}`}><NavIcon size={14} strokeWidth={2.4} /></span>
                      <span>{activeInCat ? activeInCat.label : cat}</span>
                      <ChevronDown className="nav-caret" size={14} strokeWidth={2.2} />
                    </button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>{cat}</Menu.Label>
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
            <span className="status-pill"><span className="status-dot live"></span>Live</span>
            <span className="status-meta">NorCal AO</span>
          </div>
        </header>

        {/* Main dashboard layout */}
        <main className="dashboard-layout">
          {/* Left sidebar: layer controls */}
          <Sidebar />

          {/* Center: interactive map */}
          <section className="map-section">
            <div className="map-intel-strip">
              <div>
                <span className="intel-label"><Satellite size={12} /> Active feed</span>
                <strong>{activePlatform?.label || 'Dashboard'}</strong>
              </div>
              <div>
                <span className="intel-label"><ShieldAlert size={12} /> Focus</span>
                <strong>{activePlatform?.category || 'Operations'}</strong>
              </div>
              <div>
                <span className="intel-label"><Flame size={12} /> Threshold</span>
                <strong>{incidentMinAcres.toLocaleString()}+ acres</strong>
              </div>
            </div>
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
              selectedIncident={selectedIncident}
              landfireLayer={landfireLayer}
              landfireOpacity={landfireOpacity}
              vegetationLayer={vegetationLayer}
              vegetationOpacity={vegetationOpacity}
              incidentMinAcres={incidentMinAcres}
            />
          </section>

          {/* Right panel: platform-specific data */}
          <aside className="data-panel">
            <div className="ops-summary" aria-label="Visual operations summary">
              <div className="ops-summary-card fire">
                <Flame size={16} strokeWidth={2.4} />
                <span>Fire Intel</span>
                <strong>Priority</strong>
              </div>
              <div className="ops-summary-card camera">
                <Camera size={16} strokeWidth={2.4} />
                <span>Camera Net</span>
                <strong>Visual</strong>
              </div>
              <div className="ops-summary-card weather">
                <Gauge size={16} strokeWidth={2.4} />
                <span>Weather</span>
                <strong>Watch</strong>
              </div>
              <div className="ops-summary-card map">
                <MapPin size={16} strokeWidth={2.4} />
                <span>Map Layers</span>
                <strong>Ready</strong>
              </div>
            </div>
            <div className="ops-trend-card" aria-label="Visual risk trend">
              <div className="ops-trend-header">
                <div>
                  <span>Operational Tempo</span>
                  <strong>Visual Risk Trend</strong>
                </div>
                <TrendingUp size={18} strokeWidth={2.4} />
              </div>
              <div className="ops-trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={VISUAL_TREND_DATA} margin={{ top: 6, right: 4, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff7a3d" stopOpacity={0.42} />
                        <stop offset="95%" stopColor="#ff7a3d" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="intelFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#75c7f0" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="#75c7f0" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: '#7f8b92', fontSize: 10 }} />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip
                      cursor={{ stroke: 'rgba(255,255,255,0.16)', strokeWidth: 1 }}
                      contentStyle={{
                        background: 'rgba(9, 14, 16, 0.94)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        color: '#e8ece8',
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="intel" stroke="#75c7f0" fill="url(#intelFill)" strokeWidth={2} />
                    <Area type="monotone" dataKey="risk" stroke="#ff7a3d" fill="url(#riskFill)" strokeWidth={2.4} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <PowerBIInsightPanel />
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
