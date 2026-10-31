// OBS : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap obWrap\">\n      <div class=\"agHead\"><span class=\"label\">OBS</span><span class=\"hint\" id=\"obInfo\"></span><div class=\"agNav\"><button class=\"btn px\" id=\"obLaunch\" title=\"Démarre OBS Studio\">LANCER OBS</button><button class=\"btn main px\" id=\"obConnectBtn\">CONNEXION</button></div></div>\n      <div id=\"obSetup\" class=\"sysCard px obSetup\"><span class=\"label\">Connexion à OBS</span>\n        <div class=\"hint\">Dans OBS : <b>Outils › Paramètres du serveur WebSocket</b> › coche « Activer le serveur WebSocket », puis « Afficher les infos de connexion » pour voir le port et le mot de passe. Le mot de passe reste sur ce PC.</div>\n        <div class=\"row\"><input class=\"f\" id=\"obHost\" placeholder=\"Adresse (127.0.0.1)\"><input class=\"f\" id=\"obPort\" type=\"number\" placeholder=\"Port (4455)\"><input class=\"f\" id=\"obPw\" type=\"password\" placeholder=\"Mot de passe du serveur\"><button class=\"btn main px\" id=\"obSave\">SE CONNECTER</button></div></div>\n      <div id=\"obMain\" class=\"obMain\">\n        <div class=\"obLeft\"><div class=\"obScreen px\"><img id=\"obShot\" alt=\"\"><span id=\"obLive\" class=\"obBadge\"></span><span id=\"obRec\" class=\"obBadge rec\"></span><span id=\"obCur\" class=\"obCur\"></span></div>\n          <div class=\"obCtl\"><button class=\"btn main px\" id=\"obStreamBtn\">LANCER LE LIVE</button><button class=\"btn px\" id=\"obRecBtn\">ENREGISTRER</button><button class=\"btn px\" id=\"obPauseBtn\">PAUSE</button></div>\n          <div class=\"hint\" id=\"obStats\"></div></div>\n        <div class=\"obRight\"><div class=\"sysCard px\"><span class=\"label\">Scènes</span><div id=\"obScenes\" class=\"obScenes\"></div></div><div class=\"sysCard px\"><span class=\"label\">Audio</span><div id=\"obAudio\"></div></div></div>\n      </div>\n    </div>";
/*CSS-MOVED*/ const CSS = `.obWrap{max-width:1400px}
.obSetup .row{flex-wrap:wrap}
.obSetup .f{width:200px}
#obInfo.err{color:#ff7a8a}
.obMain{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
.obLeft{display:flex;flex-direction:column;gap:10px}
.obScreen{position:relative;aspect-ratio:16/9;background:#000;--fill:#000;display:grid;place-items:center;overflow:hidden}
.obScreen img{width:100%;height:100%;object-fit:contain}
.obBadge{position:absolute;left:10px;top:10px;font:11px var(--title);padding:6px 8px;background:rgba(5,1,11,.75);color:var(--muted)}
.obBadge.on{background:#c42a3c;color:#fff;box-shadow:0 0 12px #ff4f6d}
.obBadge.rec{left:auto;right:10px}
.obBadge.rec:empty{display:none}
.obCur{position:absolute;left:10px;bottom:10px;font:10px var(--title);color:#fff;background:rgba(5,1,11,.7);padding:5px 7px}
.obCtl{display:flex;gap:8px;flex-wrap:wrap}
#obStreamBtn.stop{background:#c42a3c}
.obRight{display:flex;flex-direction:column;gap:12px}
.obScenes{display:flex;flex-direction:column;gap:6px}
.obScene{text-align:left}
.obA{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin:6px 0}
.obA span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.obA input{grid-column:1/-1;width:100%;accent-color:var(--magenta)}
`;  // le style de ce plugin (il utilise les variables du thème de NeoBase)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const nbConfirm = host.confirm;  // la boîte de confirmation de NeoBase, à la place de celle de Windows
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
  view.innerHTML = HTML;
  const $ = id => id === "obsApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const __ls = (await doc('local')) || {}; let __lsT = null, __lsNew = false;
  for (const k of ["neoObs"]) if (__ls[k] === undefined) { const v = legacy.local ? legacy.local(k) : null; if (v != null) { __ls[k] = v; __lsNew = true; } }  // première ouverture : tu retrouves ce que tu avais
  const __lsSave = () => { clearTimeout(__lsT); __lsT = setTimeout(() => folder.write('local', __ls).catch(() => {}), 400); };
  if (__lsNew) __lsSave();
  const localStorage = new Proxy(__ls, { get: (t, k) => k === 'getItem' ? (x => t[x] ?? null) : k === 'setItem' ? ((x, v) => { t[x] = String(v); __lsSave(); }) : t[k], set: (t, k, v) => { t[k] = String(v); __lsSave(); return true; } });
  // ---- ton code d'origine ----
/* ---------- OBS, as an app of NeoBase: drives OBS Studio through its own WebSocket server (OBS 28 and later: Outils > Paramètres du
   serveur WebSocket). The live picture of the program, the scenes, going live, recording, the audio sources and the stats.
   The connection (address, port, password) stays on this PC (localStorage): it is OBS's own password, typed here by you. ---------- */
