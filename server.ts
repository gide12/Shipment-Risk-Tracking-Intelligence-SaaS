import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Simple in-memory mock shipments
const MOCK_SHIPMENTS = [
  {
    id: "SHP-001",
    origin: "Los Angeles, CA",
    destination: "Seattle, WA",
    carrier: "trucking",
    status: "in_transit",
    lat: 38.5,
    lng: -121.5,
    estimatedDeparture: "2026-05-02T08:00:00Z"
  },
  {
    id: "SHP-002",
    origin: "New York, NY",
    destination: "Chicago, IL",
    carrier: "FedEx",
    status: "delayed",
    lat: 41.5,
    lng: -81.5,
    estimatedDeparture: "2026-05-01T15:00:00Z"
  }
];

// POST /api/shipment/risk
app.post("/api/shipment/risk", async (req, res) => {
  try {
    const { origin, destination, carrier, estimatedDepartureTime } = req.body;
    
    // Fallback B2B mock data when called via API. 
    // The actual AI logic for the dashboard is processed directly on the client side 
    // to comply with the AI Studio architecture constraints.
    res.json({
      score: 45,
      riskLevel: "Medium",
      factors: ["Simulated traffic delay", "Weather warning on route"],
      delayAlert: "Moderate risk of 20-40 min delay due to regional conditions.",
      originLat: 34.0522,
      originLng: -118.2437,
      destLat: 47.6062,
      destLng: -122.3321,
      weatherAnalysis: "Expect heavy rainfall and wet roads causing moderate delays.",
      primaryWeather: "Rainy",
      primaryRouteWaypoints: [{ lat: 40.0, lng: -120.0 }],
      alternativeRouteWaypoints: [{ lat: 41.0, lng: -116.0 }],
      alternativeRouteExplanation: "Taking the eastern pass avoids the storm cell over the mountains, saving up to 45 minutes of delay."
    });
  } catch (err: any) {
    console.error("Error in risk endpoint:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shipment/eta
app.post("/api/shipment/eta", async (req, res) => {
  try {
    const { origin, destination, carrier, estimatedDepartureTime } = req.body;
    
    // Fallback B2B mock data when called via API.
    res.json({
      normalEta: "5h 20m",
      aiEta: "6h 10m",
      reasoning: "heavy traffic + rain (simulated from API endpoint)",
      estimatedDropPoints: 3,
      waitingDropTime: "1h 15m",
      gasPriceRecommendation: "$140.00 estimated for 45 gallons (trucking)"
    });
  } catch (err: any) {
    console.error("Error in eta endpoint:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shipment/status
app.get("/api/shipment/status", (req, res) => {
  res.json({ shipments: MOCK_SHIPMENTS });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // @ts-ignore
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
