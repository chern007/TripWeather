import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { getWeatherIcon, getWeatherDescription } from '../services/api';
import './Map.css';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Format time as HH:MM
const formatTime = (date) => {
    return date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Custom weather marker icon with time displayed
function createWeatherIcon(weather, time) {
    const icon = weather ? getWeatherIcon(weather.weatherCode) : '📍';
    const temp = weather ? `${Math.round(weather.temperature)}°` : '';
    const timeStr = formatTime(time);

    return L.divIcon({
        className: 'weather-marker',
        html: `
      <div class="weather-marker-content">
        <span class="weather-time">${timeStr}</span>
        <div class="weather-main">
          <span class="weather-icon">${icon}</span>
          <span class="weather-temp">${temp}</span>
        </div>
      </div>
    `,
        iconSize: [70, 70],
        iconAnchor: [35, 70],
        popupAnchor: [0, -70],
    });
}

// Custom stop marker icon
function createStopIcon(number, isStart, isEnd) {
    let bgColor = 'linear-gradient(135deg, #58a6ff 0%, #8b5cf6 100%)';
    if (isStart) bgColor = 'linear-gradient(135deg, #238636 0%, #2ea043 100%)';
    if (isEnd) bgColor = 'linear-gradient(135deg, #f85149 0%, #da3633 100%)';

    return L.divIcon({
        className: 'stop-marker',
        html: `
      <div class="stop-marker-content" style="background: ${bgColor}">
        <span>${number}</span>
      </div>
    `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36],
    });
}

