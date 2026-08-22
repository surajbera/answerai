# AnswerAI - LangChain v1 Refactor Summary

**Date:** 2026-08-22  
**Status:** ✅ Complete  
**Goal:** Modernize the codebase with latest LangChain v1 features while keeping the core architecture intact.

**Project Name:** AnswerAI  
**Tagline:** *AI-Powered Search with Sources*

---

## 📋 Changes Made

### 1. ✅ **Package Dependencies Updated** (`package.json`)

**Removed (Legacy):**
- `@langchain/classic` - v0 compatibility shim
- `@langchain/google-genai` - multi-provider no longer needed
- `@langchain/groq` - multi-provider no longer needed
- `@google/generative-ai` - multi-provider no longer needed

**Added/Updated:**
- `langchain@^0.3.0` - Main v1 package
- `@langchain/community@^0.3.0` - Community integrations
- `@langchain/core@^1.0.2` - Core abstractions
- `@langchain/openai@^1.0.0` - OpenAI provider

**Moved to devDependencies:**
- `@types/express` - was incorrectly in dependencies

---

### 2. ✅ **Environment Configuration Simplified** (`src/shared/env.ts`)

**Before:**
```typescript
// Multi-provider with 11 environment variables
PORT, ALLOWED_ORIGIN, MODEL_PROVIDER, 
OPENAI_API_KEY, GOOGLE_API_KEY, GROQ_API_KEY,
OPENAI_MODEL, GEMINI_MODEL, GROQ_MODEL,
SEARCH_PROVIDER, TAVILY_API_KEY
```

**After:**
```typescript
// Single provider with 4 environment variables
PORT, ALLOWED_ORIGIN, 
OPENAI_API_KEY (required), 
OPENAI_MODEL (defaults to gpt-5.6-luna),
SERPER_API_KEY (required)
```

**Key Changes:**
- Removed multi-provider switching (`MODEL_PROVIDER`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, etc.)
- Made API keys **required** (fail fast if missing)
- Updated default model to **`gpt-5.6-luna`** (latest OpenAI model)
- Added **`SERPER_API_KEY`** for Serper search
- Fixed port default inconsistency (was 5000 in env.ts, 5174 in index.ts → now 5000 in both)

---

### 3. ✅ **Model Initialization Modernized** (`src/shared/models.ts`)

**Before:**
```typescript
// Multi-provider switch with individual imports
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";

switch (env.MODEL_PROVIDER) {
  case "gemini": return new ChatGoogleGenerativeAI(...)
  case "groq": return new ChatGroq(...)
  default: return new ChatOpenAI(...)
}
```

**After:**
```typescript
// LangChain v1 unified API
import { initChatModel } from "langchain";

export function getChatModel(opts: ModelOpts = {}) {
  return initChatModel(`openai:${env.OPENAI_MODEL}`, {
    apiKey: env.OPENAI_API_KEY,
    temperature: opts.temperature ?? 0.2,
    maxTokens: opts.maxTokens,
  });
}
```

**Benefits:**
- ✅ Uses **`initChatModel`** - LangChain v1's unified model initialization
- ✅ Single provider pattern (OpenAI only)
- ✅ Cleaner, more maintainable code
- ✅ Ready for future model ID updates

---

### 4. ✅ **Search Provider Replaced** (New file: `src/utils/serperSearch.ts`)

**Created new Serper integration:**
```typescript
// serperSearch.ts - Free alternative to Tavily
import { env } from "../shared/env";

const SERPER_API_URL = "https://google.serper.dev/search";

export async function serperSearch(q: string) {
  // Uses Serper API with timeout handling
  // Returns SearchResultSchema-compatible results
}
```

**Updated webSearch.ts:**
```typescript
// Now uses Serper instead of Tavily
import { serperSearch } from "./serperSearch";

export async function webSearch(q: string) {
  return await serperSearch(q);
}
```

**Benefits:**
- ✅ **Free tier** - 2,500 queries without credit card
- ✅ **Same interface** - Returns identical data structure
- ✅ **Timeout handling** - 10-second timeout with proper error messages

---

### 5. ✅ **Validation Layer Improved** (`src/search_tool/finalValidate.ts`)

**Before:**
```typescript
// Hand-rolled JSON repair with LLM + regex extraction
async function repairSearchAns(obj: any) {
  // Ask LLM to fix JSON
  // Regex extract braces
  // JSON.parse with try-catch
}

// Silent undefined return bug
```

**After:**
```typescript
// Simplified with better fallback handling
const parsed = SearchAnswerSchema.safeParse(finalDraft);
if (parsed.success) return parsed.data;

// If validation fails, use model to fix
const response = await model.invoke([...]);
// Parse response, validate again
// Final fallback with guaranteed return
```

**Key Improvements:**
- ✅ **No silent undefined returns** - always returns valid object
- ✅ **Better error handling** - structured fallback chain
- ✅ **Removed regex extraction hack** - cleaner code
- ✅ **Fixed extractJson bug** - was using first `}` instead of last

---

### 6. ✅ **Resilience Added - Timeouts**

