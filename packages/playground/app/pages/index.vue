<script lang="ts" setup>
const auth = useAuth()
const { data: currentUser } = auth.currentUser
</script>

<template>
  <div class="p-4 flex flex-col h-full">
    <div class="m-auto flex flex-col gap-4 items-center text-center">
      <img
        src="/Logo.svg"
        alt="rstore logo"
        class="w-32 h-32"
      >
      <h1 class="text-2xl">
        <a href="https://github.com/Akryum/rstore" target="_blank" class="text-primary-500">rstore</a> playground
      </h1>

      <!-- Needed to test await-less useAuth() -->
      <ClientOnly>
        <div v-if="currentUser" class="m-4 p-4 flex items-center gap-4 border border-default rounded-md">
          <div>Logged in as</div>
          <UAvatar
            :src="currentUser.avatar"
            :alt="currentUser.name"
          />
          <div>{{ currentUser.name }}</div>
        </div>
      </ClientOnly>
    </div>
  </div>
</template>
