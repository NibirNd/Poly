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
  preliminaryFactors: string[],
  walletStats: any
): Promise<GeminiAnalysisResponse> => {
  
  const prompt = `
    You are a forensic analyst for prediction markets. 
    ANALYZE ONLY THE PROVIDED FACTS. DO NOT HALLUCINATE.
    
    FACTS:
    Market: "${market.question}" (Vol: $${market.volume}, Liq: $${market.liquidity})
    Trade: ${trade.side} $${trade.size} of "${trade.outcomeLabel}" at ${(trade.price * 100).toFixed(1)} cents.
    Wallet Age: ${walletStats ? walletStats.accountAgeDays + ' days' : 'Unknown'}.
    Flags: ${JSON.stringify(preliminaryFactors)}.

    TASK:
    Determine if this specific trade represents potential insider activity or informed flow.
    - Rate suspicion 0-100.
    - Provide a concise reasoning based on Z-score, liquidity impact, and wallet freshness.
    - Risk Level: LOW/MEDIUM/HIGH/CRITICAL.

    Return JSON matching schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.1, // Deterministic
        topP: 0.5,
        responseMimeType: "application/json",
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
          },
          required: ["suspicionScore", "reasoning", "riskLevel", "factors"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    const cleanedText = cleanJson(text);
    return JSON.parse(cleanedText) as GeminiAnalysisResponse;

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    // Lower confidence fallback
    const heuristicScore = preliminaryFactors.length * 15;
    return {
      suspicionScore: Math.min(50, heuristicScore),
      reasoning: "AI Unavailable - Heuristic Estimate Only",
      riskLevel: heuristicScore > 60 ? "HIGH" : "MEDIUM",
      factors: preliminaryFactors.slice(0, 3)
    };
  }
};