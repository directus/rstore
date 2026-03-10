<script setup lang="ts">
import type { TresContextWithClock } from '@tresjs/core'
import { TresCanvas } from '@tresjs/core'
import { BloomPmndrs, EffectComposerPmndrs, FXAAPmndrs, NoisePmndrs, ScanlinePmndrs } from '@tresjs/post-processing'
import { BlendFunction } from 'postprocessing'
import { CubicBezierCurve3, Vector3 } from 'three'
import { computed, ref, useTemplateRef } from 'vue'
import { useAnimationVisibility } from './composables/useAnimationVisibility'
import { useIsMobile } from './composables/useIsMobile'

type NodeKind = 'backend' | 'cache' | 'component' | 'plugin'

interface ArchitectureNode {
  id: string
  kind: NodeKind
  label: string
  color: string
  emissive: string
  size: number
  pulseOffset: number
  position: Vector3
}

interface ArchitectureLink {
  id: string
  from: string
  to: string
  lift: number
  skew: number
  tubeRadius: number
  color: string
  opacity: number
}

interface BuiltArchitectureLink extends ArchitectureLink {
  curve: CubicBezierCurve3
  radialSegments: number
  tubularSegments: number
}

interface Packet {
  id: string
  color: string
  linkIndex: number
  offset: number
  progress: number
  position: {
    x: number
    y: number
    z: number
  }
  radius: number
  speed: number
}

interface LegendItem {
  kind: NodeKind
  label: string
}

// Scene layout:
// - components on the left
// - cache in the center
// - plugins/backends on the right
const nodes: ArchitectureNode[] = [
  { id: 'ui', kind: 'component', label: 'Vue/Nuxt UI', color: '#76e7b0', emissive: '#3fdc97', size: 0.22, pulseOffset: 0.2, position: new Vector3(-3.1, 1.55, 0.8) },
  { id: 'forms', kind: 'component', label: 'Forms', color: '#92efbf', emissive: '#58e0a8', size: 0.2, pulseOffset: 1.1, position: new Vector3(-2.2, 0.2, 1.45) },
  { id: 'offline', kind: 'component', label: 'Offline', color: '#69db9e', emissive: '#42cb8f', size: 0.19, pulseOffset: 1.9, position: new Vector3(-2.7, -1.25, 0.45) },
  { id: 'dashboard', kind: 'component', label: 'Dashboard', color: '#84e6af', emissive: '#54d79a', size: 0.21, pulseOffset: 2.3, position: new Vector3(-3.3, 0.4, -0.85) },

  { id: 'cache', kind: 'cache', label: 'rstore cache', color: '#6fbfff', emissive: '#4aa8ff', size: 0.42, pulseOffset: 0, position: new Vector3(0, 0, 0) },

  { id: 'plugin-sync', kind: 'plugin', label: 'Sync plugin', color: '#90f4ff', emissive: '#56dfff', size: 0.29, pulseOffset: 0.8, position: new Vector3(1.8, 1.0, 1.1) },
  { id: 'plugin-live', kind: 'plugin', label: 'Live plugin', color: '#a5f7ff', emissive: '#6ce8ff', size: 0.27, pulseOffset: 1.4, position: new Vector3(1.95, -0.85, 0.9) },

  { id: 'api', kind: 'backend', label: 'API Layer', color: '#ffd36d', emissive: '#ffc45a', size: 0.25, pulseOffset: 1.3, position: new Vector3(3.1, 1.5, 0.35) },
  { id: 'realtime', kind: 'backend', label: 'Realtime', color: '#ffe28f', emissive: '#ffd36c', size: 0.23, pulseOffset: 2.4, position: new Vector3(3.15, -0.1, 1.5) },
  { id: 'db', kind: 'backend', label: 'Database', color: '#ffc96d', emissive: '#ffba52', size: 0.3, pulseOffset: 1.6, position: new Vector3(2.75, -1.45, -0.35) },
]

