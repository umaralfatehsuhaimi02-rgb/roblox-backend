const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

function buildPrompt(userPrompt, selected, memory) {

	const examples = memory.slice(-5).map(e => `
User: ${e.prompt}
Output:
${JSON.stringify(e.result)}
`).join("\n");

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
      "type": "create | set | delete | rename",
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
PROPERTY RULES (VERY IMPORTANT):

- ALL complex values MUST use typed format:

Vector3:
{ "type": "Vector3", "value": [x, y, z] }

Color3:
{ "type": "Color3", "value": [r, g, b] }

CFrame:
{ "type": "CFrame", "value": [x, y, z] }

UDim2:
{ "type": "UDim2", "value": [sx, ox, sy, oy] }

Enum:
{ "type": "Enum", "value": ["EnumType", "Value"] }

BrickColor:
{ "type": "BrickColor", "value": "Bright red" }

========================
ASSET RULES:

- AnimationId, SoundId, TextureId MUST be STRING:
"rbxassetid://123456"

========================
CRITICAL RULES:

- "actions" MUST ALWAYS EXIST
- NEVER empty actions
- ALWAYS at least 1 action
- If unsure → create Part
- ALWAYS valid Roblox classes
- ALWAYS correct hierarchy

========================
EXAMPLES FROM MEMORY:
${examples}

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
					{
						role: "system",
						content: "You MUST follow all rules and return ONLY valid JSON."
					},
					{ role: "user", content: prompt }
				]
			})
		});

		const data = await res.json();
		if (!res.ok) {
			console.log("OpenRouter error:", data);
			return null;
		}

		return data?.choices?.[0]?.message?.content;

	} catch (err) {
		console.log("OpenRouter crash:", err);
		return null;
	}
}

// ================= ROUTE =================

let memory = [];

app.post("/feedback", (req, res) => {
	try {
		const { rating, prompt, result } = req.body;

		if (!rating || !prompt || !result) {
			return res.json({ error: "Missing fields" });
		}

		if (rating === "good") {
			memory.push({ prompt, result });

			if (memory.length > 50) {
				memory.shift();
			}
		}

		res.json({ ok: true });

	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

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
