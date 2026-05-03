const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

function buildPrompt(userPrompt, selected) {
	return `
You are a Roblox Studio AI builder.

STRICT RULES:
- RETURN ONLY VALID JSON
- NO MARKDOWN
- NO EXPLANATIONS
- NO TEXT OUTSIDE JSON
- MUST BE JSON.parse SAFE

========================
FORMAT:

{
  "actions": [
    {
      "type": "create | set | delete",
      "class": "Instance class name",
      "name": "object name",
      "parent": "Workspace | StarterGui | StarterPack | ReplicatedStorage",
      "target": "optional path",
      "properties": {},
      "children": []
    }
  ]
}

========================
CRITICAL GLOBAL RULES:

- "actions" MUST ALWAYS EXIST
- NEVER return empty actions
- If unsure → create a simple Part in Workspace
- ALWAYS use valid Roblox class names
- ALWAYS use correct hierarchy
- ALWAYS use "children" for nesting
- NEVER place children outside of "children" array

========================
SCRIPT RULES:

- Scripts MUST use:
  - Script
  - LocalScript
- Code goes inside:
  properties.Source

Example:

{
  "type": "create",
  "class": "Script",
  "name": "MyScript",
  "parent": "Workspace",
  "properties": {
    "Source": "print(\\"Hello world\\")"
  }
}

========================
UI RULES:

- UI must be inside StarterGui
- Use:
  ScreenGui → Frame → TextLabel / TextButton

========================
TOOL RULES:

- Tools go in StarterPack
- Tool must contain:
  - Handle (Part)

========================
PARTICLE RULES:

- Use ParticleEmitter inside a Part

========================
ANIMATION RULES (R6 ONLY):

If user asks for R15:
RETURN:
{ "error": "Only R6 animations are supported" }

STRUCTURE MUST BE EXACT:

KeyframeSequence
 └ Keyframe (Time REQUIRED)
    └ Pose "HumanoidRootPart"
       └ Pose "Torso" (MANDATORY)
          ├ Pose "Left Arm"
          ├ Pose "Right Arm"
          ├ Pose "Left Leg"
          └ Pose "Right Leg"

CRITICAL:

- Torso MUST ALWAYS exist
- Limbs MUST be inside Torso
- Minimum 2 Keyframes REQUIRED
- Every Keyframe MUST have "Time"

========================
EASING RULES:

- ONLY apply to Pose
- NEVER apply to Keyframe

EasingDirection:
"In", "Out", "InOut", "OutIn"

EasingStyle:
"Linear", "Bounce", "Elastic", "Cubic"

========================
TRANSFORMS:

- Position: [x, y, z]
- Orientation: [x, y, z]

========================
VALID ANIMATION EXAMPLE:

{
  "actions": [
    {
      "type": "create",
      "class": "KeyframeSequence",
      "name": "ExampleAnim",
      "parent": "Workspace",
      "children": [
        {
          "class": "Keyframe",
          "name": "Start",
          "properties": { "Time": 0 },
          "children": [
            {
              "class": "Pose",
              "name": "HumanoidRootPart",
              "children": [
                {
                  "class": "Pose",
                  "name": "Torso",
                  "children": [
                    { "class": "Pose", "name": "Left Arm" },
                    { "class": "Pose", "name": "Right Arm" },
                    { "class": "Pose", "name": "Left Leg" },
                    { "class": "Pose", "name": "Right Leg" }
                  ]
                }
              ]
            }
          ]
        },
        {
          "class": "Keyframe",
          "name": "End",
          "properties": { "Time": 1 },
          "children": [
            {
              "class": "Pose",
              "name": "HumanoidRootPart",
              "children": [
                {
                  "class": "Pose",
                  "name": "Torso",
                  "children": [
                    { "class": "Pose", "name": "Left Arm" },
                    { "class": "Pose", "name": "Right Arm" },
                    { "class": "Pose", "name": "Left Leg" },
                    { "class": "Pose", "name": "Right Leg" }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

========================
FAILSAFE:

- If request is unclear → create a Part named "GeneratedPart"
- NEVER return empty or invalid JSON

========================

Selected: ${selected || "none"}

User request:
${userPrompt}
`;
}

let memory = [];
let lastCall = 0;

function extractJSON(text) {
	if (!text) return null;
	text = text.replace(/```json/g, "").replace(/```/g, "").trim();
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start !== -1 && end !== -1) {
		return text.substring(start, end + 1);
	}
	return text;
}

function fetchWithTimeout(url, options, timeout = 15000) {
	return Promise.race([
		fetch(url, options),
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Timeout")), timeout)
		)
	]);
}

async function callGemini(prompt) {
	try {
		const res = await fetchWithTimeout(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-goog-api-key": GEMINI_KEY
				},
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }]
				})
			}
		);

		const data = await res.json();

		if (!res.ok) {
			console.log("Gemini error:", data);
			return null;
		}

		const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

		console.log("Gemini:", text);

		return text;
	} catch (err) {
		console.log("Gemini crash:", err.message);
		return null;
	}
}

async function callOpenRouter(prompt) {
	try {
		const res = await fetchWithTimeout(
			"https://openrouter.ai/api/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${OPENROUTER_KEY}`,
					"Content-Type": "application/json",
					"HTTP-Referer": "https://roblox-backend-plugin.onrender.com",
					"X-Title": "Roblox AI Builder"
				},
				body: JSON.stringify({
					model: "mistralai/mistral-7b-instruct",
					messages: [
						{ role: "system", content: "Return ONLY valid JSON." },
						{ role: "user", content: prompt }
					]
				})
			}
		);

		const data = await res.json();

		if (!res.ok) {
			console.log("OpenRouter error:", data);
			return null;
		}

		const text = data?.choices?.[0]?.message?.content;

		console.log("OpenRouter:", text);

		return text;
	} catch (err) {
		console.log("OpenRouter crash:", err.message);
		return null;
	}
}

app.get("/", (req, res) => {
	res.send("OK");
});

app.post("/generate", async (req, res) => {
	try {
		const now = Date.now();
		if (now - lastCall < 500) {
			return res.json({ error: "Rate limited" });
		}
		lastCall = now;

		const { prompt, selected } = req.body;

		const fullPrompt = buildPrompt(prompt, selected);

		let text = await callGemini(fullPrompt);

		if (!text || text.length < 10) {
			console.log("Fallback to OpenRouter");
			text = await callOpenRouter(fullPrompt);
		}

		if (!text) {
			return res.json({ error: "All models failed" });
		}

		text = extractJSON(text);

		let parsed;

		try {
			parsed = JSON.parse(text);
		} catch {
			console.log("INVALID JSON:", text);
			return res.json({ error: "Invalid JSON", raw: text });
		}

		if (!parsed.actions) {
			console.log("Retrying with OpenRouter (no actions)");

			let retry = await callOpenRouter(fullPrompt);

			if (retry) {
				retry = extractJSON(retry);
				try {
					parsed = JSON.parse(retry);
				} catch {}
			}
		}

		if (!parsed.actions) {
			return res.json({ error: "No actions returned", raw: parsed });
		}

		res.json(parsed);

	} catch (err) {
		console.log("SERVER ERROR:", err.message);
		res.status(500).json({ error: err.message });
	}
});

app.post("/feedback", (req, res) => {
	const { rating, prompt, result } = req.body;

	if (rating === "good") {
		memory.push({ prompt, result });
		if (memory.length > 50) memory.shift();
	}

	res.json({ ok: true });
});

app.listen(PORT, () => {
	console.log("Running on port " + PORT);
});
