import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { suppressKnownBrowserExtensionRejectionNoise } from "./lib/suppress-extension-message-noise";
import "./index.css";

suppressKnownBrowserExtensionRejectionNoise();

createRoot(document.getElementById("root")!).render(<App />);
