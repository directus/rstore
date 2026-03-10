<script setup lang="ts">
import type { TresContextWithClock } from '@tresjs/core'
import { TresCanvas } from '@tresjs/core'
import { BloomPmndrs, EffectComposerPmndrs, FXAAPmndrs, NoisePmndrs, ScanlinePmndrs } from '@tresjs/post-processing'
import { BlendFunction } from 'postprocessing'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { computed, ref, useTemplateRef } from 'vue'
import { useAnimationVisibility } from './composables/useAnimationVisibility'
import { useIsMobile } from './composables/useIsMobile'

interface StarStreak {
  id: string
  x: number
  y: number
  z: number
  length: number
  speed: number
  opacity: number
  color: string
  phase: number
}

interface Planet {
  id: string
  position: [number, number, number]
  size: number
  color: string
  emissive: string
  ringColor?: string
  ringScale?: [number, number, number]
  ringRotation?: [number, number, number]
}

interface HullBlock {
  id: string
  position: [number, number, number]
  size: [number, number, number]
  color: string
  metalness: number
  roughness: number
}

const starStreaks: StarStreak[] = Array.from({ length: 120 }, (_, index) => {
  const phase = index * 0.43
  const radius = 2.8 + (index % 8) * 0.42
  const angle = index * 2.24
  return {
    id: `streak-${index}`,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle * 1.16) * (1.3 + (index % 6) * 0.18),
    z: -10 + (index % 20) * 1,
    length: 0.24 + (index % 4) * 0.11,
    speed: 3.2 + (index % 7) * 0.45,
    opacity: 0.18 + (index % 6) * 0.08,
    color: index % 3 === 0 ? '#8fe9ff' : index % 3 === 1 ? '#8fffcf' : '#b9c9ff',
    phase,
  }
})

const planets: Planet[] = [
  {
    id: 'blue-planet',
    position: [-4.5, 2.6, -3.2],
    size: 0.92,
    color: '#4f77ff',
    emissive: '#325dff',
    ringColor: '#95b7ff',
    ringScale: [1.85, 1.85, 1.85],
    ringRotation: [Math.PI * 0.45, Math.PI * 0.2, 0],
  },
  {
    id: 'mint-planet',
    position: [4.2, -2.2, -2.6],
    size: 0.68,
    color: '#5dffd0',
    emissive: '#29dfaf',
  },
  {
    id: 'violet-moon',
    position: [3.3, 2.7, -4.4],
    size: 0.48,
    color: '#8fa2ff',
    emissive: '#637fff',
  },
]

const engineLanes = Array.from({ length: 11 }, (_, index) => ({
  id: `lane-${index}`,
  x: -0.62 + index * 0.124,
  phase: index * 0.29,
  width: 0.05 + (index % 3) * 0.016,
}))

const engineCloud = Array.from({ length: 56 }, (_, index) => ({
  id: `cloud-${index}`,
  phase: index * 0.31,
  spread: (index % 14 - 6.5) * 0.1,
  heightBand: (Math.floor(index / 14) - 1.5) * 0.045,
  radius: 0.03 + (index % 4) * 0.012,
}))

const engineSparks = Array.from({ length: 44 }, (_, index) => ({
  id: `spark-${index}`,
  phase: index * 0.19,
  lane: -0.7 + (index % 12) * 0.125,
  height: (Math.floor(index / 12) - 1.5) * 0.05,
}))

const hullPanels: HullBlock[] = [
  { id: 'panel-core', position: [0, 0.15, 0.06], size: [0.58, 0.035, 0.45], color: '#e6eef6', metalness: 0.62, roughness: 0.2 },
  { id: 'panel-front-l', position: [-0.33, 0.14, 0.52], size: [0.26, 0.03, 0.26], color: '#d7e2ee', metalness: 0.58, roughness: 0.22 },
  { id: 'panel-front-r', position: [0.33, 0.14, 0.52], size: [0.26, 0.03, 0.26], color: '#d7e2ee', metalness: 0.58, roughness: 0.22 },
  { id: 'panel-mid-l', position: [-0.54, 0.13, 0.08], size: [0.22, 0.03, 0.3], color: '#cfdbe7', metalness: 0.56, roughness: 0.24 },
  { id: 'panel-mid-r', position: [0.54, 0.13, 0.08], size: [0.22, 0.03, 0.3], color: '#cfdbe7', metalness: 0.56, roughness: 0.24 },
  { id: 'panel-rear-l', position: [-0.42, 0.12, -0.46], size: [0.34, 0.03, 0.2], color: '#d5dfeb', metalness: 0.57, roughness: 0.22 },
  { id: 'panel-rear-r', position: [0.42, 0.12, -0.46], size: [0.34, 0.03, 0.2], color: '#d5dfeb', metalness: 0.57, roughness: 0.22 },
]

