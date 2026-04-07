# Ham Sandwich — Test System

> UK Amateur Radio Foundation Licence mock test and revision system with spaced repetition and progress tracking.

## Related Documents

| Document | Description |
|---|---|
| [LLM-OVERVIEW.md](LLM-OVERVIEW.md) | High-level project overview |
| [LLM-SITE.md](LLM-SITE.md) | Site architecture, pages, and UI layout |
| [LLM-FIREBASE.md](LLM-FIREBASE.md) | User data persistence (test results, wrong answers) |

---

## What Is This?

A study tool for the **UK Amateur Radio Foundation Licence** exam. Users answer multiple-choice questions drawn from a question bank, get instant feedback with explanations, and track their progress over time.

---

## Test Modes

### 1. Practice Mode (`/test/practice`)

- User selects number of questions (5, 10, 15, 20, 25, or all)
- Optionally filters by category
- Questions are shown one at a time
- **Immediate feedback** after each answer:
  - ✅ Correct: Shows "Correct!" with the explanation for why this is the right answer
  - ❌ Wrong: Shows "Incorrect — the correct answer is {X}" with explanation for the correct answer, plus optional explanations for why each wrong answer is wrong
- Wrong answers are collected during the session
- At the end: score summary + option to retest incorrect answers
- Progress bar shows question X of Y throughout

### 2. Mock Exam Mode (`/test/mock`)

- Simulates a real Foundation Licence exam
- Fixed 26 questions (matching real exam format)
- **30-minute timer** displayed prominently
- No feedback during the test — answers are recorded silently
- At the end (or when timer expires):
  - All answers revealed with correct/incorrect marking
  - Explanations shown for every question
  - Final score and pass/fail indicator (pass mark: 19/26 = 73%)
  - Wrong answers saved for retesting

### 3. Retest Wrong Answers (`/test/retest`)

- **Session retest**: Immediately retest questions answered incorrectly in the previous practice/mock session
- **Logged-in retest**: If logged in, loads ALL historically wrong answers from Firebase and presents them as a batch test
- Uses Practice Mode format (immediate feedback)
- Questions answered correctly during retest are removed from the wrong answers list
- Questions answered incorrectly again remain on the list

### 4. Category Practice (planned)

- User selects one or more categories to focus on
- Questions filtered to selected categories only
- Otherwise works like Practice Mode
- Useful for targeted revision of weak areas

---

## Question Bank Format

Questions are stored as JSON files in `/data/questions/`, organised by category.

### Question Schema