const OB = {subs: 1 | 4 | 8 | 64};  // events: general, scenes, inputs, outputs
let ob = {ws: null, ok: false, n: 0, wait: new Map(), scenes: [], cur: '', stream: {}, rec: {}, stats: {}, audio: [], shot: 0, poll: 0};
const obCfg = () => { try { return JSON.parse(localStorage.neoObs || '{}'); } catch { return {}; } };
const b64sha = async s => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))));
function obReq(type, data = {}) {
  return new Promise((ok, ko) => {
    if (!ob.ok) return ko(new Error('OBS n\'est pas connecté'));
    const id = 'r' + (++ob.n); ob.wait.set(id, {ok, ko, t: setTimeout(() => { ob.wait.delete(id); ko(new Error('OBS ne répond pas')); }, 8000)});
    ob.ws.send(JSON.stringify({op: 6, d: {requestType: type, requestId: id, requestData: data}}));
  });
}
function obConnect() {
  const c = obCfg(); obClose();
  const ws = new WebSocket('ws://' + (c.host || '127.0.0.1') + ':' + (c.port || 4455)); ob.ws = ws;
  obStatus('Connexion à OBS…');
  ws.onmessage = async e => {
    const m = JSON.parse(e.data);
    if (m.op === 0) {  // Hello: identify, with the password if OBS asks one
      const a = m.d.authentication, d = {rpcVersion: 1, eventSubscriptions: OB.subs};
      if (a) { if (!c.pw) { obStatus('OBS demande un mot de passe', true); return ws.close(); } d.authentication = await b64sha(await b64sha(c.pw + a.salt) + a.challenge); }
      ws.send(JSON.stringify({op: 1, d}));
    } else if (m.op === 2) { ob.ok = true; obStatus('Connecté à OBS'); obLoad(); }
    else if (m.op === 7) { const w = ob.wait.get(m.d.requestId); if (!w) return; ob.wait.delete(m.d.requestId); clearTimeout(w.t); m.d.requestStatus.result ? w.ok(m.d.responseData || {}) : w.ko(new Error(m.d.requestStatus.comment || 'refusé par OBS')); }
    else if (m.op === 5) obEvent(m.d.eventType, m.d.eventData || {});
  };
  ws.onclose = e => { const was = ob.ok; ob.ok = false; for (const w of ob.wait.values()) w.ko(new Error('déconnecté')); ob.wait.clear(); obStatus(e.code === 4009 ? 'Mot de passe refusé par OBS' : was ? 'OBS s\'est déconnecté' : 'OBS ne répond pas : lance-le et active son serveur WebSocket', !was || e.code === 4009); obRender(); };
}
function obClose() { if (ob.ws) { ob.ws.onclose = null; ob.ws.close(); } ob.ws = null; ob.ok = false; }
function obStatus(t, err) { $('obInfo').textContent = t; $('obInfo').classList.toggle('err', !!err); $('obSetup').style.display = ob.ok ? 'none' : ''; $('obMain').style.display = ob.ok ? '' : 'none'; $('obConnectBtn').textContent = ob.ok ? 'DÉCONNEXION' : 'CONNEXION'; }
async function obLoad() {
  try {
    const [sl, st, rc] = await Promise.all([obReq('GetSceneList'), obReq('GetStreamStatus'), obReq('GetRecordStatus')]);
    ob.scenes = sl.scenes.slice().reverse().map(s => s.sceneName); ob.cur = sl.currentProgramSceneName; ob.stream = st; ob.rec = rc;
    // the audio sources: the inputs that have a mute switch
    const {inputs} = await obReq('GetInputList');
    ob.audio = (await Promise.all(inputs.map(i => Promise.all([obReq('GetInputMute', {inputName: i.inputName}), obReq('GetInputVolume', {inputName: i.inputName})]).then(([m, v]) => ({name: i.inputName, muted: m.inputMuted, vol: v.inputVolumeMul}), () => null)))).filter(Boolean);
  } catch (e) { toast('OBS : ' + e.message, true); }
  obRender(); obTick();
}
function obEvent(type, d) {
  if (type === 'CurrentProgramSceneChanged') ob.cur = d.sceneName;
  else if (type === 'SceneListChanged' || type === 'InputCreated' || type === 'InputRemoved' || type === 'InputNameChanged') return obLoad();
  else if (type === 'StreamStateChanged') ob.stream.outputActive = d.outputActive;
  else if (type === 'RecordStateChanged') { ob.rec.outputActive = d.outputActive; ob.rec.outputPaused = d.outputState === 'OBS_WEBSOCKET_OUTPUT_PAUSED'; }
  else if (type === 'InputMuteStateChanged') { const a = ob.audio.find(x => x.name === d.inputName); if (a) a.muted = d.inputMuted; }
  else if (type === 'InputVolumeChanged') { const a = ob.audio.find(x => x.name === d.inputName); if (a) a.vol = d.inputVolumeMul; }
  else if (type === 'ExitStarted') return obClose(), obStatus('OBS s\'est fermé', true);
  obRender();
}
// while the app is shown: the picture of the program about 2 times a second, the stats and the timers every second
async function obTick() {
  clearTimeout(ob.poll);
  if (!ob.ok) return;
  ob.poll = setTimeout(obTick, 500);
  if (!view.classList.contains('on') || document.hidden) return;
  try {
    const shot = await obReq('GetSourceScreenshot', {sourceName: ob.cur, imageFormat: 'jpg', imageWidth: 960, imageCompressionQuality: 70});
    $('obShot').src = shot.imageData;
    if (++ob.shot % 2) { [ob.stats, ob.stream, ob.rec] = await Promise.all([obReq('GetStats'), obReq('GetStreamStatus'), obReq('GetRecordStatus')]); obRenderStatus(); }
  } catch {}
}
const obTc = t => (t || '00:00:00').split('.')[0];
function obRenderStatus() {
  const s = ob.stream, r = ob.rec, st = ob.stats;
  $('obLive').textContent = s.outputActive ? '● EN DIRECT ' + obTc(s.outputTimecode) : 'HORS LIGNE'; $('obLive').classList.toggle('on', !!s.outputActive);
  $('obRec').textContent = r.outputActive ? (r.outputPaused ? '❚❚ PAUSE ' : '● ENREG ') + obTc(r.outputTimecode) : ''; $('obRec').classList.toggle('on', !!r.outputActive);
  $('obStreamBtn').textContent = s.outputActive ? 'ARRÊTER LE LIVE' : 'LANCER LE LIVE'; $('obStreamBtn').classList.toggle('stop', !!s.outputActive);
  $('obRecBtn').textContent = r.outputActive ? 'ARRÊTER L\'ENREGISTREMENT' : 'ENREGISTRER'; $('obPauseBtn').disabled = !r.outputActive; $('obPauseBtn').textContent = r.outputPaused ? 'REPRENDRE' : 'PAUSE';
  const drop = s.outputTotalFrames ? (s.outputSkippedFrames / s.outputTotalFrames * 100).toFixed(1) : '0.0';
  $('obStats').textContent = st.activeFps ? Math.round(st.activeFps) + ' i/s · processeur ' + st.cpuUsage.toFixed(1).replace('.', ',') + ' % · mémoire ' + Math.round(st.memoryUsage) + ' Mo · images perdues ' + drop.replace('.', ',') + ' %' : '';
}
function obRender() {
  if (!ob.ok) return;
  $('obScenes').replaceChildren(...ob.scenes.map(n => { const b = el('button', 'btn px obScene' + (n === ob.cur ? ' main' : ''), n); b.onclick = () => obReq('SetCurrentProgramScene', {sceneName: n}).catch(e => toast(e.message, true)); return b; }));
  $('obAudio').replaceChildren(...(ob.audio.length ? ob.audio.map(a => {
    const r = el('div', 'obA'), m = el('button', 'btn px' + (a.muted ? '' : ' main'), a.muted ? '🔇' : '🔊'), v = Object.assign(el('input'), {type: 'range', min: 0, max: 100, value: Math.round(Math.sqrt(a.vol) * 100)});
    m.title = a.muted ? 'Réactiver' : 'Couper'; m.onclick = () => obReq('ToggleInputMute', {inputName: a.name}).catch(e => toast(e.message, true));
    v.oninput = () => obReq('SetInputVolume', {inputName: a.name, inputVolumeMul: (v.value / 100) ** 2}).catch(() => {});  // the slider follows the ear (squared), like OBS's
    r.append(m, el('span', '', a.name), v); return r;
  }) : [el('div', 'hint', 'Aucune source audio.')]));
  $('obCur').textContent = ob.cur;
  obRenderStatus();
}
async function obOpen() {
  const c = obCfg(); $('obHost').value = c.host || '127.0.0.1'; $('obPort').value = c.port || 4455; $('obPw').value = c.pw || '';
  if (!ob.ws && (c.saved || c.host)) obConnect(); else obStatus(ob.ok ? 'Connecté à OBS' : 'Pas connecté à OBS');
  if (ob.ok) obTick();
}
$('obSave').onclick = () => { localStorage.neoObs = JSON.stringify({host: $('obHost').value.trim() || '127.0.0.1', port: +$('obPort').value || 4455, pw: $('obPw').value, saved: true}); obConnect(); };
$('obConnectBtn').onclick = () => { if (ob.ok) { obClose(); obStatus('Déconnecté'); } else obConnect(); };
$('obLaunch').onclick = () => neo.obsLaunch().then(() => { toast('OBS démarre…'); setTimeout(obConnect, 6000); }, e => toast(e.message.replace(/^.*Error: /, ''), true));
$('obStreamBtn').onclick = async () => { if (!await nbConfirm(ob.stream.outputActive ? 'Arrêter le live ?' : 'Lancer le live ?')) return; obReq('ToggleStream').catch(e => toast(e.message, true)); };
$('obRecBtn').onclick = () => obReq('ToggleRecord').catch(e => toast(e.message, true));
$('obPauseBtn').onclick = () => obReq('ToggleRecordPause').catch(e => toast(e.message, true));  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { obOpen(); });
}
