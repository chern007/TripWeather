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

  // Automatic route calculation effect
  useEffect(() => {
    const resolvedStops = stops.filter(s => s.resolved);

    // Update Route Name
    if (resolvedStops.length >= 2) {
      const start = resolvedStops[0].name.split(',')[0];
      const end = resolvedStops[resolvedStops.length - 1].name.split(',')[0];
      setRouteName(`Ruta de ${start} a ${end}`);
    } else {
      setRouteName('');
    }

    // Trigger calculation if we have enough stops and not currently loading specific stop details
    // using a small debounce could be good but for now direct trigger
    if (resolvedStops.length >= 2 && !stops.some(s => s.loading)) {
      handleCalculateRoute(resolvedStops);
    } else if (resolvedStops.length < 2) {
      // Clear route if less than 2 stops
      setRouteGeometry(null);
      setWeatherPoints([]);
      setRouteSegments([]);
      setRouteInfo(null);
    }
  }, [stops, timeMultiplier, startTime]); // Recalculate on stops, speed, or time start change

  const handleCalculateRoute = useCallback(async (currentResolvedStops) => {
    // If not passed (manual call), filter from state
    const resolvedStops = currentResolvedStops || stops.filter(s => s.resolved);

    if (resolvedStops.length < 2) {
      return;
    }

    setIsLoading(true);
    // Note: We don't clear geometry immediately to avoid flickering on small updates

    try {
      // 1. Get route from OSRM
      // Only fetch OSRM if geometry is null or stops changed (optimization)
      // For now, allow refetch to be safe
      const route = await getRoute(resolvedStops.map(s => ({ lat: s.lat, lon: s.lon })));

      if (!route) {
        alert('No se pudo calcular la ruta. Verifica que los puntos sean accesibles por carretera.');
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

      // Apply time multiplier for motorcycle/fast travel
      const adjustedDuration = route.duration * timeMultiplier;

      // 2. Sample points along the route for weather (every 15 minutes)
      const sampledPoints = sampleRoutePoints(
        route.geometry,
        adjustedDuration,
        startTime,
        15 // Sample every 15 minutes for finer control
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

      // 5. Show ALL weather points (every 15 min, no filtering)
      setWeatherPoints(allWeatherData);

    } catch (error) {
      console.error('Error calculating route:', error);
      // Don't alert on automatic updates to avoid annoyance
    } finally {
      setIsLoading(false);
    }
  }, [stops, timeMultiplier, startTime]); // dependencies for useCallback

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon">
            <span className="material-symbols-outlined">route</span>
          </div>
          <h2 className="brand-title">
            {routeName || 'El Tiempo en mi Viaje'}
          </h2>
        </div>
      </header>

      <div className="app-content">
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
        />
        <Map
          routeGeometry={routeGeometry}
          weatherPoints={weatherPoints}
          stops={stops}
          routeInfo={routeInfo}
          routeSegments={routeSegments}
          onMapClick={handleMapClick}
        />
      </div>
    </div>
  );
}

export default App;
