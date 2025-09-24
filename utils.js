/**
 * Tries to parse a JSON object from a string.
 * It can handle JSON wrapped in markdown code blocks (```json ... ```).
 * @param {string} text The string to parse.
 * @returns {object|null} The parsed object or null if parsing fails.
 */
export function tryParseJson(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }
    // Find the first '{' and the last '}' to extract the JSON object.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        return null;
    }
    const snippet = text.substring(start, end + 1);
    try {
        return JSON.parse(snippet);
    } catch (error) {
        // Fallback for cases where the snippet might still have issues.
        console.error("Failed to parse JSON snippet:", error);
        return null;
    }
}

/**
 * Gets an object from the extension's local storage.
 * @param {string} key The key for the stored object.
 * @returns {Promise<any|null>} A promise that resolves to the stored object, or null if not found.
 */
export async function simpleCacheGet(key) {
    try {
        const result = await chrome.storage.local.get(key);
        return result[key] || null;
    } catch (error) {
        console.error(`Error getting item ${key} from cache:`, error);
        return null;
    }
}

/**
 * Saves an object to the extension's local storage.
 * @param {string} key The key for the object to store.
 * @param {any} obj The object to store.
 * @returns {Promise<void>}
 */
export async function simpleCacheSet(key, obj) {
    try {
        await chrome.storage.local.set({ [key]: obj });
    } catch (error) {
        console.error(`Error setting item ${key} in cache:`, error);
    }
}
