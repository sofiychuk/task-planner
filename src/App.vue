
<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header class="border-b border-slate-200 bg-white">
      <nav class="mx-auto flex max-w-6xl gap-6 px-6 py-4">
        <RouterLink to="/" class="font-bold">
          Planner
        </RouterLink>

        <RouterLink to="/planner" class="hover:text-blue-600">
          Мої завдання
        </RouterLink>

        <RouterLink to="/settings" class="hover:text-blue-600">
          Налаштування
        </RouterLink>
      </nav>
    </header>

    <main class="mx-auto max-w-6xl px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
