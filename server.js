const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const WORD_SOURCE_URL =
  process.env.WORD_SOURCE_URL ||
  "https://raw.githubusercontent.com/jnoodle/English-Vocabulary-Word-List/master/Oxford%205000.txt";

const DICTIONARY_API_BASE =
  process.env.DICTIONARY_API_BASE ||
  "https://api.dictionaryapi.dev/api/v2/entries/en";

let wordsCache = [];
const definitionCache = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

async function loadWords() {
  if (wordsCache.length > 0) return wordsCache;

  const response = await fetch(WORD_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Word source fetch failed: ${response.status}`);
  }

  const text = await response.text();

  const words = text
    .split(/\r?\n/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .filter((w) => /^[a-z- ]+$/.test(w))
    .map((w) => w.replace(/\s+/g, " ").trim());

  wordsCache = [...new Set(words)].slice(0, 5000);
  return wordsCache;
}

function extractDefinition(payload) {
  try {
    const meanings = payload?.[0]?.meanings || [];
    for (const meaning of meanings) {
      const defs = meaning.definitions || [];
      if (defs.length > 0 && defs[0].definition) {
        return {
          partOfSpeech: meaning.partOfSpeech || "",
          definition: defs[0].definition,
          example: defs[0].example || ""
        };
      }
    }
  } catch (_) {}

  return {
    partOfSpeech: "",
    definition: "Definition not found.",
    example: ""
  };
}

async function getDefinition(word) {
  if (definitionCache.has(word)) return definitionCache.get(word);

  try {
    const res = await fetch(`${DICTIONARY_API_BASE}/${encodeURIComponent(word)}`);
    if (!res.ok) {
      const fallback = { word, partOfSpeech: "", definition: "Definition not found.", example: "" };
      definitionCache.set(word, fallback);
      return fallback;
    }

    const data = await res.json();
    const parsed = extractDefinition(data);
    const result = { word, ...parsed };
    definitionCache.set(word, result);
    return result;
  } catch (_) {
    const fallback = { word, partOfSpeech: "", definition: "Definition not found.", example: "" };
    definitionCache.set(word, fallback);
    return fallback;
  }
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true, source: WORD_SOURCE_URL });
});

app.get("/api/course", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "150", 10), 1), 5000);
    const words = await loadWords();
    res.json({
      title: "Oxford 5000",
      total: words.length,
      items: words.slice(0, limit)
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load course", details: err.message });
  }
});

app.get("/api/word/:word", async (req, res) => {
  try {
    const word = req.params.word.toLowerCase().trim();
    const definition = await getDefinition(word);
    res.json(definition);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch word definition",
      details: err.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
