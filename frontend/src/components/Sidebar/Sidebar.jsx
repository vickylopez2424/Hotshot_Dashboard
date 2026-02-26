/**
 * Sidebar
 * Left panel — controls which map layers are visible.
 * Automatically picks up all platforms from the config registry.
 */
import React from 'react';
import { getMapLayerPlatforms } from '../../config/platforms';
import { usePlatform } from '../../context/PlatformContext';
import './Sidebar.css';

function Sidebar() {
  const { isLayerActive, toggleLayer } = usePlatform();
  const platforms = getMapLayerPlatforms();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Map Layers</div>
      <ul className="layer-list">
        {platforms.map(platform => (
          <li key={platform.id} className="layer-item">
            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={isLayerActive(platform.id)}
                onChange={() => toggleLayer(platform.id)}
              />
              <span className="layer-icon">{platform.icon}</span>
              <span className="layer-label">{platform.label}</span>
            </label>
            <p className="layer-desc">{platform.description}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default Sidebar;