const hullGreebles: HullBlock[] = [
  { id: 'greeble-a', position: [-0.15, 0.18, 0.2], size: [0.12, 0.05, 0.09], color: '#b9c8d6', metalness: 0.5, roughness: 0.28 },
  { id: 'greeble-b', position: [0.12, 0.19, -0.04], size: [0.11, 0.05, 0.11], color: '#b5c4d3', metalness: 0.5, roughness: 0.28 },
  { id: 'greeble-c', position: [-0.52, 0.17, -0.14], size: [0.08, 0.05, 0.12], color: '#aebfcf', metalness: 0.5, roughness: 0.3 },
  { id: 'greeble-d', position: [0.53, 0.17, -0.16], size: [0.08, 0.05, 0.12], color: '#aebfcf', metalness: 0.5, roughness: 0.3 },
  { id: 'greeble-e', position: [-0.35, 0.18, 0.45], size: [0.1, 0.05, 0.08], color: '#b8c7d6', metalness: 0.5, roughness: 0.28 },
  { id: 'greeble-f', position: [0.36, 0.18, 0.43], size: [0.1, 0.05, 0.08], color: '#b8c7d6', metalness: 0.5, roughness: 0.28 },
  { id: 'greeble-g', position: [-0.58, 0.15, 0.25], size: [0.07, 0.045, 0.08], color: '#9db2c4', metalness: 0.46, roughness: 0.3 },
  { id: 'greeble-h', position: [0.6, 0.15, 0.22], size: [0.07, 0.045, 0.08], color: '#9db2c4', metalness: 0.46, roughness: 0.3 },
  { id: 'greeble-i', position: [0, 0.2, -0.38], size: [0.16, 0.05, 0.09], color: '#afc0cf', metalness: 0.52, roughness: 0.26 },
]

const hullVents = Array.from({ length: 10 }, (_, index) => ({
  id: `vent-${index}`,
  x: -0.48 + index * 0.105,
}))

const elapsed = ref(0)
const shipPosition = ref({ x: 0, y: 0, z: 0 })
const shipRotation = ref({ x: 0, y: 0, z: 0 })
const shipScale = ref(1)
const enginePulse = ref(1)
const thrusterScreen = ref({ x: 50, y: 50, visible: 0 })
const flarePowerSmoothed = ref(0)
const flareAlphaSmoothed = ref(0)
const { isMobile } = useIsMobile()
const sceneRoot = useTemplateRef('sceneRoot')
const { shouldAnimate } = useAnimationVisibility(sceneRoot)

const thrusterLocalCenter = new Vector3(0, -0.01, -1.0)
const shipMatrix = new Matrix4()
const shipEuler = new Euler()
const shipQuaternion = new Quaternion()
const shipScaleVector = new Vector3(1, 1, 1)
const shipPositionVector = new Vector3()
const thrusterWorld = new Vector3()
const thrusterNdc = new Vector3()

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const flareSource = computed(() => {
  const x = clamp(thrusterScreen.value.x, 4, 96)
  const y = clamp(thrusterScreen.value.y, 4, 96)
  const dx = x - 50
  const dy = y - 50

  // JJ Abrams-style artifacts: place halo ghosts on the axis between
  // the bright source and screen center, mostly mirrored across center.
  const haloNearX = clamp(50 - dx * 0.28, -18, 118)
  const haloNearY = clamp(50 - dy * 0.28, -18, 118)
  const haloMidX = clamp(50 - dx * 1.1, -42, 142)
  const haloMidY = clamp(50 - dy * 1.1, -42, 142)
  const haloFarX = clamp(50 - dx * 1.95, -72, 172)
  const haloFarY = clamp(50 - dy * 1.95, -72, 172)

  return {
    x,
    y,
    power: flarePowerSmoothed.value,
    haloNearX,
    haloNearY,
    haloMidX,
    haloMidY,
    haloFarX,
    haloFarY,
  }
})

const flareRootStyle = computed<Record<string, string>>(() => ({
  '--flare-x': `${flareSource.value.x}%`,
  '--flare-y': `${flareSource.value.y}%`,
  '--flare-power': `${flareSource.value.power}`,
  '--flare-alpha': `${flareAlphaSmoothed.value}`,
  '--flare-halo-near-x': `${flareSource.value.haloNearX}%`,
  '--flare-halo-near-y': `${flareSource.value.haloNearY}%`,
  '--flare-halo-mid-x': `${flareSource.value.haloMidX}%`,
  '--flare-halo-mid-y': `${flareSource.value.haloMidY}%`,
  '--flare-halo-far-x': `${flareSource.value.haloFarX}%`,
  '--flare-halo-far-y': `${flareSource.value.haloFarY}%`,
}))

