/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Sacred Assembly (ver ref/DESIGN.md)
        cream: "#fbf9f8",
        navy: {
          DEFAULT: "#04162e",
          container: "#1a2b44",
          on: "#8292b0",
          soft: "#b6c7e7",
        },
        gold: {
          DEFAULT: "#af8c47",
          dim: "#e9c176",
          container: "#ffdea5",
          on: "#5d4201",
        },
        ink: {
          DEFAULT: "#1b1c1c",
          variant: "#44474d",
          muted: "#75777e",
        },
        line: "#c5c6ce",
        surface: {
          DEFAULT: "#ffffff",
          low: "#f5f3f3",
          mid: "#efeded",
          high: "#eae8e7",
        },
        danger: "#ba1a1a",
      },
      fontFamily: {
        serif: ["SourceSerif4_700Bold"],
        "serif-semibold": ["SourceSerif4_600SemiBold"],
        sans: ["SourceSans3_400Regular"],
        "sans-medium": ["SourceSans3_500Medium"],
        "sans-semibold": ["SourceSans3_600SemiBold"],
        "sans-bold": ["SourceSans3_700Bold"],
      },
      borderRadius: {
        lg: "1rem",
        xl: "1.5rem",
      },
    },
  },
  plugins: [],
};
