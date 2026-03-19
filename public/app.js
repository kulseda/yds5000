const DAILY_TARGET = 20;
const STORAGE_KEY = "oxford5000_garden_progress_v2";

let deck = [];
let detailsCache = {};
let currentCard = null;
let currentMode = "flashcards";
let quizState = { score: 0, currentQuestion: null };

let state = {
  xp: 0,
  streak: 0,
  mastered: {},
  queue: [],
  studiedToday: 0,
  lastStudyDate: "",
  nextIndex: 0
};

const wordText = document.getElementById("wordText");
const partOfSpeech = document.getElementById("partOfSpeech");
const definitionText = document.getElementById("definitionText");
const exampleText = document.getElementById("exampleText");
const meaningPanel = document.getElementById("meaningPanel");
const ratingRow = document.getElementById("ratingRow");
const progressFill = document.getElementById("progressFill");
const sessionLabel = document.getElementById("sessionLabel");
const xpValue = document.getElementById("xpValue");
const streakValue = document.getElementById("streakValue");
const masteredValue = document.getElementById("masteredValue");
const queueInfo = document.getElementById("queueInfo");
const queueList = document.getElementById("queueList");
const gardenEmoji = document.getElementById("gardenEmoji");
const gardenText = document.getElementById("gardenText");
const currentIndex = document.getElementById("currentIndex");
const statusChip = document.getElementById("statusChip");
const flashcardSection = document.getElementById("flashcardSection");
const quizSection = document.getElementById("quizSection");
const flashcardModeBtn = document.getElementById("flashcardModeBtn");
const quizModeBtn = document.getElementById("quizModeBtn");
const quizWordText = document.getElementById("quizWordText");
const quizChoices = document.getElementById("quizChoices");
const quizResult = document.getElementById("quizResult");
const nextQuizBtn = document.getElementById("nextQuizBtn");
const quizScoreChip = document.getElementById("quizScoreChip");

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    state = {
      xp: parsed.xp || 0,
      streak: parsed.streak || 0,
      mastered: parsed.mastered || {},
      queue: parsed.queue || [],
      studiedToday: parsed.studiedToday || 0,
      lastStudyDate: parsed.lastStudyDate || "",
      nextIndex: parsed.nextIndex || 0
    };
  } catch (_) {}
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateGarden() {
  const masteredCount = Object.values(state.mastered).filter(v => v >= 4).length;

  if (masteredCount >= 100) {
    gardenEmoji.textContent = "🌳";
    gardenText.textContent = "Flourishing garden";
  } else if (masteredCount >= 40) {
    gardenEmoji.textContent = "🌿";
    gardenText.textContent = "Growing strong";
  } else if (masteredCount >= 10) {
    gardenEmoji.textContent = "🪴";
    gardenText.textContent = "Young plant";
  } else {
    gardenEmoji.textContent = "🌱";
    gardenText.textContent = "New learner";
  }
}

function updateStats() {
  const masteredCount = Object.values(state.mastered).filter(v => v >= 4).length;
  xpValue.textContent = state.xp;
  streakValue.textContent = state.streak;
  masteredValue.textContent = masteredCount;

  const percent = Math.min((state.studiedToday / DAILY_TARGET) * 100, 100);
  progressFill.style.width = `${percent}%`;
  sessionLabel.textContent = `${state.studiedToday} / ${DAILY_TARGET}`;
  quizScoreChip.textContent = `Score: ${quizState.score}`;

  updateGarden();
  renderQueue();
}

function renderQueue() {
  queueInfo.textContent = `${state.queue.length} cards waiting`;
  queueList.innerHTML = "";

  state.queue.slice(0, 24).forEach((item) => {
    const badge = document.createElement("div");
    badge.className = "queue-item";
    const level = state.mastered[item.word] || 0;
    badge.textContent = `${item.word} · L${level}`;
    queueList.appendChild(badge);
  });

  if (state.queue.length === 0) {
    const badge = document.createElement("div");
    badge.className = "queue-item";
    badge.textContent = "Queue is empty.";
    queueList.appendChild(badge);
  }
}

