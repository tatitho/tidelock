export function createInput(canvas, onLockChange) {
  const st = {
    keys: new Set(), lookX: 0, lookY: 0, firing: false, ads: false,
    wheel: 0, locked: false, useHeld: false,
  };
  function onLock() {
    st.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(st.locked);
  }
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('click', () => { if (!st.locked) canvas.requestPointerLock(); });
  document.addEventListener('mousemove', e => {
    if (!st.locked) return;
    st.lookX += e.movementX; st.lookY += e.movementY;
  });
  document.addEventListener('mousedown', e => {
    if (!st.locked) return;
    if (e.button === 0) st.firing = true;
    if (e.button === 2) st.ads = true;
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) st.firing = false;
    if (e.button === 2) st.ads = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('wheel', e => { if (st.locked) st.wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('keydown', e => {
    st.keys.add(e.code);
    if (e.code === 'KeyE') st.useHeld = true;
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', e => {
    st.keys.delete(e.code);
    if (e.code === 'KeyE') st.useHeld = false;
  });
  return {
    state: st,
    requestLock() { canvas.requestPointerLock(); },
    takeLook() {
      const r = { dx: st.lookX, dy: st.lookY };
      st.lookX = 0; st.lookY = 0; return r;
    },
    takeWheel() { const w = st.wheel; st.wheel = 0; return w; },
  };
}
