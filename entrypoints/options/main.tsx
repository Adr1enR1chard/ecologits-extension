import { render } from "preact";
import "@/src/styles/tailwind.css";
import { uiLocale } from "@/src/i18n";
import { App } from "./App";

document.documentElement.lang = uiLocale();
document.title = browser.i18n.getMessage("optionsTitle");
render(<App />, document.getElementById("app")!);
