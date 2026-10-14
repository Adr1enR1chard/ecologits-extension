import { render } from "preact";
import "@/src/styles/tailwind.css";
import { App } from "./App";

document.documentElement.lang = browser.i18n.getUILanguage();
render(<App />, document.getElementById("app")!);