const legendItems: LegendItem[] = [
  { kind: 'backend', label: 'Backends' },
  { kind: 'plugin', label: 'Plugins' },
  { kind: 'cache', label: 'Cache' },
  { kind: 'component', label: 'Components' },
]

const legendPillClass: Record<NodeKind, string> = {
  backend: 'border-amber-300/55 bg-amber-100/70 text-amber-900 dark:border-amber-300/35 dark:bg-amber-400/15 dark:text-amber-200',
  plugin: 'border-cyan-300/55 bg-cyan-100/70 text-cyan-900 dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-200',
  cache: 'border-blue-300/55 bg-blue-100/70 text-blue-900 dark:border-blue-300/35 dark:bg-blue-400/15 dark:text-blue-200',
  component: 'border-emerald-300/55 bg-emerald-100/70 text-emerald-900 dark:border-emerald-300/35 dark:bg-emerald-400/15 dark:text-emerald-200',
}

const legendSymbolClass: Record<NodeKind, string> = {
  backend: 'legend-icon legend-backend',
  plugin: 'legend-icon legend-plugin',
  cache: 'legend-icon legend-cache',
  component: 'legend-icon legend-component',
}

const nodeMap = new Map(nodes.map(node => [node.id, node]))
const cacheNode = nodeMap.get('cache')!
const componentNodes = computed(() => nodes.filter(node => node.kind === 'component'))
const pluginNodes = computed(() => nodes.filter(node => node.kind === 'plugin'))
const backendNodes = computed(() => nodes.filter(node => node.kind === 'backend'))

// Data flow order:
// backends -> plugins -> cache -> components
const linkDefs: ArchitectureLink[] = [
  { id: 'api-sync', from: 'api', to: 'plugin-sync', lift: 0.42, skew: 0.22, tubeRadius: 0.022, color: '#ffd784', opacity: 0.54 },
  { id: 'db-sync', from: 'db', to: 'plugin-sync', lift: 0.56, skew: -0.15, tubeRadius: 0.023, color: '#ffd996', opacity: 0.56 },
  { id: 'realtime-live', from: 'realtime', to: 'plugin-live', lift: 0.38, skew: 0.2, tubeRadius: 0.022, color: '#ffe5a8', opacity: 0.58 },

  { id: 'sync-cache', from: 'plugin-sync', to: 'cache', lift: 0.42, skew: 0.14, tubeRadius: 0.026, color: '#7abfff', opacity: 0.66 },
  { id: 'live-cache', from: 'plugin-live', to: 'cache', lift: 0.34, skew: -0.08, tubeRadius: 0.024, color: '#95d4ff', opacity: 0.62 },

  { id: 'cache-ui', from: 'cache', to: 'ui', lift: 0.58, skew: 0.15, tubeRadius: 0.026, color: '#74e1a5', opacity: 0.56 },
  { id: 'cache-forms', from: 'cache', to: 'forms', lift: 0.42, skew: 0.12, tubeRadius: 0.022, color: '#8eebba', opacity: 0.5 },
  { id: 'cache-offline', from: 'cache', to: 'offline', lift: 0.38, skew: -0.18, tubeRadius: 0.022, color: '#69d997', opacity: 0.5 },
  { id: 'cache-dashboard', from: 'cache', to: 'dashboard', lift: 0.5, skew: -0.26, tubeRadius: 0.022, color: '#83e3ae', opacity: 0.52 },
]

function buildArc(start: Vector3, end: Vector3, lift: number, skew: number) {
  // Build smooth cubic bezier paths with:
  // - tangent-based forward controls
  // - vertical lift + horizontal skew for depth
  const direction = end.clone().sub(start)
  const distance = direction.length()
  const tangent = direction.normalize()

  const side = new Vector3(-tangent.z, 0, tangent.x).normalize()
  const bend = side.multiplyScalar(skew * 1.7).add(new Vector3(0, lift, 0))

  const control1 = start.clone()
    .add(tangent.clone().multiplyScalar(distance * 0.32))
    .add(bend.clone().multiplyScalar(0.95))
  const control2 = end.clone()
    .sub(tangent.clone().multiplyScalar(distance * 0.32))
    .add(bend.clone().multiplyScalar(0.78))

  return new CubicBezierCurve3(
    start.clone(),
    control1,
    control2,
    end.clone(),
  )
}

