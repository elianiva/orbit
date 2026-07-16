import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export async function handleMcpRequest(request: Request, server: McpServer): Promise<Response> {
  try {
    const jsonRpcRequest = (await request.json()) as JSONRPCMessage;

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const response = await new Promise<JSONRPCMessage>((resolve, reject) => {
      clientTransport.onmessage = resolve;
      clientTransport.onerror = reject;

      server.connect(serverTransport).then(() =>
        Promise.all([clientTransport.start(), serverTransport.start()]).then(() =>
          clientTransport.send(jsonRpcRequest),
        ),
      );
    });

    await clientTransport.close();
    await serverTransport.close();

    return Response.json(response, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("MCP handler error:", error);

    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
          data: error instanceof Error ? error.message : String(error),
        },
        id: null,
      },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
