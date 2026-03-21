import { createClassifyServer } from "shared";
import { HeuristicClassifier } from "./classifier";

const port = Number(process.env.PORT) || 3000;
const server = createClassifyServer(new HeuristicClassifier(), port);

console.log(`middleware-1 listening on http://localhost:${server.port}`);
