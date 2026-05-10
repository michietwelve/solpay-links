// app/api/qvac/route.ts
// MOCKED for build stability - @qvac/sdk dependency issue being resolved.

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const stream = new ReadableStream({
      async start(controller) {
        const mockResponse = "I'm the BiePay Business Assistant. I'm currently in a lightweight mode to ensure maximum performance during the hackathon. How can I help you with your merchant analytics today?";
        const tokens = mockResponse.split(" ");
        
        for (const token of tokens) {
          controller.enqueue(new TextEncoder().encode(token + " "));
          await new Promise(r => setTimeout(r, 50)); // simulate streaming
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
