import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini
// Lazy load to prevent crashing if GEMINI_API_KEY is not set globally, 
// though we'll check it in the endpoints.
let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is required");
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

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
    const aiClient = getAI();
    
    const prompt = `Analyze the shipment risk for a ${carrier} delivery from ${origin} to ${destination} departing at ${estimatedDepartureTime}. 
    Provide a realistic sounding analysis simulating factors like traffic congestion, weather, route complexity, and historical delay patterns for this specific route.
    Determine a risk score from 0-100, where 0-30 is Low, 30-70 is Medium, and 70-100 is High.
    Identify if there is a delay risk and provide an alert message if so.
    IMPORTANT: Also provide approximate realistic latitude and longitude coordinates for both the origin and destination to be used on a map.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
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
            destLng: { type: Type.NUMBER, description: "Longitude of destination exactly" }
          },
          required: ["score", "riskLevel", "factors", "delayAlert", "originLat", "originLng", "destLat", "destLng"],
        }
      }
    });

    res.json(JSON.parse(response.text));
  } catch (err: any) {
    console.error("Error in risk endpoint:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shipment/eta
app.post("/api/shipment/eta", async (req, res) => {
  try {
    const { origin, destination, carrier, estimatedDepartureTime } = req.body;
    const aiClient = getAI();
    
    const prompt = `Calculate ETA for a ${carrier} shipment from ${origin} to ${destination} departing at ${estimatedDepartureTime}.
    Provide the 'normal ETA' (ideal conditions) and the 'AI ETA' (adjusted for realistic weather, traffic, route complexity).
    Format times like "5h 20m". Return the factors that caused the change.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            normalEta: { type: Type.STRING, description: "Standard ETA e.g. '5h 20m'" },
            aiEta: { type: Type.STRING, description: "Adjusted ETA e.g. '6h 10m'" },
            reasoning: { type: Type.STRING, description: "Short explanation for the adjustment e.g. 'heavy traffic + rain'" }
          },
          required: ["normalEta", "aiEta", "reasoning"],
        }
      }
    });

    res.json(JSON.parse(response.text));
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