function ensureToday() {
  const today = todayString();

  if (state.lastStudyDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (state.lastStudyDate === yesterdayStr) {
    state.streak += 1;
  } else {
    state.streak = 1;
  }

  state.studiedToday = 0;
  state.lastStudyDate = today;
  saveState();
}

async function loadDeck() {
  const res = await fetch("/api/course?limit=5000");
  const data = await res.json();
  deck = data.items || [];

  if (!Array.isArray(deck) || deck.length === 0) {
    console.error("Deck could not be loaded.");
    return;
  }

  if (state.nextIndex <= 0 || state.nextIndex > deck.length) {
    state.nextIndex = 0;
  }

  if (!Array.isArray(state.queue)) {
    state.queue = [];
  }

  if (state.queue.length === 0) {
    fillQueueToTarget();
    saveState();
  }
}

async function getWordDetails(word) {
  if (detailsCache[word]) return detailsCache[word];

  const res = await fetch(`/api/word/${encodeURIComponent(word)}`);
  const data = await res.json();
  detailsCache[word] = data;
  return data;
}

function fillQueueToTarget() {
  const existing = new Set(state.queue.map(item => item.word));

  while (state.queue.length < 20 && state.nextIndex < deck.length) {
    const nextWord = deck[state.nextIndex];
    state.nextIndex += 1;

    if (!existing.has(nextWord)) {
      state.queue.push({ word: nextWord });
      existing.add(nextWord);
    }
  }
}

async function openNextCard() {
  if (state.queue.length === 0) {
    fillQueueToTarget();
    saveState();
  }

  if (state.queue.length === 0) {
    statusChip.textContent = "Finished";
    wordText.textContent = "All words completed";
    partOfSpeech.textContent = "No more cards left in the deck.";
    meaningPanel.classList.add("hidden");
    ratingRow.classList.add("hidden");
    currentIndex.textContent = "0";
    return;
  }

  currentCard = state.queue[0];
  const data = await getWordDetails(currentCard.word);

  wordText.textContent = data.word || currentCard.word;
  partOfSpeech.textContent = data.partOfSpeech || "";
  definitionText.textContent = data.definition || "Definition not found.";
  exampleText.textContent = data.example ? `Example: ${data.example}` : "";

  meaningPanel.classList.add("hidden");
  ratingRow.classList.add("hidden");
  statusChip.textContent = "Learning";
  currentIndex.textContent = `${Math.min(state.studiedToday + 1, DAILY_TARGET)}`;
}

function removeCurrentCard() {
  state.queue.shift();
}

function reinsertCard(word, score) {
  const item = { word };
  const level = state.mastered[word] || 0;

  if (score === 1) {
    state.queue.splice(Math.min(1, state.queue.length), 0, item);
  } else if (score === 2) {
    state.queue.splice(Math.min(3, state.queue.length), 0, item);
  } else if (score === 3) {
    if (level < 2) {
      state.queue.splice(Math.min(6, state.queue.length), 0, item);
    }
  }
  // score === 4 ise geri eklemiyoruz
}

function switchMode(mode) {
  currentMode = mode;
  flashcardModeBtn.classList.toggle("active", mode === "flashcards");
  quizModeBtn.classList.toggle("active", mode === "quiz");
  flashcardSection.classList.toggle("hidden", mode !== "flashcards");
  quizSection.classList.toggle("hidden", mode !== "quiz");

  if (mode === "quiz") {
    prepareQuizQuestion();
  }
}

async function prepareQuizQuestion() {
  if (state.queue.length === 0) {
    fillQueueToTarget();
    saveState();
  }

  const sourceWords = state.queue.length > 0
    ? state.queue.slice(0, Math.min(8, state.queue.length)).map(q => q.word)
    : deck.slice(0, 8);

  if (sourceWords.length === 0) {
    quizWordText.textContent = "No words available";
    quizChoices.innerHTML = "";
    quizResult.classList.remove("hidden");
    quizResult.textContent = "Deck is finished.";
    nextQuizBtn.classList.add("hidden");
    return;
  }

  const targetWord = sourceWords[Math.floor(Math.random() * sourceWords.length)];
  const target = await getWordDetails(targetWord);

  if (!target.definition || target.definition === "Definition not found.") {
    await prepareQuizQuestion();
    return;
  }

  const distractorWords = shuffle(deck.filter(w => w !== targetWord)).slice(0, 30);
  const distractorDetails = [];

  for (const word of distractorWords) {
    const detail = await getWordDetails(word);
    if (
      detail.definition &&
      detail.definition !== "Definition not found." &&
      detail.definition !== target.definition
    ) {
      distractorDetails.push(detail);
    }
    if (distractorDetails.length >= 3) break;
  }

  const options = shuffle([
    target.definition,
    ...distractorDetails.map(d => d.definition)
  ].slice(0, 4));

  quizState.currentQuestion = {
    word: targetWord,
    correctDefinition: target.definition,
    options
  };

  quizWordText.textContent = targetWord;
  quizChoices.innerHTML = "";
  quizResult.classList.add("hidden");
  nextQuizBtn.classList.add("hidden");

  options.forEach((option) => {
    const btn = document.createElement("button");
    btn.className = "quiz-choice";
    btn.textContent = option;
    btn.addEventListener("click", () => handleQuizAnswer(option, btn));
    quizChoices.appendChild(btn);
  });
}

function handleQuizAnswer(selected, clickedBtn) {
  const q = quizState.currentQuestion;
  if (!q) return;

  const buttons = [...document.querySelectorAll(".quiz-choice")];
  buttons.forEach(btn => (btn.disabled = true));

  buttons.forEach(btn => {
    if (btn.textContent === q.correctDefinition) {
      btn.classList.add("correct");
    }
  });

  if (selected === q.correctDefinition) {
    clickedBtn.classList.add("correct");
    quizResult.textContent = "Correct! Nice.";
    state.xp += 6;
    state.mastered[q.word] = Math.min((state.mastered[q.word] || 0) + 1, 6);
    quizState.score += 1;
  } else {
    clickedBtn.classList.add("wrong");
    quizResult.textContent = "Wrong. The correct meaning is highlighted.";
    state.xp += 1;
    state.mastered[q.word] = Math.max((state.mastered[q.word] || 0), 0);
  }

  state.studiedToday += 1;
  saveState();
  updateStats();

  quizResult.classList.remove("hidden");
  nextQuizBtn.classList.remove("hidden");
}

document.getElementById("showBtn").addEventListener("click", () => {
  meaningPanel.classList.remove("hidden");
  ratingRow.classList.remove("hidden");
  statusChip.textContent = "Rate yourself";
});

document.querySelectorAll(".rate-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!currentCard) return;

    const score = Number(btn.dataset.score);
    const word = currentCard.word;
    const currentLevel = state.mastered[word] || 0;

    if (score === 4) {
      state.mastered[word] = Math.min(currentLevel + 2, 6);
      state.xp += 8;
    } else if (score === 3) {
      state.mastered[word] = Math.min(currentLevel + 1, 6);
      state.xp += 5;
    } else if (score === 2) {
      state.mastered[word] = Math.max(currentLevel, 1);
      state.xp += 2;
    } else {
      state.mastered[word] = 0;
      state.xp += 1;
    }

    removeCurrentCard();
    reinsertCard(word, score);
    fillQueueToTarget();

    state.studiedToday += 1;
    saveState();
    updateStats();
    await openNextCard();
  });
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  state.queue = [];
  state.studiedToday = 0;
  state.nextIndex = 0;
  quizState.score = 0;

  fillQueueToTarget();
  saveState();
  updateStats();
  await openNextCard();

  if (currentMode === "quiz") {
    await prepareQuizQuestion();
  }
});

flashcardModeBtn.addEventListener("click", () => switchMode("flashcards"));
quizModeBtn.addEventListener("click", () => switchMode("quiz"));
nextQuizBtn.addEventListener("click", async () => {
  await prepareQuizQuestion();
});

(async function init() {
  loadState();
  ensureToday();
  await loadDeck();
  fillQueueToTarget();
  saveState();
  updateStats();
  await openNextCard();
})();