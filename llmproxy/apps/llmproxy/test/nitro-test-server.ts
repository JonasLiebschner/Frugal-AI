import { createServer, type Server } from "node:http";
import type { ActiveConnectionRuntime } from "../../ai-proxy/server/ai-proxy-capability";
import { createNitroTestHost } from "../../shared/test/nitro-test-host";
import {
  createLlmproxyTestLayerStack,
  type LlmproxyTestRuntimeDependencies,
  type LlmproxyTestLayerStackOptions,
} from "./runtime-api";

interface NitroTestServerOptions extends LlmproxyTestLayerStackOptions {
  listenBacklog?: number;
  host?: string;
  port?: number;
}

export class NitroTestServer {
  private readonly aiProxy;
  private readonly sse;
  private server?: Server;
  private readonly listenBacklog?: number;
  private readonly host: string;
  private readonly port: number;
  public readonly loadBalancer: LlmproxyTestRuntimeDependencies["loadBalancer"];
  private readonly testLayers;

  public constructor(
    dependencies: LlmproxyTestRuntimeDependencies,
    options: NitroTestServerOptions = {},
  ) {
    this.loadBalancer = dependencies.loadBalancer;
    const layerStack = createLlmproxyTestLayerStack(dependencies, options);
    this.sse = layerStack.sse;
    this.aiProxy = layerStack.aiProxy;
    this.listenBacklog = options.listenBacklog;
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 0;
    this.testLayers = layerStack.testLayers;
  }

  public inspectActiveConnection(requestId: string) {
    return this.aiProxy.requestState.inspectActiveConnection(requestId);
  }

  public getDashboardSseClientCount(): number {
    return this.aiProxy.requestState.getDashboardSseClientCount();
  }

  public getSseBufferedBytes(): number {
    return this.aiProxy.requestState.getSseBufferedBytes();
  }

  public listActiveConnections(): ActiveConnectionRuntime[] {
    return this.aiProxy.requestState.listActiveConnections();
  }

  public async start(): Promise<void> {
    if (this.server) {
      return;
    }

    await this.aiProxy.requestState.start();
    this.server = createServer(createNitroTestHost({
      testLayers: this.testLayers,
    }));
    this.server.on("clientError", (_error, socket) => {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      const onListening = () => {
        this.server?.off("error", reject);
        resolve();
      };

      if (this.listenBacklog) {
        this.server?.listen(this.port, this.host, this.listenBacklog, onListening);
        return;
      }

      this.server?.listen(this.port, this.host, onListening);
    });
  }

  public async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await this.aiProxy.requestState.stop();
    await this.sse.sse.closeAll();
  }
}
