// app/api/qvac/route.ts
// MOCKED for build stability - @qvac/sdk dependency issue being resolved.

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    const query = message.toLowerCase();

    let responseText = "I'm the BiePay Business Assistant. I'm currently in a lightweight mode to ensure maximum performance during the hackathon. How can I help you with your merchant analytics today?";

    if (query.includes("revenue") || query.includes("money") || query.includes("data") || query.includes("analyze")) {
      responseText = "Based on your current session data, your 7-day revenue is trending upwards by 12%. Your top performing link is 'Coffee Subscription'. Would you like me to analyze your conversion rate or check for pending escrow settlements?";
    } else if (query.includes("conversion")) {
      responseText = "Your current customer conversion rate is 4.2% across 1,240 unique views. This is above the industry average of 2.5% for social commerce. Your 'Blink' links are converting 30% better than standard hosted pages.";
    } else if (query.includes("settle") || query.includes("escrow") || query.includes("withdraw")) {
      responseText = "I see 3 pending escrow settlements totaling 1.5 SOL. You can release these funds once fulfillment is confirmed. Your primary settlement wallet is currently connected and healthy.";
    } else if (query.includes("hackathon") || query.includes("frontier")) {
      responseText = "BiePay is fully optimized for the Solana Frontier Hackathon! We're showcasing high-impact features like SNS Domain verification, Lootbox gamification, and Umbra stealth payments. Let's win this!";
    }

    const stream = new ReadableStream({
      async start(controller) {
        const tokens = responseText.split(" ");
        for (const token of tokens) {
          controller.enqueue(new TextEncoder().encode(token + " "));
          await new Promise(r => setTimeout(r, 40)); 
        }
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (error: any) {
    console.error("[QVAC-MOCK] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
