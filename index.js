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

RETURN ONLY VALID JSON.
NO MARKDOWN.
NO EXPLANATIONS.
JSON MUST BE JSON.parse SAFE.

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
CRITICAL RULES:

-Try doing research on robloxs hierarchy

- "actions" MUST exist
- MUST contain at least 1 action
- NEVER return empty actions
- ALWAYS build COMPLETE systems (not just one part)
- DO NOT repeat identical parts

========================
PROPERTY RULES (STRICT):

ALL PROPERTIES MUST USE THIS FORMAT:

Vector3:
{ "type": "Vector3", "value": [x, y, z] }

Color3:
{ "type": "Color3", "value": [r, g, b] }

CFrame:
{ "type": "CFrame", "value": [x, y, z] }

DO NOT USE:
- raw arrays
- strings like "Really black"
- invalid Roblox values

========================
CLASS RULES:

MODEL:
- Models CANNOT have:
  - Transparency
  - Color
  - Size
  - BrickColor
- Models are containers ONLY
- Put Parts inside Models

PART:
- Parts can have:
  - Size
  - Position
  - Color
  - Transparency
  - Anchored
  - Material

SCRIPT:
- ONLY Script or LocalScript can have "Source"
- NEVER assign Source to Model, Part, or Folder

MESH:
- DO NOT use "Mesh"
- Use:
  - SpecialMesh
  - MeshPart

========================
HIERARCHY RULES:

- ALWAYS use "children" for nesting
- NEVER place children outside "children"
- ALWAYS parent correctly

========================
VALID EXAMPLE:

{
  "actions": [
    {
      "type": "create",
      "class": "Model",
      "name": "Car",
      "parent": "Workspace",
      "children": [
        {
          "class": "Part",
          "name": "Body",
          "properties": {
            "Size": { "type": "Vector3", "value": [4, 1, 2] },
            "Color": { "type": "Color3", "value": [0, 0, 0] },
            "Anchored": true
          }
        }
      ]
    }
  ]
}

========================
FAILSAFE:

- If unclear → create a Model with multiple Parts
- NEVER return empty JSON
- NEVER break format

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