function wrapZ(base: number, speed: number, time: number) {
  return ((base + time * speed) % 22) - 11
}

function shipPoint(time: number) {
  const cycle = (time * 0.055) % 1

  // Stars move toward +Z while the ship travels toward -Z.
  // This keeps both motions visually coherent and always opposite.
  const z = 3.1 - cycle * 15.8
  const x = Math.sin(time * 0.48) * 1.45 + Math.sin(time * 1.08) * 0.2
  const y = Math.cos(time * 0.63) * 0.44 + Math.sin(time * 1.38) * 0.08

  return { x, y, z, cycle }
}

function edgeFade(progress: number) {
  const fadeIn = Math.min(1, progress / 0.1)
  const fadeOut = Math.min(1, (1 - progress) / 0.1)
  return Math.min(fadeIn, fadeOut)
}

function onLoop(context: TresContextWithClock) {
  const elapsedTime = context.elapsed
  const deltaTime = Math.max(0, context.delta)
  elapsed.value = elapsedTime

  const current = shipPoint(elapsedTime)
  const next = shipPoint(elapsedTime + 0.03)
  const dx = next.x - current.x
  const dy = next.y - current.y
  const dz = next.z - current.z

  shipPosition.value.x = current.x
  shipPosition.value.y = current.y
  shipPosition.value.z = current.z

  shipRotation.value.x = -Math.asin(Math.max(-1, Math.min(1, dy))) * 0.85
  shipRotation.value.y = Math.atan2(dx, dz)
  shipRotation.value.z = Math.sin(elapsedTime * 1.9) * 0.12

  shipScale.value = Math.max(0.001, edgeFade(current.cycle))
  enginePulse.value = 1 + Math.sin(elapsedTime * 16) * 0.2

  const activeCamera = context.camera.activeCamera.value
  shipEuler.set(shipRotation.value.x, shipRotation.value.y, shipRotation.value.z, 'XYZ')
  shipQuaternion.setFromEuler(shipEuler)
  shipPositionVector.set(shipPosition.value.x, shipPosition.value.y, shipPosition.value.z)
  shipScaleVector.set(shipScale.value, shipScale.value, shipScale.value)
  shipMatrix.compose(shipPositionVector, shipQuaternion, shipScaleVector)

  thrusterWorld.copy(thrusterLocalCenter).applyMatrix4(shipMatrix)
  thrusterNdc.copy(thrusterWorld).project(activeCamera)

  thrusterScreen.value.x = (thrusterNdc.x * 0.5 + 0.5) * 100
  thrusterScreen.value.y = (-thrusterNdc.y * 0.5 + 0.5) * 100
  thrusterScreen.value.visible = (
    thrusterNdc.z >= -1
    && thrusterNdc.z <= 1
    && Math.abs(thrusterNdc.x) <= 1.2
    && Math.abs(thrusterNdc.y) <= 1.2
  )
    ? 1
    : 0

  // Smooth every flare channel over 500ms while keeping x/y positions immediate.
  const smoothingFactor = 1 - Math.exp(-deltaTime / 0.5)

  const pulse = clamp((enginePulse.value - 0.78) / 0.52, 0, 1)
  const targetPower = clamp(0.38 + pulse * 0.75, 0, 1)
  flarePowerSmoothed.value += (targetPower - flarePowerSmoothed.value) * smoothingFactor

  const scaleVisibility = clamp((shipScale.value - 0.4) / 0.42, 0, 1)
  const targetAlpha = scaleVisibility * thrusterScreen.value.visible
  flareAlphaSmoothed.value += (targetAlpha - flareAlphaSmoothed.value) * smoothingFactor
}
</script>

