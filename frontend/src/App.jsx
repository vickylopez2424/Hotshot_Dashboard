import React, { useState } from 'react';
import './App.css';
import MapView from './components/Map/MapView';
import CameraPanel from './components/Cameras/CameraPanel';
import ElmfirePanel from './components/Elmfire/ElmfirePanel';
import WimsPanel from './components/WeatherStations/WimsPanel';
import Sidebar from './components/Sidebar/Sidebar';
import { PlatformProvider } from './context/PlatformContext';
import { PLATFORMS } from './config/platforms';

function App() {
  const [activePanel, setActivePanel] = useState('cameras');

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

          {/* Center: interactive map */}
          <section className="map-section">
            <MapView />
          </section>

          {/* Right panel: platform-specific data */}
          <aside className="data-panel">
            {activePanel === 'cameras'    && <CameraPanel />}
            {activePanel === 'elmfire'    && <ElmfirePanel />}
            {activePanel === 'wims'       && <WimsPanel />}
            {/* Additional panels added here as platforms expand */}
          </aside>
        </main>
      </div>
    </PlatformProvider>
  );
}

export default App;
