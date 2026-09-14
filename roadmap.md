# Sarathi AI Tutor — roadmap

## Real tutor backend + frontend integration (in progress)
- [ ] Server tutor engine: intent detection, concept selection, mastery eval, teaching strategy, LLM call
- [ ] `POST /api/tutor/chat` as the authoritative tutor endpoint (advance/previous handled server-side)
- [ ] Server-side conversation history + student learning state (in-memory now, DB later)
- [ ] "Build GPT-2 from Scratch with PyTorch" course alongside existing demo courses
- [ ] Centralized typed service layer under `src/services/`
- [ ] Lesson page: tutor conversation + concept/mastery/objectives sidebar driven by backend state
- [ ] Rich rendering: markdown, headings, lists, code + highlighting, math, mermaid, quizzes
- [ ] Admin AI Settings page (provider, model, temperature, max tokens, status, test connection) — key stays server-side
- [ ] Quiz + code-exercise service interfaces prepared (no fake engines)
- [ ] Error handling: unavailable / rate limit / bad key / timeout, friendly messages, no fallback to fake AI

## Blocked
- [ ] Real Groq API key (`GROQ_API_KEY`) must be supplied by the user for live tutor responses