<template>
  <div ref="sceneRoot" class="ai-support-scene absolute inset-0">
    <ClientOnly>
      <TresCanvas
        v-if="shouldAnimate"
        class="size-full"
        :alpha="true"
        :antialias="true"
        clear-color="#00000000"
        @loop="onLoop"
      >
        <TresPerspectiveCamera :position="[0, 0.25, 7.8]" :rotation="[-0.03, 0, 0]" />

        <TresAmbientLight :intensity="0.76" color="#d7eeff" />
        <TresDirectionalLight :position="[4, 5, 7]" :intensity="1.08" color="#9ce4ff" />
        <TresPointLight :position="[0, 0, 4.8]" :intensity="1.8" color="#9fefff" />
        <TresPointLight :position="[-3.4, -2.1, 3.2]" :intensity="1.35" color="#8dffd7" />

        <TresGroup>
          <TresMesh
            v-for="planet in planets"
            :key="planet.id"
            :position="planet.position"
          >
            <TresSphereGeometry :args="[planet.size, 30, 30]" />
            <TresMeshStandardMaterial
              :color="planet.color"
              :emissive="planet.emissive"
              :emissive-intensity="0.5"
              :metalness="0.3"
              :roughness="0.38"
            />
          </TresMesh>

          <TresGroup
            v-for="planet in planets"
            :key="`${planet.id}-ring`"
            :position="planet.position"
            :rotation="planet.ringRotation ?? [0, 0, 0]"
            :scale="planet.ringScale ?? [1, 1, 1]"
          >
            <TresMesh v-if="planet.ringColor">
              <TresTorusGeometry :args="[planet.size * 1.25, planet.size * 0.07, 12, 64]" />
              <TresMeshStandardMaterial
                :color="planet.ringColor"
                :emissive="planet.ringColor"
                :emissive-intensity="0.22"
                :transparent="true"
                :opacity="0.62"
                :metalness="0.5"
                :roughness="0.22"
              />
            </TresMesh>
          </TresGroup>

          <TresGroup>
            <TresMesh
              v-for="streak in starStreaks"
              :key="streak.id"
              :position="[
                streak.x + Math.sin(elapsed * 0.3 + streak.phase) * 0.2,
                streak.y + Math.cos(elapsed * 0.2 + streak.phase) * 0.14,
                wrapZ(streak.z, streak.speed, elapsed),
              ]"
            >
              <TresBoxGeometry :args="[0.018, 0.018, streak.length + Math.sin(elapsed * 2 + streak.phase) * 0.08]" />
              <TresMeshBasicMaterial
                :color="streak.color"
                :transparent="true"
                :opacity="streak.opacity"
              />
            </TresMesh>
          </TresGroup>

          <TresGroup
            :position="[shipPosition.x, shipPosition.y, shipPosition.z]"
            :rotation="[shipRotation.x, shipRotation.y, shipRotation.z]"
            :scale="[shipScale, shipScale, shipScale]"
          >
            <TresPointLight
              :position="[0, -0.02, -1.22]"
              color="#9fe6ff"
              :intensity="2.3 + (enginePulse - 1) * 4"
              :distance="4.2"
            />

            <!-- Falcon-like saucer body -->
            <TresMesh :position="[0, 0.09, 0]" :scale="[1, 0.28, 1]">
              <TresSphereGeometry :args="[0.9, 32, 24]" />
              <TresMeshStandardMaterial color="#eef5fb" :metalness="0.56" :roughness="0.24" />
            </TresMesh>

            <TresMesh :position="[0, -0.1, 0]" :scale="[1, 0.16, 1]">
              <TresSphereGeometry :args="[0.9, 30, 20]" />
              <TresMeshStandardMaterial color="#c8d5e2" :metalness="0.54" :roughness="0.3" />
            </TresMesh>

            <!-- Hull rings and trenches -->
            <TresMesh :position="[0, 0.125, 0]" :rotation="[Math.PI / 2, 0, 0]">
              <TresTorusGeometry :args="[0.62, 0.018, 12, 84]" />
              <TresMeshStandardMaterial color="#bdd0e1" :metalness="0.54" :roughness="0.24" />
            </TresMesh>
            <TresMesh :position="[0, 0.122, 0]" :rotation="[Math.PI / 2, 0, 0]">
              <TresTorusGeometry :args="[0.44, 0.014, 12, 80]" />
              <TresMeshStandardMaterial color="#a6bbcd" :metalness="0.46" :roughness="0.28" />
            </TresMesh>

            <!-- Hull paneling -->
            <TresMesh
              v-for="panel in hullPanels"
              :key="panel.id"
              :position="panel.position"
            >
              <TresBoxGeometry :args="panel.size" />
              <TresMeshStandardMaterial
                :color="panel.color"
                :metalness="panel.metalness"
                :roughness="panel.roughness"
              />
            </TresMesh>

            <!-- Greeble blocks -->
            <TresMesh
              v-for="g in hullGreebles"
              :key="g.id"
              :position="g.position"
            >
              <TresBoxGeometry :args="g.size" />
              <TresMeshStandardMaterial
                :color="g.color"
                :metalness="g.metalness"
                :roughness="g.roughness"
              />
            </TresMesh>

            <!-- Vent array -->
            <TresMesh
              v-for="vent in hullVents"
              :key="vent.id"
              :position="[vent.x, 0.12, -0.14]"
            >
              <TresBoxGeometry :args="[0.05, 0.022, 0.16]" />
              <TresMeshStandardMaterial color="#2f3f55" :metalness="0.24" :roughness="0.55" />
            </TresMesh>

            <!-- Side docking rings -->
            <TresMesh :position="[0.78, 0.08, -0.12]" :rotation="[0, 0, Math.PI / 2]">
              <TresTorusGeometry :args="[0.19, 0.03, 10, 40]" />
              <TresMeshStandardMaterial color="#c4d4e2" :metalness="0.56" :roughness="0.24" />
            </TresMesh>
            <TresMesh :position="[-0.78, 0.08, -0.12]" :rotation="[0, 0, Math.PI / 2]">
              <TresTorusGeometry :args="[0.19, 0.03, 10, 40]" />
              <TresMeshStandardMaterial color="#c4d4e2" :metalness="0.56" :roughness="0.24" />
            </TresMesh>

            <!-- Upper and lower turret domes -->
            <TresMesh :position="[0.02, 0.28, -0.05]">
              <TresSphereGeometry :args="[0.14, 18, 18]" />
              <TresMeshStandardMaterial color="#d5e2ee" :metalness="0.56" :roughness="0.2" />
            </TresMesh>
            <TresMesh :position="[0.02, -0.24, -0.05]">
              <TresSphereGeometry :args="[0.13, 16, 16]" />
              <TresMeshStandardMaterial color="#bfcfdd" :metalness="0.52" :roughness="0.24" />
            </TresMesh>

            <TresMesh :position="[0.1, 0.29, 0.02]" :rotation="[Math.PI / 2, 0.05, 0.1]">
              <TresCylinderGeometry :args="[0.018, 0.018, 0.28, 12]" />
              <TresMeshStandardMaterial color="#dae7f3" :metalness="0.62" :roughness="0.18" />
            </TresMesh>
            <TresMesh :position="[-0.06, 0.29, 0.04]" :rotation="[Math.PI / 2, -0.08, -0.1]">
              <TresCylinderGeometry :args="[0.018, 0.018, 0.28, 12]" />
              <TresMeshStandardMaterial color="#dae7f3" :metalness="0.62" :roughness="0.18" />
            </TresMesh>

            <!-- Front mandibles -->
            <TresMesh :position="[0.25, -0.01, 0.98]">
              <TresBoxGeometry :args="[0.28, 0.12, 0.86]" />
              <TresMeshStandardMaterial color="#d3deea" :metalness="0.62" :roughness="0.2" />
            </TresMesh>
            <TresMesh :position="[-0.25, -0.01, 0.98]">
              <TresBoxGeometry :args="[0.28, 0.12, 0.86]" />
              <TresMeshStandardMaterial color="#d3deea" :metalness="0.62" :roughness="0.2" />
            </TresMesh>
            <TresMesh :position="[0, -0.01, 1.03]">
              <TresBoxGeometry :args="[0.16, 0.1, 0.62]" />
              <TresMeshStandardMaterial color="#222f45" :metalness="0.22" :roughness="0.45" />
            </TresMesh>

            <!-- Side cockpit tube and pod -->
            <TresMesh :position="[0.93, 0.03, 0.2]" :rotation="[0, 0, Math.PI / 2]">
              <TresCylinderGeometry :args="[0.11, 0.11, 0.68, 20]" />
              <TresMeshStandardMaterial color="#d9e7f3" :metalness="0.64" :roughness="0.2" />
            </TresMesh>
            <TresMesh :position="[1.32, 0.03, 0.26]">
              <TresSphereGeometry :args="[0.2, 18, 18]" />
              <TresMeshStandardMaterial
                color="#e9f6ff"
                emissive="#8fd9ff"
                :emissive-intensity="0.24"
                :metalness="0.52"
                :roughness="0.18"
              />
            </TresMesh>
            <TresMesh :position="[1.45, 0.03, 0.28]">
              <TresSphereGeometry :args="[0.07, 14, 14]" />
              <TresMeshStandardMaterial
                color="#7acbff"
                emissive="#54c0ff"
                :emissive-intensity="0.55"
                :metalness="0.34"
                :roughness="0.16"
              />
            </TresMesh>

            <!-- Radar dish -->
            <TresMesh :position="[-0.18, 0.3, -0.08]">
              <TresCylinderGeometry :args="[0.02, 0.02, 0.12, 12]" />
              <TresMeshStandardMaterial color="#dbe6f2" :metalness="0.6" :roughness="0.2" />
            </TresMesh>
            <TresMesh :position="[-0.18, 0.37, -0.08]" :rotation="[-0.55, 0.3, 0]">
              <TresConeGeometry :args="[0.14, 0.07, 18, 1, true]" />
              <TresMeshStandardMaterial color="#dbe6f2" :metalness="0.56" :roughness="0.2" />
            </TresMesh>

            <!-- Rear thruster strip -->
            <TresMesh :position="[0, -0.01, -0.94]">
              <TresBoxGeometry :args="[1.42, 0.12, 0.17]" />
              <TresMeshStandardMaterial
                color="#7ad2ff"
                emissive="#49c2ff"
                :emissive-intensity="0.75 + (enginePulse - 1) * 1.2"
                :metalness="0.26"
                :roughness="0.16"
              />
            </TresMesh>
            <TresMesh :position="[0, -0.01, -1.06]">
              <TresBoxGeometry :args="[1.3, 0.1, 0.08]" />
              <TresMeshBasicMaterial color="#b5ecff" :transparent="true" :opacity="0.58" />
            </TresMesh>

            <!-- Cinematic full-width ion glow -->
            <TresMesh
              :position="[0, -0.005, -1.17]"
              :scale="[1 + (enginePulse - 1) * 0.42, 1 + (enginePulse - 1) * 0.2, 1 + (enginePulse - 1) * 0.7]"
            >
              <TresBoxGeometry :args="[1.52, 0.17, 0.24]" />
              <TresMeshBasicMaterial color="#9fe6ff" :transparent="true" :opacity="0.34" />
            </TresMesh>
            <TresMesh
              :position="[0, 0, -1.28]"
              :scale="[2.4 + (enginePulse - 1) * 1.1, 0.62 + (enginePulse - 1) * 0.3, 1.06 + (enginePulse - 1) * 1]"
            >
              <TresSphereGeometry :args="[0.28, 16, 16]" />
              <TresMeshBasicMaterial color="#c2f0ff" :transparent="true" :opacity="0.26" />
            </TresMesh>

            <!-- Layered lane plumes so the entire strip emits -->
            <TresMesh
              v-for="lane in engineLanes"
              :key="lane.id"
              :position="[
                lane.x + Math.sin(elapsed * 4.2 + lane.phase) * 0.02,
                Math.sin(elapsed * 7 + lane.phase) * 0.02,
                -1.35 - Math.abs(Math.sin(elapsed * 6 + lane.phase)) * 0.08,
              ]"
            >
              <TresBoxGeometry :args="[lane.width, 0.04, 0.92 + Math.sin(elapsed * 10 + lane.phase) * 0.22]" />
              <TresMeshBasicMaterial
                color="#a9e9ff"
                :transparent="true"
                :opacity="0.28 + Math.abs(Math.sin(elapsed * 8 + lane.phase)) * 0.12"
              />
            </TresMesh>

            <!-- Fine spark spray -->
            <TresMesh
              v-for="spark in engineSparks"
              :key="spark.id"
              :position="[
                spark.lane + Math.sin(elapsed * 5 + spark.phase) * 0.04,
                spark.height + Math.cos(elapsed * 4.8 + spark.phase) * 0.04,
                -1.48 - ((elapsed * 8.4 + spark.phase) % 3.4) * 1.06,
              ]"
            >
              <TresBoxGeometry :args="[0.012, 0.012, 0.14 + Math.sin(elapsed * 14 + spark.phase) * 0.05]" />
              <TresMeshBasicMaterial
                color="#e0f8ff"
                :transparent="true"
                :opacity="0.24"
              />
            </TresMesh>

            <TresMesh
              v-for="particle in engineCloud"
              :key="particle.id"
              :position="[
                particle.spread + Math.sin(elapsed * 4 + particle.phase) * 0.09,
                particle.heightBand + Math.cos(elapsed * 3.8 + particle.phase) * 0.06,
                -1.52 - ((elapsed * 4.2 + particle.phase) % 2.2) * 1.04,
              ]"
            >
              <TresSphereGeometry :args="[particle.radius, 10, 10]" />
              <TresMeshBasicMaterial
                color="#c8f2ff"
                :transparent="true"
                :opacity="0.14"
              />
            </TresMesh>
          </TresGroup>
        </TresGroup>

        <Suspense>
          <EffectComposerPmndrs>
            <BloomPmndrs
              :radius="0.95"
              :intensity="3.15"
              :luminance-threshold="0.1"
              :luminance-smoothing="0.28"
              mipmap-blur
            />
            <FXAAPmndrs v-if="!isMobile" :samples="8" />
            <NoisePmndrs
              premultiply
              :opacity="0.14"
              :blend-function="BlendFunction.SCREEN"
            />
            <ScanlinePmndrs
              :density="1.25"
              :opacity="0.1"
              :scroll-speed="0.05"
            />
          </EffectComposerPmndrs>
        </Suspense>
      </TresCanvas>

      <template #fallback>
        <div class="ai-support-fallback" />
      </template>
    </ClientOnly>

    <div class="lensflare-root" :style="flareRootStyle">
      <div class="flare-streak flare-streak-main" />
      <div class="flare-streak flare-streak-thin" />
      <div class="flare-streak flare-streak-wide" />
      <div class="flare-streak flare-streak-offset" />
      <div class="flare-cross flare-cross-horizontal" />
      <div class="flare-halo" />
      <div class="flare-halo flare-halo-reflect-near" />
      <div class="flare-halo flare-halo-reflect-mid" />
      <div class="flare-halo flare-halo-reflect-far" />
      <div class="flare-ghost flare-ghost-near" />
      <div class="flare-ghost flare-ghost-far" />
    </div>
  </div>
