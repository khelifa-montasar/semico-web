import { useQuery } from "@tanstack/react-query";

export interface CurrentWeather {
  time: string;
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPct: number;
  precipitationMm: number;
  weatherCode: number;
  windSpeedKmh: number;
}

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
}

async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  signal: AbortSignal,
): Promise<CurrentWeather> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);

  const payload = (await response.json()) as OpenMeteoResponse;
  const current = payload.current;
  if (
    !current ||
    typeof current.time !== "string" ||
    typeof current.temperature_2m !== "number" ||
    typeof current.apparent_temperature !== "number" ||
    typeof current.relative_humidity_2m !== "number" ||
    typeof current.precipitation !== "number" ||
    typeof current.weather_code !== "number" ||
    typeof current.wind_speed_10m !== "number"
  ) {
    throw new Error("Weather service returned incomplete current conditions");
  }

  return {
    time: current.time,
    temperatureC: current.temperature_2m,
    apparentTemperatureC: current.apparent_temperature,
    humidityPct: current.relative_humidity_2m,
    precipitationMm: current.precipitation,
    weatherCode: current.weather_code,
    windSpeedKmh: current.wind_speed_10m,
  };
}

/** Fetches current conditions only when the active farm has explicitly configured coordinates. */
export function useWeather(latitude: number | null | undefined, longitude: number | null | undefined) {
  const hasCoordinates =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude);

  return useQuery({
    queryKey: ["weather", latitude ?? null, longitude ?? null],
    queryFn: ({ signal }) => fetchCurrentWeather(latitude as number, longitude as number, signal),
    enabled: hasCoordinates,
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
  });
}

/** WMO weather interpretation codes (WW). */
export function weatherDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Current conditions";
}
