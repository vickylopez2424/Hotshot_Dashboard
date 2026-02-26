import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

const FEATURES = [
  {
    icon: '🛰️',
    title: 'Active Fire Detection',
    desc: 'NASA FIRMS satellite hotspot data updated every 10 minutes across the continental US.',
  },
  {
    icon: '📈',
    title: 'Fire Spread Modeling',
    desc: 'ELMFIRE physics-based wildfire spread predictions with animated time-step visualization.',
  },
  {
    icon: '📷',
    title: '1,600+ Live Cameras',
    desc: 'ALERTWildfire network — HD cameras across CA, OR, WA, NV, ID, MT with MJPEG streams.',
  },
  {
    icon: '🌡️',
    title: 'RAWS Weather Stations',
    desc: 'Real-time fire weather data from 2,000+ Remote Automated Weather Stations nationwide.',
  },
  {
    icon: '🚒',
    title: 'Incident Tracking',
    desc: 'NIFC IRWIN incident data combined with WildCAD dispatch feeds — active fires and trends.',
  },
  {
    icon: '🗺️',
    title: 'Unified Map View',
    desc: 'All data sources on one interactive map. Toggle layers, filter by region, click for details.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      {/* ── Nav ── */}
      <nav className="landing-nav">
        <div className="landing-nav-logo">
          <span className="logo-icon">🔥</span>
          <span className="logo-text">Hotshot Dashboard</span>
        </div>
        <div className="landing-nav-actions">
          <button className="btn-ghost" onClick={() => navigate('/auth?mode=login')}>
            Sign In
          </button>
          <button className="btn-primary" onClick={() => navigate('/auth?mode=signup')}>
            Request Access
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-badge">Wildfire Situational Awareness</div>
        <h1 className="hero-title">
          Every data source.<br />
          One dashboard.
        </h1>
        <p className="hero-subtitle">
          Hotshot Dashboard aggregates satellite fire detection, live camera networks,
          weather stations, predictive models, and incident data into a single
          real-time operational picture.
        </p>
        <div className="hero-actions">
          <button className="btn-primary btn-lg" onClick={() => navigate('/auth?mode=signup')}>
            Request Free Access
          </button>
          <button className="btn-outline btn-lg" onClick={() => navigate('/auth?mode=login')}>
            Sign In
          </button>
        </div>
        <p className="hero-note">
          Free access · Manual approval required · Built for fire professionals
        </p>
      </section>

      {/* ── Features ── */}
      <section className="features">
        <h2 className="section-title">Everything you need. Nothing you don't.</h2>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <span className="feature-icon">{f.icon}</span>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section">
        <h2>Built for hotshot crews, dispatchers, and fire managers.</h2>
        <p>
          Accounts are manually reviewed to ensure access is limited to fire
          professionals and authorized personnel.
        </p>
        <button className="btn-primary btn-lg" onClick={() => navigate('/auth?mode=signup')}>
          Request Access — It's Free
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} NonBinary Technology</span>
        <a href="https://nbtechai.com" target="_blank" rel="noreferrer">nbtechai.com</a>
      </footer>
    </div>
  );
}
