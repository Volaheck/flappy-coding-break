"use strict"

const { GROUND_Y } = require("./constants.cjs")

// The Flappy Duck look every renderer shares. Translucent colours carry a solid twin for surfaces
// that paint without alpha: the same colour as it lands on the scene behind it.
const THEME = {
  // World units per pixel of the Flappy Duck art.
  artScale: 0.73,
  // A radial sky: the inner colour holds to half the radius, then fades to the outer one at the edge.
  sky: { inner: "#3596ff", outer: "#007aff" },
  // The cloud band the duck lands on: its tile's top edge in world y, and the colour clouds and band share.
  band: { y: GROUND_Y - 14, color: "#f2f2f7" },
  // The two city layers stand on this world y, behind the band, and scroll at these parts of the speed.
  city: { base: GROUND_Y + 30, parallax: [0.25, 0.5] },
  crate: {
    face: "#d4b628", light: "#ecd25a", shade: "#ae9122", seam: "#8f781d",
    panel: "#b39622", plank: "#9d8420", brace: "#d9bb2e", braceEdge: "#8f781d",
  },
  ui: {
    text: "#ffffff",
    hint: "rgba(255, 255, 255, 0.72)", hintSolid: "#b8c2cc",
    pill: "rgba(255, 255, 255, 0.16)", pillSolid: "#2b8fff", pillOnDark: "#2d3742",
    overlay: "rgba(0, 0, 0, 0.8)", dim: "rgba(0, 0, 0, 0.45)",
    // The same veils as a part of black, for surfaces that darken the scene's colours instead.
    veil: { result: 0.8, paused: 0.45 },
    record: "#ff9c10", recordBg: "rgba(255, 156, 16, 0.12)", recordBgSolid: "#3a2a12",
    status: { running: "#ff9c10", done: "#31d158" },
    statusText: "rgba(0, 0, 0, 0.8)", statusTextSolid: "#333336",
    statusBg: "rgba(0, 0, 0, 0.06)", statusBgSolid: "#e4e4e9",
  },
}

// Flappy Duck's result phrases fall into these bands of score.
function phraseKind(score, record) {
  if (record) return "record"
  if (score === 0) return "zero"
  return score <= 35 ? "normal" : "good"
}

module.exports = { THEME, phraseKind }
