<script lang="ts" setup>
useHead({
  title: 'rstore playground',
})

const devtoolsOpen = useLocalStorage('rstore-devtools-open', false)
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator />

    <div class="flex h-screen">
      <div class="flex-1 min-w-0 flex flex-col h-screen overflow-auto">
        <nav class="flex items-center px-4 gap-2 relative z-10">
          <UNavigationMenu
            :items="[
              {
                icon: 'lucide:home',
                to: '/',
              },
              {
                label: 'Todo',
                icon: 'lucide:check-check',
                active: $route.path.startsWith('/todo'),
                children: [
                  {
                    label: 'List',
                    to: '/todo',
                  },
                  {
                    label: 'Layers',
                    to: '/todo/layers',
                  },
                  {
                    label: 'Bulk',
                    to: '/todo/bulk',
                  },
                ],
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
              {
                label: 'Messages',
                icon: 'lucide:mail',
                active: $route.path.startsWith('/messages'),
                children: [
                  {
                    label: 'Nested fetch',
                    to: '/messages/nested-fetch',
                  },
                  {
                    label: 'Cache',
                    to: '/messages/cache',
                  },
                  {
                    label: 'Computed',
                    to: '/messages/computed',
                  },
                ],
              },
              {
                label: 'Chat',
                icon: 'lucide:message-circle',
                to: '/chat',
              },
              {
                label: 'Database',
                icon: 'lucide:database',
                active: $route.path.startsWith('/gc') || $route.path.startsWith('/database'),
                children: [
                  {
                    label: 'Overview',
                    to: '/database',
                  },
                  {
                    label: 'Garbage Collection',
                    to: '/gc',
                  },
                ],
              },
              {
                label: 'Books',
                icon: 'lucide:book-open',
                active: $route.path.startsWith('/books'),
                children: [
                  {
                    label: 'Paginated',
                    to: '/books',
                  },
                  {
                    label: 'All',
                    to: '/books/all',
                  },
                ],
              },
            ]"
            content-orientation="vertical"
          />

          <div class="flex-1" />

          <UserMenu />

          <ClientOnly>
            <UTooltip text="rstore">
              <UButton
                icon="lucide:database-zap"
                size="sm"
                v-bind="devtoolsOpen ? {
                  color: 'primary',
                  variant: 'solid',
                } : {
                  color: 'neutral',
                  variant: 'subtle',
                }"
                @click="devtoolsOpen = !devtoolsOpen"
              />
            </UTooltip>
          </ClientOnly>
        </nav>

        <div class="flex-1">
          <NuxtPage />
        </div>
      </div>

      <ClientOnly>
        <div
          class="flex-none border-l border-default bg-gray-50 dark:bg-gray-900 w-100 transition-all duration-300 ease-in-out overflow-hidden"
          :class="{
            '!w-0': !devtoolsOpen,
          }"
        >
          <Devtools
            class="w-100 h-full"
          />
        </div>
      </ClientOnly>
    </div>
  </UApp>
</template>
