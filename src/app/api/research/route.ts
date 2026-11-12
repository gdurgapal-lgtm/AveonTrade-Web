import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { query, symbol, apiKey, technicals } = await req.json();

    if (!query) {
      return NextResponse.json({ success: false, message: "Query is required." }, { status: 400 });
    }

    const activeKey = apiKey || process.env.GEMINI_API_KEY;

    if (!activeKey) {
      return NextResponse.json(
        { success: false, message: "API key is missing. Please configure your Gemini API key in settings." },
        { status: 401 }
      );
    }

    const techContext = technicals ? `
      Active Chart Technicals:
      - Timeframe: ${technicals.timeframe || 'N/A'}
      - LTP: ₹${technicals.ltp || 'N/A'}
      - Active Indicators: ${technicals.activeIndicators || 'N/A'}
    ` : "";

    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash-lite:generateContent?key=${activeKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ 
            text: `Act as an expert senior technical analyst and quantitative trader. Provide a concise, structured research breakdown for ${symbol || "market query"} regarding: ${query}. ${techContext} Structure the analysis clearly into: 1. Trend & Breakout Levels, 2. Indicator & Volume Confirmation, 3. Intraday Outlook & Triggers, and 4. Delivery / Swing Structure.` 
          }]
        }]
      })
    });

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("[Research API Error]", data);
      const errorMsg = data?.error?.message || "AI service rejected request.";
      return NextResponse.json({ success: false, message: errorMsg }, { status: 500 });
    }

    const insight = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No insights generated.";

    return NextResponse.json({ success: true, insight });
  } catch (error) {
    console.error("[Research Route Exception]", error);
    return NextResponse.json({ success: false, message: "Research synthesis failed." }, { status: 500 });
  }
}