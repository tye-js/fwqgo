import baseConfig from "../../tailwind.config";

const config = {
  ...baseConfig,
  content: [
    "../../src/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
};

export default config;
