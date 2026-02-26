import React, { createContext, useContext, useState } from 'react';
import { getMapLayerPlatforms } from '../config/platforms';

const PlatformContext = createContext(null);

/**
 * PlatformProvider
 * Tracks which map layers are active and any global dashboard state.
 * Wrap App with this provider.
 */
export function PlatformProvider({ children }) {
  // Initialize all map-layer platforms as active
  const [activeLayers, setActiveLayers] = useState(
    Object.fromEntries(getMapLayerPlatforms().map(p => [p.id, true]))
  );

  const toggleLayer = (platformId) => {
    setActiveLayers(prev => ({ ...prev, [platformId]: !prev[platformId] }));
  };

  const isLayerActive = (platformId) => !!activeLayers[platformId];

  return (
    <PlatformContext.Provider value={{ activeLayers, toggleLayer, isLayerActive }}>
      {children}
    </PlatformContext.Provider>
  );
}

export const usePlatform = () => {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
};
