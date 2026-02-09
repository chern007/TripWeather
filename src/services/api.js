// API Services for Weather Route App

const OSRM_BASE_URL = 'https://router.project-osrm.org';
const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Geocode a location name to coordinates using Open-Meteo Geocoding API
 * @param {string} query - City name or location
 * @returns {Promise<{lat: number, lon: number, name: string, country: string} | null>}
 */
export async function geocodeLocation(query) {
  try {
    let searchQuery = query.trim();
    let locationFilter = null;

    // Parse different address formats
    // Common formats:
    // 1. "Ciudad" - simple city name
    // 2. "Localidad, Provincia" - locality with province
    // 3. "Calle X, 123, Ciudad" - street address with city
    // 4. "Calle X 123, Ciudad" - street address variant
    // 5. "Localidad, Provincia, País" - full location

    if (searchQuery.includes(',')) {
      const parts = searchQuery.split(',').map(p => p.trim()).filter(p => p.length > 0);

      if (parts.length >= 3) {
        // Format: "Calle, Numero, Ciudad" or "Localidad, Provincia, País"
        // Try the last part as the main city, use second-to-last as filter
        searchQuery = parts[parts.length - 1];
        locationFilter = parts[parts.length - 2]?.toLowerCase();

        // If last part looks like a country (España, Spain, etc.), use previous as city
        const countries = ['españa', 'spain', 'portugal', 'france', 'francia', 'andorra'];
        if (countries.includes(searchQuery.toLowerCase())) {
          searchQuery = parts[parts.length - 2];
          locationFilter = parts.length > 2 ? parts[parts.length - 3]?.toLowerCase() : null;
        }
      } else if (parts.length === 2) {
        // Format: "Localidad, Provincia" or "Calle, Ciudad"
        // Check if first part looks like a street (contains numbers or street keywords)
        const streetKeywords = ['calle', 'avenida', 'avda', 'av.', 'plaza', 'paseo', 'camino', 'carretera', 'c/', 'pº', 'plz'];
        const firstPartLower = parts[0].toLowerCase();
        const isStreet = streetKeywords.some(kw => firstPartLower.includes(kw)) || /\d/.test(parts[0]);

        if (isStreet) {
          // First part is a street, second is city
          searchQuery = parts[1];
          locationFilter = null;
        } else {
          // Standard "Localidad, Provincia" format
          searchQuery = parts[0];
          locationFilter = parts[1]?.toLowerCase();
        }
      }
    }

    // Remove common street prefixes/numbers if still present for cleaner city search
    searchQuery = searchQuery
      .replace(/^\d+\s*/, '') // Remove leading numbers
      .replace(/\s+\d+$/, '') // Remove trailing numbers
      .trim();

    const response = await fetch(
      `${OPEN_METEO_GEOCODING_URL}?name=${encodeURIComponent(searchQuery)}&count=15&language=es&format=json`
    );
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      let result = data.results[0];

      // If we have a location filter, try to find a match
      if (locationFilter) {
        const filteredResult = data.results.find(r => {
          const nameMatch = r.name?.toLowerCase().includes(locationFilter);
          const admin1Match = r.admin1?.toLowerCase().includes(locationFilter);
          const admin2Match = r.admin2?.toLowerCase().includes(locationFilter);
          const admin3Match = r.admin3?.toLowerCase().includes(locationFilter);
          const countryMatch = r.country?.toLowerCase().includes(locationFilter);
          return nameMatch || admin1Match || admin2Match || admin3Match || countryMatch;
        });
        if (filteredResult) {
          result = filteredResult;
        }
      }

      return {
        lat: result.latitude,
        lon: result.longitude,
        name: result.name,
        country: result.country,
        admin1: result.admin1 || ''
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}


/**
 * Parse coordinates from string format "lat, lon" or "lat,lon"
 * @param {string} input 
 * @returns {{lat: number, lon: number} | null}
 */
export function parseCoordinates(input) {
  const match = input.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon, name: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
    }
  }
  return null;
}

/**
 * Get route from OSRM between waypoints
 * @param {Array<{lat: number, lon: number}>} waypoints 
 * @returns {Promise<{geometry: Array, legs: Array, duration: number} | null>}
 */
