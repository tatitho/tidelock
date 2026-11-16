export function createMinimap(canvas) {
  const g = canvas.getContext('2d');
  const W = 180, H = 140;
  const sx = W / 44, sz = H / 34;
  const X = x => (x + 22) * sx, Z = z => (z + 17) * sz;
  const LABELS = [['A-LONG', -16.5, 0], ['MID', 0, 3], ['B-LONG', 16.5, 0], ['CT CONN', 0, -14], ['A-GATE', -15, -11], ['B-PUMP', 15, -11], ['GANTRY', 0, -2], ['MID-DOORS', 0, 1.2]];
  return {
    draw(state) {
      g.fillStyle = '#0e1622'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#3a4750'; g.lineWidth = 2;
      g.strokeRect(1, 1, W - 2, H - 2);
      const sites = [['A', -15, -11, '#f0a830'], ['B', 15, -11, '#2e8f86']];
      for (let i = 0; i < 2; i++) {
        const s = sites[i];
        g.fillStyle = s[3]; g.globalAlpha = 0.35;
        g.fillRect(X(s[1] - 3), Z(s[2] - 2.5), 6 * sx, 5 * sz);
        g.globalAlpha = 1; g.fillStyle = s[3];
        g.font = 'bold 11px system-ui'; g.fillText(s[0], X(s[1]) - 4, Z(s[2]) + 4);
      }
      g.fillStyle = '#8fa3ad'; g.font = '9px system-ui'; g.textAlign = 'center';
      for (let i = 0; i < LABELS.length; i++) g.fillText(LABELS[i][0], X(LABELS[i][1]), Z(LABELS[i][2]) + 3);
      g.textAlign = 'start';
      if (state.bomb && (state.bomb.status === 'planted' || state.bomb.status === 'dropped')) {
        g.fillStyle = '#f0a830';
        g.beginPath(); g.arc(X(state.bomb.x), Z(state.bomb.z), 4, 0, 6.29); g.fill();
      }
      const ps = state.players || [];
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (i === state.playerId) continue;
        if (p.team !== 'tide') continue;
        g.fillStyle = p.alive ? '#3ddc84' : '#8a8a8a';
        g.beginPath(); g.arc(X(p.x), Z(p.z), 3, 0, 6.29); g.fill();
      }
      const me = ps[state.playerId];
      if (me) {
        g.save(); g.translate(X(me.x), Z(me.z)); g.rotate(-me.yaw);
        g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
        g.restore();
      }
    },
  };
}
