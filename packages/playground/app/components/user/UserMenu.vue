<script lang="ts" setup>
import { z } from 'zod'

const auth = await useAuth()
const { data: currentUser } = auth.currentUser

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const loginState = ref<z.infer<typeof loginSchema>>({
  email: 'user1@acme.com',
  password: 'admin',
})
</script>

<template>
  <div>
    <UPopover
      v-if="!currentUser"
      arrow
    >
      <UButton label="Login" color="neutral" variant="subtle" />

      <template #content>
        <UForm
          :state="loginState"
          :schema="loginSchema"
          class="p-4 space-y-4 lg:w-80"
          @submit="auth.login(loginState.email, loginState.password)"
        >
          <UFormField
            name="email"
          >
            <UInput
              v-model="loginState.email"
              type="email"
              placeholder="Email"
              icon="lucide:mail"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="password"
          >
            <UInput
              v-model="loginState.password"
              type="password"
              placeholder="Password"
              icon="lucide:lock"
              class="w-full"
            />
          </UFormField>

          <UButton
            label="Login"
            type="submit"
            color="primary"
            block
            :loading="auth.login.$loading.value"
          />

          <UAlert
            v-if="auth.login.$error.value"
            :description="(auth.login.$error.value as any).data?.message ?? auth.login.$error.value.message"
            color="error"
            variant="soft"
            icon="lucide:triangle-alert"
          />
        </UForm>
      </template>
    </UPopover>

    <UPopover
      v-else
      arrow
    >
      <UButton
        :avatar="{
          src: currentUser.avatar,
          alt: currentUser.name,
        }"
        :label="currentUser.name"
        color="neutral"
        variant="subtle"
      />

      <template #content>
        <UButton
          label="Logout"
          color="neutral"
          variant="subtle"
          block
          icon="lucide:log-out"
          :loading="auth.logout.$loading.value"
          @click="auth.logout()"
        />
      </template>
    </UPopover>
  </div>
</template>
