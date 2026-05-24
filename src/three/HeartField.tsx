import { Canvas } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

const PALETTE = ['#FF3D8E', '#9B4DFF', '#4D7CFF', '#35CDE8'] as const

function makeHeartGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(0, -0.3, -0.5, -1, -1, -1)
  shape.bezierCurveTo(-2, -1, -2, 0.5, -2, 0.5)
  shape.bezierCurveTo(-2, 1.5, -1, 2.4, 0, 3)
  shape.bezierCurveTo(1, 2.4, 2, 1.5, 2, 0.5)
  shape.bezierCurveTo(2, 0.5, 2, -1, 1, -1)
  shape.bezierCurveTo(0.5, -1, 0, -0.3, 0, 0)
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.5,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.1,
    bevelSegments: 4,
    curveSegments: 24,
  })
  geom.center()
  geom.rotateZ(Math.PI) // point downward
  geom.scale(0.35, 0.35, 0.35)
  return geom
}

type HeartProps = {
  position: [number, number, number]
  color: string
  scale: number
  speed: number
  rotationIntensity: number
  floatIntensity: number
}

function Heart({ position, color, scale, speed, rotationIntensity, floatIntensity }: HeartProps) {
  const geometry = useMemo(() => makeHeartGeometry(), [])
  return (
    <Float speed={speed} rotationIntensity={rotationIntensity} floatIntensity={floatIntensity}>
      <mesh position={position} scale={scale} geometry={geometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.55}
          metalness={0.35}
          roughness={0.25}
        />
      </mesh>
    </Float>
  )
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

export default function HeartField() {
  // Deterministic positions so SSR/HMR don't reshuffle on every render.
  const hearts = useMemo<HeartProps[]>(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      const r = (n: number) => pseudoRandom(i * 13.37 + n)
      return {
        position: [(r(1) - 0.5) * 9, (r(2) - 0.5) * 5.5, (r(3) - 0.5) * 4 - 1],
        color: PALETTE[i % PALETTE.length],
        scale: 0.5 + r(4) * 0.9,
        speed: 0.8 + r(5) * 1.4,
        rotationIntensity: 0.3 + r(6) * 0.6,
        floatIntensity: 0.8 + r(7) * 1.4,
      }
    })
  }, [])

  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.35} color="#5A2D6E" />
      <pointLight position={[6, 5, 5]} intensity={3.5} color="#FF3D8E" distance={20} decay={1.6} />
      <pointLight position={[-6, -3, 4]} intensity={2.8} color="#9B4DFF" distance={20} decay={1.6} />
      <pointLight position={[0, 6, 2]} intensity={1.2} color="#35CDE8" distance={15} decay={1.8} />
      {hearts.map((h, i) => (
        <Heart key={i} {...h} />
      ))}
    </Canvas>
  )
}
