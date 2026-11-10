import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // One React, even when run-live.mjs links the workspace builds of the packages (LOCAL=1).
  resolve: { dedupe: ["react", "react-dom"] },
});