</template>

<style scoped>
.ai-support-scene {
  background:
    radial-gradient(circle at 10% 14%, rgb(0 198 255 / 0.2), transparent 36%),
    radial-gradient(circle at 88% 20%, rgb(0 255 174 / 0.16), transparent 32%),
    radial-gradient(circle at 50% 100%, rgb(11 32 74 / 0.94), rgb(1 6 20));
}

.ai-support-fallback {
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 16% 18%, rgb(0 188 255 / 0.17), transparent 35%),
    radial-gradient(circle at 84% 22%, rgb(66 255 181 / 0.14), transparent 34%),
    radial-gradient(circle at 50% 46%, rgb(125 170 255 / 0.2), transparent 44%),
    linear-gradient(170deg, rgb(4 13 34), rgb(1 8 20));
}

.lensflare-root {
  position: absolute;
  inset: 0;
  z-index: 26;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: var(--flare-alpha);
}

.flare-streak {
  position: absolute;
  left: 0;
  width: 100%;
  pointer-events: none;
}

.flare-streak-main {
  top: var(--flare-y);
  height: 3px;
  opacity: calc(0.15 + var(--flare-power) * 0.55);
  transform: translateY(-50%);
  background:
    linear-gradient(
      90deg,
      rgb(191 245 255 / 0) 0%,
      rgb(191 245 255 / 0) calc(var(--flare-x) - 38%),
      rgb(210 249 255 / 0.6) calc(var(--flare-x) - 3%),
      rgb(233 255 255 / 0.95) var(--flare-x),
      rgb(210 249 255 / 0.6) calc(var(--flare-x) + 3%),
      rgb(191 245 255 / 0) calc(var(--flare-x) + 38%),
      rgb(191 245 255 / 0) 100%
    );
  filter: blur(0.8px);
}

