/**
 * Entry Point - Backend Server
 * 
 * This is the main entry point for the backend application.
 * It initializes an Express server that handles HTTP requests for the search API.
 * 
 * CONNECTIONS:
 * - Imports and mounts searchRouter from ./routes/search_lcel.ts
 * - The searchRouter handles all /search endpoint requests
 * 
 * IMPACT:
 * - Any request to /search/* is forwarded to searchRouter
 * - CORS is configured to allow requests only from ALLOWED_ORIGIN (from .env)
 * - Server runs on PORT specified in .env (default: 5000)
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { searchRouter } from "./routes/search_lcel";

const app = express();

// CORS Configuration: Restricts API access to the frontend origin specified in .env
// This prevents cross-origin requests from unauthorized domains
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN,
  })
);

// JSON Body Parser Middleware
// Parses incoming JSON request bodies and makes them available on req.body
app.use(express.json());

// API Route: All search requests are routed through /search
// The searchRouter (from search_lcel.ts) handles the actual request processing
app.use("/search", searchRouter);

// Server Initialization: Starts the Express server on the configured port
// PORT is loaded from .env file (default: 5000)
const port = Number(process.env.PORT ?? 5000);
app.listen(port, () => {
  console.log(`server is now running on port ${port}`);
});