```json
{
  "id": "LR-001",
  "category": "licensing-and-regulations",
  "subcategory": "licence-conditions",
  "question": "What is the minimum age to hold a UK Amateur Radio Foundation Licence?",
  "options": [
    {
      "key": "A",
      "text": "There is no minimum age",
      "reason_if_wrong": "While there is no minimum age set by Ofcom for the Foundation Licence, this is actually the correct answer — but if you selected this thinking otherwise, note that the Foundation Licence has no age restriction."
    },
    {
      "key": "B",
      "text": "10 years old",
      "reason_if_wrong": "There is no minimum age requirement. Candidates of any age can sit the Foundation exam."
    },
    {
      "key": "C",
      "text": "14 years old",
      "reason_if_wrong": "14 is not a requirement. The Foundation Licence has no minimum age."
    },
    {
      "key": "D",
      "text": "16 years old",
      "reason_if_wrong": "16 is not required. Anyone of any age may hold a Foundation Licence."
    }
  ],
  "correct": "A",
  "reason": "There is no minimum age requirement to hold a UK Amateur Radio Foundation Licence. Ofcom does not impose an age restriction, though young candidates may need a responsible adult to help with the exam process.",
  "difficulty": 1,
  "tags": ["age", "foundation", "ofcom", "licence"]
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique identifier. Format: `{CATEGORY_PREFIX}-{NUMBER}` |
| `category` | string | Yes | Primary category for filtering and reporting |
| `subcategory` | string | No | Sub-topic within the category |
| `question` | string | Yes | The question text |
| `options` | array | Yes | 4 multiple-choice options (A–D) |
| `options[].key` | string | Yes | Option letter (A, B, C, D) |
| `options[].text` | string | Yes | Option text |
| `options[].reason_if_wrong` | string | No | Explanation shown if this wrong option is selected |
| `correct` | string | Yes | Key of the correct option (A, B, C, or D) |
| `reason` | string | Yes | Explanation for why the correct answer is correct |
| `difficulty` | number | No | 1 (easy), 2 (medium), 3 (hard) — for future use |
| `tags` | array | No | Keywords for search and cross-referencing |

### Question Categories

Based on the UK Foundation Licence syllabus:

| Category ID | Category Name | Prefix |
|---|---|---|
| `licensing-and-regulations` | Licensing, Regulations & Conditions | LR |
| `technical-basics` | Technical Basics (Electricity, Circuits) | TB |
| `transmitters-receivers` | Transmitters and Receivers | TR |
| `propagation` | Propagation | PR |
| `antennas-feeders` | Antennas and Feeders | AF |
| `safety` | Safety | SF |
| `operating-practices` | Operating Practices and Procedures | OP |
| `electromagnetic-compatibility` | Electromagnetic Compatibility (EMC) | EC |

### File Organisation

```
/data/questions/
├── licensing-and-regulations.json
├── technical-basics.json
├── transmitters-receivers.json
├── propagation.json
├── antennas-feeders.json
├── safety.json
├── operating-practices.json
└── electromagnetic-compatibility.json
```

Each file contains an array of question objects for that category.

---

## UI Design

> **Styling:** All UI elements must use `receipt-css` component classes (see [LLM-SITE.md](LLM-SITE.md)). Use `.form-row` and `.dropdown` for the test setup form, `receipt-css` button styles for answer options and navigation, and `.output-box` for feedback and results panels.

> **Session vs login:** Score and wrong-answer data for the current session are always stored in `sessionStorage`, enabling immediate retest for all users without requiring login. Persistent history (wrong-answer tracking, spaced repetition, test history) is saved to Firestore only when the user is logged in — see the Scoring & Progress section below.

> **Login-gated buttons:** Any button that requires login (e.g. "Load Historical Wrong Answers" on the retest page, future "Save Progress" actions) must follow the login-gated action pattern from [LLM-SITE.md § UI Patterns](LLM-SITE.md): always render the button, dim it when the user is logged out, show a tooltip on hover, and open the login modal on click. Do **not** hide these buttons from anonymous users. Use `data-auth-action="{action description}"` on the element.

### Question Display

```
┌──────────────────────────────────────┐
│  Question 3 of 15          [=====  ] │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Category: Safety                    │
│                                      │
│  What should you do before working   │
│  on an antenna installation?         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ A) Check the weather forecast  │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ B) Disconnect the power and    │  │
│  │    ensure it cannot be         │  │
│  │    reconnected                 │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ C) Notify your neighbours     │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ D) Wear sunglasses            │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Feedback Display (Practice Mode)

After selecting an answer:

**Correct:**
```
┌──────────────────────────────────────┐
│  ✅ Correct!                         │
│                                      │
│  B) Disconnect the power and ensure  │
│  it cannot be reconnected            │
│                                      │
│  Before working on any antenna or    │
│  feeder system, you must disconnect  │
│  the power supply and ensure it      │
│  cannot be accidentally reconnected. │
│  This is a fundamental safety        │
│  practice.                           │
│                                      │
│           [Next Question →]          │
└──────────────────────────────────────┘
```

**Incorrect:**
```
┌──────────────────────────────────────┐
│  ❌ Incorrect                        │
│                                      │
│  You selected: A) Check the weather  │
│  forecast                            │
│                                      │
│  While checking weather is sensible, │
│  it is not the primary safety step.  │
│                                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                      │
│  ✅ Correct answer:                  │
│  B) Disconnect the power and ensure  │
│  it cannot be reconnected            │
│                                      │
│  Before working on any antenna or    │
│  feeder system, you must disconnect  │
│  the power supply and ensure it      │
│  cannot be accidentally reconnected. │
│                                      │
│           [Next Question →]          │
└──────────────────────────────────────┘
```