.flare-streak-thin {
  top: calc(var(--flare-y) + 2px);
  height: 1px;
  opacity: calc(0.2 + var(--flare-power) * 0.65);
  transform: translateY(-50%);
  background:
    linear-gradient(
      90deg,
      rgb(147 231 255 / 0) 0%,
      rgb(147 231 255 / 0) calc(var(--flare-x) - 48%),
      rgb(174 239 255 / 0.7) calc(var(--flare-x) - 4%),
      rgb(230 255 255 / 1) var(--flare-x),
      rgb(174 239 255 / 0.7) calc(var(--flare-x) + 4%),
      rgb(147 231 255 / 0) calc(var(--flare-x) + 48%),
      rgb(147 231 255 / 0) 100%
    );
}

.flare-streak-wide {
  top: calc(var(--flare-y) - 1px);
  height: 7px;
  opacity: calc(0.05 + var(--flare-power) * 0.24);
  transform: translateY(-50%);
  background:
    linear-gradient(
      90deg,
      rgb(167 236 255 / 0) 0%,
      rgb(167 236 255 / 0) calc(var(--flare-x) - 58%),
      rgb(190 243 255 / 0.2) calc(var(--flare-x) - 24%),
      rgb(218 252 255 / 0.45) var(--flare-x),
      rgb(190 243 255 / 0.2) calc(var(--flare-x) + 24%),
      rgb(167 236 255 / 0) calc(var(--flare-x) + 58%),
      rgb(167 236 255 / 0) 100%
    );
  filter: blur(2.4px);
}

