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
    if (existsSync(path)) {
      const content=readFileSync(path,"utf8");
      // Chrome crée le fichier avant d'y écrire le port et le chemin WebSocket.
      // L'existence seule peut produire un port vide (fetch vers localhost:80).
      if(/^\d+\r?\n\/devtools\/browser\/[^\s]+/u.test(content))return content;
    }
    await wait(25);
  }
  throw chromeError(phase, `n'a pas ouvert DevTools dans les ${timeout} ms`, stderr());
}

async function openCdpClient(wsUrl, timeout, phase, stderr) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const events = new Map();
  const rejectPending = () => {
    const error = chromeError(phase, "connexion DevTools fermée", stderr());
    for (const item of pending.values()) item.reject(error);
    pending.clear();
    for (const listeners of events.values()) for (const item of listeners) item.reject(error);
    events.clear();
  };
  socket.addEventListener("close", rejectPending);
  let nextId = 1;
  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(chromeError(phase, `n'a pas accepté la connexion DevTools dans les ${timeout} ms`, stderr())), timeout);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(chromeError(phase, "a refusé la connexion DevTools", stderr())); }, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const item = pending.get(message.id);
      if (item) { pending.delete(message.id); item.resolve(message); }
      return;
    }
    const key = `${message.sessionId || ""}:${message.method}`;
    const listeners = events.get(key) || [];
    events.delete(key);
    listeners.forEach((item) => item.resolve(message));
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
        pending.set(id, {reject:(error)=>{clearTimeout(timer);reject(error);}, resolve:(message) => {
          clearTimeout(timer);
          if (message.error) reject(chromeError(phase, `${method} a échoué: ${message.error.message || JSON.stringify(message.error)}`, stderr()));
          else resolve(message.result || {});
        }});
        socket.send(JSON.stringify(payload));
      });
    },
    event(method, eventTimeout = timeout, sessionId = "") {
      return new Promise((resolve, reject) => {
        const key = `${sessionId}:${method}`;
        const remove = () => { const rest=(events.get(key)||[]).filter(item=>item!==listener); if(rest.length)events.set(key,rest);else events.delete(key); };
        const timer = setTimeout(() => {remove();reject(chromeError(phase, `n'a pas émis ${method} dans les ${eventTimeout} ms`, stderr()));}, eventTimeout);
        const listener = {resolve:(message)=>{clearTimeout(timer);resolve(message.params||{});},reject:(error)=>{clearTimeout(timer);reject(error);}};
        const listeners = events.get(key) || [];
        listeners.push(listener);
        events.set(key, listeners);
      });
    },
    close: () => { rejectPending(); socket.close(); },
  };
}

/**
 * Charge une page locale dans Chrome puis ferme explicitement le navigateur
 * via DevTools. `--dump-dom` peut rester bloqué sur macOS après le rendu ; ce
 * harnais donne donc une borne utile à chaque étape et ne laisse aucun enfant
 * Chrome appartenant au test en arrière-plan.
 */
export async function collectPageResultWithIsolatedChrome({ chrome, url, profileDir, phase, timeout = 20_000, resultWait = 8_000, selector, onLifecycle = () => {} }) {
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
    "--disable-component-extensions-with-background-pages",
    "--no-startup-window",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
  ], { stdio: ["ignore", "ignore", "pipe"], detached:process.platform !== "win32" });
  onLifecycle({event:"spawn",pid:child.pid});
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const stderrText = () => stderr;
  const exit = new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
    child.once("error", error => resolve({error}));
  });
  const waitExit = (ms) => new Promise(resolve => {
    const timer=setTimeout(()=>resolve(null),ms);
    exit.then(outcome=>{clearTimeout(timer);resolve(outcome);});
  });
  let client;
  let browserContextId;
  let sessionId;
  let primaryError;
  let closeRequested = false;
  try {
    const devtools = await waitForFile(join(profileDir, "DevToolsActivePort"), 8_000, phase, stderrText);
    const [port] = devtools.trim().split(/\s+/u);
    const metadata = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json());
    client = await openCdpClient(metadata.webSocketDebuggerUrl, 8_000, phase, stderrText);
    ({browserContextId} = await client.command("Target.createBrowserContext"));
    const { targetId } = await client.command("Target.createTarget", { url: "about:blank", browserContextId });
    ({ sessionId } = await client.command("Target.attachToTarget", { targetId, flatten: true }));
    await client.command("Page.enable", {}, sessionId);
    const load = client.event("Page.loadEventFired", 8_000, sessionId);
    load.catch(() => {}); // The awaited load still rejects; avoid an unhandled rejection if navigation fails first.
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
    primaryError = error;
    if (error instanceof Error) throw error;
    throw chromeError(phase, String(error), stderrText());
  } finally {
    let cleanupError;
    try {
      if (client) {
        if(sessionId) await client.command("Target.detachFromTarget", {sessionId});
        if(browserContextId) await client.command("Target.disposeBrowserContext", {browserContextId});
        const {targetInfos} = await client.command("Target.getTargets");
        if(targetInfos.some(target=>target.browserContextId===browserContextId)) throw chromeError(phase,"cible du test toujours active après nettoyage");
        onLifecycle({event:"context-disposed",pid:child.pid,targets:targetInfos.map(({type,attached})=>({type,attached}))});
        closeRequested = true;
        try { await client.command("Browser.close", {}, undefined, 3_000); }
        catch(error) { if(!await waitExit(5_000)) throw error; }
      }
    } catch(error) { cleanupError = error; }
    client?.close();
    let outcome = await waitExit(5_000);
    if (!outcome) {
      cleanupError ||= chromeError(phase, "n'a pas fermé après Browser.close", stderrText());
      const kill = signal => {
        try { if(process.platform === "win32")child.kill(signal);else process.kill(-child.pid,signal); }
        catch(error) { if(error.code !== "ESRCH")throw error; }
      };
      kill("SIGTERM");
      outcome = await waitExit(1_000);
      if(!outcome){kill("SIGKILL");outcome=await waitExit(1_000);}
      if(!outcome) cleanupError = chromeError(phase,"processus non réabsorbé après arrêt forcé",stderrText());
    }
    onLifecycle({event:"closed",pid:child.pid,outcome});
    if (closeRequested && outcome && (outcome.code !== 0 || outcome.signal)) {
      cleanupError ||= chromeError(phase, `s'est arrêté anormalement (code ${outcome.code}, signal ${outcome.signal || "aucun"})`, stderrText());
    }
    if(cleanupError) throw primaryError ? new AggregateError([primaryError,cleanupError],`${phase}: erreur de rendu et de nettoyage`) : cleanupError;
  }
}
