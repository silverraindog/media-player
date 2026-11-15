/**
 * media-player/src/utils/rateLimitHandler.ts
 * 
 * This module provides a wrapper function to safely call external APIs 
 * while automatically handling HTTP 429 (Too Many Requests) status codes 
 * and implementing exponential backoff and retries.
 */

/**
 * Fetches data from an API endpoint with built-in rate limiting and retry logic.
 * 
 * @param {() => Promise<Response>} apiCall - An asynchronous function that performs the actual API fetch. 
 *   NOTE: This function MUST return a Promise that resolves to a Fetch API Response object (e.g., Response).
 * @param {string} apiUrl - The full URL for the API call.
 * @param {number} maxRetries - Maximum number of retry attempts (default: 5).
 * @returns {Promise<Object>} The JSON parsed data object upon success.
 * @throws {Error} If the request fails after all retries or due to a non-recoverable error.
 */
export async function fetchWithRateLimitHandling(apiCall, apiUrl, maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Execute the API call provided by the caller
            const response = await apiCall();
            
            // Check if the response object was successfully received
            if (!response || typeof response.status === 'undefined') {
                throw new Error("API call failed to return a valid Response object.");
            }

            // 1. Success Check
            if (response.ok) {
                // Optionally, log headers like remaining calls here for advanced UI feedback
                return response.json();
            }

            // 2. Handle Rate Limiting (Status 429)
            if (response.status === 429) {
                let waitTimeSeconds;
                const retryAfterHeader = response.headers.get('Retry-After');
                
                // Determine wait time: prioritize explicit header, otherwise use exponential backoff
                if (retryAfterHeader) {
                    waitTimeSeconds = Math.max(parseInt(retryAfterHeader) * 1000, 1000);
                } else {
                    waitTimeSeconds = 5 * Math.pow(2, attempt); // Default exponential backoff (5s, 10s, 20s, ...)
                }

                console.warn(`[API Handler] Rate limit hit (429) for ${apiUrl}. Retrying in ${Math.ceil(waitTimeSeconds / 1000)} seconds.`);
                await new Promise(resolve => setTimeout(resolve, waitTimeSeconds));
                continue; // Go to next attempt
            } 
            
            // 3. Handle other client/server errors
            else if (response.status >= 400 && response.status < 500) {
                const errorText = await response.text();
                throw new Error(`Client API Error (${response.status}): ${errorText || 'Bad request.'}`);
            }

            // 4. Handle Server Errors (5xx)
            else if (response.status >= 500) {
                const errorText = await response.text();
                console.error(`[API Handler] Server Error (${response.status}): ${errorText}`);
                // For 5xx errors, we treat it as temporary and retry
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                    continue;
                }
                throw new Error(`API failed after multiple retries due to persistent server error (${response.status}).`);
            }
            
            // Fallthrough: Should not be reached if logic is correct
            throw new Error(`Unhandled API response status: ${response.status}`);

        } catch (error) {
            console.error("[API Handler] Network or execution error:", error.message);
            
            // Check if it was a network error (e.g., DNS failure, timeout)
            if (error.message.includes('fetch failed') || error.name === 'TypeError') {
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                    continue;
                }
            }
            
            // If it's a critical failure after retries or non-recoverable error
            throw new Error(`Failed to retrieve data from ${apiUrl} after ${maxRetries} attempts. Final error: ${error.message}`);
        }
    }
    throw new Error(`Exceeded maximum retry attempts (${maxRetries}) for ${apiUrl}.`);
}