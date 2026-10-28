export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    const backendUrl = process.env.BACKEND_API_URL || "http://localhost:3001";

    let backendResponse: Response;
    try {
      backendResponse = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json(
        {
          error: `Unable to connect to backend server: (${msg})`,
        },
        { status: 502 }
      );
    }

    if (!backendResponse.ok) {
      let errDetail = `Backend HTTP ${backendResponse.status}`;
      try {
        const json = await backendResponse.json();
        if (json.error) errDetail = json.error;
      } catch {
        // use default status text
      }
      return Response.json({ error: errDetail }, { status: backendResponse.status });
    }

    // Stream the SSE response from backend directly to client
    const encoder = new TextEncoder();
    const reader = backendResponse.body?.getReader();

    const stream = new ReadableStream({
      async start(controller) {
        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (streamErr) {
          const errMsg = streamErr instanceof Error ? streamErr.message : "Stream error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}

