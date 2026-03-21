export enum QueryComplexity {
  Small = "small",
  Large = "large",
}

export interface ClassifyRequest {
  query: string;
}

export interface ClassifyResponse {
  result: QueryComplexity;
  details?: Record<string, unknown>;
}

export interface ClassifyResult {
  result: QueryComplexity;
  details?: Record<string, unknown>;
}

export interface Classifier {
  classify(query: string): ClassifyResult | Promise<ClassifyResult>;
}

export interface ServerOptions {
  port?: number;
  title?: string;
  description?: string;
  version?: string;
}

function buildOpenApiSpec(opts: Required<ServerOptions>) {
  return {
    openapi: "3.0.3",
    info: {
      title: opts.title,
      description: opts.description,
      version: opts.version,
    },
    paths: {
      "/api/v1/classify": {
        post: {
          summary: "Classify a query",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query"],
                  properties: {
                    query: { type: "string", example: "Explain how garbage collection works" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Classification result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "string",
                        enum: ["small", "large"],
                      },
                      details: {
                        type: "object",
                        description: "Optional middleware-specific metadata (e.g. score, reason, usage)",
                        additionalProperties: true,
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid request body",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { error: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function swaggerUiHtml(specUrl: string, title: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: "${specUrl}", dom_id: "#swagger-ui", presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset] });
  </script>
</body>
</html>`;
}

export function createClassifyServer(classifier: Classifier, portOrOptions: number | ServerOptions = 3000) {
  const opts: Required<ServerOptions> =
    typeof portOrOptions === "number"
      ? { port: portOrOptions, title: "Classify Middleware", description: "Query complexity classifier", version: "1.0.0" }
      : {
          port: portOrOptions.port ?? 3000,
          title: portOrOptions.title ?? "Classify Middleware",
          description: portOrOptions.description ?? "Query complexity classifier",
          version: portOrOptions.version ?? "1.0.0",
        };

  const spec = buildOpenApiSpec(opts);
  const specJson = JSON.stringify(spec);

  return Bun.serve({
    port: opts.port,
    routes: {
      "/": {
        GET: () =>
          new Response(swaggerUiHtml("/openapi.json", opts.title), {
            headers: { "Content-Type": "text/html" },
          }),
      },
      "/openapi.json": {
        GET: () => Response.json(spec),
      },
      "/api/v1/classify": {
        POST: async (req) => {
          let body: ClassifyRequest;
          try {
            body = await req.json();
          } catch {
            return Response.json({ error: "Invalid JSON body" }, { status: 400 });
          }

          if (!body.query || typeof body.query !== "string") {
            return Response.json({ error: "Missing required field: query" }, { status: 400 });
          }

          const { result, details } = await Promise.resolve(classifier.classify(body.query));
          const response: ClassifyResponse = details !== undefined ? { result, details } : { result };
          return Response.json(response);
        },
        GET: () =>
          new Response(null, {
            status: 405,
            headers: { Allow: "POST" },
          }),
      },
    },
    fetch(req) {
      return new Response("Not found", { status: 404 });
    },
  });
}
