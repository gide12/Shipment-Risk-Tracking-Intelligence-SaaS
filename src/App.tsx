import { useState, FormEvent, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Activity, AlertTriangle, Clock, MapPin, Navigation, Package, ShieldAlert, Truck, Fuel, GitCommit, Cloud, CloudRain, CloudLightning, CloudSnow, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type } from '@google/genai';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Custom map markers using DivIcon to avoid Vite static asset issues
const createCustomIcon = (colorClass: string) => L.divIcon({
  className: 'custom-leaflet-icon',
  html: `<div class="w-4 h-4 rounded-full border-2 border-white shadow-md ${colorClass}"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const OriginIcon = createCustomIcon('bg-slate-800');
const DestIcon = createCustomIcon('bg-blue-600');

type RiskData = {
  score: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  factors: string[];
  delayAlert: string | null;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  weatherAnalysis: string;
  primaryWeather: 'Sunny' | 'Rainy' | 'Stormy' | 'Cloudy' | 'Snowy' | 'Clear';
  primaryRouteWaypoints: { lat: number, lng: number }[];
  alternativeRouteWaypoints: { lat: number, lng: number }[];
  alternativeRouteExplanation: string;
};

type EtaData = {
  normalEta: string;
  aiEta: string;
  reasoning: string;
  estimatedDropPoints: number;
  waitingDropTime: string;
  gasPriceRecommendation: string;
};

// Component to dynamically fit Map bounds to markers
function MapBoundsUpdater({ origin, dest }: { origin?: [number, number], dest?: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (origin && dest) {
      const bounds = L.latLngBounds([origin, dest]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [origin, dest, map]);
  return null;
}

export default function App() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [carrier, setCarrier] = useState('UPS');
  const [etd, setEtd] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [etaData, setEtaData] = useState<EtaData | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!origin || !destination || !carrier || !etd) return;

    setLoading(true);
    setRiskData(null);
    setEtaData(null);

    try {
      // Initialize Gemini directly on the frontend
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const riskPrompt = `Analyze the shipment risk for a ${carrier} delivery from ${origin} to ${destination} departing at ${etd}. 
      Provide a realistic sounding analysis simulating factors like traffic congestion, weather, route complexity, and historical delay patterns for this specific route.
      Determine a risk score from 0-100, where 0-30 is Low, 30-70 is Medium, and 70-100 is High.
      Identify if there is a delay risk and provide an alert message if so.
      Analyze the estimated weather conditions along the route. Provide a short weather analysis and classify the primary weather condition.
      IMPORTANT: Also provide approximate realistic latitude and longitude coordinates for both the origin and destination to be used on a map.
      Provide 1-2 intermediate waypoints for the primary route, and 1-2 intermediate waypoints for an alternative route that avoids storms, big accidents, or heavy traffic. Explain why the alternative route is more efficient.`;

      const etaPrompt = `Calculate ETA for a ${carrier} shipment from ${origin} to ${destination} departing at ${etd}.
      Provide the 'normal ETA' (ideal conditions) and the 'AI ETA' (adjusted for realistic weather, traffic, route complexity).
      Format times like "5h 20m". Return the factors that caused the change.
      Additionally, analyze if there are likely multiple drop points (intermediate stops) along this route. Estimate the number of drop points, and the total wait time due to these drops.
      Finally, recommend the estimated gas price for this trip.`;

      // Parallel generation requests
      const [riskRes, etaRes] = await Promise.all([
        ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: riskPrompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER, description: "Risk score 0-100" },
                riskLevel: { type: Type.STRING, description: "Low, Medium, or High" },
                factors: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "List of key risk factors (e.g., Heavy rain, Route complexity)"
                },
                delayAlert: {
                  type: Type.STRING,
                  description: "A short warning message if delayed, otherwise null or empty string."
                },
                originLat: { type: Type.NUMBER, description: "Latitude of origin exactly" },
                originLng: { type: Type.NUMBER, description: "Longitude of origin exactly" },
                destLat: { type: Type.NUMBER, description: "Latitude of destination exactly" },
                destLng: { type: Type.NUMBER, description: "Longitude of destination exactly" },
                weatherAnalysis: { type: Type.STRING, description: "Short description of estimated weather along the route" },
                primaryWeather: { type: Type.STRING, description: "One of: Sunny, Rainy, Stormy, Cloudy, Snowy, Clear" },
                primaryRouteWaypoints: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { lat: { type: Type.NUMBER }, lng: { type: Type.NUMBER } }
                  },
                  description: "1-2 intermediate waypoints for the main route"
                },
                alternativeRouteWaypoints: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { lat: { type: Type.NUMBER }, lng: { type: Type.NUMBER } }
                  },
                  description: "1-2 intermediate waypoints for a safer alternative route avoiding storms/traffic"
                },
                alternativeRouteExplanation: {
                  type: Type.STRING,
                  description: "Explanation of why the alternative route is safer/more efficient"
                }
              },
              required: ["score", "riskLevel", "factors", "delayAlert", "originLat", "originLng", "destLat", "destLng", "weatherAnalysis", "primaryWeather", "primaryRouteWaypoints", "alternativeRouteWaypoints", "alternativeRouteExplanation"],
            }
          }
        }),
        ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: etaPrompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                normalEta: { type: Type.STRING, description: "Standard ETA e.g. '5h 20m'" },
                aiEta: { type: Type.STRING, description: "Adjusted ETA e.g. '6h 10m'" },
                reasoning: { type: Type.STRING, description: "Short explanation for the adjustment e.g. 'heavy traffic + rain'" },
                estimatedDropPoints: { type: Type.INTEGER, description: "Estimated number of intermediate drop points" },
                waitingDropTime: { type: Type.STRING, description: "Total estimated waiting time at drop points (e.g. '1h 30m')" },
                gasPriceRecommendation: { type: Type.STRING, description: "Recommendation for gas cost (e.g. '$150-$200')" }
              },
              required: ["normalEta", "aiEta", "reasoning", "estimatedDropPoints", "waitingDropTime", "gasPriceRecommendation"],
            }
          }
        })
      ]);

      if (riskRes.text) {
        setRiskData(JSON.parse(riskRes.text));
      }
      if (etaRes.text) {
        setEtaData(JSON.parse(etaRes.text));
      }

    } catch (err: any) {
      console.error(err);
      alert('Failed to analyze shipment: ' + (err.message || 'Please check your inputs or try again later.'));
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = 
    riskData?.riskLevel === 'High' ? 'text-red-600 bg-red-100 border-red-200' :
    riskData?.riskLevel === 'Medium' ? 'text-amber-600 bg-amber-100 border-amber-200' :
    'text-emerald-600 bg-emerald-100 border-emerald-200';

  const riskGaugeColor = 
    riskData?.riskLevel === 'High' ? 'bg-red-500' :
    riskData?.riskLevel === 'Medium' ? 'bg-amber-400' :
    'bg-emerald-500';

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 font-sans text-slate-900">
      
      {/* Sidebar Form */}
      <aside className="w-full md:w-80 bg-white border-r border-slate-200 shadow-sm z-10 flex flex-col">
        <div className="p-6 border-b border-slate-100 bg-slate-900 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-semibold tracking-tight">ShipRisk</h1>
          </div>
          <p className="text-xs text-slate-400">Intelligence & ETA Prediction</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5 flex-1 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Origin</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input 
                required
                type="text" 
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                placeholder="e.g. Los Angeles, CA"
                value={origin}
                onChange={e => setOrigin(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Destination</label>
            <div className="relative">
              <Navigation className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input 
                required
                type="text" 
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                placeholder="e.g. Seattle, WA"
                value={destination}
                onChange={e => setDestination(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Carrier</label>
            <div className="relative">
              <Truck className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <select 
                value={carrier}
                onChange={e => setCarrier(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none appearance-none cursor-pointer"
              >
                <option>UPS</option>
                <option>FedEx</option>
                <option>USPS</option>
                <option>Private Trucking</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Estimated Departure</label>
            <div className="relative">
              <Clock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input 
                required
                type="datetime-local" 
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                value={etd}
                onChange={e => setEtd(e.target.value)}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors focus:ring-4 focus:ring-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing Intelligence...
              </>
            ) : "Analyze Shipment"}
          </button>
        </form>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-[60vh] md:h-screen w-full relative">
        <div className="absolute inset-0 z-0 bg-slate-100 flex items-center justify-center">
          {(!riskData || !etaData) && !loading ? (
            <div className="text-center p-8 bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200 shadow-sm max-w-sm">
              <Package className="w-12 h-12 text-blue-300 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-slate-800 mb-2">Awaiting Shipment Details</h2>
              <p className="text-sm text-slate-500">Enter origin, destination, and carrier details to generate AI-driven ETA predictions and risk analysis.</p>
            </div>
          ) : (
            <MapContainer 
               center={riskData ? [riskData.originLat, riskData.originLng] : [39.8283, -98.5795]} 
               zoom={4} 
               className="w-full h-full z-0"
               zoomControl={false}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              
              {riskData && (
                <>
                  <MapBoundsUpdater 
                    origin={[riskData.originLat, riskData.originLng]} 
                    dest={[riskData.destLat, riskData.destLng]} 
                  />
                  
                  {/* Primary Route */}
                  <Polyline 
                    positions={[
                      [riskData.originLat, riskData.originLng],
                      ...(riskData.primaryRouteWaypoints ? riskData.primaryRouteWaypoints.map(p => [p.lat, p.lng] as [number, number]) : []),
                      [riskData.destLat, riskData.destLng]
                    ]}
                    color="#3b82f6" 
                    weight={4}
                    opacity={0.8}
                  />

                  {/* Alternative Route */}
                  {riskData.alternativeRouteWaypoints && riskData.alternativeRouteWaypoints.length > 0 && (
                    <Polyline 
                      positions={[
                        [riskData.originLat, riskData.originLng],
                        ...riskData.alternativeRouteWaypoints.map(p => [p.lat, p.lng] as [number, number]),
                        [riskData.destLat, riskData.destLng]
                      ]}
                      color="#10b981" 
                      weight={3}
                      dashArray="8, 8"
                      opacity={0.9}
                    />
                  )}

                  <Marker position={[riskData.originLat, riskData.originLng]} icon={OriginIcon}>
                    <Popup className="text-sm font-medium">Origin</Popup>
                  </Marker>
                  
                  <Marker position={[riskData.destLat, riskData.destLng]} icon={DestIcon}>
                    <Popup className="text-sm font-medium">Destination</Popup>
                  </Marker>
                </>
              )}
            </MapContainer>
          )}
        </div>

        {/* Floating overlays */}
        <AnimatePresence>
          {riskData && etaData && !loading && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="absolute bottom-4 left-4 right-4 md:bottom-8 md:left-8 md:right-8 z-20 flex flex-col md:flex-row flex-wrap gap-4"
            >
              
              {/* ETA Prediction Card */}
              <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-5 shadow-xl flex-1 max-w-sm min-w-[280px]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800">AI ETA Prediction</h3>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <span className="text-sm text-slate-500">Standard ETA</span>
                    <span className="text-sm font-medium text-slate-700 font-mono">{etaData.normalEta}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-blue-700">Adjusted ETA</span>
                    <span className="text-lg font-bold text-blue-700 font-mono">{etaData.aiEta}</span>
                  </div>
                  {etaData.reasoning && (
                    <div className="mt-3 p-2.5 bg-slate-50/80 rounded-lg text-xs leading-relaxed text-slate-600 border border-slate-100 italic">
                      "{etaData.reasoning}"
                    </div>
                  )}
                </div>
              </div>

              {/* Trip Logistics Card */}
              <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-5 shadow-xl flex-1 max-w-sm min-w-[280px]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Fuel className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800">Trip Logistics</h3>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <GitCommit className="w-4 h-4" />
                      <span>Est. Drop Points</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700 font-mono">{etaData.estimatedDropPoints} stops</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Clock className="w-4 h-4" />
                      <span>Wait Time</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700 font-mono">{etaData.waitingDropTime}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-sm font-medium text-indigo-700">Gas Recommendation</span>
                  </div>
                  <div className="p-2.5 bg-slate-50/80 rounded-lg text-xs leading-relaxed text-slate-600 border border-slate-100">
                    {etaData.gasPriceRecommendation}
                  </div>
                </div>
              </div>

              {/* Risk Engine Card */}
              <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-5 shadow-xl flex-1 max-w-md min-w-[300px]">
                <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <ShieldAlert className="w-4 h-4 text-slate-700" />
                    </div>
                    <h3 className="font-semibold text-slate-800">Risk Score Engine</h3>
                   </div>
                   <div className={cn("px-2.5 py-1 rounded-full text-xs font-bold border", scoreColor)}>
                    {riskData.score} / 100 • {riskData.riskLevel}
                   </div>
                </div>

                {/* Score Bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full mb-5 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${riskData.score}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className={cn("h-full", riskGaugeColor)} 
                  />
                </div>

                <div className="mb-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Weather Condition</h4>
                  <div className="flex items-start gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                    <div className="mt-1">
                      {riskData.primaryWeather === 'Sunny' || riskData.primaryWeather === 'Clear' ? <Sun className="w-5 h-5 text-amber-500" /> :
                       riskData.primaryWeather === 'Rainy' ? <CloudRain className="w-5 h-5 text-blue-500" /> :
                       riskData.primaryWeather === 'Stormy' ? <CloudLightning className="w-5 h-5 text-indigo-500" /> :
                       riskData.primaryWeather === 'Snowy' ? <CloudSnow className="w-5 h-5 text-sky-400" /> :
                       <Cloud className="w-5 h-5 text-slate-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-0.5">{riskData.primaryWeather}</p>
                      <p className="text-xs text-slate-500 leading-snug">{riskData.weatherAnalysis}</p>
                    </div>
                  </div>
                </div>

                {riskData.alternativeRouteExplanation && (
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Alternative Route (Green)</h4>
                    <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 text-xs text-slate-600 leading-snug">
                      {riskData.alternativeRouteExplanation}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Identified Factors</h4>
                  <div className="flex flex-wrap gap-2">
                    {riskData.factors.map((factor, i) => (
                      <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                        {factor}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Alert Card - Only show if there's a delay alert */}
              {riskData.delayAlert && riskData.delayAlert.length > 2 && (
                <div className="bg-red-50/95 backdrop-blur-md border border-red-200 rounded-2xl p-5 shadow-xl flex-1 max-w-sm min-w-[280px] flex flex-col justify-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-red-800 text-sm mb-1">Delay Alert!</h3>
                      <p className="text-red-700 text-sm font-medium leading-tight">
                        {riskData.delayAlert}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