// Component to recenter on route
function MapController({ routeGeometry, stops, routeSegments }) {
    const map = useMap();

    useEffect(() => {
        // Prefer route segments for bounds if available
        if (routeSegments && routeSegments.length > 0) {
            const allPositions = routeSegments.flatMap(seg => seg.positions);
            if (allPositions.length > 0) {
                const bounds = L.latLngBounds(allPositions);
                map.fitBounds(bounds, { padding: [50, 50] });
                return;
            }
        }

        if (routeGeometry && routeGeometry.length > 0) {
            const bounds = L.latLngBounds(routeGeometry);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else if (stops && stops.length > 0) {
            const resolvedStops = stops.filter(s => s.resolved);
            if (resolvedStops.length > 0) {
                const bounds = L.latLngBounds(resolvedStops.map(s => [s.lat, s.lon]));
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [routeGeometry, stops, map]); // Removed routeSegments to prevent auto-zoom on weather updates

    return null;
}

// Component to handle map clicks for adding waypoints
function MapClickHandler({ onMapClick }) {
    useMapEvents({
        click: (e) => {
            if (onMapClick) {
                onMapClick(e.latlng.lat, e.latlng.lng);
            }
        },
    });
    return null;
}

export default function Map({
    routeGeometry,
    weatherPoints,
    stops,
    routeInfo,
    routeSegments,
    onMapClick,
    isMapClickEnabled,
    setIsMapClickEnabled,
    showSidebar
}) {
    const mapRef = useRef(null);

    // Center on Spain by default
    const defaultCenter = [40.4168, -3.7038]; // Madrid
    const defaultZoom = 6;

    const formatDate = (date) => {
        return date.toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
    };

    const formatDuration = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}min`;
        }
        return `${minutes}min`;
    };

    const formatDistance = (meters) => {
        const km = meters / 1000;
        return `${km.toFixed(1)} km`;
    };

    return (
        <div className="map-container">
            <MapContainer
                ref={mapRef}
                center={defaultCenter}
                zoom={defaultZoom}
                className="leaflet-map"
                scrollWheelZoom={true}
                zoomControl={true}
            >
                {/* Visualización estándar de OpenStreetMap (mejor para rutas) */}
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapController
                    routeGeometry={routeGeometry}
                    stops={stops}
                    routeSegments={routeSegments}
                />

                {/* Click handler for adding waypoints - Only active if enabled */}
                {isMapClickEnabled && <MapClickHandler onMapClick={onMapClick} />}

                {/* Route segments with precipitation coloring */}
                {routeSegments && routeSegments.length > 0 ? (
                    routeSegments.map((segment, index) => (
                        <Polyline
                            key={`segment-${index}`}
                            positions={segment.positions}
                            pathOptions={{
                                color: segment.color,
                                weight: 6,
                                opacity: 0.9,
                                lineCap: 'round',
                                lineJoin: 'round'
                            }}
                        />
                    ))
                ) : (
                    /* Fallback: single polyline if no segments */
                    routeGeometry && routeGeometry.length > 0 && (
                        <Polyline
                            positions={routeGeometry}
                            pathOptions={{
                                color: '#2b7cee',
                                weight: 5,
                                opacity: 0.8,
                                lineCap: 'round',
                                lineJoin: 'round'
                            }}
                        />
                    )
                )}

                {/* Stop markers */}
                {stops && stops.filter(s => s.resolved).map((stop, index) => (
                    <Marker
                        key={`stop-${stop.id}`}
                        position={[stop.lat, stop.lon]}
                        icon={createStopIcon(
                            index + 1,
                            index === 0,
                            index === stops.length - 1
                        )}
                    >
                        <Popup className="custom-popup">
                            <div className="popup-content stop-popup">
                                <h3>{stop.name}</h3>
                                <p className="popup-coords">
                                    {stop.lat.toFixed(4)}, {stop.lon.toFixed(4)}
                                </p>
                                {stop.admin1 && <p className="popup-region">{stop.admin1}, {stop.country}</p>}
                            </div>
                        </Popup>
                    </Marker>
                ))}

                {/* Weather markers with time */}
                {weatherPoints && weatherPoints.map((point, index) => (
                    <Marker
                        key={`weather-${index}`}
                        position={[point.lat, point.lon]}
                        icon={createWeatherIcon(point.weather, point.time)}
                    >
                        <Popup className="custom-popup">
                            <div className="popup-content weather-popup">
                                <div className="popup-time">
                                    <span className="popup-date">{formatDate(point.time)}</span>
                                    <span className="popup-hour">{formatTime(point.time)}</span>
                                </div>
                                {point.weather ? (
                                    <>
                                        <div className="popup-weather-main">
                                            <span className="popup-icon">{getWeatherIcon(point.weather.weatherCode)}</span>
                                            <span className="popup-temp">{Math.round(point.weather.temperature)}°C</span>
                                        </div>
                                        <p className="popup-description">
                                            {getWeatherDescription(point.weather.weatherCode)}
                                        </p>
                                        <p className="popup-precipitation">
                                            💧 Precipitación: {point.weather.precipitation} mm
                                        </p>
                                        {point.significantReason && (
                                            <p className="popup-reason">
                                                {point.significantReason === 'rain_start' && '⚠️ Comienza la lluvia'}
                                                {point.significantReason === 'rain_end' && '✓ Termina la lluvia'}
                                                {point.significantReason === 'temp_change' && '🌡️ Cambio de temperatura'}
                                                {point.significantReason === 'weather_change' && '🔄 Cambio de tiempo'}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="popup-no-data">Sin datos meteorológicos</p>
                                )}
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* Custom Map Controls UI - Hidden when Sidebar is open (mobile menu) */}
            {!showSidebar && (
                <div className="map-controls-ui">
                    <button
                        className={`map-control-btn ${isMapClickEnabled ? 'primary' : ''}`}
                        onClick={() => setIsMapClickEnabled(prev => !prev)}
                        title={isMapClickEnabled ? "Desactivar añadir puntos" : "Activar añadir puntos"}
                    >
                        <span className="material-symbols-outlined">
                            {isMapClickEnabled ? 'touch_app' : 'do_not_touch'}
                        </span>
                    </button>
                </div>
            )}

            {/* Route info overlay - Redesigned */}
            {routeInfo && (
                <div className="route-info-overlay">
                    <div className="route-info-card">
                        <div className="info-main">
                            <span className="info-title">Tiempo Estimado</span>
                            <p className="info-time">
                                <span>{formatDuration(routeInfo.adjustedDuration)}</span>
                            </p>
                        </div>
                        <div className="info-divider"></div>
                        <div className="info-secondary">
                            <span className="info-label">Distancia</span>
                            <div className="info-value">{formatDistance(routeInfo.distance)}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Legend - Only show if Sidebar is closed (on mobile particularly) and maybe hide if Click Hint is active to avoid clutter? 
                User said: "mas abajo... mientras no aparezca el cuadro informativo de 'Modo añadir puntos ACTIVO'"
                Implies: If active mode (Hint visible), Legend moves or hides? 
                Let's hide Legend if Sidebar is Open OR if Map Click Mode is Enabled to save space/avoid overlap, or just ensure positioning.
                The user said: "deberá desaparecer al mostrar el menú... (tambien el cuadro de 'añadir puntos ACTIVO')" -> If Sidebar Open, Hide BOTH.
            */}
            {!showSidebar && (
                <>
                    {/* Legend: Show only if NOT in 'add point' mode to keep it clean, OR stack them?
                        Request: "estar mas abajo (igual que hacia la izquierda) mientras no aparezca el cuadro..."
                        Implies: Position is standard low. If Hint appears, maybe Legend moves?
                        Simpler interpretation: Hide Legend if Add Mode is Active to avoid clutter in mobile.
                        Let's keep it simple: If isMapClickEnabled, hide Legend? Or just position it?
                        Let's keep Legend always visible unless Sidebar open, but maybe adjust bottom if Hint is there? 
                        Actually, let's follow: "desaparecer al mostrar el menú". Done via !showSidebar.
                    */}
                    {!isMapClickEnabled && (
                        <div className="map-legend">
                            <h4 className="legend-title">Precipitación (mm)</h4>
                            <div className="legend-items">
                                <div className="legend-item">
                                    <div className="legend-color" style={{ background: '#22c55e' }}></div>
                                    <span className="legend-label">0 (Seco)</span>
                                </div>
                                <div className="legend-item">
                                    <div className="legend-color" style={{ background: '#fbbf24' }}></div>
                                    <span className="legend-label">&lt; 0.5 (Chispea)</span>
                                </div>
                                <div className="legend-item">
                                    <div className="legend-color" style={{ background: '#f97316' }}></div>
                                    <span className="legend-label">0.5 - 2 (Lluvia)</span>
                                </div>
                                <div className="legend-item">
                                    <div className="legend-color" style={{ background: '#ef4444' }}></div>
                                    <span className="legend-label">&gt; 2 (Intensa)</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Click hint - Only shown when enabled and sidebar closed */}
                    {isMapClickEnabled && (
                        <div className="map-click-hint">
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>touch_app</span>
                            <span>Modo añadir puntos ACTIVO</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

