# Auto-AI Ultra Human Mode

This document describes the production implementation of Auto-AI's adaptive conversation layer. The goal is to make conversations feel emotionally aware, context-aware, and personalized while preserving explicit safety boundaries: Auto-AI must not claim to be human, hide that it is an AI, or become abusive.

## Runtime Flow

1. The authenticated user sends a message to `/api/v1/ai/chat` or `/api/v1/ai/chat/stream`.
2. The metacognition layer analyzes the incoming text and recent chat history.
3. The memory engine retrieves relevant user-owned memories.
4. The personality and style engines choose the best response posture.
5. The humanization layer builds a quiet system context for Groq.
6. The Groq chat completion runs with the base safety prompt, adaptive context, document context, chat history, and user message.
7. The assistant message is stored.
8. The interaction profile, extracted memories, and turn analysis are persisted.

## Modules

| Module | File | Responsibility |
| --- | --- | --- |
| Emotion Detection Engine | `backend/app/services/human/emotion_detection.py` | Classifies happiness, sadness, frustration, anger, stress, anxiety, excitement, motivation, curiosity, and confidence. |
| Tone Analysis Engine | `backend/app/services/human/tone_analysis.py` | Detects language style, Hinglish/Hindi/English mix, formality, energy, humor, punctuation habits, and technical density. |
| Emotional State Manager | `backend/app/services/human/emotional_state.py` | Owns trust, rapport, respect, curiosity, confidence, frustration, and humor scores. |
| Style Mirroring Engine | `backend/app/services/human/style_mirroring.py` | Converts tone and emotion signals into safe style directives. |
| Long-Term Memory Engine | `backend/app/services/human/memory_service.py` | Extracts, stores, retrieves, updates, and deletes user-owned memory facts. |
| Personality Adaptation Engine | `backend/app/services/human/personality.py` | Chooses a mentor, engineer, researcher, friend, teacher, strategist, and creative-thinker blend. |
| Relationship Engine | `backend/app/services/human/relationship.py` | Updates topics, current projects, long-term objectives, and learning-style hints. |
| Conversation Manager | `backend/app/services/human/conversation_manager.py` | Detects intent, repeated messages, circular patterns, identity probes, memory requests, urgency, and contradiction signals. |
| Humanization Layer | `backend/app/services/human/humanization.py` | Builds the compact adaptive context passed to the model. |
| Metacognition Layer | `backend/app/services/human/metacognition.py` | Orchestrates all engines before and after each assistant turn. |
| Prompt Contract | `backend/app/services/human/prompts.py` | Defines the base Auto-AI system prompt and safety boundaries. |

## Database Schema

### `user_interaction_profiles`

One row per user. This stores long-lived adaptive state.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(36)` | Primary key UUID. |
| `user_id` | `String(36)` | Unique FK to `users.id`. |
| `trust_score` | `Integer` | 0 to 100. Default 50. |
| `rapport_score` | `Integer` | 0 to 100. Default 40. |
| `respect_score` | `Integer` | 0 to 100. Default 70. |
| `curiosity_score` | `Integer` | 0 to 100. Default 50. |
| `confidence_score` | `Integer` | 0 to 100. Default 60. |
| `frustration_score` | `Integer` | 0 to 100. Default 10. |
| `humor_score` | `Integer` | 0 to 100. Default 30. |
| `communication_style` | `JSON` | Last observed language, formality, energy, length, humor, and technical density. |
| `personality_blend` | `JSON` | Last selected personality blend and directives. |
| `favorite_topics` | `JSON` | Topic hints and explicit liked topics. |
| `current_projects` | `JSON` | Extracted project context. |
| `long_term_objectives` | `JSON` | Goals and learning objectives. |
| `learning_style` | `String(80)` | Optional style such as `step_by_step`, `code_first`, `example_driven`, or `deep_dive`. |
| `first_interaction_at` | `DateTime` | First profile creation time. |
| `last_interaction_at` | `DateTime` | Last adaptive update time. |
| `created_at` | `DateTime` | Row creation time. |
| `updated_at` | `DateTime` | Row update time. |

### `user_memories`

User-owned long-term memory facts. The user can inspect, add, update, and delete these.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(36)` | Primary key UUID. |
| `user_id` | `String(36)` | FK to `users.id`. |
| `category` | `String(80)` | Examples: `identity`, `communication_style`, `career_goal`, `project`, `favorite_topic`. |
| `key` | `String(160)` | Stable key inside a category. |
| `value` | `Text` | The remembered fact. |
| `source` | `String(80)` | `conversation` or `user`. |
| `confidence` | `Float` | 0 to 1. |
| `last_seen_at` | `DateTime` | Last observed or edited time. |
| `created_at` | `DateTime` | Row creation time. |
| `updated_at` | `DateTime` | Row update time. |

