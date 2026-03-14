<script setup lang="ts">
</script>

<template>
  <RScope>
    <RToastProvider>
      <div class="app">
        <header class="header">
          <h1 class="title">Workout</h1>
          <nav class="nav">
            <RouterLink to="/" class="nav-link">Home</RouterLink>
            <RouterLink to="/workout" class="nav-link">Workout</RouterLink>
            <RouterLink to="/history" class="nav-link">History</RouterLink>
          </nav>
        </header>
        <main class="main">
          <RouterView />
        </main>
      </div>
    </RToastProvider>
  </RScope>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.header {
  padding: 1rem 1.5rem;
  border-bottom: 2px solid var(--r-color-stroke, #333);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title {
  font-size: 1.5rem;
  margin: 0;
  font-weight: 600;
}
.nav {
  display: flex;
  gap: 1rem;
}
.nav-link {
  color: var(--r-color-stroke, #333);
  text-decoration: none;
  font-weight: 500;
}
.nav-link.router-link-active {
  text-decoration: underline;
}
.main {
  flex: 1;
  padding: 1.5rem;
}
</style>
