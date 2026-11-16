"use client";

/**
 * The 3D desk lamp on the sign-in page (three.js via React Three Fiber).
 *
 * - The lamp is built from simple shapes in code (no model file to download).
 * - The pull-cord is a small spring simulation: drag the brass handle down (mouse or finger) and it
 *   clicks the light on/off once pulled far enough; let go and it springs back and swings.
 *   A quick tap on the handle works too.
 * - Loaded only on /login (next/dynamic, client-only), so the rest of the dashboard never ships three.js.
 */

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type LampSceneProps = {
  on: boolean;
  /** The cord was pulled (or tapped): flip the light. */
  onPull: () => void;
  reducedMotion: boolean;
  /** HTML label kept next to the cord's handle ("Pull the cord to sign in"). */
  hintRef: React.RefObject<HTMLDivElement>;
};

const METAL = "#555d6a";
const BRASS = "#c9a24a";
const WARM = new THREE.Color("#ffd9a3");

// Lamp skeleton (lamp units; the base sits on y = 0).
const P_BASE = new THREE.Vector3(0, 0.16, 0);
const P_ELBOW = new THREE.Vector3(0.55, 2.0, 0);
const P_HEAD = new THREE.Vector3(1.55, 2.9, 0);

// Shade profile (radius, height) turned around its axis; the opening (radius 0.62) is at the top.
const RIM_R = 0.62;
const RIM_Z = 0.75;
const SHADE_PROFILE = [
  [0.001, -0.16], [0.12, -0.155], [0.2, -0.12], [0.24, -0.05], [0.25, 0.02], [RIM_R, RIM_Z],
].map(([x, y]) => new THREE.Vector2(x, y));

const CORD_LEN = 1.0;   // resting length of the cord (lamp units)
const TRIGGER = 0.42;   // pull this far to click the switch
const MAX_PULL = 1.1;
const SPOT_MAX = 26;

// Bulb flicker when switching on (seconds, brightness).
const FLICKER: [number, number][] = [[0, 0], [0.05, 0.85], [0.09, 0.12], [0.16, 0.95], [0.21, 0.35], [0.32, 1]];
function flicker(t: number): number {
  if (t >= 0.32) return 1;
  for (let i = 1; i < FLICKER.length; i++) {
    const [t1, v1] = FLICKER[i];
    if (t <= t1) {
      const [t0, v0] = FLICKER[i - 1];
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
  }
  return 1;
}

const BEAM_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = /* glsl */ `
uniform float uLevel; uniform vec3 uColor;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  float fall = pow(1.0 - vUv.y, 1.7);
  float edge = pow(abs(dot(vN, vV)), 2.2);
  gl_FragColor = vec4(uColor, fall * edge * 0.30 * uLevel);
}`;

export default function LampScene(props: LampSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 35, position: [0, 1.9, 9], near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
    >
      <Scene {...props} />
    </Canvas>
  );
}

function Arm({ from, to, radius }: { from: THREE.Vector3; to: THREE.Vector3; radius: number }) {
  const { pos, quat, len } = useMemo(() => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { pos: from.clone().add(to).multiplyScalar(0.5), quat, len };
  }, [from, to]);
  return (
    <mesh position={pos} quaternion={quat}>
      <cylinderGeometry args={[radius, radius, len, 24]} />
      <meshStandardMaterial color={METAL} metalness={0.3} roughness={0.42} />
    </mesh>
  );
}

function Joint({ at, r = 0.11 }: { at: THREE.Vector3; r?: number }) {
  return (
    <group position={at}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, 0.13, 28]} />
        <meshStandardMaterial color="#2c3038" metalness={0.3} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0, 0.07]}>
        <torusGeometry args={[r * 0.8, 0.022, 12, 36]} />
        <meshStandardMaterial color={BRASS} metalness={0.75} roughness={0.28} />
      </mesh>
    </group>
  );
}