Unique constraint: `(user_id, category, key)`.

### `conversation_turn_analyses`

Per-turn observability for adaptive behavior.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(36)` | Primary key UUID. |
| `user_id` | `String(36)` | FK to `users.id`. |
| `chat_id` | `String(36)` | FK to `chats.id`. |
| `user_message_id` | `String(36)` | Optional FK to `messages.id`. |
| `assistant_message_id` | `String(36)` | Optional FK to `messages.id`. |
| `emotion` | `JSON` | Emotion result. |
| `tone` | `JSON` | Tone result. |
| `intent` | `String(120)` | Conversation intent. |
| `language` | `String(40)` | Detected language style. |
| `personality_mode` | `JSON` | Selected personality blend. |
| `state_delta` | `JSON` | Score movement for the turn. |
| `flags` | `JSON` | Repetition, circularity, urgency, identity probe, memory request, contradiction signal. |
| `created_at` | `DateTime` | Row creation time. |

## APIs

All endpoints require `Authorization: Bearer <jwt>`.

### Profile

`GET /api/v1/human/profile`

Returns the current `user_interaction_profiles` row, creating it if needed.

### State

`GET /api/v1/human/state`

Returns:

```json
{
  "profile": {},
  "memories": [],
  "recent_turns": []
}
```

### Memories

`GET /api/v1/human/memories`

Optional query:

```text
category=project
```

`POST /api/v1/human/memories`

```json
{
  "category": "communication_style",
  "key": "response_preference",
  "value": "prefers concise, code-first answers",
  "confidence": 0.9,
  "source": "user"
}
```

`PATCH /api/v1/human/memories/{memory_id}`

Updates any editable memory fields.

`DELETE /api/v1/human/memories/{memory_id}`

Deletes a user-owned memory.

### Turn Analysis

`GET /api/v1/human/turns`

Optional query:

```text
chat_id=<chat-id>&limit=50
```

## Prompt Design

The prompt has two layers:

1. Base safety and personality prompt from `AUTO_AI_HUMAN_MODE_PROMPT`.
2. Adaptive context generated per turn by `HumanizationLayer`.

The adaptive context is intentionally compact. It gives the model:

- Detected emotion and intensity.
- Tone and language style.
- Personality mode.
- Conversation intent.
- Relationship score snapshot and projected movement.
- Style directives.
- Relevant memory facts.
- Active conversation flags.

The model is instructed to use this context quietly and not narrate internal analysis unless the user asks.

## Memory Design

Memory extraction is local and conservative. The engine records patterns such as:

- `call me ...`
- `my name is ...`
- `I prefer ...`
- `my goal is ...`
- `I want to ...`
- `I'm learning ...`
- `I'm building ...`
- `my project is ...`
- `I like/love/enjoy ...`
- `remember that ...`

Memory retrieval is query-aware and ranks by token overlap, confidence, and category boost for identity and communication style.

## Production Notes

- The current implementation uses deterministic local heuristics. This keeps latency and Groq token cost stable.
- For higher recall, a future version can add an optional Groq-powered memory extractor behind a feature flag.
- All memory is scoped by `user_id`.
- Users can inspect and delete memory through `/api/v1/human/memories`.
- The adaptive layer never overrides safety boundaries.

