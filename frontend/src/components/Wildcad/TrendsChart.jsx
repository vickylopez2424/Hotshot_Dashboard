/**
 * TrendsChart
 * Lightweight SVG bar charts for wildfire trend data.
 * No external chart library needed — pure React/SVG.
 */
import React from 'react';
import './TrendsChart.css';

function BarChart({ data, labelKey, valueKey, color = '#ff6b35', title, maxBars = 12 }) {
  if (!data || data.length === 0) return null;
  const visible = data.slice(0, maxBars);
  const max = Math.max(...visible.map(d => d[valueKey]), 1);

  return (
    <div className="chart-container">
      <div className="chart-title">{title}</div>
      <div className="bar-chart">
        {visible.map((d, i) => {
          const pct = (d[valueKey] / max) * 100;
          return (
            <div key={i} className="bar-item" title={`${d[labelKey]}: ${d[valueKey]}`}>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ height: `${pct}%`, background: color }}
                />
              </div>
              <div className="bar-label">{_shortLabel(d[labelKey])}</div>
              <div className="bar-value">{d[valueKey]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HorizBarChart({ data, labelKey, valueKey, color = '#ff6b35', title, maxBars = 10 }) {
  if (!data || data.length === 0) return null;
  const visible = data.slice(0, maxBars);
  const max = Math.max(...visible.map(d => d[valueKey]), 1);

  return (
    <div className="chart-container">
      <div className="chart-title">{title}</div>
      <div className="horiz-chart">
        {visible.map((d, i) => {
          const pct = (d[valueKey] / max) * 100;
          return (
            <div key={i} className="horiz-row">
              <div className="horiz-label">{d[labelKey]}</div>
              <div className="horiz-track">
                <div
                  className="horiz-fill"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              <div className="horiz-value">{d[valueKey].toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card-value" style={{ color: color || '#ff6b35' }}>
        {value}
      </div>
      <div className="stat-card-label">{label}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

function _shortLabel(str) {
  if (!str) return '';
  // Shorten month labels: 2024-06 → Jun
  const m = str.match(/^\d{4}-(\d{2})$/);
  if (m) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[parseInt(m[1]) - 1] || str;
  }
  // Shorten long labels
  return str.length > 8 ? str.slice(0, 7) + '…' : str;
}

function TrendsChart({ trends }) {
  if (!trends) return <p className="placeholder">Loading trends...</p>;

  const totalAcresFormatted = trends.total_acres >= 1000
    ? `${(trends.total_acres / 1000).toFixed(1)}k`
    : Math.round(trends.total_acres).toLocaleString();

  const containedPct = trends.total_incidents > 0
    ? Math.round((trends.contained_count / trends.total_incidents) * 100)
    : 0;

  return (
    <div className="trends-panel">
      {/* Summary stat cards */}
      <div className="stat-cards">
        <StatCard
          label="Incidents YTD"
          value={trends.total_incidents.toLocaleString()}
          color="#ff6b35"
        />
        <StatCard
          label="Acres Burned"
          value={totalAcresFormatted}
          color="#ff9800"
        />
        <StatCard
          label="% Contained"
          value={`${containedPct}%`}
          color="#4caf50"
        />
      </div>

      {/* Monthly bar chart */}
      <BarChart
        data={trends.by_month}
        labelKey="month"
        valueKey="count"
        color="#ff6b35"
        title="Incidents by Month"
      />

      {/* Cause breakdown */}
      <HorizBarChart
        data={trends.by_cause}
        labelKey="cause"
        valueKey="count"
        color="#ff9800"
        title="By Cause"
        maxBars={6}
      />

      {/* Agency breakdown */}
      <HorizBarChart
        data={trends.by_agency}
        labelKey="agency"
        valueKey="count"
        color="#2196f3"
        title="By Agency"
        maxBars={6}
      />

      {/* Top states */}
      <HorizBarChart
        data={trends.by_state}
        labelKey="state"
        valueKey="count"
        color="#9c27b0"
        title="Top States"
        maxBars={10}
      />
    </div>
  );
}

export default TrendsChart;