function Scene({ on, onPull, reducedMotion, hintRef }: LampSceneProps) {
  const { camera, size, gl } = useThree();
  const desktop = size.width >= 1024;

  const lampRef = useRef<THREE.Group>(null!);
  const shadeRef = useRef<THREE.Group>(null!);
  const spotRef = useRef<THREE.SpotLight>(null!);
  const glowRef = useRef<THREE.PointLight>(null!);
  const warmRef = useRef<THREE.HemisphereLight>(null!);
  const bulbMat = useRef<THREE.MeshStandardMaterial>(null!);
  const innerMat = useRef<THREE.MeshStandardMaterial>(null!);
  const cordRef = useRef<THREE.Mesh>(null!);
  const beadRef = useRef<THREE.Group>(null!);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const shadeGeo = useMemo(() => new THREE.LatheGeometry(SHADE_PROFILE, 64), []);
  const beamUniforms = useMemo(() => ({ uLevel: { value: 0 }, uColor: { value: WARM.clone() } }), []);
  const glowSprite = useRef<THREE.Sprite>(null!);
  const glowTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,246,220,1)");
    grd.addColorStop(0.25, "rgba(255,214,150,0.55)");
    grd.addColorStop(1, "rgba(255,200,120,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);

  const onPullRef = useRef(onPull);
  onPullRef.current = onPull;

  // Where the lamp stands and where it shines, from the screen size.
  const layout = useMemo(() => {
    const cam = desktop ? new THREE.Vector3(0, 1.9, 9) : new THREE.Vector3(0, 0.2, 12.5);
    const look = new THREE.Vector3(0, cam.y, 0);
    const h = 2 * cam.z * Math.tan(THREE.MathUtils.degToRad(35 / 2));
    const w = h * (size.width / Math.max(1, size.height));
    if (desktop) {
      return {
        cam, look, scale: 1,
        base: new THREE.Vector3(-0.22 * w - 0.75, 0, 0),
        target: new THREE.Vector3(0.27 * w, 1.6, -1.2), // toward the sign-in card on the right
      };
    }
    const scale = Math.min(0.8, (w - 0.3) / 3.35); // keep the whole lamp on narrow phones
    const top = look.y + h / 2;
    return {
      cam, look, scale,
      base: new THREE.Vector3(-w / 2 + 0.9 * scale + 0.12, top - 0.45 - 3.5 * scale, 0),
      target: new THREE.Vector3(0.5, look.y - h * 0.32, 0.6), // down onto the card
    };
  }, [desktop, size.width, size.height]);

  useEffect(() => {
    camera.position.copy(layout.cam);
    camera.lookAt(layout.look);
    camera.updateProjectionMatrix();
  }, [camera, layout]);

  useEffect(() => {
    spotRef.current.target = spotTarget;
  }, [spotTarget]);

  const sim = useRef({
    level: on ? 1 : 0, onAt: on ? -10 : -1, prevOn: on,
    pull: 0, pullV: 0, swing: 0, swingV: 0,
    dragging: false, fired: false, downAt: 0, maxPull: 0,
    aim: new THREE.Vector3(), lampYaw: 0, ready: false,
  });
  const ndc = useRef(new THREE.Vector2());
  const tmp = useMemo(() => ({
    q: new THREE.Quaternion(), v: new THREE.Vector3(), top: new THREE.Vector3(), bead: new THREE.Vector3(),
    goal: new THREE.Vector3(), ray: new THREE.Raycaster(), plane: new THREE.Plane(), hit: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0), dir: new THREE.Vector3(),
  }), []);

  // Drag the cord's handle. Window listeners so the drag keeps working outside the handle.
  const onHandleDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const s = sim.current;
    s.dragging = true; s.fired = false; s.maxPull = 0; s.downAt = performance.now();
    const rect = gl.domElement.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      ndc.current.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      s.dragging = false;
      // A quick tap (no real pull) flips the light too, with a little tug animation.
      if (!s.fired && performance.now() - s.downAt < 300 && s.maxPull < 0.12 * layout.scale) {
        s.pullV = 3.4 * layout.scale;
        s.swingV += 0.5 * layout.scale;
        onPullRef.current();
      }
    };
    move(e.nativeEvent);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.body.style.cursor = "grabbing";
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = sim.current;
    const t = state.clock.elapsedTime;
    const scale = layout.scale;

    // ---- light level (flicker on, quick fade off) ----
    if (on !== s.prevOn) { if (on) s.onAt = t; s.prevOn = on; }
    if (on) s.level = reducedMotion ? Math.min(1, s.level + dt * 6) : flicker(t - s.onAt);
    else s.level = Math.max(0, s.level - dt * 7);
    const L = s.level;
    spotRef.current.intensity = L * SPOT_MAX;
    glowRef.current.intensity = L * 3;
    warmRef.current.intensity = L * 0.45;
    bulbMat.current.emissiveIntensity = 0.05 + L * 5;
    innerMat.current.emissiveIntensity = 0.03 + L * 1.2;
    beamUniforms.uLevel.value = L;
    glowSprite.current.material.opacity = L * 0.9;
    glowSprite.current.scale.setScalar(0.4 + L * 1.5);

    // ---- place the lamp; the head gently follows the pointer ----
    const lamp = lampRef.current;
    lamp.position.copy(layout.base);
    lamp.scale.setScalar(scale);
    const still = reducedMotion || s.dragging;
    const px = still ? 0 : state.pointer.x;
    const py = still ? 0 : state.pointer.y;
    tmp.goal.copy(layout.target).add(tmp.v.set(px * 0.9, py * 0.6, 0));
    if (!s.ready) { s.aim.copy(tmp.goal); s.ready = true; }
    else s.aim.lerp(tmp.goal, 1 - Math.exp(-dt * 3));
    s.lampYaw += ((still ? 0 : px * 0.12) - s.lampYaw) * (1 - Math.exp(-dt * 3));
    lamp.rotation.y = s.lampYaw;
    lamp.updateMatrixWorld();
    const shade = shadeRef.current;
    shade.lookAt(s.aim);
    shade.updateMatrixWorld(true);

    // ---- cord hangs from the lowest point of the shade's rim ----
    shade.getWorldQuaternion(tmp.q).invert();
    tmp.v.set(0, -1, 0).applyQuaternion(tmp.q);
    tmp.v.z = 0;
    if (tmp.v.lengthSq() < 1e-6) tmp.v.set(0, -1, 0);
    tmp.v.normalize().multiplyScalar(RIM_R * 0.96);
    tmp.v.z = RIM_Z;
    const top = shade.localToWorld(tmp.top.copy(tmp.v));
    const restLen = CORD_LEN * scale;

    if (s.dragging) {
      tmp.ray.setFromCamera(ndc.current, camera);
      tmp.plane.set(new THREE.Vector3(0, 0, 1), -top.z);
      if (tmp.ray.ray.intersectPlane(tmp.plane, tmp.hit)) {
        s.pull = THREE.MathUtils.clamp(top.y - restLen - tmp.hit.y, 0, MAX_PULL * scale);
        s.swing = THREE.MathUtils.clamp(tmp.hit.x - top.x, -0.6 * scale, 0.6 * scale);
        s.pullV = 0; s.swingV = 0;
        s.maxPull = Math.max(s.maxPull, s.pull);
        if (!s.fired && s.pull > TRIGGER * scale) {
          s.fired = true; // click once per pull, like a real switch
          onPullRef.current();
        }
      }
    } else {
      // springs: the cord snaps back up and the handle swings to rest
      s.pullV += (-95 * s.pull - 9 * s.pullV) * dt;
      s.pull += s.pullV * dt;
      if (s.pull < 0) { s.pull = 0; s.pullV *= -0.25; }
      s.swingV += (-28 * s.swing - 2 * s.swingV) * dt;
      s.swing += s.swingV * dt;
    }

    const bead = tmp.bead.set(top.x + s.swing, top.y - restLen - s.pull, top.z);
    beadRef.current.position.copy(bead);
    beadRef.current.scale.setScalar(scale);
    const cord = cordRef.current;
    tmp.dir.copy(bead).sub(top);
    const len = Math.max(0.001, tmp.dir.length());
    cord.position.copy(top).add(bead).multiplyScalar(0.5);
    cord.quaternion.setFromUnitVectors(tmp.up, tmp.dir.normalize());
    cord.scale.set(scale, len, scale);

    // ---- keep the HTML hint next to the handle ----
    const el = hintRef.current;
    if (el && desktop) {
      tmp.v.copy(bead).project(camera);
      const x = (tmp.v.x * 0.5 + 0.5) * size.width;
      const y = (-tmp.v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${Math.round(x + 26)}px, ${Math.round(y - 12)}px)`;
      el.style.opacity = "1";
    }
  });

  return (
    <>
      {/* Faint room light so the lamp is visible in the dark */}
      <ambientLight intensity={0.35} color="#8d9ab8" />
      <directionalLight position={[-4, 6, 5]} intensity={1.6} color="#b5c3e0" />
      <directionalLight position={[6, 2, 6]} intensity={0.35} color="#7f8db0" />
      <hemisphereLight ref={warmRef} args={["#ffd59a", "#1a1206", 0]} />

      {desktop && (
        // The desk the lamp stands on (its back edge reads as the table edge)
        <mesh position={[0, 0, 1.25]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[80, 7.5]} />
          <meshStandardMaterial color="#26282d" roughness={0.92} metalness={0} />
        </mesh>
      )}

      <group ref={lampRef}>
        {/* Base */}
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.88, 0.94, 0.12, 64]} />
          <meshStandardMaterial color={METAL} metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.125, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.86, 0.012, 8, 64]} />
          <meshStandardMaterial color="#5c6370" metalness={0.8} roughness={0.25} />
        </mesh>
        <Arm from={P_BASE} to={P_ELBOW} radius={0.055} />
        <Arm from={P_ELBOW} to={P_HEAD} radius={0.05} />
        <Joint at={P_BASE} r={0.12} />
        <Joint at={P_ELBOW} />
        <Joint at={P_HEAD} r={0.1} />

        {/* Shade: its +Z axis points where the light goes */}
        <group ref={shadeRef} position={P_HEAD}>
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh geometry={shadeGeo}>
              <meshStandardMaterial color={METAL} metalness={0.3} roughness={0.38} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={shadeGeo} scale={[0.97, 0.995, 0.97]}>
              <meshStandardMaterial ref={innerMat} color="#2a2418" emissive="#ffcf86" emissiveIntensity={0} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, RIM_Z, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[RIM_R, 0.02, 12, 72]} />
              <meshStandardMaterial color={BRASS} metalness={0.75} roughness={0.28} />
            </mesh>
            <mesh position={[0, 0.07, 0]}>
              <cylinderGeometry args={[0.09, 0.11, 0.14, 24]} />
              <meshStandardMaterial color="#1a1c20" metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.25, 0]}>
              <sphereGeometry args={[0.15, 32, 24]} />
              <meshStandardMaterial ref={bulbMat} color="#fff3d6" emissive="#fff0c2" emissiveIntensity={0.05} />
            </mesh>
            {/* Light beam (soft cone that fades with distance) */}
            <mesh position={[0, RIM_Z - 0.03 + 4, 0]}>
              <cylinderGeometry args={[3.0, RIM_R * 0.92, 8, 64, 1, true]} />
              <shaderMaterial
                vertexShader={BEAM_VERT}
                fragmentShader={BEAM_FRAG}
                uniforms={beamUniforms}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
          <sprite ref={glowSprite} position={[0, 0, RIM_Z * 0.7]}>
            <spriteMaterial map={glowTex} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
          <pointLight ref={glowRef} position={[0, 0, 0.35]} intensity={0} distance={2.2} decay={2} color="#ffd59a" />
          <spotLight ref={spotRef} position={[0, 0, 0.3]} angle={0.5} penumbra={0.75} decay={1} distance={0} intensity={0} color="#ffd9a3" />
          <primitive object={spotTarget} position={[0, 0, 6]} />
        </group>
      </group>

      {/* Pull-cord (world space, so it always hangs straight down) */}
      <mesh ref={cordRef}>
        <cylinderGeometry args={[0.012, 0.012, 1, 8]} />
        <meshStandardMaterial color="#d6b866" metalness={0.5} roughness={0.4} />
      </mesh>
      <group ref={beadRef}>
        <mesh>
          <sphereGeometry args={[0.075, 24, 16]} />
          <meshStandardMaterial color={BRASS} metalness={0.8} roughness={0.25} />
        </mesh>
        {/* Bigger invisible grab area around the handle */}
        <mesh
          onPointerDown={onHandleDown}
          onPointerOver={() => { if (!sim.current.dragging) document.body.style.cursor = "grab"; }}
          onPointerOut={() => { if (!sim.current.dragging) document.body.style.cursor = ""; }}
        >
          <sphereGeometry args={[desktop ? 0.34 : 0.45, 12, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
