import OpenAI from "openai";

export function getOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment variables");
  }

  return apiKey;
}

export function getOpenAIClient() {
  return new OpenAI({
    apiKey: getOpenAIApiKey()
  });
}
