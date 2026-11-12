# Vue audit checklist

Each rule: the **signal** to look for, **when it matters** (so you can tell a real finding from a harmless match), and the **fix**.

## Reactivity and render cost

- **Function call where `computed` fits.** Signal: a template calls a function on reactive data (`{{ total(items) }}`, `v-for="x in filtered()"`). Matters: it re-runs on every render of the component, not only when its inputs change; costly when it filters, sorts or reduces lists, or sits inside a `v-for`. Fix: a `computed` (or a computed map keyed by id for per-row values).
- **Heavy inline template expressions.** Signal: `.filter`/`.map`/`.reduce`/`sort` or date/currency formatting chains inside the template. Matters: same re-run-per-render cost, plus logic that can't be tested. Fix: move into `computed`.
- **Unstable or index `:key`.** Signal: `:key="index"`, `:key="i"`, missing key, or `Math.random()`. Matters only when the list can reorder, filter, insert or remove, or rows hold local state (inputs, child components, transitions); a static list rendered once is fine — say so under "Checked and fine". Fix: a stable id from the data (`sku`, `id`, `month`).
- **`v-if` and `v-for` on one element.** In Vue 3 `v-if` evaluates first and cannot see the loop variable, so it is a bug, not just a perf issue. Fix: filter in a `computed`, or move `v-if` to a wrapping `<template>`.
- **Deep reactivity on large data.** Signal: big arrays/objects from an API held in `ref`/`reactive` and replaced wholesale, never mutated in place. Matters: Vue makes every nested property reactive at a cost proportional to size. Fix: `shallowRef` and assign a new value.
- **`deep: true` watchers** on large structures, or watchers that recompute derived state. Fix: watch the specific getter, or replace the watcher with `computed`.
- **`v-show` vs `v-if`.** `v-if` on something toggled often (tabs, dropdowns) rebuilds it each time; `v-show` on something heavy and rarely shown (a modal with its own data) pays its mount cost up front. Fix whichever is backwards.
- **Static subtrees re-rendered.** Large static markup inside a frequently re-rendering component. Fix: `v-once`, or `v-memo` for list rows whose inputs rarely change.
- **Leaks.** `addEventListener`/`setInterval`/subscriptions without cleanup in `onUnmounted`. Correctness and memory issue; rank High.

## Reuse

- **Repeated stateful logic → composable.** Signal: the same `ref`s + `watch` + fetch/load pattern, or the same event-listener setup, in several components. Fix: a `useX()` composable returning the refs and actions; reuse an existing composable in `composables/` when one is close. List every copy and how each differs.
- **Repeated pure helpers → util module.** Signal: same-named or same-bodied formatters (currency, dates, percentages, status colors) defined in multiple files. Fix: one module in `utils/` (or the project's equivalent), imported everywhere.
- **Repeated markup → component.** Signal: the same structure across files — modal shells (overlay + header + close), cards, stat tiles, tables, chart scaffolding, empty/loading states. Fix: a component with props and slots for the parts that differ; name the slots.
- **Repeated CSS → shared styles.** Signal: the same selectors and rules in several `<style scoped>` blocks. Fix: move to the global stylesheet or the extracted component. Only flag when the rules actually match, not just the class name.

## Structure

- **Oversized component.** Signal: a file far above the rest of the codebase (roughly 400+ lines, or a script with many unrelated concerns). Matters when it mixes independent sections that change for different reasons. Fix: propose concrete child components and composables by section, naming each and what it owns; one vague "split this up" is not a finding.
- **Prop drilling.** Signal: a prop passed through components that don't use it. Fix: `provide`/`inject` or a composable holding shared state.
- **Mixed responsibilities.** Data fetching, transformation and presentation tangled together in one component. Fix: move fetching and transformation into a composable so the component only renders.
- **Two-way sync hacks.** Signal: a prop copied into local state plus a watcher to keep them in sync. Fix: `defineModel` / `v-model` or a computed getter/setter.

## Loading

- **Eager route components.** Signal: `import View from './views/View.vue'` at the top of the router file. Matters: every page ships in the initial bundle. Fix: `component: () => import('./views/View.vue')`. Keep the landing route eager if first paint matters.
- **Heavy, rarely shown components loaded up front.** Signal: modals, dialogs and charts imported statically but rendered only behind a `v-if`. Fix: `defineAsyncComponent(() => import(...))`.
- **Heavy imports.** Signal: whole-library imports (`import _ from 'lodash'`, full chart libraries) where one function is used. Fix: a per-function import or a native alternative.
- **Waterfall fetches.** Signal: independent API calls awaited one after another in `onMounted`. Fix: `Promise.all`.
