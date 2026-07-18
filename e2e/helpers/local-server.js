import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARTICLE_FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/article.html"
);

const createChatCompletionBody = (content) => {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "gpt-test",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: content },
        finish_reason: "stop"
      }
    ]
  };
};

export const startLocalServer = async () => {
  const articleHtml = await readFile(ARTICLE_FIXTURE_PATH, "utf8");
  const requests = [];
  const responseQueue = [];

  const handleChatCompletion = (req, res, rawBody) => {
    requests.push({
      method: req.method,
      path: "/chat/completions",
      headers: req.headers,
      body: JSON.parse(rawBody)
    });

    const content = responseQueue.shift();

    if (content === undefined) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "No queued mock response." } }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(createChatCompletionBody(content)));
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/article.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(articleHtml);
      return;
    }

    if (req.method === "POST" && url.pathname === "/chat/completions") {
      let rawBody = "";

      req.setEncoding("utf8");

      req.on("data", (chunk) => {
        rawBody += chunk;
      });

      req.on("end", () => {
        handleChatCompletion(req, res, rawBody);
      });

      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();

  return {
    origin: `http://127.0.0.1:${port}`,
    requests: requests,
    enqueueResponse: (content) => {
      responseQueue.push(content);
    },
    stop: () => {
      return new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
  };
};
