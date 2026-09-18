import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

function chromeError(phase, message, stderr = "") {
  const detail = String(stderr).trim().slice(-1_000);
  return new Error(`${phase}: Chrome headless ${message}${detail ? `\n${detail}` : ""}`);
}

async function waitForFile(path, timeout, phase, stderr, processOutcome) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const outcome = processOutcome();
    if (outcome) throw chromeError(phase, outcome.error ? `démarrage impossible: ${outcome.error.message}` : `arrêt prématuré (code ${outcome.code}, signal ${outcome.signal || "aucun"})`, stderr());
    if (existsSync(path)) {
      const content=readFileSync(path,"utf8");
      // Chrome crée le fichier avant d'y écrire le port et le chemin WebSocket.
      // L'existence seule peut produire un port vide (fetch vers localhost:80).
      if(/^\d+\r?\n\/devtools\/browser\/[^\s]+/u.test(content))return content;
    }
    await wait(25);
  }
  throw chromeError(phase, `${existsSync(path) ? "DevToolsActivePort incomplet" : "DevToolsActivePort absent"} après ${timeout} ms`, stderr());
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
  try { await opened; }
  catch (error) {
    rejectPending();
    // A failed opening must not leave a socket that can connect later.
    socket.close();
    throw error;
  }
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
  const args = [
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
  ];
  const child = spawn(chrome, args, { stdio: ["ignore", "ignore", "pipe"], detached:process.platform !== "win32" });
  onLifecycle({event:"spawn",pid:child.pid});
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const stderrText = () => stderr;
  let processOutcome;
  const exit = new Promise((resolve) => {
    // `close` also waits for inherited stdio (for example Chrome's updater).
    // Only `exit` proves whether the browser process itself terminated cleanly.
    child.once("exit", (code, signal) => { processOutcome={code,signal}; resolve(processOutcome); });
    child.once("error", error => { processOutcome={error}; resolve(processOutcome); });
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
  let startupStage = "process-start";
  let port;
  let processAtFailure;
  let portFileAtFailure;
  const cleanupSteps=[];
  try {
    const devtools = await waitForFile(join(profileDir, "DevToolsActivePort"), 8_000, phase, stderrText, () => processOutcome);
    [port] = devtools.trim().split(/\s+/u);
    startupStage = "cdp-endpoint";
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {signal:AbortSignal.timeout(8_000)});
    if (!response.ok) throw chromeError(phase, `endpoint CDP indisponible (HTTP ${response.status})`, stderrText());
    const metadata = await response.json();
    startupStage = "websocket-open";
    client = await openCdpClient(metadata.webSocketDebuggerUrl, 8_000, phase, stderrText);
    startupStage = "ready";
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
    processAtFailure=processOutcome||{running:child.pid!==undefined,exitCode:child.exitCode,signalCode:child.signalCode};
    if(startupStage !== "ready"){
      const path=join(profileDir,"DevToolsActivePort");
      let content=null;
      try{content=readFileSync(path,"utf8");}catch{}
      portFileAtFailure={exists:existsSync(path),content};
    }
    if (error instanceof Error) throw error;
    throw chromeError(phase, String(error), stderrText());
  } finally {
    const cleanupErrors=[];
    const cleanup = async (step, action) => {
      cleanupSteps.push(step);
      try { await action(); } catch(error) { cleanupErrors.push(error); }
    };
      if (client) {
        if(sessionId) await cleanup("detach-session",()=>client.command("Target.detachFromTarget", {sessionId}));
        if(browserContextId) await cleanup("dispose-context",()=>client.command("Target.disposeBrowserContext", {browserContextId}));
        await cleanup("inspect-targets",async()=>{
        const {targetInfos} = await client.command("Target.getTargets");
        if(targetInfos.some(target=>target.browserContextId===browserContextId)) throw chromeError(phase,"cible du test toujours active après nettoyage");
        onLifecycle({event:"context-disposed",pid:child.pid,targets:targetInfos.map(({type,attached})=>({type,attached}))});
        });
        closeRequested = true;
        await cleanup("Browser.close",async()=>{
        try { await client.command("Browser.close", {}, undefined, 3_000); }
        catch(error) { if(!await waitExit(5_000)) throw error; }
        });
      }
    client?.close();
    let outcome = await waitExit(5_000);
    if (!outcome) {
      if(closeRequested) cleanupErrors.push(chromeError(phase, "n'a pas fermé après Browser.close", stderrText()));
      const kill = signal => {
        try { if(process.platform === "win32")child.kill(signal);else process.kill(-child.pid,signal); }
        catch(error) { if(error.code !== "ESRCH")throw error; }
      };
      cleanupSteps.push("SIGTERM-owned-group");
      kill("SIGTERM");
      outcome = await waitExit(1_000);
      if(!outcome){cleanupSteps.push("SIGKILL-owned-group");kill("SIGKILL");outcome=await waitExit(1_000);}
      if(!outcome) cleanupErrors.push(chromeError(phase,"processus non réabsorbé après arrêt forcé",stderrText()));
    }
    // The process outcome is known (or cleanup has failed explicitly). Release
    // our pipe without waiting for unrelated descendants to close their copy.
    child.stderr.destroy();
    onLifecycle({event:"closed",pid:child.pid,outcome});
    if (closeRequested && outcome && (outcome.code !== 0 || outcome.signal)) {
      cleanupErrors.push(chromeError(phase, `s'est arrêté anormalement (code ${outcome.code}, signal ${outcome.signal || "aucun"})`, stderrText()));
    }
    if(primaryError && startupStage !== "ready") {
      const path=join(profileDir,"DevToolsActivePort");
      let portFile=null;
      try { portFile=readFileSync(path,"utf8"); } catch {}
      primaryError.chromeStartupDiagnostic={stage:startupStage,pid:child.pid,command:chrome,args,profileDir,requestedPort:0,discoveredPort:port||null,portFileAtFailure,portFileExists:existsSync(path),portFile,processAtFailure,finalOutcome:outcome,stderr,sessionId:sessionId||null,browserContextId:browserContextId||null,cleanupSteps};
      console.error(`${phase}: diagnostic démarrage Chrome ${JSON.stringify(primaryError.chromeStartupDiagnostic)}`);
    }
    if(cleanupErrors.length) throw new AggregateError(primaryError ? [primaryError,...cleanupErrors] : cleanupErrors,`${phase}: erreur ${primaryError ? "de rendu et " : ""}de nettoyage: ${cleanupErrors.map(error=>error.message).join("; ")}`,{cause:primaryError||cleanupErrors[0]});
  }
}
