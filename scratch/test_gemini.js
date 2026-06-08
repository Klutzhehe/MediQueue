import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = "AIzaSyADDR1mFuHoyNH6hpy0X6Du61_NH3DRm5w";
const genAI = new GoogleGenerativeAI(API_KEY);

async function testModel() {
  try {
    console.log("Checking gemini-3-flash-preview...");
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent("Hi");
    console.log("Response:", result.response.text());
  } catch (err) {
    console.log(`Status code: ${err.status || 'unknown'}`);
    console.error("Result:", err.message);
  }
}

testModel();