.flare-streak-offset {
  top: calc(var(--flare-y) - 14px);
  height: 2px;
  opacity: calc(0.04 + var(--flare-power) * 0.2);
  transform: translateY(-50%) skewX(-20deg);
  background:
    linear-gradient(
      90deg,
      rgb(173 242 255 / 0) 0%,
      rgb(173 242 255 / 0) calc(var(--flare-x) - 42%),
      rgb(206 249 255 / 0.55) calc(var(--flare-x) - 6%),
      rgb(236 255 255 / 0.82) var(--flare-x),
      rgb(206 249 255 / 0.55) calc(var(--flare-x) + 6%),
      rgb(173 242 255 / 0) calc(var(--flare-x) + 42%),
      rgb(173 242 255 / 0) 100%
    );
  filter: blur(1.6px);
}

.flare-cross {
  position: absolute;
  left: var(--flare-x);
  top: var(--flare-y);
  transform: translate(-50%, -50%);
  border-radius: 999px;
}

.flare-cross-horizontal {
  width: 440px;
  height: 2px;
  opacity: calc(0.06 + var(--flare-power) * 0.23);
  background:
    linear-gradient(
      90deg,
      rgb(168 238 255 / 0) 0%,
      rgb(168 238 255 / 0.5) 50%,
      rgb(168 238 255 / 0) 100%
    );
  filter: blur(0.8px);
}

