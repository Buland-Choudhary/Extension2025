import { get_compare_system, get_compare_prompt, get_my_profile, sampleComparisonResult } from './prompts.js';
import { tryParseJson } from './utils.js';
import { USE_SAMPLE_DATA, OPENAI_API_KEY } from './config.js';

// IMPORTANT: Use the same API key as in extractor.js
const COMPARE_MODEL = "gpt-5-mini";

/**
 * Basic structural check for the comparison output.
 * @param {object} parsed The parsed JSON object from the LLM.
 * @returns {boolean} True if the structure is valid.
 */
function validateOutputStruct(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (!('overall_eligibility' in parsed) || !('fields' in parsed)) return false;
    return typeof parsed.fields === 'object';
}

/**
 * Calls the LLM comparator and returns the parsed JSON result.
 * @param {object} extracted_json The JSON object extracted from the job description.
 * @param {object} profile_json The user's profile JSON.
 * @param {number} max_retries The maximum number of times to retry the API call.
 * @returns {Promise<object>} A promise that resolves to an object containing the comparison result and usage stats.
 */
export async function compareJd(extracted_json, profile_json = null, max_retries = 1) {
    if (USE_SAMPLE_DATA) {
        console.log("USING SAMPLE COMPARISON DATA");
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
        return Promise.resolve({ data: sampleComparisonResult, usage: { total_tokens: 0 } });
    }

    if (!profile_json) {
        profile_json = get_my_profile();
    }

    const system = get_compare_system();
    const user = get_compare_prompt(extracted_json, profile_json);
    const messages = [{ role: "system", content: system }, { role: "user", content: user }];

    console.log("compareJd called", { model: COMPARE_MODEL });

    for (let attempt = 1; attempt <= max_retries; attempt++) {
        try {
            console.log(`Calling comparator LLM (attempt ${attempt})`);
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: COMPARE_MODEL,
                    messages: messages,
                    response_format: { "type": "json_object" }
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content;

            if (content) {
                const parsed = tryParseJson(content);
                if (validateOutputStruct(parsed)) {
                    console.log("Successfully parsed and validated comparison from LLM", parsed);
                    return { data: parsed, usage: data.usage };
                }
            }
            console.log("LLM returned no usable/valid JSON, will retry if attempts remain.");

        } catch (error) {
            console.error("Comparator LLM call exception:", error);
            if (attempt === max_retries) {
                // On final attempt, return a fallback object.
                const fallback = {
                    "overall_eligibility": "grey",
                    "summary_explanation": "Comparator failed to return a valid structured result.",
                    "fields": {}
                };
                return { data: fallback, usage: { total_tokens: 0 } };
            }
            await new Promise(resolve => setTimeout(resolve, 500)); // wait before retrying
        }
    }
}
