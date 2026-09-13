import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import "./styles.css";
import "./theme.css";
import "./public.css";

createRoot(document.getElementById("root")!).render(<Root />);
