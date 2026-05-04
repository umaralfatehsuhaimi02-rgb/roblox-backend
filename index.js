const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

let lastCall = 0;

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
- ALWAYS return at least 1 action
- If unsure → create a simple Part
- ALWAYS use valid Roblox class names
- ALWAYS use proper hierarchy
- ALWAYS use "children" for nesting
- NEVER place children outside "children"

========================
SCRIPT RULES:

- Scripts MUST be:
  - Script
  - LocalScript

- Code MUST be inside:
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
- Use structure:
  ScreenGui → Frame → TextLabel / TextButton

========================
TOOL RULES:

- Tools go in StarterPack
- Tool MUST contain:
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
- Every Keyframe MUST include "Time"
- HumanoidRootPart MUST contain Torso
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
VALID ANIMATION EXAMPLE:

{
  "actions": [
    {
      "type": "create",
      "class": "KeyframeSequence",
      "name": "ExampleAnimation",
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
EXAMPLE (SCRIPT):

{
  "actions": [
    {
      "type": "create",
      "class": "Script",
      "name": "PrintScript",
      "parent": "Workspace",
      "properties": {
        "Source": "print(\\"Hello from AI\\")"
      }
    }
  ]
}

========================
EXAMPLE (UI):

{
  "actions": [
    {
      "type": "create",
      "class": "ScreenGui",
      "name": "MyUI",
      "parent": "StarterGui",
      "children": [
        {
          "class": "Frame",
          "name": "MainFrame",
          "children": [
            {
              "class": "TextLabel",
              "name": "Label",
              "properties": {
                "Text": "Hello UI"
              }
            }
          ]
        }
      ]
    }
  ]
}

========================
FAILSAFE:

- If request is unclear → create:
  Part named "GeneratedPart" in Workspace
- NEVER return empty JSON
- NEVER break format

========================

Selected: ${selected || "none"}

User request:
${userPrompt}
`;
}


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

// ================= PROVIDERS =================

async function callGroq(prompt) {
	if (!GROQ_KEY) return null;

	try {
		const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${GROQ_KEY}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: "llama3-8b-8192",
				temperature: 0.2,
				messages: [
					{ role: "system", content: "Return ONLY valid JSON." },
					{ role: "user", content: prompt }
				]
			})
		});

		const data = await res.json();
		if (!res.ok) return null;

		let text = data?.choices?.[0]?.message?.content;

		if (text && !text.trim().startsWith("{")) {
			const s = text.indexOf("{");
			const e = text.lastIndexOf("}");
			if (s !== -1 && e !== -1) text = text.substring(s, e + 1);
		}

		return text;
	} catch {
		return null;
	}
}

async function callOpenRouter(prompt) {
	if (!OPENROUTER_KEY) return null;

	try {
		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${OPENROUTER_KEY}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: "deepseek/deepseek-chat",
				temperature: 0.2,
				messages: [
					{ role: "system", content: "Return ONLY valid JSON." },
					{ role: "user", content: prompt }
				]
			})
		});

		const data = await res.json();
		if (!res.ok) return null;

		let text = data?.choices?.[0]?.message?.content;

		if (text && !text.trim().startsWith("{")) {
			const s = text.indexOf("{");
			const e = text.lastIndexOf("}");
			if (s !== -1 && e !== -1) text = text.substring(s, e + 1);
		}

		return text;
	} catch {
		return null;
	}
}

async function callGemini(prompt) {
	if (!GEMINI_KEY) return null;

	try {
		const res = await fetch(
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
		if (!res.ok) return null;

		return data?.candidates?.[0]?.content?.parts?.[0]?.text;
	} catch {
		return null;
	}
}

// ================= ROUTE =================

app.post("/generate", async (req, res) => {
	try {
		const { prompt, selected, model } = req.body;

		const fullPrompt = prompt;

		let text = await callOpenRouter(fullPrompt, model);

		if (!text) return res.json({ error = "Model failed" });

		text = text.replace(/```json/g,"").replace(/```/g,"").trim();

		local s = text:find("{")
		local e = text:match(".*()}")

		if (s and e) then
			text = text:sub(s, e)
		end

		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch {
			return res.json({ error: "Invalid JSON", raw: text });
		}

		res.json({
			provider: model,
			data: parsed
		});

	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});
app.listen(PORT, () => {
	console.log("Running on port " + PORT);
});

