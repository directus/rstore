<script setup>
const store = useVanillaStore()
</script>

<template>
  <div>
    <nav class="flex items-center px-2 gap-2 relative z-10">
      <UNavigationMenu
        :items="[
          {
            icon: 'lucide:home',
            to: '/',
          },
          {
            label: 'Todo',
            icon: 'lucide:check-check',
            to: '/todo',
          },
          {
            label: 'Users',
            icon: 'lucide:users',
            active: $route.path.startsWith('/users'),
            children: [
              {
                label: 'List',
                to: '/users',
              },
              {
                label: 'Filter many',
                to: '/users/filter',
              },
              {
                label: 'Filter first',
                to: '/users/filter-first',
              },
            ],
          },
        ]"
        content-orientation="vertical"
        class="min-w-200"
      />

      <div class="flex-1" />

      <UPopover>
        <UButton label="cache" color="neutral" variant="subtle" icon="lucide:database-zap" />

        <template #content>
          <pre class="text-xs overflow-auto max-w-200 max-h-100 p-2">{{ store.cache.getState() }}</pre>
        </template>
      </UPopover>
    </nav>

    <NuxtPage />
  </div>
</template>
