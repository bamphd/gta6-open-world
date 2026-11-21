// HUD: DOM readouts and the canvas minimap (top-down city, roads, player arrow, mission
// marker, police, cars, medallions). All drawing is 2D canvas, cheap and legible.
import { STREETS } from './world.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const cash = el('cash'), hp = el('hp'), ar = el('ar'), stars = el('stars'), obj = el('obj'),
    msg = el('msg'), wpn = el('wpn'), speed = el('speed'), map = el('map'), xhair = el('xhair'),
    hint = el('hint'), toast = el('toast'), hud = el('hud');
  const mctx = map.getContext('2d');
  let toastT = 0;
  const H = {
    show(on) { hud.classList.toggle('on', on); },
    toast(text, secs) { toast.textContent = text; toast.style.display = 'block'; toastT = secs || 3; },
    update(G, dt) {
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.style.display = 'none'; }
      const P = G.player;
      cash.innerHTML = '$' + Math.floor(G.save.cash).toLocaleString('en-US') + ' <small>SOLMARA</small>';
      hp.firstElementChild.style.width = Math.max(0, P.health) + '%';
      ar.firstElementChild.style.width = Math.max(0, P.armor) + '%';
      let s = '';
      for (let i = 0; i < 5; i++) s += `<span class="${i < G.police.level ? '' : 'off'}">★</span>`;
      stars.innerHTML = s;
      obj.innerHTML = '<b>' + (G.shotObjective || G.missions.objective()) + '</b>';
      msg.textContent = G.police.dispatchT > 0 ? G.police.dispatch : (G.sayText || '');
      const w = G.weapons[G.player.weapon];
      wpn.innerHTML = w.name + ' &middot; ' + P.ammo + '/' + w.mag + (G.player.reloading ? ' …' : '');
      speed.textContent = P.car ? Math.round(Math.abs(P.car.speed) * 3.6) : Math.round(P.speed * 3.6);
      speed.textContent += P.car ? ' km/h' : '';
      xhair.classList.toggle('on', !!P.aiming);
      hint.textContent = G.hint || '';
      H.drawMap(G);
    },
    drawMap(G) {
      const W = 190, C = W / 2, S = W / 640;
      mctx.clearRect(0, 0, W, W);
      mctx.fillStyle = '#10141c'; mctx.beginPath(); mctx.arc(C, C, C - 2, 0, 7); mctx.fill();
      mctx.save();
      mctx.beginPath(); mctx.arc(C, C, C - 2, 0, 7); mctx.clip();
      const X = (x) => C + x * S, Z = (z) => C + z * S;
      // districts
      mctx.fillStyle = '#c8a86a'; mctx.fillRect(0, Z(200), W, W - Z(200));
      mctx.fillStyle = '#5a6a4a'; mctx.fillRect(0, 0, W, Z(-200));
      mctx.fillStyle = '#4a4e52'; mctx.fillRect(0, 0, X(-200), W);
      // roads
      mctx.strokeStyle = '#8a8578'; mctx.lineWidth = 3;
      for (const s of STREETS) {
        mctx.beginPath(); mctx.moveTo(X(s), 0); mctx.lineTo(X(s), W); mctx.stroke();
        mctx.beginPath(); mctx.moveTo(0, Z(s)); mctx.lineTo(W, Z(s)); mctx.stroke();
      }
      // medallions
      mctx.fillStyle = '#ffd34d';
      for (const m of G.world.medallions) if (!m.taken) { mctx.beginPath(); mctx.arc(X(m.x), Z(m.z), 2.5, 0, 7); mctx.fill(); }
      // cars
      mctx.fillStyle = '#d8d8d8';
      for (const c of G.traffic.cars) { mctx.fillRect(X(c.x) - 1.5, Z(c.z) - 1.5, 3, 3); }
      // police
      mctx.fillStyle = '#ff4a4a';
      for (const c of G.police.cruisers) { mctx.beginPath(); mctx.arc(X(c.x), Z(c.z), 3.5, 0, 7); mctx.fill(); }
      if (G.people.heli.state !== 'off') {
        mctx.fillStyle = '#ff8a8a';
        mctx.beginPath(); mctx.arc(X(G.people.heli.x), Z(G.people.heli.z), 4, 0, 7); mctx.fill();
      }
      // mission / next-job marker
      const mp = G.missions.markerPos || (G.missions.next() ? { x: 120, z: 200 } : null);
      if (mp) {
        const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
        mctx.fillStyle = '#ffd34d';
        mctx.beginPath(); mctx.arc(X(mp.x), Z(mp.z), pulse, 0, 7); mctx.fill();
        mctx.fillStyle = '#231303';
        mctx.font = 'bold 9px system-ui'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
        mctx.fillText('V', X(mp.x), Z(mp.z));
      }
      // fare marker
      if (G.farePos) {
        mctx.fillStyle = '#4ade80';
        mctx.beginPath(); mctx.arc(X(G.farePos.x), Z(G.farePos.z), 4, 0, 7); mctx.fill();
        mctx.fillStyle = '#06230f';
        mctx.font = 'bold 8px system-ui'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
        mctx.fillText('$', X(G.farePos.x), Z(G.farePos.z));
      }
      // player arrow
      const P = G.player;
      mctx.save();
      mctx.translate(X(P.x), Z(P.z));
      mctx.rotate(P.heading);
      mctx.fillStyle = '#4ade80';
      mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath(); mctx.fill();
      mctx.restore();
      mctx.restore();
      // north tick
      mctx.fillStyle = '#fff'; mctx.font = 'bold 11px system-ui'; mctx.textAlign = 'center';
      mctx.fillText('N', C, 12);
    },
  };
  return H;
}
