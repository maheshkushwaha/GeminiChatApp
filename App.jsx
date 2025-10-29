import React, { useState, useCallback } from 'react';
import { Send, Loader2, Zap, ClipboardCopy, Link as LinkIcon } from 'lucide-react';

// --- API Configuration and Utility Functions ---

// NOTE: In this browser environment, we use a direct fetch call to the Gemini API
// endpoint instead of the @google/generative-ai SDK, as the SDK is typically
// intended for server-side or bundled environments.

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";

const useApiConfig = () => {
  // CRITICAL SECURITY NOTE: The API key MUST be an empty string for the platform
  // to securely inject the token via a fetch interceptor, preventing exposure.
  const apiKey = ""; 
  
  return { apiKey, apiUrl: `${GEMINI_API_URL}?key=${apiKey}` };
};

// Utility to copy text to clipboard
const copyToClipboard = (text) => {
    if (!navigator.clipboard) {
        // Fallback for environments where clipboard API is restricted (like iframes)
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";  // Avoid scrolling to bottom
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            alert("Response copied to clipboard!");
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            alert("Failed to copy. Please copy the text manually.");
        }
        document.body.removeChild(textArea);
    } else {
        navigator.clipboard.writeText(text).then(() => {
            alert("Response copied to clipboard!");
        }, (err) => {
            console.error('Async: Could not copy text: ', err);
            alert("Failed to copy using clipboard API. Please copy the text manually.");
        });
    }
};

// --- Main Application Component ---

const App = () => {
  const { apiUrl } = useApiConfig();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerateContent = useCallback(async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResponse(null);

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        // Enabling Google Search grounding for fresh, relevant results
        tools: [{ "google_search": {} }], 
    };

    try {
        const fetchWithBackoff = async (url, options, retries = 3, delay = 1000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, options);
                    if (response.status === 429 && i < retries - 1) {
                        // Rate limit error (429), retry after delay
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2; // Exponential backoff
                        continue; 
                    }
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error?.message || `API request failed with status: ${response.status}`);
                    }
                    return response;
                } catch (err) {
                    if (i === retries - 1) throw err;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                }
            }
        };

        const apiResponse = await fetchWithBackoff(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await apiResponse.json();
        
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const generatedText = candidate.content.parts[0].text;
            
            // Extract grounding sources
            let sources = [];
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                sources = groundingMetadata.groundingAttributions
                    .map(attribution => ({
                        uri: attribution.web?.uri,
                        title: attribution.web?.title,
                    }))
                    .filter(source => source.uri && source.title);
            }

            setResponse({ text: generatedText, sources });
        } else {
            // Handle cases where the model returns an error or no text
            setError("The model did not return a valid response. This might be due to safety filters or an internal error.");
        }

    } catch (err) {
        console.error('API Error:', err);
        setError(`An error occurred: ${err.message}`);
    } finally {
        setIsLoading(false);
    }
  }, [query, apiUrl]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-8 font-sans">
      
      {/* Header */}
      <header className="w-full max-w-4xl text-center mb-8">
        <h1 className="text-4xl font-extrabold text-blue-700 flex items-center justify-center">
          <Zap className="w-8 h-8 mr-2 text-yellow-500" />
          Gemini Assistant
        </h1>
        <p className="text-gray-500 mt-2">Ask anything and get a grounded, AI-generated response.</p>
      </header>

      {/* Input Form */}
      <div className="w-full max-w-3xl bg-white shadow-2xl rounded-2xl p-6 mb-8 border border-gray-100">
        <form onSubmit={handleGenerateContent} className="flex flex-col space-y-4">
          <textarea
            className="w-full p-4 border border-gray-300 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition duration-150 resize-none h-32 text-gray-700 placeholder-gray-400 text-base"
            placeholder="What's the latest news on renewable energy technology? Or ask for a short story about a space pirate..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            className={`w-full flex justify-center items-center px-6 py-3 font-semibold text-white rounded-xl shadow-lg transition duration-300 transform ${
              isLoading || !query.trim()
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
            }`}
            disabled={isLoading || !query.trim()}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Send className="w-5 h-5 mr-2" />
            )}
            {isLoading ? 'Generating Response...' : 'Ask Gemini'}
          </button>
        </form>
      </div>

      {/* Response Area */}
      <div className="w-full max-w-3xl">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl mb-6 shadow-md">
            <p className="font-bold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {response && (
          <div className="bg-white shadow-2xl rounded-2xl p-6 border border-gray-100 animate-fadeIn">
            <div className="flex justify-between items-start mb-4 border-b pb-3">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Zap className="w-6 h-6 mr-2 text-blue-500" />
                    AI Response
                </h2>
                <button
                    onClick={() => copyToClipboard(response.text)}
                    className="flex items-center text-sm text-gray-500 hover:text-blue-600 transition duration-150 px-3 py-1 border border-gray-200 rounded-lg hover:bg-blue-50"
                >
                    <ClipboardCopy className="w-4 h-4 mr-1" /> Copy
                </button>
            </div>
            
            {/* Generated Text */}
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                {response.text}
            </div>

            {/* Sources */}
            {response.sources && response.sources.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">Sources Grounded by Google Search:</h3>
                    <ul className="space-y-1">
                        {response.sources.slice(0, 3).map((source, index) => (
                            <li key={index} className="flex items-center text-xs text-gray-500">
                                <LinkIcon className="w-3 h-3 mr-1 flex-shrink-0 text-blue-400" />
                                <a 
                                    href={source.uri} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="hover:text-blue-600 truncate"
                                    title={source.title}
                                >
                                    {source.title}
                                </a>
                            </li>
                        ))}
                        {response.sources.length > 3 && (
                            <li className="text-xs text-gray-400 mt-1">
                                + {response.sources.length - 3} more sources...
                            </li>
                        )}
                    </ul>
                </div>
            )}
          </div>
        )}
      </div>
      
    </div>
  );
};

export default App;

