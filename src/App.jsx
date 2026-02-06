import { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Map from './components/Map';
import {
  geocodeLocation,
  parseCoordinates,
  getRoute,
  sampleRoutePoints,
  getWeatherForRoute,
  createRouteSegments
} from './services/api';
import './App.css';

// Utility to format duration
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
};

function App() {
  const [stops, setStops] = useState([]);
  const [routeName, setRouteName] = useState('');
  const [startTime, setStartTime] = useState(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    return now;
  });
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [weatherPoints, setWeatherPoints] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeSegments, setRouteSegments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [timeMultiplier, setTimeMultiplier] = useState(1.0);
  const [lastUpdated, setLastUpdated] = useState(null);

  const generateId = () => `stop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleAddStop = useCallback(async (input) => {
    const id = generateId();

    // Add stop immediately with loading state
    setStops(prev => [...prev, {
      id,
      input,
      name: input,
      resolved: false,
      loading: true
    }]);

    // Try to parse as coordinates first
    const coords = parseCoordinates(input);
    if (coords) {
      setStops(prev => prev.map(stop =>
        stop.id === id
          ? { ...stop, ...coords, resolved: true, loading: false }
          : stop
      ));
      return;
    }

    // Otherwise, geocode the location
    const result = await geocodeLocation(input);
    if (result) {
      setStops(prev => prev.map(stop =>
        stop.id === id
          ? {
            ...stop,
            lat: result.lat,
            lon: result.lon,
            name: result.name,
            country: result.country,
            admin1: result.admin1,
            resolved: true,
            loading: false
          }
          : stop
      ));
    } else {
      setStops(prev => prev.map(stop =>
        stop.id === id
          ? { ...stop, error: 'No se encontró la ubicación', loading: false }
          : stop
      ));
    }
  }, []);

  const handleRemoveStop = useCallback((id) => {
    setStops(prev => prev.filter(stop => stop.id !== id));
  }, []);

  const handleUpdateStop = useCallback((id, updates) => {
    setStops(prev => prev.map(stop =>
      stop.id === id ? { ...stop, ...updates } : stop
    ));
  }, []);

  const handleMoveStop = useCallback((index, direction) => {
    setStops(prev => {
      const newStops = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newStops.length) return prev;
      [newStops[index], newStops[targetIndex]] = [newStops[targetIndex], newStops[index]];
      return newStops;
    });
  }, []);

  // Handle click on map to add a waypoint
  const handleMapClick = useCallback((lat, lon) => {
    const id = generateId();
    const name = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    setStops(prev => [...prev, {
      id,
      input: name,
      name,
      lat,
      lon,
      resolved: true,
      loading: false
    }]);
  }, []);

  const handleCalculateRoute = useCallback(async (currentResolvedStops, isAutoRefresh = false) => {
    // If not passed (manual call), filter from state
    const resolvedStops = currentResolvedStops || stops.filter(s => s.resolved);

    if (resolvedStops.length < 2) {
      return;
    }

    setIsLoading(true);
    try {
      // 1. Get route from OSRM
      const route = await getRoute(resolvedStops.map(s => ({ lat: s.lat, lon: s.lon })));

      if (!route) {
        if (!isAutoRefresh) {
          alert('No se pudo calcular la ruta. Verifica que los puntos sean accesibles por carretera.');
        }
        setIsLoading(false);
        return;
      }

      setRouteGeometry(route.geometry);
      // Info updated with trip details
      setRouteInfo({
        distance: route.distance,
        duration: route.duration, // Base duration
        adjustedDuration: route.duration * timeMultiplier // Adjusted by speed
      });

      // Apply time multiplier for travel speed
      const adjustedDuration = route.duration * timeMultiplier;

      // 2. Sample points along the route for weather (every 15 minutes)
      const sampledPoints = sampleRoutePoints(
        route.geometry,
        adjustedDuration,
        startTime,
        15 // Sample every 15 minutes
      );

      // 3. Get weather for each sampled point
      const allWeatherData = await getWeatherForRoute(sampledPoints);

      // 4. Create colored route segments based on precipitation
      const segments = createRouteSegments(
        route.geometry,
        allWeatherData,
        adjustedDuration,
        startTime
      );
      setRouteSegments(segments);

      // 5. Show weather points
      setWeatherPoints(allWeatherData);

      setLastUpdated(new Date());

    } catch (error) {
      console.error('Error calculating route:', error);
    } finally {
      setIsLoading(false);
    }
  }, [stops, timeMultiplier, startTime]);

  // Automatic route calculation effect
  useEffect(() => {
    const resolvedStops = stops.filter(s => s.resolved);

    // Update Route Name with safety checks
    if (resolvedStops.length >= 2) {
      try {
        const start = resolvedStops[0].name ? resolvedStops[0].name.split(',')[0] : 'Inicio';
        const end = resolvedStops[resolvedStops.length - 1].name ? resolvedStops[resolvedStops.length - 1].name.split(',')[0] : 'Destino';
        setRouteName(`Ruta de ${start} a ${end}`);
      } catch (e) {
        console.error("Error setting route name:", e);
      }
    } else {
      setRouteName('');
    }

    // Trigger calculation if we have enough stops and not currently loading specific stop details
    if (resolvedStops.length >= 2 && !stops.some(s => s.loading) && !isLoading) {
      handleCalculateRoute(resolvedStops);
    } else if (resolvedStops.length < 2) {
      // Clear route if less than 2 stops
      setRouteGeometry(null);
      setWeatherPoints([]);
      setRouteSegments([]);
      setRouteInfo(null);
    }
  }, [stops, timeMultiplier, startTime]);

  // Auto-refresh interval (every 1 minute)
  useEffect(() => {
    // Only set interval if we have a calculated route
    if (!routeGeometry || stops.length < 2) return;

    const intervalId = setInterval(() => {
      // Just re-trigger calculation to fetch fresh weather data
      // We pass null to use existing resolved stops
      // This will update the 'now' time implicitly if we used Date.now(), 
      // but since startTime is state, we might want to update startTime if it was "current time".
      // For now, we just refresh weather for the existing time window.
      handleCalculateRoute(null, true);
    }, 60000); // 60000 ms = 1 minute

    return () => clearInterval(intervalId);
  }, [routeGeometry, stops, handleCalculateRoute]);

  // Map Click Mode State
  const [isMapClickEnabled, setIsMapClickEnabled] = useState(false);

  // Responsive state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showSidebar, setShowSidebar] = useState(!isMobile);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setShowSidebar(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={`app ${isMobile ? 'is-mobile' : ''}`}>
      <header className="app-header">
        <div className="header-brand">
          {isMobile && (
            <button
              className="icon-btn menu-btn"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              <span className="material-symbols-outlined">
                {showSidebar ? 'close' : 'menu'}
              </span>
            </button>
          )}
          <div className="brand-icon">
            <span className="material-symbols-outlined">route</span>
          </div>
          <h2 className="brand-title">
            {routeName || 'El Tiempo en mi Viaje'}
          </h2>
        </div>
      </header>

      <div className="app-content">
        <div className={`sidebar-wrapper ${showSidebar ? 'open' : 'closed'}`}>
          <Sidebar
            stops={stops}
            onAddStop={handleAddStop}
            onRemoveStop={handleRemoveStop}
            onUpdateStop={handleUpdateStop}
            onMoveStop={handleMoveStop}
            startTime={startTime}
            onStartTimeChange={setStartTime}
            onCalculateRoute={handleCalculateRoute}
            isLoading={isLoading}
            timeMultiplier={timeMultiplier}
            onTimeMultiplierChange={setTimeMultiplier}
            lastUpdated={lastUpdated}
          />
        </div>
        <Map
          routeGeometry={routeGeometry}
          weatherPoints={weatherPoints}
          stops={stops}
          routeInfo={routeInfo}
          routeSegments={routeSegments}
          onMapClick={handleMapClick}
          isMapClickEnabled={isMapClickEnabled}
          setIsMapClickEnabled={setIsMapClickEnabled}
          showSidebar={showSidebar}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

export default App;
