// Kept separate from TripMap.tsx on purpose: importing a value from the Leaflet
// component would load Leaflet on the server and crash with "window is not defined".
export const DAY_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be185d"];