const links: BuiltArchitectureLink[] = linkDefs.map((link) => {
  const from = nodeMap.get(link.from)!
  const to = nodeMap.get(link.to)!

  return {
    ...link,
    curve: buildArc(from.position, to.position, link.lift, link.skew),
    radialSegments: 18,
    tubularSegments: 120,
  }
})

const ambientParticles = Array.from({ length: 22 }, (_, index) => {
  const angle = index * 1.53
  const radius = 3.6 + (index % 4) * 0.28
  return {
    id: `ambient-${index}`,
    phase: index * 0.47,
    size: 0.028 + (index % 3) * 0.008,
    x: Math.cos(angle) * radius,
    y: (index % 6 - 2.5) * 0.5,
    z: Math.sin(angle * 1.2) * 1.7,
  }
})

const packetPalette = ['#7bc4ff', '#8bffdc', '#76e7b0', '#ffe089']
// Packets are data dots moving on every link, each with unique phase/speed.
const packets = ref<Packet[]>(
  Array.from({ length: 32 }, (_, index) => ({
    id: `packet-${index}`,
    color: packetPalette[index % packetPalette.length]!,
    linkIndex: index % links.length,
    offset: (index * 0.173) % 1,
    progress: 0,
    position: { x: 0, y: 0, z: 0 },
    radius: 0.045 + (index % 4) * 0.008,
    speed: 0.11 + (index % 7) * 0.013,
  })),
)

// Per-component impact energy. Increased on packet arrival, then decays over time.
const componentPulseEnergy = ref<Record<string, number>>(
  Object.fromEntries(nodes
    .filter(node => node.kind === 'component')
    .map(node => [node.id, 0])),
)

// Only cache -> component links can trigger component pulses.
const componentLinkTargetByIndex = new Map<number, string>()
links.forEach((link, index) => {
  if (nodeMap.get(link.to)?.kind === 'component') {
    componentLinkTargetByIndex.set(index, link.to)
  }
})

const elapsed = ref(0)
const graphRotation = ref(0)
const graphTilt = ref(0)
const coreSpin = ref(0)
const corePulse = ref(1)
const lastElapsed = ref(0)
const { isMobile } = useIsMobile()
const sceneRoot = useTemplateRef('sceneRoot')
const { shouldAnimate } = useAnimationVisibility(sceneRoot)

function triggerComponentPulse(componentId: string) {
  // Saturate so repeated hits stack but remain bounded.
  const current = componentPulseEnergy.value[componentId] ?? 0
  componentPulseEnergy.value[componentId] = Math.min(1, current + 0.9)
}

function decayComponentPulses(delta: number) {
  if (delta <= 0) {
    return
  }

  const next = { ...componentPulseEnergy.value }
  const decayAmount = delta * 1.9

  for (const key of Object.keys(next)) {
    next[key] = Math.max(0, next[key]! - decayAmount)
  }

  componentPulseEnergy.value = next
}

function updatePacketPositions(time: number) {
  for (const packet of packets.value) {
    const link = links[packet.linkIndex]!
    const previousT = packet.progress
    const t = (time * packet.speed + packet.offset) % 1
    packet.progress = t

    // When t wraps from ~1 back to 0, the packet reached the destination node.
    if (previousT > t) {
      const targetComponentId = componentLinkTargetByIndex.get(packet.linkIndex)
      if (targetComponentId) {
        triggerComponentPulse(targetComponentId)
      }
    }

    const point = link.curve.getPointAt(t)
    packet.position.x = point.x
    packet.position.y = point.y
    packet.position.z = point.z
  }
}

updatePacketPositions(0)