### Results Summary

```
┌──────────────────────────────────────┐
│  ━━━ Test Complete ━━━               │
│                                      │
│  Score: 12 / 15 (80%)               │
│                                      │
│  ✅ Correct:  12                     │
│  ❌ Incorrect: 3                     │
│                                      │
│  Breakdown by Category:              │
│  • Safety: 3/3 ✅                    │
│  • Propagation: 2/3                  │
│  • Technical Basics: 4/5            │
│  • Operating Practices: 3/4         │
│                                      │
│  💡 Consider revising: Propagation   │
│                                      │
│  [Retest Wrong Answers]              │
│  [New Test]                          │
│  [Back to Menu]                      │
└──────────────────────────────────────┘
```

---

## Scoring & Progress System

### Session-Level (No Login Required)

- Score is calculated and displayed at end of test
- Wrong answers stored in `sessionStorage` for immediate retest
- No persistence between browser sessions

### User-Level (Logged In) — see [LLM-FIREBASE.md](LLM-FIREBASE.md)

Wrong answers and test history are saved to Firestore.

#### Firestore Schema: Test Results

```json
{
  "user_id": "firebase_uid",
  "test_type": "practice",
  "date": "2026-03-29T14:30:00Z",
  "total_questions": 15,
  "correct_count": 12,
  "score_percentage": 80,
  "categories": {
    "safety": { "correct": 3, "total": 3 },
    "propagation": { "correct": 2, "total": 3 },
    "technical-basics": { "correct": 4, "total": 5 },
    "operating-practices": { "correct": 3, "total": 4 }
  },
  "wrong_answers": ["SF-003", "PR-007", "TB-012"]
}
```

#### Firestore Schema: Wrong Answer Tracking

```json
{
  "user_id": "firebase_uid",
  "question_id": "PR-007",
  "times_wrong": 3,
  "times_correct": 1,
  "last_wrong": "2026-03-29T14:30:00Z",
  "last_correct": "2026-03-28T10:15:00Z",
  "wrong_ratio": 0.75
}
```

---

## Spaced Repetition System (Planned)

For logged-in users, a **dynamic retest quiz** adapts question frequency based on historical performance.

### How It Works

1. Each question has a **weight** based on the user's history:
   - **Never attempted**: weight = 1.0 (neutral)
   - **Wrong frequently**: weight increases (shown more often)
   - **Always correct**: weight decreases (shown less often)
   
2. Weight formula:
   ```
   weight = base_weight + (times_wrong * 0.5) - (times_correct * 0.2)
   minimum weight = 0.1 (never fully removed)
   ```

3. When building a test, questions are selected using **weighted random sampling**:
   - Higher weight = higher chance of appearing
   - Guarantees coverage by ensuring minimum representation from each category

4. After answering, weights are updated immediately in Firestore

### Spaced Repetition Quiz (`/test/smart-review`)

- Available only to logged-in users with history
- Selects questions using weighted sampling
- Uses Practice Mode format (immediate feedback)
- Shows how many times the user has seen each question and their success rate
- Dashboard shows per-category strength chart

---

## Mock Exam Details

### Real Exam Simulation