export async function getRoute(waypoints) {
  if (waypoints.length < 2) return null;

  try {
    const coordinates = waypoints.map(wp => `${wp.lon},${wp.lat}`).join(';');
    const response = await fetch(
      `${OSRM_BASE_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`
    );
    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        geometry: route.geometry.coordinates.map(coord => [coord[1], coord[0]]), // Convert [lon, lat] to [lat, lon]
        legs: route.legs,
        duration: route.duration, // in seconds
        distance: route.distance // in meters
      };
    }
    return null;
  } catch (error) {
    console.error('Routing error:', error);
    return null;
  }
}

/**
 * Get weather forecast for a specific location and time
 * Uses local time formatting to avoid timezone issues
 * @param {number} lat 
 * @param {number} lon 
 * @param {Date} datetime 
 * @returns {Promise<{temperature: number, precipitation: number, weatherCode: number} | null>}
 */
export async function getWeatherAtTime(lat, lon, datetime) {
  try {
    // Format date in local time to avoid timezone conversion issues
    const year = datetime.getFullYear();
    const month = String(datetime.getMonth() + 1).padStart(2, '0');
    const day = String(datetime.getDate()).padStart(2, '0');
    const startDate = `${year}-${month}-${day}`;

    const nextDay = new Date(datetime);
    nextDay.setDate(nextDay.getDate() + 1);
    const endDate = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;

    const response = await fetch(
      `${OPEN_METEO_WEATHER_URL}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,weather_code&start_date=${startDate}&end_date=${endDate}&timezone=Europe/Madrid`
    );
    const data = await response.json();

    if (data.hourly && data.hourly.time) {
      const targetHour = datetime.getHours();

      // Find the closest hour for the target date
      const hourIndex = data.hourly.time.findIndex(t => {
        const parts = t.split('T');
        if (parts[0] !== startDate) return false;
        const hour = parseInt(parts[1].split(':')[0], 10);
        return hour === targetHour;
      });

      if (hourIndex !== -1) {
        return {
          temperature: data.hourly.temperature_2m[hourIndex],
          precipitation: data.hourly.precipitation[hourIndex],
          weatherCode: data.hourly.weather_code[hourIndex]
        };
      }

      // Fallback: use first available hour of the target date
      const fallbackIndex = data.hourly.time.findIndex(t => t.startsWith(startDate));
      if (fallbackIndex !== -1) {
        return {
          temperature: data.hourly.temperature_2m[fallbackIndex],
          precipitation: data.hourly.precipitation[fallbackIndex],
          weatherCode: data.hourly.weather_code[fallbackIndex]
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Weather error:', error);
    return null;
  }
}

/**
 * Get weather for multiple points along a route
 * @param {Array<{lat: number, lon: number, time: Date}>} points 
 * @returns {Promise<Array<{lat: number, lon: number, time: Date, weather: object}>>}
 */
export async function getWeatherForRoute(points) {
  const results = await Promise.all(
    points.map(async (point) => {
      const weather = await getWeatherAtTime(point.lat, point.lon, point.time);
      return {
        ...point,
        weather
      };
    })
  );
  return results;
}

/**
 * Sample points along the route at regular time intervals
 * @param {Array<[number, number]>} geometry - Route geometry [lat, lon] pairs
 * @param {number} totalDuration - Total duration in seconds
 * @param {Date} startTime - Trip start time
 * @param {number} intervalMinutes - Interval in minutes (default 30)
 * @returns {Array<{lat: number, lon: number, time: Date, geometryIndex: number}>}
 */
export function sampleRoutePoints(geometry, totalDuration, startTime, intervalMinutes = 30) {
  const points = [];
  const intervalSeconds = intervalMinutes * 60;
  const numIntervals = Math.floor(totalDuration / intervalSeconds);

  // Calculate cumulative distances for interpolation
  let cumulativeDistances = [0];
  for (let i = 1; i < geometry.length; i++) {
    const dist = haversineDistance(
      geometry[i - 1][0], geometry[i - 1][1],
      geometry[i][0], geometry[i][1]
    );
    cumulativeDistances.push(cumulativeDistances[i - 1] + dist);
  }
  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];

  // Always include start point
  points.push({
    lat: geometry[0][0],
    lon: geometry[0][1],
    time: new Date(startTime),
    geometryIndex: 0,
    isStart: true
  });

  // Sample at each time interval
  for (let i = 1; i <= numIntervals; i++) {
    const elapsedTime = i * intervalSeconds;
    const progress = elapsedTime / totalDuration;
    const targetDistance = progress * totalDistance;

    // Find the segment containing this distance
    let segmentIndex = cumulativeDistances.findIndex(d => d >= targetDistance);
    if (segmentIndex <= 0) segmentIndex = 1;

    // Interpolate within segment
    const segmentStart = cumulativeDistances[segmentIndex - 1];
    const segmentEnd = cumulativeDistances[segmentIndex];
    const segmentProgress = segmentEnd > segmentStart
      ? (targetDistance - segmentStart) / (segmentEnd - segmentStart)
      : 0;

    const lat = geometry[segmentIndex - 1][0] +
      segmentProgress * (geometry[segmentIndex][0] - geometry[segmentIndex - 1][0]);
    const lon = geometry[segmentIndex - 1][1] +
      segmentProgress * (geometry[segmentIndex][1] - geometry[segmentIndex - 1][1]);

    points.push({
      lat,
      lon,
      time: new Date(startTime.getTime() + elapsedTime * 1000),
      geometryIndex: segmentIndex
    });
  }

  // Always include end point
  const lastGeometry = geometry[geometry.length - 1];
  const endTime = new Date(startTime.getTime() + totalDuration * 1000);

  // Avoid duplicating if last sampled point is very close to end
  const lastPoint = points[points.length - 1];
  const distToEnd = haversineDistance(lastPoint.lat, lastPoint.lon, lastGeometry[0], lastGeometry[1]);
  if (distToEnd > 2) { // More than 2km from end
    points.push({
      lat: lastGeometry[0],
      lon: lastGeometry[1],
      time: endTime,
      geometryIndex: geometry.length - 1,
      isEnd: true
    });
  } else {
    lastPoint.isEnd = true;
    // Ensure the last point matches the actual end of the route
    // so the drawn path covers the entire geometry
    lastPoint.lat = lastGeometry[0];
    lastPoint.lon = lastGeometry[1];
    lastPoint.time = endTime;
    lastPoint.geometryIndex = geometry.length - 1;
  }

  return points;
}

/**
 * Filter weather points to show only significant ones
 * Shows: start, end, weather changes (rain starts/stops), or every N points
 * @param {Array} weatherPoints - All weather points
 * @param {number} maxPoints - Maximum number of points to show
 * @returns {Array} Filtered significant weather points
 */
export function filterSignificantWeatherPoints(weatherPoints, maxPoints = 8) {
  if (weatherPoints.length <= 3) return weatherPoints;

  const significant = [];
  let lastSignificantIndex = -1;

  // Helper to check if precipitation is significant
  const hasPrecipitation = (point) => {
    return point.weather && point.weather.precipitation > 0;
  };

  // Helper to check if weather code indicates rain/snow
  const isRainyCode = (code) => {
    return code >= 51; // All codes >= 51 indicate precipitation
  };

  for (let i = 0; i < weatherPoints.length; i++) {
    const point = weatherPoints[i];
    const prevPoint = i > 0 ? weatherPoints[i - 1] : null;

    let isSignificant = false;
    let reason = '';

    // Always include start and end
    if (point.isStart || point.isEnd) {
      isSignificant = true;
      reason = point.isStart ? 'start' : 'end';
    }

    // Check for precipitation change
    if (prevPoint && point.weather && prevPoint.weather) {
      const currentRain = hasPrecipitation(point) || isRainyCode(point.weather.weatherCode);
      const prevRain = hasPrecipitation(prevPoint) || isRainyCode(prevPoint.weather.weatherCode);

      if (currentRain !== prevRain) {
        isSignificant = true;
        reason = currentRain ? 'rain_start' : 'rain_end';
      }

      // Check for significant temperature change (> 3°C)
      const tempDiff = Math.abs(point.weather.temperature - prevPoint.weather.temperature);
      if (tempDiff > 3) {
        isSignificant = true;
        reason = 'temp_change';
      }

      // Check for weather code category change
      const weatherCategory = (code) => {
        if (code <= 3) return 'clear';
        if (code <= 48) return 'fog';
        if (code <= 67) return 'rain';
        if (code <= 77) return 'snow';
        if (code <= 82) return 'showers';
        return 'storm';
      };

      if (weatherCategory(point.weather.weatherCode) !== weatherCategory(prevPoint.weather.weatherCode)) {
        isSignificant = true;
        reason = 'weather_change';
      }
    }

    if (isSignificant) {
      significant.push({ ...point, significantReason: reason });
      lastSignificantIndex = i;
    }
  }

  // If we have too few points, add some intermediate ones
  if (significant.length < 4 && weatherPoints.length > 4) {
    const interval = Math.floor(weatherPoints.length / 4);
    for (let i = interval; i < weatherPoints.length - 1; i += interval) {
      if (!significant.find(p => p.time.getTime() === weatherPoints[i].time.getTime())) {
        significant.push({ ...weatherPoints[i], significantReason: 'interval' });
      }
    }
    // Sort by time
    significant.sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  // If we still have too many, keep only the most important
  if (significant.length > maxPoints) {
    // Prioritize: start, end, rain changes, then others
    const prioritized = significant.sort((a, b) => {
      const priority = { start: 0, end: 1, rain_start: 2, rain_end: 3, weather_change: 4, temp_change: 5, interval: 6 };
      return (priority[a.significantReason] || 6) - (priority[b.significantReason] || 6);
    });
    return prioritized.slice(0, maxPoints).sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  return significant;
}

/**
 * Create route segments with precipitation info for coloring
 * @param {Array<[number, number]>} geometry - Full route geometry
 * @param {Array} weatherPoints - Weather points with precipitation data
 * @param {number} totalDuration - Total route duration in seconds
 * @param {Date} startTime - Start time
 * @returns {Array<{positions: Array, precipitation: number, color: string}>}
 */
export function createRouteSegments(geometry, weatherPoints, totalDuration, startTime) {
  if (!weatherPoints || weatherPoints.length < 2) {
    return [{ positions: geometry, precipitation: 0, color: '#58a6ff' }];
  }

  const segments = [];

  // Calculate cumulative distances to map time/progress to geometry
  let cumulativeDistances = [0];
  for (let i = 1; i < geometry.length; i++) {
    const dist = haversineDistance(
      geometry[i - 1][0], geometry[i - 1][1],
      geometry[i][0], geometry[i][1]
    );
    cumulativeDistances.push(cumulativeDistances[i - 1] + dist);
  }
  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];

  // Helper to determine color based on strict weather rules
  const getColorForWeather = (weather) => {
    if (!weather) return '#94a3b8'; // Grey for unknown

    // 1. Check for dangerous conditions first (Snow, Freezing Rain, Storms) regardless of precipitation amount
    const dangerousCodes = [
      56, 57, // Freezing Drizzle
      66, 67, // Freezing Rain
      71, 73, 75, 77, // Snow
      85, 86, // Snow Showers
      95, 96, 99 // Thunderstorm
    ];
    if (dangerousCodes.includes(weather.weatherCode)) return '#ef4444'; // Red

    // 2. Check precipitation amount
    const p = weather.precipitation;
    if (p <= 0) return '#22c55e'; // Green - Clear
    if (p < 0.5) return '#fbbf24'; // Yellow - Drizzle/Light
    if (p < 2.0) return '#f97316'; // Orange - Rain
    return '#ef4444'; // Red - Heavy Rain
  };

  // Create segment between each consecutive pair of weather points
  // STRATEGY: Split the segment between two points in half.
  // First half gets color of Start Point, Second half gets color of End Point.
  // This visualizes the transition closer to reality than coloring the whole line.
  for (let i = 0; i < weatherPoints.length - 1; i++) {
    const startPoint = weatherPoints[i];
    const endPoint = weatherPoints[i + 1];

    // Calculate progress for start and end
    const startProgress = (startPoint.time.getTime() - startTime.getTime()) / (totalDuration * 1000);
    const endProgress = (endPoint.time.getTime() - startTime.getTime()) / (totalDuration * 1000);

    const startDistance = startProgress * totalDistance;
    const endDistance = endProgress * totalDistance;

    // Find geometry indices
    let startIdx = cumulativeDistances.findIndex(d => d >= startDistance);
    let endIdx = cumulativeDistances.findIndex(d => d >= endDistance);

    if (startIdx <= 0) startIdx = 0;
    if (endIdx <= 0) endIdx = geometry.length - 1;
    if (endIdx >= geometry.length) endIdx = geometry.length - 1;
    if (startIdx > endIdx) startIdx = endIdx; // Safety check

    // Extract potential full segment positions
    const fullSegmentPositions = geometry.slice(startIdx, endIdx + 1);

    if (fullSegmentPositions.length < 2) continue;

    // Split in half
    const splitIndex = Math.floor(fullSegmentPositions.length / 2);

    const positionsPart1 = fullSegmentPositions.slice(0, splitIndex + 1);
    // Overlap slightly to ensure continuity
    const positionsPart2 = fullSegmentPositions.slice(splitIndex);

    // Weather colors
    const color1 = getColorForWeather(startPoint.weather);
    const color2 = getColorForWeather(endPoint.weather);

    if (positionsPart1.length > 1) {
      segments.push({
        positions: positionsPart1,
        color: color1,
        weather: startPoint.weather
      });
    }

    if (positionsPart2.length > 1) {
      segments.push({
        positions: positionsPart2,
        color: color2,
        weather: endPoint.weather
      });
    }
  }

  // If no segments created (edge case), return full route
  if (segments.length === 0) {
    return [{ positions: geometry, precipitation: 0, color: '#58a6ff' }];
  }

  return segments;
}

/**
 * Calculate haversine distance between two points in km
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get weather icon based on WMO weather code
 */
export function getWeatherIcon(code) {
  // WMO Weather interpretation codes
  const icons = {
    0: '☀️', // Clear sky
    1: '🌤️', // Mainly clear
    2: '⛅', // Partly cloudy
    3: '☁️', // Overcast
    45: '🌫️', // Fog
    48: '🌫️', // Depositing rime fog
    51: '🌧️', // Light drizzle
    53: '🌧️', // Moderate drizzle
    55: '🌧️', // Dense drizzle
    56: '🌧️', // Light freezing drizzle
    57: '🌧️', // Dense freezing drizzle
    61: '🌧️', // Slight rain
    63: '🌧️', // Moderate rain
    65: '🌧️', // Heavy rain
    66: '🌧️', // Light freezing rain
    67: '🌧️', // Heavy freezing rain
    71: '🌨️', // Slight snow
    73: '🌨️', // Moderate snow
    75: '🌨️', // Heavy snow
    77: '🌨️', // Snow grains
    80: '🌦️', // Slight rain showers
    81: '🌦️', // Moderate rain showers
    82: '🌦️', // Violent rain showers
    85: '🌨️', // Slight snow showers
    86: '🌨️', // Heavy snow showers
    95: '⛈️', // Thunderstorm
    96: '⛈️', // Thunderstorm with slight hail
    97: '⛈️', // Thunderstorm with heavy hail
    99: '⛈️', // Thunderstorm with heavy hail
  };
  return icons[code] || '❓';
}

/**
 * Get weather description based on WMO weather code
 */
export function getWeatherDescription(code) {
  const descriptions = {
    0: 'Cielo despejado',
    1: 'Mayormente despejado',
    2: 'Parcialmente nublado',
    3: 'Nublado',
    45: 'Niebla',
    48: 'Niebla con escarcha',
    51: 'Llovizna ligera',
    53: 'Llovizna moderada',
    55: 'Llovizna intensa',
    56: 'Llovizna helada ligera',
    57: 'Llovizna helada intensa',
    61: 'Lluvia ligera',
    63: 'Lluvia moderada',
    65: 'Lluvia intensa',
    66: 'Lluvia helada ligera',
    67: 'Lluvia helada intensa',
    71: 'Nevada ligera',
    73: 'Nevada moderada',
    75: 'Nevada intensa',
    77: 'Granos de nieve',
    80: 'Chubascos ligeros',
    81: 'Chubascos moderados',
    82: 'Chubascos violentos',
    85: 'Chubascos de nieve ligeros',
    86: 'Chubascos de nieve intensos',
    95: 'Tormenta',
    96: 'Tormenta con granizo ligero',
    99: 'Tormenta con granizo intenso',
  };
  return descriptions[code] || 'Desconocido';
}

/**
 * Get precipitation color for legend (Consistent with route coloring)
 */
export function getPrecipitationColor(precipitation) {
  if (precipitation === 0) return '#22c55e'; // Green
  if (precipitation < 0.5) return '#fbbf24'; // Yellow
  if (precipitation < 2.0) return '#f97316'; // Orange
  return '#ef4444'; // Red
}
