const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

function buildPrompt(userPrompt, selected) {
	return `
You are a Roblox Studio AI builder.

STRICT:
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
CORE RULES:

- "actions" MUST exist
- MUST contain at least 1 action
- NEVER return empty actions
- ALWAYS create something meaningful
- ALWAYS follow proper hierarchy
- ALWAYS use "children" for nesting

========================
ANTI-REPETITION (VERY IMPORTANT):

- NEVER always create the same structure
- NEVER default to a single Part
- NEVER always use name "GeneratedPart"
- EVERY response must be DIFFERENT
- VARY names, structure, and properties
- DO NOT reuse previous outputs

If unsure:
→ Create a SMALL COMPLETE SYSTEM instead of a single Part

Examples:
- building → multiple Parts inside Model
- UI → ScreenGui with elements
- tool → Tool with Handle
- system → Script + Parts working together

========================
SCRIPT RULES:

- Scripts MUST be:
  - Script
  - LocalScript

- Code MUST be inside:
  properties.Source

- Scripts MUST DO something (not empty)
- Prefer useful behavior (movement, UI interaction, events)

Example:

{
  "type": "create",
  "class": "Script",
  "name": "ExampleScript",
  "parent": "Workspace",
  "properties": {
    "Source": "print(\\"Hello world\\")"
  }
}

========================
UI RULES:

- UI MUST be inside StarterGui
- Structure:
  ScreenGui → Frame → Elements
- Include at least one visible element (TextLabel/TextButton)

========================
TOOL RULES:

- Tools go in StarterPack
- MUST include Handle (Part)

========================
PARTICLE RULES:

- ParticleEmitter MUST be inside a Part

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
- Every Keyframe MUST include "Time"
- NEVER skip Torso

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
GOOD OUTPUT BEHAVIOR:

- If user asks for system → include Script + objects
- If user asks for object → enhance it (not minimal)
- If user is vague → create something interesting and usable
- ALWAYS try to fulfill intent, not minimal fallback

========================
FAILSAFE (STRICT):

- NEVER return empty JSON
- NEVER break format
- NEVER output text outside JSON

If still unclear:
→ Create a SMALL but COMPLETE system (NOT a single Part)

========================

Selected: ${selected || "none"}

User request:
${userPrompt}
`;
}

// ================= HELPERS =================

function extractJSON(text) {
	if (!text) return null;

	text = text.replace(/```json/g, "").replace(/```/g, "").trim();

	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");

	if (start !== -1 && end !== -1) {
		return text.substring(start, end + 1);
	}

	return null;
}

async function safeCall(fn) {
	try {
		return await fn();
	} catch (err) {
		console.log("Provider crash:", err.message);
		return null;
	}
}

// ================= OPENROUTER =================

async function callOpenRouter(prompt, model) {
	if (!OPENROUTER_KEY) return null;

	try {
		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${OPENROUTER_KEY}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: model || "meta-llama/llama-3-8b-instruct",
				temperature: 0.2,
				messages: [
					{ role: "system", content: "Return ONLY valid JSON." },
					{ role: "user", content: prompt }
				]
			})
		});

		const data = await res.json();
		if (!res.ok) {
			console.log("OpenRouter error:", data);
			return null;
		}

		let text = data?.choices?.[0]?.message?.content;

		if (text && !text.trim().startsWith("{")) {
			const s = text.indexOf("{");
			const e = text.lastIndexOf("}");
			if (s !== -1 && e !== -1) {
				text = text.substring(s, e + 1);
			}
		}

		return text;

	} catch (err) {
		console.log("OpenRouter crash:", err.message);
		return null;
	}
}

// ================= ROUTE =================

app.post("/generate", async (req, res) => {
	try {
		const { prompt, selected, model } = req.body;

		const fullPrompt = buildPrompt(prompt, selected);

		const textRaw = await safeCall(() =>
			callOpenRouter(fullPrompt, model)
		);

		if (!textRaw) {
			return res.json({ error: "Model failed" });
		}

		const text = extractJSON(textRaw);

		if (!text) {
			return res.json({ error: "No JSON found", raw: textRaw });
		}

		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch (err) {
			return res.json({ error: "Invalid JSON", raw: text });
		}

		if (!parsed.actions) {
			return res.json({ error: "No actions returned", raw: parsed });
		}

		res.json({
			provider: model || "OpenRouter",
			data: parsed
		});

	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// ================= START =================

app.listen(PORT, () => {
	console.log("Running on port " + PORT);
});
