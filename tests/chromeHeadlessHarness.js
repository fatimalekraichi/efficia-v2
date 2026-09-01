import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

function chromeError(phase, message, stderr = "") {
  const detail = String(stderr).trim().slice(-1_000);
  return new Error(`${phase}: Chrome headless ${message}${detail ? `\n${detail}` : ""}`);
}

async function waitForFile(path, timeout, phase, stderr) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (existsSync(path)) return readFileSync(path, "utf8");
    await wait(25);
  }
  throw chromeError(phase, `n'a pas ouvert DevTools dans les ${timeout} ms`, stderr());
}

async function openCdpClient(wsUrl, timeout, phase, stderr) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const events = new Map();
  let nextId = 1;
  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(chromeError(phase, `n'a pas accepté la connexion DevTools dans les ${timeout} ms`, stderr())), timeout);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(chromeError(phase, "a refusé la connexion DevTools", stderr())); }, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const resolve = pending.get(message.id);
      if (resolve) { pending.delete(message.id); resolve(message); }
      return;
    }
    const listeners = events.get(message.method) || [];
    events.delete(message.method);
    listeners.forEach((resolve) => resolve(message));
  });
  await opened;
  return {
    command(method, params = {}, sessionId, commandTimeout = timeout) {
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(chromeError(phase, `n'a pas répondu à ${method} dans les ${commandTimeout} ms`, stderr()));
        }, commandTimeout);
        pending.set(id, (message) => {
          clearTimeout(timer);
          if (message.error) reject(chromeError(phase, `${method} a échoué: ${message.error.message || JSON.stringify(message.error)}`, stderr()));
          else resolve(message.result || {});
        });
        socket.send(JSON.stringify(payload));
      });
    },
    event(method, eventTimeout = timeout) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(chromeError(phase, `n'a pas émis ${method} dans les ${eventTimeout} ms`, stderr())), eventTimeout);
        const listener = (message) => { clearTimeout(timer); resolve(message.params || {}); };
        const listeners = events.get(method) || [];
        listeners.push(listener);
        events.set(method, listeners);
      });
    },
    close: () => socket.close(),
  };
}

/**
 * Charge une page locale dans Chrome puis ferme explicitement le navigateur
 * via DevTools. `--dump-dom` peut rester bloqué sur macOS après le rendu ; ce
 * harnais donne donc une borne utile à chaque étape et ne laisse aucun enfant
 * Chrome appartenant au test en arrière-plan.
 */
export async function collectPageResultWithIsolatedChrome({ chrome, url, profileDir, phase, timeout = 20_000, resultWait = 8_000, selector }) {
  let stderr = "";
  const child = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--no-sandbox",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const stderrText = () => stderr;
  const exit = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  let client;
  let closeRequested = false;
  try {
    const devtools = await waitForFile(join(profileDir, "DevToolsActivePort"), 8_000, phase, stderrText);
    const [port] = devtools.trim().split(/\s+/u);
    const metadata = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json());
    client = await openCdpClient(metadata.webSocketDebuggerUrl, 8_000, phase, stderrText);
    const { targetId } = await client.command("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await client.command("Target.attachToTarget", { targetId, flatten: true });
    await client.command("Page.enable", {}, sessionId);
    const load = client.event("Page.loadEventFired", 8_000);
    await client.command("Page.navigate", { url }, sessionId);
    await load;
    const expression = `new Promise((resolve, reject) => {
      const deadline = Date.now() + ${resultWait};
      const poll = () => {
        const output = document.querySelector(${JSON.stringify(selector)});
        if (output && output.textContent) return resolve(output.textContent);
        if (Date.now() > deadline) return reject(new Error("résultat de rendu absent après ${resultWait} ms"));
        setTimeout(poll, 25);
      };
      poll();
    })`;
    const evaluated = await client.command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId, timeout);
    if (evaluated.exceptionDetails) throw chromeError(phase, `a échoué pendant l'évaluation: ${evaluated.exceptionDetails.text || "erreur JavaScript"}`, stderrText());
    return String(evaluated.result?.value || "");
  } catch (error) {
    if (error instanceof Error) throw error;
    throw chromeError(phase, String(error), stderrText());
  } finally {
    try {
      if (client) {
        closeRequested = true;
        await client.command("Browser.close", {}, undefined, 3_000);
      }
    } catch { /* Browser.close coupe parfois lui-même la socket DevTools. */ }
    client?.close();
    const outcome = await Promise.race([exit, wait(5_000).then(() => null)]);
    if (!outcome) {
      child.kill("SIGTERM");
      throw chromeError(phase, "n'a pas fermé après Browser.close", stderrText());
    }
    if (closeRequested && (outcome.code !== 0 || outcome.signal)) {
      throw chromeError(phase, `s'est arrêté anormalement (code ${outcome.code}, signal ${outcome.signal || "aucun"})`, stderrText());
    }
  }
}