function onLoop({ elapsed: elapsedTime }: TresContextWithClock) {
  // Frame delta used for time-based decay (frame-rate independent).
  const delta = Math.max(0, elapsedTime - lastElapsed.value)
  lastElapsed.value = elapsedTime

  // Global scene motion.
  elapsed.value = elapsedTime
  graphRotation.value = elapsedTime * 0.24
  graphTilt.value = Math.sin(elapsedTime * 0.55) * 0.08
  coreSpin.value = elapsedTime * 1.75
  corePulse.value = 1 + Math.sin(elapsedTime * 2.2) * 0.05

  // Pulse simulation + packet movement.
  decayComponentPulses(delta)

  updatePacketPositions(elapsedTime)
}
</script>

<template>
  <div ref="sceneRoot" class="architecture-v2 absolute inset-0">
    <ClientOnly>
      <TresCanvas
        v-if="shouldAnimate"
        class="size-full"
        :alpha="true"
        :antialias="true"
        clear-color="#00000000"
        @loop="onLoop"
      >
        <!-- Camera framing and user interaction -->
        <TresPerspectiveCamera :position="[0, 0.6, 8.1]" :rotation="[-0.075, 0, 0]" />

        <!-- Base scene lighting -->
        <TresAmbientLight :intensity="0.95" color="#efffff" />
        <TresDirectionalLight :position="[6, 6, 8]" :intensity="1.25" color="#d5ffec" />
        <TresPointLight :position="[-4, 1.5, 3.4]" :intensity="1.5" color="#49a6ff" />
        <TresPointLight :position="[3.8, -2.4, 2.2]" :intensity="1.1" color="#ffd16c" />

        <!-- Entire architecture graph motion (slow orbit + tilt) -->
        <TresGroup :rotation="[graphTilt, graphRotation, 0]">
          <!-- Link trajectories between architecture layers -->
          <TresMesh
            v-for="link in links"
            :key="link.id"
          >
            <!-- Tube geometry sampled from a cubic bezier path -->
            <TresTubeGeometry :args="[link.curve, link.tubularSegments, link.tubeRadius, link.radialSegments, false]" />
            <TresMeshStandardMaterial
              :color="link.color"
              :transparent="true"
              :opacity="link.opacity"
              :metalness="0.62"
              :roughness="0.18"
              :emissive="link.color"
              :emissive-intensity="0.35"
            />
          </TresMesh>

          <!-- Component planets (reactive UI nodes) -->
          <TresGroup
            v-for="node in componentNodes"
            :key="node.id"
            :position="[node.position.x, node.position.y, node.position.z]"
          >
            <!-- Outer aura that expands/brightens on packet impact -->
            <TresMesh
              :scale="[
                1.35 + Math.sin(elapsed * 1.9 + node.pulseOffset) * 0.12 + (componentPulseEnergy[node.id] ?? 0) * 0.52,
                1.35 + Math.sin(elapsed * 1.9 + node.pulseOffset) * 0.12 + (componentPulseEnergy[node.id] ?? 0) * 0.52,
                1.35 + Math.sin(elapsed * 1.9 + node.pulseOffset) * 0.12 + (componentPulseEnergy[node.id] ?? 0) * 0.52,
              ]"
            >
              <TresSphereGeometry :args="[node.size, 24, 24]" />
              <TresMeshBasicMaterial
                :color="node.color"
                :transparent="true"
                :opacity="0.11 + (componentPulseEnergy[node.id] ?? 0) * 0.14"
              />
            </TresMesh>

            <!-- Main component planet body -->
            <TresMesh :scale="[1 + (componentPulseEnergy[node.id] ?? 0) * 0.14, 1 + (componentPulseEnergy[node.id] ?? 0) * 0.14, 1 + (componentPulseEnergy[node.id] ?? 0) * 0.14]">
              <TresSphereGeometry :args="[node.size, 30, 30]" />
              <TresMeshStandardMaterial
                :color="node.color"
                :emissive="node.emissive"
                :emissive-intensity="0.46 + (componentPulseEnergy[node.id] ?? 0) * 1.15"
                :metalness="0.52"
                :roughness="0.26"
              />
            </TresMesh>

            <!-- Fast transient flash ring at impact -->
            <TresMesh
              :scale="[
                1.58 + (componentPulseEnergy[node.id] ?? 0) * 0.95,
                1.58 + (componentPulseEnergy[node.id] ?? 0) * 0.95,
                1.58 + (componentPulseEnergy[node.id] ?? 0) * 0.95,
              ]"
            >
              <TresSphereGeometry :args="[node.size, 20, 20]" />
              <TresMeshBasicMaterial
                :color="node.color"
                :transparent="true"
                :opacity="(componentPulseEnergy[node.id] ?? 0) * 0.1"
              />
            </TresMesh>
          </TresGroup>

          <!-- Plugin stations (transport/adapters) -->
          <TresGroup
            v-for="node in pluginNodes"
            :key="node.id"
            :position="[node.position.x, node.position.y, node.position.z]"
            :rotation="[0, elapsed * 0.45 + node.pulseOffset, 0]"
          >
            <!-- Station core hub -->
            <TresMesh>
              <TresCylinderGeometry :args="[node.size * 0.42, node.size * 0.42, node.size * 0.56, 20]" />
              <TresMeshStandardMaterial
                :color="node.color"
                :emissive="node.emissive"
                :emissive-intensity="0.52"
                :metalness="0.72"
                :roughness="0.2"
              />
            </TresMesh>

            <!-- Rotating docking ring -->
            <TresMesh :rotation="[Math.PI / 2, elapsed * 0.8, 0]">
              <TresTorusGeometry :args="[node.size * 0.92, node.size * 0.085, 12, 68]" />
              <TresMeshStandardMaterial
                color="#b8f9ff"
                :emissive="node.emissive"
                :emissive-intensity="0.35"
                :metalness="0.8"
                :roughness="0.15"
              />
            </TresMesh>

            <!-- Side module A -->
            <TresMesh :position="[node.size * 0.95, 0, 0]">
              <TresBoxGeometry :args="[node.size * 0.46, node.size * 0.09, node.size * 0.24]" />
              <TresMeshStandardMaterial color="#8deeff" :metalness="0.6" :roughness="0.28" />
            </TresMesh>

            <!-- Side module B -->
            <TresMesh :position="[-node.size * 0.95, 0, 0]">
              <TresBoxGeometry :args="[node.size * 0.46, node.size * 0.09, node.size * 0.24]" />
              <TresMeshStandardMaterial color="#8deeff" :metalness="0.6" :roughness="0.28" />
            </TresMesh>

            <!-- Top beacon light -->
            <TresMesh :position="[0, node.size * 0.36, 0]">
              <TresSphereGeometry :args="[node.size * 0.14, 16, 16]" />
              <TresMeshStandardMaterial color="#d6fdff" :emissive="node.emissive" :emissive-intensity="0.58" />
            </TresMesh>
          </TresGroup>

          <!-- Backend stars (remote systems) -->
          <TresGroup
            v-for="node in backendNodes"
            :key="node.id"
            :position="[node.position.x, node.position.y, node.position.z]"
            :rotation="[elapsed * 0.55 + node.pulseOffset, elapsed * 0.42, 0]"
          >
            <!-- Outer glow shell -->
            <TresMesh :scale="[1.42 + Math.sin(elapsed * 2.6 + node.pulseOffset) * 0.12, 1.42 + Math.sin(elapsed * 2.6 + node.pulseOffset) * 0.12, 1.42 + Math.sin(elapsed * 2.6 + node.pulseOffset) * 0.12]">
              <TresSphereGeometry :args="[node.size * 1.2, 20, 20]" />
              <TresMeshBasicMaterial :color="node.color" :transparent="true" :opacity="0.3" />
            </TresMesh>

            <!-- Main star crystal -->
            <TresMesh :rotation="[elapsed * 1.3, elapsed * 0.9, 0]">
              <TresOctahedronGeometry :args="[node.size * 0.95, 0]" />
              <TresMeshStandardMaterial
                :color="node.color"
                :emissive="node.emissive"
                :emissive-intensity="0.74"
                :metalness="0.45"
                :roughness="0.2"
              />
            </TresMesh>

            <!-- Secondary inner crystal -->
            <TresMesh :rotation="[0.78, elapsed * -1.15, 0.4]">
              <TresOctahedronGeometry :args="[node.size * 0.68, 0]" />
              <TresMeshStandardMaterial
                :color="node.color"
                :emissive="node.emissive"
                :emissive-intensity="0.62"
                :metalness="0.42"
                :roughness="0.2"
              />
            </TresMesh>
          </TresGroup>

          <!-- Central normalized cache planet + rings -->
          <TresGroup
            :position="[cacheNode.position.x, cacheNode.position.y, cacheNode.position.z]"
            :rotation="[0, coreSpin, 0]"
            :scale="[corePulse, corePulse, corePulse]"
          >
            <!-- Cache atmosphere glow -->
            <TresMesh :scale="[1.5, 1.5, 1.5]">
              <TresSphereGeometry :args="[cacheNode.size, 30, 30]" />
              <TresMeshBasicMaterial :color="cacheNode.color" :transparent="true" :opacity="0.14" />
            </TresMesh>

            <!-- Cache planet core -->
            <TresMesh>
              <TresSphereGeometry :args="[cacheNode.size, 38, 38]" />
              <TresMeshStandardMaterial
                :color="cacheNode.color"
                :emissive="cacheNode.emissive"
                :emissive-intensity="0.74"
                :metalness="0.48"
                :roughness="0.16"
              />
            </TresMesh>

            <!-- Main cache ring -->
            <TresMesh :rotation="[Math.PI / 2, coreSpin * 0.65, 0]">
              <TresTorusGeometry :args="[0.78, 0.058, 14, 76]" />
              <TresMeshStandardMaterial
                color="#9dd2ff"
                :transparent="true"
                :opacity="0.72"
                emissive="#69b6ff"
                :emissive-intensity="0.4"
                :metalness="0.7"
                :roughness="0.14"
              />
            </TresMesh>

            <!-- Secondary thin ring for depth -->
            <TresMesh :rotation="[0, coreSpin * -1.15, Math.PI * 0.25]">
              <TresTorusGeometry :args="[1.02, 0.024, 12, 72]" />
              <TresMeshStandardMaterial
                color="#d7ebff"
                :transparent="true"
                :opacity="0.45"
                emissive="#9acbff"
                :emissive-intensity="0.3"
                :metalness="0.66"
                :roughness="0.16"
              />
            </TresMesh>
          </TresGroup>

          <!-- Moving data packets flowing along link curves -->
          <TresGroup>
            <TresMesh
              v-for="packet in packets"
              :key="packet.id"
              :position="[packet.position.x, packet.position.y, packet.position.z]"
            >
              <!-- Individual packet sphere -->
              <TresSphereGeometry :args="[packet.radius, 14, 14]" />
              <TresMeshStandardMaterial
                :color="packet.color"
                :emissive="packet.color"
                :emissive-intensity="1.1"
                :metalness="0.3"
                :roughness="0.12"
              />
            </TresMesh>
          </TresGroup>

          <!-- Ambient star dust for depth/atmosphere -->
          <TresGroup>
            <TresMesh
              v-for="particle in ambientParticles"
              :key="particle.id"
              :position="[particle.x, particle.y + Math.sin(elapsed * 0.8 + particle.phase) * 0.12, particle.z]"
            >
              <!-- Tiny background particle -->
              <TresSphereGeometry :args="[particle.size, 8, 8]" />
              <TresMeshBasicMaterial
                color="#b5ffe8"
                :transparent="true"
                :opacity="0.35"
              />
            </TresMesh>
          </TresGroup>
        </TresGroup>

        <!-- Post-processing stack for glow and sci-fi texture -->
        <Suspense>
          <EffectComposerPmndrs>
            <!-- Bloom boosts emissive glow -->
            <BloomPmndrs
              :radius="0.85"
              :intensity="3.0"
              :luminance-threshold="0.1"
              :luminance-smoothing="0.3"
              mipmap-blur
            />
            <!-- FXAA smooths jagged edges -->
            <FXAAPmndrs
              v-if="!isMobile"
              :samples="24"
            />
            <!-- Subtle sensor-like noise -->
            <NoisePmndrs
              premultiply
              :blend-function="BlendFunction.SCREEN"
            />
            <!-- Moving scanlines for sci-fi texture -->
            <ScanlinePmndrs
              v-if="!isMobile"
              :density="1.25"
              :opacity="0.1"
              :scroll-speed="0.05"
            />
          </EffectComposerPmndrs>
        </Suspense>
      </TresCanvas>

      <template #fallback>
        <div class="architecture-v2-fallback" />
      </template>
    </ClientOnly>

    <!-- Color legend / caption -->
    <div class="pointer-events-none absolute inset-x-2 bottom-2 z-20">
      <div class="flex flex-wrap justify-center gap-2 rounded-2xl bg-white/40 p-2.5 backdrop-blur-xl dark:bg-[#060b0a]/40">
        <span
          v-for="item in legendItems"
          :key="item.kind"
          class="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none"
          :class="legendPillClass[item.kind]"
        >
          <span :class="legendSymbolClass[item.kind]" />
          <span>{{ item.label }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.architecture-v2 {
  background: radial-gradient(circle at 50% 10%, rgb(0 255 126 / 0.08), transparent 40%);
}

.architecture-v2-fallback {
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 50% 40%, rgb(87 165 255 / 0.16), transparent 42%),
    radial-gradient(circle at 18% 12%, rgb(0 255 145 / 0.12), transparent 34%),
    radial-gradient(circle at 82% 24%, rgb(255 194 92 / 0.11), transparent 30%),
    linear-gradient(160deg, rgb(251 255 253 / 0.46), rgb(228 238 233 / 0.2));
}

