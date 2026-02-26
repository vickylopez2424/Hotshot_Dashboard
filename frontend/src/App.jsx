import React, { useState, useCallback } from 'react';
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
import Sidebar from './components/Sidebar/Sidebar';
import { PlatformProvider } from './context/PlatformContext';
import { PLATFORMS } from './config/platforms';

function App() {
  const [activePanel, setActivePanel] = useState('cameras');

  // Shared ELMFIRE time state — panel controls it, map layer reads it
  const [elmfireTime, setElmfireTime] = useState(null);

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
            {PLATFORMS.filter(p => p.enabled).map(platform => (
              <button
                key={platform.id}
                className={`nav-btn ${activePanel === platform.id ? 'active' : ''}`}
                onClick={() => setActivePanel(platform.id)}
              >
                {platform.icon} {platform.label}
              </button>
            ))}
          </nav>
          <div className="topbar-status">
            <span className="status-dot live"></span> Live
          </div>
        </header>

        {/* Main dashboard layout */}
        <main className="dashboard-layout">
          {/* Left sidebar: layer controls */}
          <Sidebar />

          {/* Center: interactive map — receives elmfireTime for animation */}
          <section className="map-section">
            <MapView elmfireTime={elmfireTime} />
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
            {/* Additional panels added here as platforms expand */}
          </aside>
        </main>
      </div>
    </PlatformProvider>
  );
}

export default App;
