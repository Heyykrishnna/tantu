import baseline from "../backend/eslint.config.mjs";

export default [
  ...baseline,
  { ignores: [".artifacts/**"] },
  {
    files: ["prototype/interaction.js"],
    languageOptions: { globals: { document: "readonly", FormData: "readonly" } },
  },
];