.legend-icon {
  position: relative;
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  flex-shrink: 0;
}

.legend-backend {
  background: radial-gradient(circle at 30% 30%, rgb(255 246 203), rgb(255 193 88));
  box-shadow: 0 0 10px rgb(255 193 88 / 0.7);
  clip-path: polygon(50% 0%, 63% 35%, 100% 50%, 63% 65%, 50% 100%, 37% 65%, 0% 50%, 37% 35%);
}

.legend-plugin {
  border-radius: 3px;
  background: linear-gradient(140deg, rgb(180 248 255), rgb(76 214 239));
  box-shadow: 0 0 10px rgb(76 214 239 / 0.58);
}

.legend-plugin::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1.02rem;
  height: 0.24rem;
  border: 1px solid rgb(153 244 255 / 0.9);
  border-radius: 999px;
  transform: translate(-50%, -50%);
}

.legend-cache {
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, rgb(205 231 255), rgb(86 166 255));
  box-shadow: 0 0 10px rgb(86 166 255 / 0.68);
}

.legend-cache::before {
  content: '';
  position: absolute;
  inset: -2px;
  border: 1px solid rgb(155 209 255 / 0.84);
  border-radius: 999px;
  transform: scale(1.25, 0.62);
}

.legend-component {
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, rgb(201 255 227), rgb(34 197 123));
  box-shadow: 0 0 10px rgb(34 197 123 / 0.56);
}

.legend-component::before {
  content: '';
  position: absolute;
  top: 0.14rem;
  left: 0.17rem;
  width: 0.2rem;
  height: 0.2rem;
  border-radius: 999px;
  background: rgb(233 255 246 / 0.78);
}
</style>