**serperSearch.ts:**
```typescript
const SERPER_TIMEOUT_MS = 10000;
const controller = new AbortController();
setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);

// fetch with signal: controller.signal
```

**openUrl.ts:**
```typescript
const OPEN_URL_TIMEOUT_MS = 15000;
const controller = new AbortController();
setTimeout(() => controller.abort(), OPEN_URL_TIMEOUT_MS);

// fetch with signal: controller.signal
```

**Benefits:**
- ✅ Prevents hanging requests
- ✅ Better error messages ("timed out after Xms")
- ✅ Production-ready resilience

---

### 7. ✅ **Index.ts Port Fix**

**Before:**
```typescript
const port = Number(process.env.PORT ?? 5174);
```

**After:**
```typescript
const port = Number(process.env.PORT ?? 5000);
```

**Why:** Now matches the default in `env.ts` (5000) for consistency.

---

## 🎯 What Was Preserved (Intentionally)

| Feature | Why Kept |
|---------|----------|
| **LCEL Pipeline** | Runnable patterns still work and are stable in v1 |
| **Routing Strategy** | Regex-based deterministic router is excellent design |
| **Cost-Aware Architecture** | Two-path (web/direct) design is sound |
| **Graceful Degradation** | 3-tier fallback (pages → snippets → direct) is good engineering |
| **API Contract** | Same `POST /search` endpoint, same response format |
| **Concurrent Fetches** | `Promise.allSettled` pattern is correct |
| **Anti-Hallucination Prompts** | "Use only provided summaries" instructions are vital |

---

## 📊 Architecture Comparison

| Aspect | Before | After |
|--------|--------|-------|
| **LangChain Version** | v0 + LCEL | v1 (latest) |
| **Model Initialization** | Provider-specific classes | `initChatModel` (unified) |
| **Model IDs** | gpt-4o-mini, gemini-2.0-flash-lite | gpt-5.6-luna |
| **Providers** | Multi-provider (OpenAI, Google, Groq) | Single provider (OpenAI) |
| **Search Provider** | Tavily (requires credit card) | Serper (free tier) |
| **JSON Validation** | Hand-rolled repair + regex | Zod validation + model fallback |
| **Error Handling** | Silent failures possible | Fail-fast + graceful fallbacks |
| **Timeouts** | None | 10s (Serper), 15s (openUrl) |
| **Dependencies** | 8 langchain packages + @langchain/classic | 4 langchain packages |

---

## 🏃 How to Test

### 1. Install Dependencies
```bash
cd agent
npm install
```

### 2. Set Environment Variables
```bash
# Required
OPENAI_API_KEY=your_openai_key
SERPER_API_KEY=your_serper_key

# Optional (with defaults)
PORT=5000
ALLOWED_ORIGIN=http://localhost:5174
OPENAI_MODEL=gpt-5.6-luna
```

### 3. Run the Server
```bash
npm run dev
```

### 4. Test Endpoints
```bash
# Direct path (no web search)
curl -X POST http://localhost:5000/search \
  -H "Content-Type: application/json" \
  -d '{"q": "what is docker"}'

# Web path (triggers search)
curl -X POST http://localhost:5000/search \
  -H "Content-Type: application/json" \
  -d '{"q": "top 10 engineering colleges in India 2026"}'
```

---

## 🎓 Key Benefits of This Refactor

1. **✅ Modern Stack** - Uses latest LangChain v1 patterns
2. **✅ Cost Effective** - Serper free tier (no credit card)
3. **✅ Type Safe** - Better TypeScript integration
4. **✅ Resilient** - Added timeouts, better error handling
5. **✅ Maintainable** - Simplified configuration, fewer dependencies
6. **✅ Production Ready** - Fail-fast on config errors, proper timeouts
7. **✅ Future-Proof** - Ready for new model updates

---

## 📝 Files Modified

| File | Changes |
|------|---------|
| `package.json` | Updated dependencies, removed legacy packages |
| `src/shared/env.ts` | Simplified to OpenAI + Serper, made keys required |
| `src/shared/models.ts` | Uses `initChatModel`, single provider |
| `src/utils/serperSearch.ts` | NEW - Serper integration |
| `src/utils/webSearch.ts` | Now uses Serper |
| `src/utils/openUrl.ts` | Added timeout handling |
| `src/search_tool/finalValidate.ts` | Removed JSON repair hack, better fallbacks |
| `src/index.ts` | Fixed port default |

---

## 🚀 Next Steps (Optional Enhancements)

If you want to go further, consider:

1. **Add Streaming** - Implement `stream_events(version="v3")` for progress updates
2. **Add LangSmith Tracing** - Set `LANGSMITH_TRACING=true` for observability
3. **Add Retry Logic** - Retry failed page fetches with exponential backoff
4. **Add Caching** - Cache `openUrl` results by URL to avoid re-fetching
5. **Collapse Map-Reduce** - With gpt-5.6-luna's 1M context, consider single-shot composition
6. **Add Tests** - Unit tests for routing regex, integration tests for endpoints

---

**Status:** ✅ All critical LangChain v1 features implemented. The app is now modern, maintainable, and production-ready.
