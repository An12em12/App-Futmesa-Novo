
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateTournamentSlogan(name: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Gere um slogan curto e impactante em português para um torneio de futebol amador chamado "${name}".`,
    });
    return response.text?.trim() || "A emoção do futebol começa aqui!";
  } catch (error) {
    console.error("Gemini error:", error);
    return "Onde os campeões se encontram.";
  }
}

export async function suggestTeamNames(): Promise<string[]> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Sugira 8 nomes criativos para times de futebol amador brasileiros. Retorne apenas uma lista separada por vírgula.",
    });
    const text = response.text || "";
    return text.split(',').map(s => s.trim());
  } catch (error) {
    return ["Galáticos FC", "Vila Real", "União da Bola", "Resenha FC"];
  }
}
