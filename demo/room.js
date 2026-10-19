// A simple furnished room for the Room planner demo, so the UI is seen the
// way it would be in mixed reality: floating in a real, lit space.
// Hidden in mixed reality, where the real room shows through.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  const plankW = 128;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x < 1024; x += plankW) {
    for (let y = -rnd() * 512; y < 1024; y += 512) {
      const l = 52 + rnd() * 10;
      g.fillStyle = `hsl(30, 32%, ${l}%)`;
      g.fillRect(x, y, plankW, 512);
      g.strokeStyle = 'rgba(60,35,15,0.12)';
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        const yy = y + rnd() * 512;
        g.moveTo(x, yy);
        g.bezierCurveTo(x + 40, yy + rnd() * 8, x + 90, yy - rnd() * 8, x + plankW, yy);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,25,10,0.35)';
      g.fillRect(x, y, 2, 512);
      g.fillRect(x, y, plankW, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.anisotropy = 8;
  return t;
}

export function buildRoom() {
  const room = new THREE.Group();
  const W = 5, D = 5.5, H = 2.7;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -1.2;
  floor.receiveShadow = true;
  room.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9d3ca, roughness: 0.95 });
  const wall = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    room.add(m);
  };
  wall(W, H, 0, H / 2, -1.2 - D / 2, 0);
  wall(D, H, -W / 2, H / 2, -1.2, Math.PI / 2);
  wall(D, H, W / 2, H / 2, -1.2, -Math.PI / 2);
  wall(W, H, 0, H / 2, -1.2 + D / 2, Math.PI);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H, -1.2);
  room.add(ceiling);

  // A tall window on the left wall: the main light.
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.7), new THREE.MeshBasicMaterial({ color: 0xf6f8ff }));
  glass.position.set(-W / 2 + 0.01, 1.45, -2.0);
  glass.rotation.y = Math.PI / 2;
  room.add(glass);
  const sun = new THREE.DirectionalLight(0xfff3e2, 1.7);
  sun.position.set(-2.4, 2.6, -1.4);
  sun.target.position.set(0.4, 0, -1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -3; sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 3; sun.shadow.camera.bottom = -3;
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  room.add(sun, sun.target);
  room.add(new THREE.HemisphereLight(0xfaf7f2, 0x6a5a48, 0.45));

  // Rug, sofa, coffee table.
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.2, 0.004, -2.1);
  rug.receiveShadow = true;
  room.add(rug);

  const fabric = new THREE.MeshStandardMaterial({ color: 0x7d8590, roughness: 0.9 });
  const box = (w, h, d, x, y, z, mat = fabric, r = 0.04) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    room.add(m);
    return m;
  };
  const sx = 0.2, sz = -3.4;
  box(2.1, 0.42, 0.95, sx, 0.25, sz);
  box(2.1, 0.5, 0.22, sx, 0.62, sz - 0.37);
  box(0.22, 0.6, 0.95, sx - 1.0, 0.36, sz);
  box(0.22, 0.6, 0.95, sx + 1.0, 0.36, sz);
  for (const dx of [-0.48, 0.48]) box(0.92, 0.14, 0.7, sx + dx, 0.52, sz + 0.06, fabric, 0.06);
  const oak = new THREE.MeshStandardMaterial({ color: 0x9a7350, roughness: 0.55 });
  box(1.0, 0.05, 0.55, 0.2, 0.4, -2.2, oak, 0.02);
  for (const [dx, dz] of [[-0.44, -0.22], [0.44, -0.22], [-0.44, 0.22], [0.44, 0.22]]) box(0.04, 0.38, 0.04, 0.2 + dx, 0.19, -2.2 + dz, oak, 0.01);

  // Floor lamp: its brightness is driven by the Z-Slider in the demo.
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4, metalness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 16), metal);
  pole.position.set(1.6, 0.75, -3.2);
  room.add(pole);
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.9, emissive: 0xffd9a0, emissiveIntensity: 0, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 32, 1, true), shadeMat);
  shade.position.set(1.6, 1.55, -3.2);
  room.add(shade);
  const lampLight = new THREE.PointLight(0xffc98a, 0, 6, 1.6);
  lampLight.position.set(1.6, 1.5, -3.2);
  room.add(lampLight);

  const setLamp = v => {
    lampLight.intensity = v * 6;
    shadeMat.emissiveIntensity = v * 1.4;
  };
  return { room, setLamp };
}
