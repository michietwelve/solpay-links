import { loadModel, LLAMA_3_2_1B_INST_Q4_0, completion } from "@qvac/sdk";

// Global cache for the model ID so it's not reloaded on every request
// We use a global variable to persist it across hot-reloads in development
declare global {
  var _qvacModelId: string | null;
}

let globalModelId = global._qvacModelId || null;

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!globalModelId) {
      console.log("[QVAC] Loading model (this may take a moment to download on first run)...");
      globalModelId = await loadModel({
        modelSrc: LLAMA_3_2_1B_INST_Q4_0,
        modelType: "llm",
        onProgress: (p: number) => {
          // Log progress every 10% to avoid spam
          const percent = Math.round(p * 100);
          if (percent % 10 === 0) {
            console.log(`[QVAC] Model loading progress: ${percent}%`);
          }
        },
      });
      global._qvacModelId = globalModelId;
      console.log("[QVAC] Model loaded successfully:", globalModelId);
    }

    const history = [
      {
        role: "system",
        content: "You are the BiePay Business Assistant. You are a helpful AI analyzing merchant data and giving brief, concise answers. Keep your answers under 3 sentences."
      },
      {
        role: "user",
        content: message,
      },
    ];

    console.log("[QVAC] Generating completion...");
    const result = completion({ modelId: globalModelId, history, stream: true });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const token of result.tokenStream) {
            controller.enqueue(new TextEncoder().encode(token));
          }
        } catch (e) {
          console.error("[QVAC] Stream error:", e);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (error: any) {
    console.error("[QVAC] Error processing request:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
