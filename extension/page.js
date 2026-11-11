(() => {
  let media = null;
  let req = null;
  let pm = null;
  let Sound = null;
  let Playlist = null;
  let audio = null;
  let store = null;
  let ready = false;
  let jamOn = false;
  let rate = 1;
  let quietUntil = 0;
  let lastSource = null;
  let lastId = null;
  let finished = null;
  let n = 0;
  let port = null;

  const portPost = MessagePort.prototype.postMessage;
  const up = m => {
    if (port) portPost.call(port, m);
  };

  window.addEventListener(
    'message',
    e => {
      if (port || e.source !== window || !e.data || e.data.__chorusBridge !== 1 || !e.ports || !e.ports[0]) return;
      e.stopImmediatePropagation();
      port = e.ports[0];
      port.onmessage = ev => onDown(ev.data);
    },
    true
  );
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hush = (ms = 1200) => {
    quietUntil = Date.now() + ms;
  };
  const quiet = () => Date.now() < quietUntil;

  const play0 = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this.tagName === 'AUDIO') {
      media = this;
      if (this.playbackRate !== rate) this.playbackRate = rate;
    }
    return play0.apply(this, arguments);
  };

  const session = navigator.mediaSession;
  if (session && session.setActionHandler) {
    const set0 = session.setActionHandler.bind(session);
    session.setActionHandler = (action, fn) => {
      if (fn && (action === 'nexttrack' || action === 'previoustrack')) {
        const orig = fn;
        fn = d => (jamOn ? up({ ev: 'ukey', a: action === 'nexttrack' ? 'next' : 'prev' }) : orig(d));
      }
      return set0(action, fn);
    };
  }

  function find() {
    const jp = window.webpackJsonp;
    if (!jp || !jp.push) return false;
    if (!req) {
      const k = 'chorus' + Math.random().toString(36).slice(2);
      try {
        jp.push([[k], { [k]: (m, e, r) => { req = r; } }, [[k]]]);
      } catch {}
    }
    if (!req || !req.c) return false;
    for (const id in req.c) {
      const ex = req.c[id] && req.c[id].exports;
      if (!ex) continue;
      if (!pm && typeof ex.playSource === 'function' && typeof ex.seekCurrentTo === 'function' && typeof ex.getCurrentSound === 'function') pm = ex;
      else if (!Sound && typeof ex === 'function' && typeof ex.resolve === 'function' && ex.prototype && typeof ex.prototype.seek === 'function' && typeof ex.prototype.getSoundIndex === 'function') Sound = ex;
      else if (!Playlist && typeof ex === 'function' && typeof ex.resolve === 'function' && ex.prototype && typeof ex.prototype.getSounds === 'function' && typeof ex.prototype.seek !== 'function') {
        const src = String(ex.resolve);
        if (src.includes('"sets"') && !src.includes('discover')) Playlist = ex;
      } else if (!audio && typeof ex.setGlobalMuted === 'function' && typeof ex.getGlobalMuted === 'function') audio = ex;
      else if (!store && ex._store && typeof ex.get === 'function' && typeof ex.has === 'function') {
        try {
          if (ex.has('me')) store = ex;
        } catch {}
      }
    }
    return !!(pm && Sound);
  }

  function hook() {
    const seek0 = Sound.prototype.seek;
    Sound.prototype.seek = function (ms) {
      if (jamOn && !quiet() && typeof ms === 'number' && ms > 0 && pm.getCurrentSound() === this) up({ ev: 'useek', ms, id: this.id });
      return seek0.apply(this, arguments);
    };
    const playSource0 = pm.playSource;
    pm.playSource = function (source, sound) {
      if (!quiet() && source && sound && source !== sound) lastSource = { source, id: sound.id, at: Date.now() };
      return playSource0.apply(this, arguments);
    };
    for (const name of ['playNext', 'playPrev']) {
      const orig = pm[name];
      if (typeof orig !== 'function') continue;
      pm[name] = function () {
        if (!jamOn || quiet()) return orig.apply(this, arguments);
        const c = pm.getCurrentSound();
        let end = false;
        try {
          end = !!c && name === 'playNext' && c.currentTime() >= (c.attributes.duration || c.attributes.full_duration || Infinity) - 4000;
        } catch {}
        if (end) finished = c.id;
        else up({ ev: 'ukey', a: name === 'playNext' ? 'next' : 'prev' });
      };
    }
  }

  function art(u) {
    return (u || '').replace('-large.', '-t200x200.');
  }

  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
  function text(s) {
    return String(s || '').replace(/&(amp|lt|gt|quot|apos|#39);/g, (m, k) => entities[k]);
  }

  function plain(a) {
    const u = a.user || {};
    return {
      id: a.id,
      url: a.permalink_url || '',
      title: text(a.title),
      artist: text(u.username),
      art: art(a.artwork_url || u.avatar_url),
      dur: a.duration || a.full_duration || 0,
      genre: a.genre || '',
      uid: (u && u.id) || a.user_id || 0
    };
  }

  function desc(s) {
    return s ? plain({ ...(s.attributes || {}), id: s.id }) : null;
  }

  function me() {
    try {
      const m = store && store.get('me');
      const a = m && m.attributes;
      if (!a || !a.id) return null;
      return { name: a.username || '', avatar: art(a.avatar_url), url: a.permalink_url || '' };
    } catch {
      return null;
    }
  }

  function settle(d, ms) {
    return new Promise((ok, no) => {
      if (!d || typeof d.then !== 'function') {
        no(new Error('resolve'));
        return;
      }
      const timer = setTimeout(() => no(new Error('timeout')), ms);
      d.then(
        v => {
          clearTimeout(timer);
          ok(v);
        },
        e => {
          clearTimeout(timer);
          no(e || new Error('resolve'));
        }
      );
    });
  }

  function partsOf(u) {
    const x = new URL(String(u), location.origin);
    if (x.origin !== location.origin) throw new Error('origin');
    return x.pathname.split('/').filter(Boolean);
  }

  function resolve(u) {
    const parts = partsOf(u);
    if (parts.length < 2 || parts[1] === 'sets') return Promise.reject(new Error('track'));
    return settle(Sound.resolve(parts[0], parts[1], parts[2]), 10000);
  }

  async function fill(sounds) {
    const one = s => (s.get('permalink_url') ? null : settle(s.fetch(), 6000).catch(() => {}));
    for (let i = 0; i < sounds.length; i += 8) await Promise.all(sounds.slice(i, i + 8).map(one));
    return sounds.map(desc).filter(d => d && d.url);
  }

  async function resolveSet(parts) {
    if (!Playlist) throw new Error('playlist');
    const pl = await settle(Playlist.resolve(parts[0], parts[2], parts[3]), 10000);
    return { title: pl.get('title') || '', url: pl.get('permalink_url') || '', list: await fill(pl.getSounds().slice(0, 150)) };
  }

  function label(src) {
    try {
      if (src.get) {
        const t = src.get('title') || src.get('username');
        if (t) return t;
      }
    } catch {}
    const h = document.querySelector('.soundTitle__title, .profileHeaderInfo__userName, .fullHero__title, h1');
    return (h && h.textContent.trim()) || document.title.split('|')[0].trim();
  }

  async function context(s) {
    const src = lastSource;
    if (!src || src.id !== s.id || Date.now() - src.at > 8000) return;
    lastSource = null;
    let sounds = [];
    try {
      sounds = typeof src.source.getSounds === 'function' ? src.source.getSounds() : [];
    } catch {}
    const i = sounds.findIndex(x => x && x.id === s.id);
    if (i < 0) return;
    const rest = sounds.slice(i + 1, i + 151);
    if (!rest.length) return;
    let url = '';
    try {
      url = (src.source.get && src.source.get('permalink_url')) || '';
    } catch {}
    up({ ev: 'ctx', id: s.id, title: label(src.source), url, list: await fill(rest) });
  }

  function clientId() {
    const hit = performance
      .getEntriesByType('resource')
      .map(e => e.name)
      .reverse()
      .find(u => /api-v2\.soundcloud\.com.*[?&]client_id=/.test(u));
    return hit ? new URL(hit).searchParams.get('client_id') : null;
  }

  function script(text) {
    if (/[ğüşıöçĞÜŞİÖÇ]/.test(text)) return 'tr';
    if (/[Ѐ-ӿ]/.test(text)) return 'cyr';
    if (/[؀-ۿ]/.test(text)) return 'ar';
    if (/[぀-ヿ一-鿿가-힯]/.test(text)) return 'cjk';
    return 'lat';
  }

  function related(cid, id, n) {
    return fetch(`https://api-v2.soundcloud.com/tracks/${encodeURIComponent(id)}/related?client_id=${encodeURIComponent(cid)}&limit=${n}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { collection: [] }))
      .then(j => (Array.isArray(j.collection) ? j.collection : []))
      .catch(() => []);
  }

  function playable(a) {
    if (!a || !a.id || !a.permalink_url || a.policy === 'SNIP' || a.policy === 'BLOCK') return false;
    const dur = a.duration || a.full_duration || 0;
    return dur >= 60000 && dur <= 12 * 60000;
  }

  async function recs(seeds, exclude, taste) {
    const cid = clientId();
    if (!cid || !seeds.length) return [];
    taste = taste && typeof taste === 'object' ? taste : {};
    const love = taste.love || {};
    const meh = taste.meh || {};
    const likedGenres = taste.genres || {};
    const heard = new Set((taste.recent || []).map(String));
    const skip = new Set(exclude.map(String));
    const genres = new Map();
    const scripts = new Map();
    const seedArtists = new Set();
    for (const s of seeds) {
      skip.add(String(s.id));
      const g = String(s.genre || '').toLowerCase().trim();
      if (g) genres.set(g, (genres.get(g) || 0) + 1);
      const sc = script(s.title + ' ' + s.artist);
      scripts.set(sc, (scripts.get(sc) || 0) + 1);
      seedArtists.add(String(s.artist || '').toLowerCase());
    }
    const mainScript = [...scripts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const pool = new Map();
    const take = (list, weight) => {
      list.forEach((a, rank) => {
        if (!playable(a) || skip.has(String(a.id))) return;
        const e = pool.get(a.id) || { a, score: 0, hits: 0 };
        e.score += weight * (1 - rank / 60);
        e.hits++;
        pool.set(a.id, e);
      });
    };
    const lists = await Promise.all(seeds.map(s => related(cid, s.id, 40)));
    lists.forEach((list, i) => take(list, 1 + (0.6 * i) / Math.max(1, seeds.length - 1)));
    if ([...pool.values()].filter(e => !heard.has(String(e.a.id))).length < 25) {
      const hop = [...pool.values()].sort((x, y) => y.score - x.score).slice(0, 3);
      const more = await Promise.all(hop.map(e => related(cid, e.a.id, 30)));
      more.forEach(list => take(list, 0.45));
    }
    for (const e of pool.values()) {
      const a = e.a;
      const artist = String((a.user && a.user.username) || '');
      const g = String(a.genre || '').toLowerCase().trim();
      if (g && genres.has(g)) e.score += 0.7 * genres.get(g);
      if (g && likedGenres[g]) e.score += 0.3;
      const sc = script((a.title || '') + ' ' + artist);
      if (sc === mainScript) e.score += 1;
      else if (mainScript !== 'lat' || sc !== 'lat') e.score -= 1.6;
      if (e.hits > 1) e.score += 0.9 * (e.hits - 1);
      if (love[artist]) e.score += 1.2 * love[artist];
      if (meh[artist]) e.score -= 0.6 * meh[artist];
      if (seedArtists.has(artist.toLowerCase())) e.score -= 0.4;
      if (heard.has(String(a.id))) e.score -= 2.5;
      const plays = a.playback_count || 0;
      if (plays) e.score += Math.min(0.6, Math.log10(plays + 1) * 0.1);
      if (plays > 1000 && a.likes_count) e.score += Math.min(0.4, (a.likes_count / plays) * 8);
      e.score += Math.random() * 0.45;
      e.artist = artist;
      e.genre = g;
    }
    const ranked = [...pool.values()].sort((x, y) => y.score - x.score);
    const perArtist = new Map();
    const out = [];
    let lastArtist = '';
    let lastGenre = '';
    let streak = 0;
    while (out.length < 20 && ranked.length) {
      let pick = -1;
      for (let i = 0; i < ranked.length && i < 12; i++) {
        const e = ranked[i];
        const used = perArtist.get(e.artist) || 0;
        if (used >= (out.length < 10 ? 1 : 2)) continue;
        if (e.artist === lastArtist) continue;
        if (e.genre && e.genre === lastGenre && streak >= 3) continue;
        pick = i;
        break;
      }
      if (pick < 0) {
        const i = ranked.findIndex(e => (perArtist.get(e.artist) || 0) < 2);
        if (i < 0) break;
        pick = i;
      }
      const [e] = ranked.splice(pick, 1);
      perArtist.set(e.artist, (perArtist.get(e.artist) || 0) + 1);
      streak = e.genre && e.genre === lastGenre ? streak + 1 : 1;
      lastGenre = e.genre;
      lastArtist = e.artist;
      out.push(plain(e.a));
    }
    return out;
  }

  async function load(m) {
    let snd;
    try {
      snd = await resolve(m.url);
    } catch (e) {
      up({ ev: 'bad', url: m.url });
      throw e;
    }
    const cur = () => pm.getCurrentSound();
    const silent = !m.play && audio && !audio.getGlobalMuted();
    if (silent) audio.setGlobalMuted(true);
    try {
      hush();
      if (!cur() || cur().id !== snd.id) pm.playSource(snd, snd);
      for (let i = 0; i < 160 && (!cur() || cur().id !== snd.id); i++) await sleep(25);
      const s = cur();
      if (!s || s.id !== snd.id) {
        up({ ev: 'bad', url: m.url });
        return;
      }
      hush();
      const pos = m.live ? m.pos + (Date.now() - m.sent) + 60 : m.pos;
      if (pos > 300) s.seek(pos);
      if (m.play) {
        if (!pm.isPlaying()) pm.playCurrent({ allowAdBreak: false });
      } else {
        pm.pauseCurrent();
        if (pos <= 300) s.seek(0);
      }
    } finally {
      if (silent) setTimeout(() => audio.setGlobalMuted(false), 120);
    }
  }

  async function run(m) {
    const s = pm.getCurrentSound();
    if (m.c === 'play' || m.c === 'seek' || m.c === 'load') finished = null;
    switch (m.c) {
      case 'jam':
        jamOn = !!m.on;
        break;
      case 'rate':
        if (typeof m.r !== 'number' || !(m.r >= 0.9 && m.r <= 1.1)) break;
        rate = m.r;
        if (media && media.playbackRate !== rate) media.playbackRate = rate;
        break;
      case 'play':
        hush();
        pm.playCurrent({ allowAdBreak: false });
        break;
      case 'pause':
        hush();
        pm.pauseCurrent();
        break;
      case 'seek':
        if (s && typeof m.ms === 'number' && Number.isFinite(m.ms)) {
          hush();
          s.seek(Math.max(0, m.ms));
        }
        break;
      case 'load':
        await load(m);
        break;
      case 'resolve': {
        const parts = partsOf(m.path);
        if (parts[1] === 'sets') up({ ev: 'res', rid: m.rid, ...(await resolveSet(parts)) });
        else up({ ev: 'res', rid: m.rid, t: desc(await resolve(m.path)) });
        break;
      }
      case 'warm':
        resolve(m.url).catch(() => {});
        break;
      case 'recs':
        up({ ev: 'recs', list: await recs(Array.isArray(m.seeds) ? m.seeds : [], Array.isArray(m.exclude) ? m.exclude : [], m.taste) });
        break;
    }
  }

  function onDown(m) {
    if (!pm || !m || typeof m.c !== 'string') return;
    run(m).catch(err => {
      if (m.rid) up({ ev: 'res', rid: m.rid, err: String((err && err.message) || err) });
    });
  }

  setInterval(() => {
    if (!ready) {
      if (!find()) return;
      ready = true;
      hook();
    }
    if (n++ % 15 === 0) {
      if (!store || !audio) find();
      up({ ev: 'me', me: me() });
    }
    const s = pm.getCurrentSound();
    let pos = 0;
    let buf = false;
    if (s) {
      try {
        pos = s.currentTime();
        buf = !!(s.player && s.player.isLoading && s.player.isLoading());
      } catch {}
      if (s.id !== lastId) {
        lastId = s.id;
        context(s).catch(() => {});
      }
    }
    up({ ev: 'tick', ts: Date.now(), t: desc(s), playing: !!(s && pm.isPlaying()), pos, buf, fin: !!s && finished === s.id });
  }, 200);
})();