.flare-halo {
  position: absolute;
  left: var(--flare-x);
  top: var(--flare-y);
  width: 210px;
  height: 210px;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  opacity: calc(0.08 + var(--flare-power) * 0.26);
  background:
    radial-gradient(circle at 50% 50%, rgb(129 214 255 / 0.3) 0%, rgb(129 214 255 / 0.12) 35%, rgb(129 214 255 / 0) 72%);
}

.flare-halo-reflect-near {
  left: var(--flare-halo-near-x);
  top: var(--flare-halo-near-y);
  width: 108px;
  height: 108px;
  opacity: calc(0.13 + var(--flare-power) * 0.14);
  background:
    radial-gradient(
      circle at 50% 50%,
      rgb(190 243 255 / 0.42) 0%,
      rgb(190 243 255 / 0.2) 28%,
      rgb(190 243 255 / 0.06) 56%,
      rgb(190 243 255 / 0) 100%
    );
  filter: blur(1px);
}

.flare-halo-reflect-mid {
  left: var(--flare-halo-mid-x);
  top: var(--flare-halo-mid-y);
  width: 190px;
  height: 190px;
  opacity: calc(0.122 + var(--flare-power) * 0.105);
  background:
    radial-gradient(
      circle at 50% 50%,
      rgb(172 236 255 / 0.3) 0%,
      rgb(172 236 255 / 0.15) 32%,
      rgb(172 236 255 / 0.05) 60%,
      rgb(172 236 255 / 0) 100%
    );
  filter: blur(1.4px);
}

.flare-halo-reflect-far {
  left: var(--flare-halo-far-x);
  top: var(--flare-halo-far-y);
  width: 268px;
  height: 220px;
  opacity: calc(0.117 + var(--flare-power) * 0.082);
  background:
    radial-gradient(
      ellipse at 50% 50%,
      rgb(153 229 255 / 0.26) 0%,
      rgb(153 229 255 / 0.12) 36%,
      rgb(153 229 255 / 0.04) 64%,
      rgb(153 229 255 / 0) 100%
    );
  filter: blur(1.7px);
}

.flare-ghost {
  position: absolute;
  border-radius: 999px;
  transform: translate(-50%, -50%);
}

.flare-ghost-near {
  left: calc(var(--flare-x) - 52px);
  top: calc(var(--flare-y) + 16px);
  width: 78px;
  height: 78px;
  opacity: calc(0.03 + var(--flare-power) * 0.12);
  background:
    radial-gradient(circle at 50% 50%, rgb(162 233 255 / 0.24) 0%, rgb(162 233 255 / 0.06) 54%, rgb(162 233 255 / 0) 100%);
  filter: blur(0.6px);
}

.flare-ghost-far {
  left: calc(var(--flare-x) + 88px);
  top: calc(var(--flare-y) - 26px);
  width: 48px;
  height: 48px;
  opacity: calc(0.02 + var(--flare-power) * 0.1);
  background:
    radial-gradient(circle at 50% 50%, rgb(183 241 255 / 0.26) 0%, rgb(183 241 255 / 0.08) 50%, rgb(183 241 255 / 0) 100%);
  filter: blur(0.4px);
}
</style>
