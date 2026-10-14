import { render } from "preact";
import "@/src/styles/tailwind.css";
import { uiLocale } from "@/src/i18n";
import { App } from "./App";

document.documentElement.lang = uiLocale();
render(<App />, document.getElementById("app")!);
