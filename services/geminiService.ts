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
    You are a forensic analyst for prediction markets. Use the provided FACTS ONLY.
    
    FACTS_JSON:
    ${JSON.stringify({
      market: { 
        question: market.question, 
        volume: market.volume, 
        liquidity: market.liquidity 
      },
      trade: { 
        side: trade.side, 
        usdcSize: trade.size, 
        price: trade.price, 
        outcome: trade.outcomeLabel, 
        ts: trade.timestamp, 
        wallet: trade.makerAddress 
      },
      forensics: {
        walletAgeDays: walletStats.accountAgeDays,
        heuristicFlags: preliminaryFactors
      }
    }, null, 2)}

    TASK:
    Assess if this trade indicates informed insider flow.
    - High suspicion if: Fresh wallet (<2 days) AND large size OR known insider pattern.
    - Medium suspicion if: High slippage acceptance or unusual outcome accumulation.
    
    Return ONLY JSON.
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