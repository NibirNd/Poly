import { GoogleGenAI, Type } from "@google/genai";
import { Trade, PolymarketMarket, GeminiAnalysisResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const cleanJson = (text: string) => {
  if (!text) return "{}";
  let clean = text.trim();
  clean = clean.replace(/^```(json)?/i, '').replace(/```$/, '');
  return clean.trim();
};

export const analyzeSuspicion = async (
  trade: Trade, 
  market: PolymarketMarket, 
  preliminaryFactors: string[]
): Promise<GeminiAnalysisResponse> => {
  
  const prompt = `
    Analyze this trade for insider trading. Return ONLY valid JSON.
    
    Market: "${market.question}" (Vol: $${market.volume}, Liq: $${market.liquidity})
    Trade: ${trade.side} $${trade.size} of "${trade.outcomeLabel}" @ ${(trade.price * 100).toFixed(1)} cents.
    Wallet: ${trade.makerAddress}
    Flags: ${preliminaryFactors.join(", ")}
    
    Assess if this is informed flow.
    Output JSON structure:
    {
      "suspicionScore": number (0-100),
      "reasoning": string (max 20 words),
      "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "factors": string[] (max 3 short tags)
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // Providing schema helps the model structure the output correctly
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suspicionScore: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            riskLevel: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
            factors: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    const cleanedText = cleanJson(text);
    return JSON.parse(cleanedText) as GeminiAnalysisResponse;

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return {
      suspicionScore: preliminaryFactors.includes("Known Insider Wallet") ? 95 : 65,
      reasoning: "Automated heuristic analysis (AI Offline)",
      riskLevel: preliminaryFactors.includes("Known Insider Wallet") ? "CRITICAL" : "MEDIUM",
      factors: preliminaryFactors
    };
  }
};