# Running the Backend Application

This guide explains how to set up, run, and test the backend server for the AnswerAI search application.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Installation](#installation)
4. [Running the Backend](#running-the-backend)
5. [API Endpoints](#api-endpoints)
6. [Testing the Application](#testing-the-application)
7. [Troubleshooting](#troubleshooting)
8. [Understanding the Modes](#understanding-the-modes)

---

## Prerequisites

Before running the backend, ensure you have the following installed:

- **Node.js**: Version 18 or higher (recommended: LTS version)
- **npm** or **yarn**: Package manager (npm comes with Node.js)
- **API Keys**: You will need API keys for the services used

### Verify Node.js Installation

```bash
node --version
# Should output: v18.x.x or higher

npm --version
# Should output: 9.x.x or higher
```

If Node.js is not installed, download it from [nodejs.org](https://nodejs.org/)

---

## Environment Setup

The application requires several environment variables to be configured. These are loaded from a `.env` file in the `agent/` directory.

### Required API Keys

1. **OpenAI API Key** (`OPENAI_API_KEY`)
   - Required for all LLM interactions
   - Get it from: https://platform.openai.com/account/api-keys
   - This is a **required** field - the application will fail to start without it

2. **Serper API Key** (`SERPER_API_KEY`)
   - Required for web search functionality
   - Get it from: https://serper.dev/
   - Free tier available
   - This is a **required** field for web search mode

### Environment Variables

Create or edit the `.env` file in the `agent/` directory with the following content:

```env
# Server Configuration
PORT=5000
ALLOWED_ORIGIN=http://localhost:5174

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.6-luna

# Serper Search Configuration
SERPER_API_KEY=your_serper_api_key_here
```

### Notes:

- `PORT`: The port the backend server will run on (default: 5000)
- `ALLOWED_ORIGIN`: CORS origin - set this to your frontend URL or `*` for development
- `OPENAI_MODEL`: The OpenAI model to use (e.g., `gpt-4o-mini`, `gpt-5.6-luna`)
- Both API keys are **required** - the application will not start without them

---

## Installation

Navigate to the backend directory and install dependencies:

```bash
cd /Users/berasuraj/web-apps/ai-eng/answerai/agent

# Install dependencies using npm
npm install

# OR using yarn
yarn install
```

This will install all required dependencies listed in `package.json`:
- Express.js (web framework)
- LangChain v1 (LLM orchestration)
- Zod (schema validation)
- html-to-text (HTML content extraction)
- cors (CORS middleware)
- dotenv (environment variable loading)

---

## Running the Backend

There are two ways to run the backend server:

### Development Mode (Recommended)

Uses `tsx watch` which provides:
- Automatic reloading when files change
- TypeScript support without manual compilation

```bash
# From the agent/ directory
npm run dev

# Output should be:
# server is now running on port 5000
```

### Production Mode

Runs the server without hot reloading:

```bash
# From the agent/ directory
npm start

# Output should be:
# server is now running on port 5000
```

---

## API Endpoints

Once the server is running, the following endpoints are available:

### POST `/search`

Processes a search query and returns an answer.

**Request Body:**
```json
{
  "q": "your search query here"
}
```

**Response (Success):**
```json
{
  "answer": "The answer to your query",
  "sources": ["https://example.com", "https://another-source.com"],
  "mode": "web" | "direct"
}
```

**Response (Error):**
```json
{
  "error": "Error message describing what went wrong"
}
```

**Query Requirements:**
- Minimum 5 characters: `"Please ask a specific query"`

---

## Testing the Application

### Method 1: Using cURL

```bash
# Simple query (direct mode)
curl -X POST http://localhost:5000/search \
  -H "Content-Type: application/json" \
  -d '{"q": "What is the capital of France?"}'

# Query that triggers web search mode
curl -X POST http://localhost:5000/search \
  -H "Content-Type: application/json" \
  -d '{"q": "top 10 engineering colleges in India 2025"}'
```

### Method 2: Using Postman

1. Open Postman
2. Create a new POST request to `http://localhost:5000/search`
3. Set header: `Content-Type: application/json`
4. Set body (raw JSON): `{"q": "What is TypeScript?"}`
5. Send the request

### Method 3: Using a Browser (for quick testing)

You can use a simple HTML file to test:

```html
<!DOCTYPE html>
<html>
<body>
  <form id="searchForm">
    <input type="text" id="query" placeholder="Enter your query" value="What is AI?">
    <button type="submit">Search</button>
  </form>
  <pre id="result"></pre>
  
  <script>
    document.getElementById('searchForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = document.getElementById('query').value;
      
      const response = await fetch('http://localhost:5000/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query })
      });
      
      const result = await response.json();
      document.getElementById('result').textContent = JSON.stringify(result, null, 2);
    });
  </script>
</body>
</html>
```

Save this as `test.html` and open it in a browser.

---

## Understanding the Modes

The application uses two different processing modes based on the query:

### Direct Mode

Used for:
- Short queries (< 70 characters)
- Simple questions that don't require current information
- General knowledge questions

**Behavior:**
- Query is sent directly to the LLM
- No web search is performed
- Faster response (no API calls to search provider)
- `sources` array will be empty
- `mode` field will be `"direct"`

**Example queries:**
- "What is the capital of France?"
- "Explain quantum computing"
- "Who wrote Romeo and Juliet?"

### Web Mode

Used for:
- Long queries (> 70 characters)
- Queries mentioning recent years (2024-2039)
- Queries with specific patterns:
  - Comparisons: "top 10", "best", "vs", "compare"
  - Pricing: "price", "cost", "cheapest"
  - Current events: "latest", "today", "news", "released"
  - Technical: "deprecated", "compatible with", "install"
  - Location-based: "near me", "nearby"

**Behavior:**
- Performs web search using Serper
- Opens top 5 results
- Extracts and cleans content from each page
- Summarizes each page using LLM
- Generates final answer from summaries
- Slower but more accurate for current information
- `sources` array contains URLs of consulted pages
- `mode` field will be `"web"`

**Example queries:**
- "top 10 engineering colleges in India 2025"
- "What is the latest version of React?"
- "best laptops under $1000"
- "compare Python vs JavaScript"

---

## Expected Output Examples

### Direct Mode Response

**Query:** `"What is the capital of France?"`

```json
{
  "answer": "The capital of France is Paris.",
  "sources": [],
  "mode": "direct"
}
```

### Web Mode Response

**Query:** `"top 10 engineering colleges in India 2025"`

```json
{
  "answer": "The top 10 engineering colleges in India for 2025 include IIT Bombay, IIT Delhi, IIT Kanpur... [truncated]",
  "sources": [
    "https://example.com/top-colleges",
    "https://another-site.com/rankings"
  ],
  "mode": "web"
}
```

---

## Troubleshooting

### Server won't start

**Symptom:** Server crashes immediately after starting

**Possible causes:**
1. Missing environment variables (OPENAI_API_KEY or SERPER_API_KEY)
2. Invalid .env file syntax

**Solution:**
- Check that `.env` file exists in the `agent/` directory
- Verify both API keys are present and correct
- Run with debugging:
  ```bash
  npm run dev
  ```
- Look for error messages like "SERPER_API_KEY is missing"

### CORS errors

**Symptom:** Browser console shows CORS errors

**Solution:**
- Ensure `ALLOWED_ORIGIN` in `.env` matches your frontend URL
- For local development, you can set: `ALLOWED_ORIGIN=http://localhost:5173` (or whatever port your frontend uses)
- For testing from Postman/cURL, CORS doesn't apply

### Timeout errors

**Symptom:** Requests time out after 10-15 seconds

**Possible causes:**
- Slow internet connection
- Serper API is slow or down
- Web pages are slow to respond

**Solution:**
- Check your internet connection
- Try a different query
- Verify Serper API is working (check Serper status page)
- Note: Some websites block bots - the application will use fallback to snippets

### "Invalid URL" errors

**Symptom:** Errors about invalid URLs

**Possible causes:**
- Search results contain malformed URLs
- The URL uses an unsupported protocol

**Solution:**
- The application only supports http:// and https:// URLs
- Other protocols (ftp://, file://, etc.) will be rejected

### Empty or poor quality answers

**Symptom:** Answers are incomplete or don't make sense

**Possible causes:**
- Web pages couldn't be fetched (403, 404 errors)
- Content extraction failed
- LLM couldn't understand the content

**Solution:**
- Check the `sources` array - if empty in web mode, all fetches failed
- The application falls back to using search snippets when page fetching fails
- Try a different query

---

## Verifying Everything Works

Run through this checklist:

1. [ ] Node.js is installed (v18+)
2. [ ] Dependencies are installed (`npm install`)
3. [ ] `.env` file exists in `agent/` directory
4. [ ] `OPENAI_API_KEY` is set in `.env`
5. [ ] `SERPER_API_KEY` is set in `.env`
6. [ ] Server starts without errors (`npm run dev`)
7. [ ] Test with cURL or Postman
8. [ ] Try both direct and web mode queries

---

## Additional Notes

- The application uses **LangChain v1** with LCEL (LangChain Expression Language)
- All API responses are validated using **Zod** schemas
- Error handling is built-in with graceful fallbacks
- Web pages are cleaned to remove navigation, scripts, and styles before being sent to the LLM
- Summaries are capped at 8000 characters to control input size
- Final answers are capped at 2500 characters

---

## File Locations

| Purpose | File | Location |
|---------|------|----------|
| Main entry point | `index.ts` | `agent/src/` |
| API routes | `search_lcel.ts` | `agent/src/routes/` |
| Search pipeline | `searchChain.ts` | `agent/src/search_tool/` |
| Web pipeline | `webPipeline.ts` | `agent/src/search_tool/` |
| Direct pipeline | `directPipeline.ts` | `agent/src/search_tool/` |
| Environment config | `env.ts` | `agent/src/shared/` |
| Environment variables | `.env` | `agent/` |
| Package dependencies | `package.json` | `agent/` |
