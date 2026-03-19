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

const TRANSLATE_API_BASE =
  process.env.TRANSLATE_API_BASE ||
  "https://api.mymemory.translated.net/get";

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
    definition: `${payload?.[0]?.word || "This word"} is an English vocabulary item.`,
    example: ""
  };
}

function generateExample(word, partOfSpeech, definition) {
  const cleanWord = String(word || "").trim();
  const pos = String(partOfSpeech || "").toLowerCase();
  const cleanDefinition = String(definition || "").trim();

  if (pos === "noun") {
    return `The lesson explains the word "${cleanWord}" clearly.`;
  }

  if (pos === "verb") {
    return `We use the verb "${cleanWord}" in many everyday situations.`;
  }

  if (pos === "adjective") {
    return `The teacher gave a very ${cleanWord} explanation during the lesson.`;
  }

  if (pos === "adverb") {
    return `She answered the question ${cleanWord} during class.`;
  }

  if (pos === "preposition") {
    return `Please look at how "${cleanWord}" is used in this sentence.`;
  }

  if (pos === "pronoun") {
    return `The text shows how "${cleanWord}" works in context.`;
  }

  if (pos === "conjunction") {
    return `We can connect two ideas with "${cleanWord}".`;
  }

  if (pos === "interjection") {
    return `"${cleanWord}!" the students shouted when they heard the news.`;
  }

  if (cleanDefinition) {
    return `In this unit, we study "${cleanWord}", which means ${cleanDefinition.toLowerCase()}.`;
  }

  return `I learned the word "${cleanWord}" today and used it in a sentence.`;
}

async function translateToTurkish(text) {
  try {
    const url =
      `${TRANSLATE_API_BASE}?q=${encodeURIComponent(text)}&langpair=en|tr`;

    const res = await fetch(url);
    if (!res.ok) return "";

    const data = await res.json();
    const translated = data?.responseData?.translatedText || "";

    return String(translated).trim();
  } catch (_) {
    return "";
  }
}

async function getDefinition(word) {
  if (definitionCache.has(word)) return definitionCache.get(word);

  let parsed = {
    partOfSpeech: "",
    definition: `${word} is an English vocabulary item.`,
    example: ""
  };

  try {
    const res = await fetch(`${DICTIONARY_API_BASE}/${encodeURIComponent(word)}`);
    if (res.ok) {
      const data = await res.json();
      parsed = extractDefinition(data);
    }
  } catch (_) {}

  const guaranteedExample =
    parsed.example && parsed.example.trim()
      ? parsed.example.trim()
      : generateExample(word, parsed.partOfSpeech, parsed.definition);

  const [turkishDefinition, turkishExample] = await Promise.all([
    translateToTurkish(parsed.definition),
    translateToTurkish(guaranteedExample)
  ]);

  const result = {
    word,
    partOfSpeech: parsed.partOfSpeech || "",
    definition: parsed.definition || `${word} is an English vocabulary item.`,
    example: guaranteedExample,
    turkish:
      turkishDefinition ||
      `${word} kelimesinin Türkçe çevirisi şu anda alınamadı.`,
    turkishExample:
      turkishExample ||
      `Bu örnek cümlenin Türkçe çevirisi şu anda alınamadı.`
  };

  definitionCache.set(word, result);
  return result;
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
    res.status(500).json({
      error: "Failed to load course",
      details: err.message
    });
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