The UK Foundation Licence exam has:
- **26 questions** (multiple choice, A–D)
- **55 minutes** allowed (we use 30 minutes for the online version as there's no need to read through a physical paper)
- **Pass mark**: 19 out of 26 (73%)

### Timer Behaviour

```
┌──────────────────────────────────────┐
│  Mock Exam        ⏱️ 24:31 remaining │
│  Question 8 of 26                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
```

- Timer is always visible at the top
- At **5 minutes remaining**: timer turns bold/highlighted
- At **1 minute remaining**: timer pulses
- At **0:00**: Test auto-submits with whatever answers have been provided
- Unanswered questions count as incorrect

### Mock Exam Results

Same as practice results summary, but additionally shows:
- ✅ **PASS** or ❌ **FAIL** prominently
- Score relative to pass mark (e.g., "You needed 19 — you got 22")
- Time taken vs time allowed

---

## JavaScript Implementation

### Core Module: `test.js`

```javascript
// Key responsibilities:
// - Load questions from /data/questions/*.json
// - Shuffle and select questions based on mode and filters
// - Render questions and handle answer selection
// - Track correct/incorrect within session
// - Calculate and display results
// - Interface with Firebase for logged-in users (via auth.js)

const TestEngine = {
  questions: [],          // Loaded question pool
  currentTest: [],        // Questions for this test session
  currentIndex: 0,        // Current question position
  answers: {},            // { questionId: selectedKey }
  mode: 'practice',       // 'practice' | 'mock' | 'retest'
  timer: null,            // Mock exam timer reference

  async loadQuestions(categories = null) { /* ... */ },
  startTest(mode, numQuestions, categories) { /* ... */ },
  renderQuestion(index) { /* ... */ },
  submitAnswer(questionId, selectedKey) { /* ... */ },
  showFeedback(questionId, selectedKey, isCorrect) { /* ... */ },
  nextQuestion() { /* ... */ },
  calculateResults() { /* ... */ },
  renderResults(results) { /* ... */ },
  saveResults(results) { /* ... */ },   // Firebase save
  getWrongAnswers() { /* ... */ },
  startRetest(questionIds) { /* ... */ },

  // Timer (mock mode)
  startTimer(minutes) { /* ... */ },
  updateTimerDisplay(remaining) { /* ... */ },
  onTimerExpired() { /* ... */ },

  // Spaced repetition
  async getWeightedQuestions(numQuestions) { /* ... */ },
  async updateQuestionWeight(questionId, wasCorrect) { /* ... */ },
};
```

### Question Shuffling

- Questions within a test are shuffled randomly
- Answer options within each question are **also shuffled** (the `correct` key follows the option, so shuffling is safe)
- For mock exams, a consistent seed based on the session start time can be used for reproducibility if needed

---

## Adding New Questions

### Guidelines for Question Authors

1. Follow the JSON schema exactly
2. Every question **must** have a `reason` explaining the correct answer
3. `reason_if_wrong` on options is optional but encouraged — it helps learners understand why each wrong answer is wrong
4. Keep question text clear and unambiguous
5. Only one option should be clearly correct
6. Assign the correct `category` and `id` prefix
7. Use `difficulty` (1–3) if the difficulty is clear
8. Add relevant `tags` for future search/cross-referencing

### Validation

A JSON schema file (`/data/questions/schema.json`) is provided for validation:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "category", "question", "options", "correct", "reason"],
    "properties": {
      "id": { "type": "string", "pattern": "^[A-Z]{2}-\\d{3}$" },
      "category": { "type": "string" },
      "subcategory": { "type": "string" },
      "question": { "type": "string", "minLength": 10 },
      "options": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["key", "text"],
          "properties": {
            "key": { "type": "string", "enum": ["A", "B", "C", "D"] },
            "text": { "type": "string" },
            "reason_if_wrong": { "type": "string" }
          }
        },
        "minItems": 4,
        "maxItems": 4
      },
      "correct": { "type": "string", "enum": ["A", "B", "C", "D"] },
      "reason": { "type": "string", "minLength": 10 },
      "difficulty": { "type": "integer", "minimum": 1, "maximum": 3 },
      "tags": { "type": "array", "items": { "type": "string" } }
    }
  }
}
```

Run validation locally:
```bash
npx ajv validate -s data/questions/schema.json -d "data/questions/*.json"
```

---

## Future Enhancements

- **Question bank expansion**: Add Intermediate and Full licence questions
- **Community-contributed questions**: Allow logged-in users to submit questions for review
- **Leaderboard**: Anonymous or named leaderboard for mock exam scores
- **Streak tracking**: Daily study streaks with visual indicators
- **Export results**: Download test results as PDF for study records
