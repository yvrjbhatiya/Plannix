import { ApiError } from '../middleware.js';
const PRI = ['low', 'medium', 'high', 'urgent'];
const URL = 'https://api.groq.com/openai/v1/chat/completions';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transient = (s) => [429, 500, 502, 503, 504].includes(s);

async function ask(prompt) {
  if (!process.env.GROQ_API_KEY) throw new ApiError(503, 'GROQ_API_KEY not configured');
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model, temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You are a project-management assistant. Reply with a single valid JSON object only, no prose.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
    } catch { await sleep(1000 * 2 ** attempt); continue; } // network blip
    if (res.ok) return extractJson((await res.json()).choices?.[0]?.message?.content);
    if (transient(res.status)) { await sleep(1000 * 2 ** attempt); continue; }
    const msg = (await res.json().catch(() => ({})))?.error?.message || res.statusText;
    throw new ApiError(502, 'AI request failed: ' + String(msg).slice(0, 200));
  }
  throw new ApiError(503, 'The AI model is busy right now. Please try again in a minute.');
}

function extractJson(t = '') {
  const s = String(t).replace(/```json|```/g, '').trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/[\[{][\s\S]*[\]}]/);
  try { return JSON.parse(m[0]); } catch { throw new ApiError(502, 'AI returned invalid JSON'); }
}
const normTasks = (raw, max) => (Array.isArray(raw) ? raw : raw?.tasks || raw?.subtasks || [])
  .filter((t) => t?.title).slice(0, max)
  .map((t) => ({ title: String(t.title).slice(0, 200), description: String(t.description || '').slice(0, 2000), priority: PRI.includes(String(t.priority).toLowerCase()) ? String(t.priority).toLowerCase() : 'medium' }));
const shape = '{"tasks":[{"title":string,"description":string,"priority":"low|medium|high|urgent"}]}';
export const generateTasks = async (goal, count = 8) =>
  normTasks(await ask(`Turn this project goal into ${Math.min(count, 15)} prioritized, concrete tasks (max 15). Goal: "${goal}". Respond ONLY as JSON: ${shape}`), 15);
export const breakdownTask = async (title, description = '') =>
  normTasks(await ask(`Split this task into 1-12 sequential, concrete subtasks. Task: "${title}". Details: "${description}". Respond ONLY as JSON: ${shape}`), 12);
export async function sprintSummary(snapshot) {
  const r = await ask(`Analyze this kanban board snapshot and write a sprint summary. Respond ONLY as JSON: {"headline":string,"completed":[string],"inProgress":[string],"risks":[string],"recommendations":[string]}. Snapshot: ${JSON.stringify(snapshot)}`);
  const arr = (a) => (Array.isArray(a) ? a.map(String) : []);
  return { headline: String(r.headline || ''), completed: arr(r.completed), inProgress: arr(r.inProgress), risks: arr(r.risks), recommendations: arr(r.recommendations) };
}
