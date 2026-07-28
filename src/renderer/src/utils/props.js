// Prop shape checks: a record prop declares the fields it relies on, so a bad
// prop names the missing field instead of failing deep in a template.
export const shaped =
  (...keys) =>
  (value) =>
    !!value && typeof value === 'object' && keys.every((k) => k in value)

// Every item of an array prop must satisfy the same shape.
export const arrayOfShape =
  (...keys) =>
  (value) =>
    Array.isArray(value) && value.every(shaped(...keys))
