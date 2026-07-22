// Prop shape checks. A prop typed `Object` accepts anything, so components that
// take a record declare which fields they actually rely on — the failure then
// names the missing field instead of surfacing as an undefined deep in a
// template. Vue only runs validators in development builds.
export const shaped =
  (...keys) =>
  (value) =>
    !!value && typeof value === 'object' && keys.every((k) => k in value)

// Every item of an array prop must satisfy the same shape.
export const arrayOfShape =
  (...keys) =>
  (value) =>
    Array.isArray(value) && value.every(shaped(...keys))
