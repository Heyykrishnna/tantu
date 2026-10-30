import baseline from "../backend/eslint.config.mjs";

export default [
  ...baseline,
  { ignores: [".artifacts/**"] },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", setTimeout: "readonly", clearTimeout: "readonly" } },
  },
  {
    files: ["prototype/interaction.js"],
    languageOptions: { globals: { document: "readonly", FormData: "readonly" } },
  },
];
